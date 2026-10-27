// ============================================================================
// utils/training-record.js —— 训练记录（本地保存 + 上报队列 + 隐私同意）
// ----------------------------------------------------------------------------
// 原则：
//  1. 先本地保存，再考虑上报；本地是唯一可信来源，上报失败不影响训练。
//  2. 同一局只保存/上报一次：recordId 由「游戏 + 开始时间 + 随机串」生成，
//     重复调用 save() 会命中已有记录直接返回，不会重复累加。
//  3. 上报地址不写死在代码里：由管理员写入本地配置。未配置时状态为
//     unconfigured，界面如实显示「未配置上报接口」。
//  4. 上报前必须经过隐私确认（由页面弹窗展示将要发送的字段和用途）。
//  5. 模拟数据（dataSource = 'simulation'）默认不上报，避免冒充真实训练数据。
//
// 多游戏支持：
//   每个游戏一份独立的记录库与上报配置（存储键不同），互不干扰。
//   本文件底部导出的 list/save/upload... 是「走钢丝」的默认实例（保持旧调用点
//   不变）；新游戏用 createRecordStore({ storageKey, uploadKey, describe }) 自建。
// ============================================================================

const MAX_RETRY = 3

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

/**
 * 建立一个游戏专属的记录库。
 * @param {object} opts
 *   storageKey  记录存储键（必填）
 *   uploadKey   上报配置存储键（必填）
 *   describe    隐私清单生成函数 (record) => [[字段名, 值], ...]
 *   maxRecords  本地最多保留条数，默认 120
 */
function createRecordStore(opts) {
  const o = opts || {}
  const RECORD_KEY = o.storageKey
  const UPLOAD_CFG_KEY = o.uploadKey
  const MAX_RECORDS = o.maxRecords || 120
  const describe = typeof o.describe === 'function' ? o.describe : () => []

  function readList() {
    let list = null
    try { list = wx.getStorageSync(RECORD_KEY) } catch (e) { /* 忽略 */ }
    return Array.isArray(list) ? list : []
  }

  function writeList(list) {
    try { wx.setStorageSync(RECORD_KEY, list) } catch (e) { /* 忽略 */ }
  }

  // -------------------------------------------------------------- 上报配置
  function getUploadConfig() {
    let cfg = null
    try { cfg = wx.getStorageSync(UPLOAD_CFG_KEY) } catch (e) { /* 忽略 */ }
    if (!cfg || typeof cfg !== 'object' || !cfg.url) return { url: '', token: '', enabled: false }
    return {
      url: String(cfg.url || ''),
      token: String(cfg.token || ''),
      enabled: cfg.enabled !== false
    }
  }

  function setUploadConfig(cfg) {
    const next = {
      url: String((cfg && cfg.url) || '').trim(),
      token: String((cfg && cfg.token) || ''),
      enabled: !!(cfg && cfg.enabled !== false)
    }
    try { wx.setStorageSync(UPLOAD_CFG_KEY, next) } catch (e) { /* 忽略 */ }
    return next
  }

  // -------------------------------------------------------------- 读写
  /** 保存一局记录；已存在同 recordId 时直接返回原记录（防重复结算） */
  function save(record) {
    if (!record || !record.recordId) return null
    const list = readList()
    const idx = list.findIndex((r) => r.recordId === record.recordId)
    if (idx >= 0) return list[idx]

    const item = Object.assign({
      uploadState: 'local', // local | uploaded | failed | skipped | unconfigured
      uploadError: '',
      retry: 0
    }, record)

    item.uploadState = item.dataSource === 'simulation' ? 'skipped' : 'local'
    list.unshift(item)
    while (list.length > MAX_RECORDS) list.pop()
    writeList(list)
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
   * 上传一条记录。
   * @param {string} recordId
   * @param {object} opts { consent:boolean } —— 必须显式 true，表示用户已确认
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
      if (!opt.consent) {
        resolve({ ok: false, state: rec.uploadState, error: '需要用户确认后才能上报' })
        return
      }

      const cfg = getUploadConfig()
      if (!cfg.url || !cfg.enabled) {
        update(recordId, { uploadState: 'unconfigured', uploadError: '未配置上报接口' })
        resolve({ ok: false, state: 'unconfigured', error: '未配置上报接口' })
        return
      }
      if (rec.retry >= MAX_RETRY) {
        update(recordId, { uploadState: 'failed', uploadError: '重试次数已达上限' })
        resolve({ ok: false, state: 'failed', error: '重试次数已达上限' })
        return
      }

      const token = cfg.token
      const payload = JSON.parse(JSON.stringify(rec))
      // 本地状态字段不传给后端
      delete payload.uploadState
      delete payload.uploadError
      delete payload.retry

      wx.request({
        url: cfg.url,
        method: 'POST',
        timeout: 10000,
        header: Object.assign(
          { 'content-type': 'application/json' },
          token ? { Authorization: 'Bearer ' + token } : {}
        ),
        data: payload,
        success: (res) => {
          const code = res && res.statusCode
          if (code >= 200 && code < 300) {
            update(recordId, { uploadState: 'uploaded', uploadError: '', uploadedAt: Date.now() })
            resolve({ ok: true, state: 'uploaded' })
          } else {
            update(recordId, {
              uploadState: 'failed',
              uploadError: '服务返回 ' + code,
              retry: (rec.retry || 0) + 1
            })
            resolve({ ok: false, state: 'failed', error: '服务返回 ' + code })
          }
        },
        fail: (err) => {
          update(recordId, {
            uploadState: 'failed',
            uploadError: (err && err.errMsg) || '网络异常',
            retry: (rec.retry || 0) + 1
          })
          resolve({ ok: false, state: 'failed', error: (err && err.errMsg) || '网络异常' })
        }
      })
    })
  }

  return {
    save,
    list,
    get,
    update,
    remove,
    clear,
    stats,
    upload,
    describePayload,
    getUploadConfig,
    setUploadConfig,
    RECORD_KEY,
    UPLOAD_CFG_KEY
  }
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
  formatTime,
  formatDuration,
  makeId,
  RECORD_KEY: wireStore.RECORD_KEY,
  UPLOAD_CFG_KEY: wireStore.UPLOAD_CFG_KEY
}, wireStore)
