// ============================================================================
// utils/training-record.js —— 训练记录（本地保存 + 静默上报 + 离线补传）
// ----------------------------------------------------------------------------
// 相对 v1 的变化：
//   1. 不再要求每局传 consent:true —— 改成「首次登录时授权一次」，之后静默上报。
//      治疗室场景治疗师会点，家用场景没人会点，这是数据能不能上来的关键。
//   2. 上报走 utils/api.js：token 自动续期、401 自动重登，不再手填 URL/令牌。
//   3. 失败进队列，启动时批量补传（一次最多 20 条，服务端上限）。
//   4. patientId 不由客户端传 —— 服务端从 JWT 推导，客户端伪造不了别人的记录。
//   5. dataSource 'real' 会被映射成服务端认的 'sensor'。
//
// 仍然保留：本地是唯一可信来源、recordId 幂等、模拟数据不上报。
// ============================================================================

const api = require('./api.js')
const auth = require('./auth.js')

const MAX_RETRY = 3
const BATCH_MAX = 20

/** 所有创建过的 store，用于全局补传 */
const allStores = []

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function formatTime(ts) {
  const d = new Date(ts || Date.now())
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec || 0))
  return pad(Math.floor(s / 60)) + ':' + pad(s % 60)
}

function makeId(gameId, startedAt) {
  const rnd = Math.random().toString(36).slice(2, 8)
  return gameId + '_' + startedAt + '_' + rnd
}

/** 环境是否具备联网能力（headless 测试里没有 wx.request） */
function canNetwork() {
  return typeof wx !== 'undefined' &&
    typeof wx.request === 'function' &&
    typeof wx.login === 'function'
}

// ---------------------------------------------------------------------------
// 记录 → 上报载荷
// 游戏特有字段统一塞进 metrics，通用字段抽出来，避免服务端为每个游戏建表。
// ---------------------------------------------------------------------------
const CORE_KEYS = [
  'recordId', 'gameId', 'startedAt', 'endedAt', 'durationSec', 'score',
  'accuracy', 'dataSource', 'interrupted', 'interruptedSec', 'clientVer',
  'configSnapshot', 'uploadState', 'uploadError', 'retry', 'uploadedAt', 'createdAt'
]

function clamp01(v) {
  if (typeof v !== 'number' || !isFinite(v)) return null
  return v < 0 ? 0 : (v > 1 ? 1 : v)
}

function buildPayload(rec) {
  const metrics = {}
  Object.keys(rec).forEach((k) => {
    if (CORE_KEYS.indexOf(k) >= 0) return
    const v = rec[k]
    // metrics 里只放基础类型，避免把嵌套对象/函数传上去
    if (v === null || v === undefined) return
    const t = typeof v
    if (t === 'string' || t === 'number' || t === 'boolean') metrics[k] = v
  })

  const ts = Number(rec.startedAt || rec.createdAt || Date.now())
  const payload = {
    recordId: rec.recordId,
    gameId: rec.gameId,
    // 服务端要求 >= 2020-09，太小会被判非法，兜底成当前时间
    startedAt: ts > 1600000000000 ? Math.round(ts) : Date.now(),
    durationSec: Math.max(0, Number(rec.durationSec) || 0),
    dataSource: rec.dataSource === 'simulation' ? 'simulation' : 'sensor',
    metrics,
    configSnapshot: rec.configSnapshot || { version: 0, missing: true },
    interrupted: !!rec.interrupted,
    interruptedSec: Math.max(0, Number(rec.interruptedSec) || 0)
  }

  if (typeof rec.score === 'number' && isFinite(rec.score)) {
    payload.score = Math.max(0, Math.round(rec.score))
  }
  const acc = clamp01(rec.accuracy)
  if (acc !== null) payload.accuracy = acc
  if (rec.endedAt) payload.endedAt = Math.round(rec.endedAt)
  if (rec.appVersion) payload.clientVer = String(rec.appVersion).slice(0, 32)
  // 归属戳：服务端会核对，防止换账号后把上一个人的记录传上去
  if (rec.owner) payload.ownerId = rec.owner

  return payload
}

/**
 * 建立一个游戏专属的记录库。
 * @param {object} opts
 *   storageKey  记录存储键（必填）
 *   uploadKey   保留字段，兼容旧调用（现在不再需要手填上报配置）
 *   describe    隐私清单生成函数 (record) => [[字段名, 值], ...]
 *   maxRecords  本地最多保留条数，默认 120
 */
function createRecordStore(opts) {
  const o = opts || {}
  // ★ 存储键必须按账号隔离。
  // 原来用固定的 'wire_records_v1'，导致同一个设备上换人登录后：
  //   1. 记录页看到的是上一个人的记录；
  //   2. A 未上传的记录会被 B 的 flushAll 用 B 的身份上报，脏数据记到 B 名下。
  // 现在的键是 `${base}:${patientId}`，未登录时用 `:anon`。
  const BASE_KEY = o.storageKey
  const UPLOAD_CFG_KEY = o.uploadKey || (BASE_KEY + '_upload')
  const MAX_RECORDS = o.maxRecords || 120
  const describe = typeof o.describe === 'function' ? o.describe : () => []

  function scopeKey(uid) {
    const id = uid === undefined ? auth.patientId() : uid
    return BASE_KEY + ':' + (id || 'anon')
  }

  function readRaw(key) {
    let list = null
    try { list = wx.getStorageSync(key) } catch (e) { /* 忽略 */ }
    return Array.isArray(list) ? list : []
  }

  function writeRaw(key, list) {
    try { wx.setStorageSync(key, list) } catch (e) { /* 忽略 */ }
  }

  function readList() {
    return readRaw(scopeKey())
  }

  function writeList(list) {
    writeRaw(scopeKey(), list)
  }

  // -------------------------------------------------------------- 上报状态
  /**
   * 兼容旧接口：页面用 `if (getUploadConfig().url)` 判断要不要自动上传。
   * 现在 url 固定是 API 基址，token 由 api.js 自己管，不再需要用户手填。
   */
  function getUploadConfig() {
    const net = canNetwork()
    return {
      url: net ? api.getBase() : '',
      token: '',
      enabled: net && !!auth.patientId()
    }
  }

  /** 旧接口保留但不再生效：地址与令牌由 utils/api.js 统一管理 */
  function setUploadConfig() {
    return getUploadConfig()
  }

  // -------------------------------------------------------------- 读写
  /** 保存一局记录；已存在同 recordId 时直接返回原记录（防重复结算） */
  function save(record) {
    if (!record || !record.recordId) return null
    const list = readList()
    const idx = list.findIndex((r) => r.recordId === record.recordId)
    if (idx >= 0) return list[idx]

    const item = Object.assign({
      uploadState: 'local', // local | uploaded | failed | skipped
      uploadError: '',
      retry: 0
    }, record)

    // 归属戳：上报前会核对，避免换账号后把上一个人的记录传上去
    if (!item.owner) item.owner = auth.patientId() || ''

    item.uploadState = item.dataSource === 'simulation' ? 'skipped' : 'local'
    list.unshift(item)
    while (list.length > MAX_RECORDS) list.pop()
    writeList(list)

    // 训练结束即静默上报：不弹窗、不阻塞、失败进队列
    if (item.uploadState === 'local') {
      Promise.resolve().then(() => {
        if (auth.hasPrivacyConsent()) upload(item.recordId, {})
      })
    }
    return item
  }

  function list(limit) {
    const arr = readList()
    if (!limit || limit <= 0) return arr
    return arr.slice(0, limit)
  }

  function get(recordId) {
    return readList().find((r) => r.recordId === recordId) || null
  }

  function update(recordId, patch) {
    const arr = readList()
    const i = arr.findIndex((r) => r.recordId === recordId)
    if (i < 0) return null
    arr[i] = Object.assign({}, arr[i], patch || {})
    writeList(arr)
    return arr[i]
  }

  function remove(recordId) {
    writeList(readList().filter((r) => r.recordId !== recordId))
    return true
  }

  function clear() {
    writeList([])
    return true
  }

  function stats() {
    const arr = readList()
    const uploaded = arr.filter((r) => r.uploadState === 'uploaded').length
    const pending = arr.filter((r) => r.uploadState === 'local' || r.uploadState === 'failed').length
    return { total: arr.length, uploaded, pending }
  }

  function describePayload(record) {
    return record ? describe(record) : []
  }

  // -------------------------------------------------------------- 上报
  /**
   * 单条上报。保留旧签名（recordId, { consent }）。
   * consent 不再强制：只要做过一次全局隐私授权即可。
   * @returns {Promise<{ok:boolean, state:string, error?:string}>}
   */
  function upload(recordId, opts2) {
    const opt = opts2 || {}
    return new Promise((resolve) => {
      const rec = get(recordId)
      if (!rec) {
        resolve({ ok: false, state: 'missing', error: '记录不存在' })
        return
      }
      if (rec.uploadState === 'uploaded') {
        resolve({ ok: true, state: 'uploaded' })
        return
      }
      if (rec.dataSource === 'simulation') {
        update(recordId, { uploadState: 'skipped', uploadError: '模拟数据不上报' })
        resolve({ ok: false, state: 'skipped', error: '模拟数据不上报' })
        return
      }
      if (!canNetwork()) {
        resolve({ ok: false, state: 'offline', error: '当前环境不支持网络请求' })
        return
      }
      const myId = auth.patientId()
      if (!myId) {
        resolve({ ok: false, state: 'no-user', error: '尚未登录，记录只存本地' })
        return
      }
      // 纵深防御：即使存储隔离出了问题，也不用自己的身份传别人的记录
      if (rec.owner && rec.owner !== myId) {
        resolve({ ok: false, state: 'foreign', error: '这条记录属于其他账号，不会提交' })
        return
      }
      if (!auth.hasPrivacyConsent() && !opt.consent) {
        resolve({ ok: false, state: 'consent-required', error: '需要先完成一次隐私授权' })
        return
      }
      if ((rec.retry || 0) >= MAX_RETRY && !opt.force) {
        update(recordId, { uploadState: 'failed', uploadError: '重试次数已达上限' })
        resolve({ ok: false, state: 'failed', error: '重试次数已达上限' })
        return
      }

      api.post('/v1/records', buildPayload(rec)).then(() => {
        update(recordId, { uploadState: 'uploaded', uploadError: '', uploadedAt: Date.now() })
        resolve({ ok: true, state: 'uploaded' })
      }).catch((err) => {
        update(recordId, {
          uploadState: 'failed',
          uploadError: err.message || '网络异常',
          retry: (rec.retry || 0) + 1
        })
        resolve({ ok: false, state: 'failed', error: err.message || '网络异常' })
      })
    })
  }

  /**
   * 批量补传未上传的记录。一次最多 20 条（服务端上限）。
   * 服务端会返回 rejected 明细，被拒的单独标失败，不牵连整批。
   */
  function flushPending(limit) {
    if (!canNetwork()) return Promise.resolve({ skipped: 'offline' })
    const myId = auth.patientId()
    if (!myId) return Promise.resolve({ skipped: 'no-user' })
    if (!auth.hasPrivacyConsent()) return Promise.resolve({ skipped: 'no-consent' })

    const pending = readList().filter(
      (r) => (r.uploadState === 'local' || r.uploadState === 'failed') &&
        r.dataSource !== 'simulation' &&
        (!r.owner || r.owner === myId) &&
        (r.retry || 0) < MAX_RETRY
    )
    if (!pending.length) return Promise.resolve({ uploaded: 0, remaining: 0 })

    const batch = pending.slice(0, Math.min(limit || BATCH_MAX, BATCH_MAX))
    const payloads = batch.map(buildPayload)

    return api.post('/v1/records', { records: payloads }).then((res) => {
      const badIdx = {}
      ;(res.rejected || []).forEach((rj) => { badIdx[rj.index] = rj.reason })
      batch.forEach((rec, i) => {
        if (badIdx[i] !== undefined) {
          update(rec.recordId, {
            uploadState: 'failed',
            uploadError: '服务端拒绝: ' + badIdx[i],
            retry: (rec.retry || 0) + 1
          })
        } else {
          update(rec.recordId, { uploadState: 'uploaded', uploadError: '', uploadedAt: Date.now() })
        }
      })
      const remaining = readList().filter(
        (r) => (r.uploadState === 'local' || r.uploadState === 'failed') && r.dataSource !== 'simulation'
      ).length
      return {
        uploaded: batch.length - Object.keys(badIdx).length,
        rejected: Object.keys(badIdx).length,
        remaining
      }
    }).catch((err) => {
      batch.forEach((rec) => {
        update(rec.recordId, {
          uploadState: 'failed',
          uploadError: err.message || '网络异常',
          retry: (rec.retry || 0) + 1
        })
      })
      return { uploaded: 0, failed: batch.length, error: err.message }
    })
  }

  /**
   * 把旧版本（固定键）和未登录（:anon）的记录归到当前账号名下。
   * 只在登录后调用。旧记录没有 owner 字段 —— 它们本来就是这台设备上
   * 这个人做的，只是当时还没登录，所以归属给首次登录的账号是安全的。
   */
  function migrateTo(uid) {
    if (!uid) return 0
    const targetKey = BASE_KEY + ':' + uid
    const target = readRaw(targetKey)
    const seen = {}
    target.forEach((r) => { if (r && r.recordId) seen[r.recordId] = true })

    let moved = 0
    ;[BASE_KEY, BASE_KEY + ':anon'].forEach((key) => {
      const list = readRaw(key)
      if (!list.length) return
      list.forEach((r) => {
        if (!r || !r.recordId || seen[r.recordId]) return
        if (!r.owner) r.owner = uid
        target.push(r)
        seen[r.recordId] = true
        moved += 1
      })
      writeRaw(key, [])
    })

    if (moved) {
      target.sort((a, b) => (b.createdAt || b.startedAt || 0) - (a.createdAt || a.startedAt || 0))
      while (target.length > MAX_RECORDS) target.pop()
      writeRaw(targetKey, target)
    }
    return moved
  }

  const store = {
    save,
    list,
    get,
    update,
    remove,
    clear,
    stats,
    upload,
    flushPending,
    migrateTo,
    describePayload,
    getUploadConfig,
    setUploadConfig,
    storageKey: BASE_KEY,
    RECORD_KEY: BASE_KEY,
    UPLOAD_CFG_KEY
  }
  allStores.push(store)
  return store
}

/**
 * 登录后必须调用一次：把历史遗留的固定键记录、以及登录前产生的
 * `:anon` 记录，归到当前账号名下。返回迁移条数。
 */
function migrateStores() {
  const pid = auth.patientId()
  if (!pid) return 0
  return allStores.reduce((n, st) => n + st.migrateTo(pid), 0)
}

/** 所有游戏一起补传。启动/回到前台时调用一次即可。 */
function flushAll() {
  if (!canNetwork()) return Promise.resolve({ skipped: 'offline' })
  if (!auth.hasPrivacyConsent()) return Promise.resolve({ skipped: 'no-consent' })
  return allStores.reduce(
    (p, st) => p.then((acc) => st.flushPending().then((r) => {
      acc.uploaded += (r.uploaded || 0)
      acc.remaining += (r.remaining || 0)
      return acc
    })),
    Promise.resolve({ uploaded: 0, remaining: 0 })
  )
}

// ---------------------------------------------------------------------------
// 走钢丝（wire）—— 默认实例，保持既有调用点不变
// ---------------------------------------------------------------------------
function describeWire(record) {
  const rows = [
    ['昵称', record.nickname || '体验用户'],
    ['游戏', '走钢丝 · ' + (record.scene || '固定场景')],
    ['难度', '第 ' + record.difficulty + ' 档'],
    ['得分', String(record.score)],
    ['训练时长', formatDuration(record.durationSec)],
    ['前进距离（游戏内）', (record.distance || 0).toFixed(1) + ' 米'],
    ['平衡稳定时间', (record.stableSec || 0).toFixed(1) + ' 秒'],
    ['偏离次数', String(record.offCount || 0)],
    ['保险绳触发', String(record.ropeTriggers || 0) + ' 次'],
    ['数据来源', record.dataSource === 'simulation' ? '模拟数据' : '真实传感器']
  ]
  if (record.dataSource === 'simulation') rows.push(['提示', '模拟数据默认不上报'])
  return rows
}

const wireStore = createRecordStore({
  storageKey: 'wire_records_v1',
  uploadKey: 'wire_upload_cfg_v1',
  describe: describeWire
})

module.exports = Object.assign({
  createRecordStore,
  flushAll,
  migrateStores,
  buildPayload,
  canNetwork,
  formatTime,
  formatDuration,
  makeId,
  MAX_RETRY,
  BATCH_MAX,
  RECORD_KEY: wireStore.RECORD_KEY,
  UPLOAD_CFG_KEY: wireStore.UPLOAD_CFG_KEY
}, wireStore)
