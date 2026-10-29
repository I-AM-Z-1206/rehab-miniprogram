// ============================================================================
// utils/remote-config.js —— 治疗师下发参数的接入层
// ----------------------------------------------------------------------------
// 治疗师在后台改一次参数，患者下次启动/回到前台时自动拉到，不用再逐台设备手改。
//
// 关键点：服务端下发的键与各游戏 SCHEMA 同名，直接喂给 ConfigStore.patch()，
// 复用现有的类型转换、范围裁剪、步长对齐（utils/config-store.js:97）。
// 服务端不实现第二套校验，客户端 validate() 兜底 —— 治疗师即使塞了越界值，
// 也只会被裁到合法范围，不会把游戏搞崩。
// ============================================================================

const api = require('./api.js')

const GAMES = ['fruit', 'wire', 'rhythm', 'shoot']

function verKey(gameId) {
  return 'cfg_ver_' + gameId
}

function localVersion(gameId) {
  try { return Number(wx.getStorageSync(verKey(gameId))) || 0 } catch (e) { return 0 }
}

function saveVersion(gameId, v) {
  try { wx.setStorageSync(verKey(gameId), Number(v) || 0) } catch (e) { /* 忽略 */ }
}

/** 惰性加载，避免启动时就实例化所有游戏的配置 */
// ★ 主包不能 require 分包（微信硬限制：分包代码在导航过去之前根本没加载）。
//   射击的 ConfigStore 已随功能搬进 pkgShoot/games/shoot/config.js，
//   所以这里**拿不到**，必须由射击页自己把 store 注入进来（见 attach()）。
//   原来这里直接加载 ./game/config.js，那个文件搬家后就不存在了，
//   异常被 try 吞掉 —— 表现是射击的云端参数一直没生效，且完全静默。
const injected = {}

function register(gameId, store) {
  if (gameId && store && typeof store.patch === 'function') injected[gameId] = store
  return injected[gameId] || null
}

function storeFor(gameId) {
  if (gameId === 'shoot') return injected.shoot || null
  try {
    if (gameId === 'fruit') return require('./fruit-config.js').getStore()
    if (gameId === 'wire') return require('./wire-config.js').getStore()
    if (gameId === 'rhythm') return require('./rhythm-config.js').getStore()
  } catch (e) {
    console.warn('[remote-config] 加载 ' + gameId + ' 配置失败', e && e.message)
  }
  return null
}

/**
 * 分包页面专用：注入自己的 store 并立刻拉一次该游戏的参数。
 * 必须在页面 onLoad 里调（那时分包代码才加载完）。
 */
function attach(gameId, store) {
  register(gameId, store)
  return pull(gameId).catch(() => ({ changed: false }))
}

/**
 * 拉取单个游戏的参数。
 * @param {string} gameId
 * @param {object} opts { force:true 忽略本地版本强制全量 }
 * @returns {Promise<{changed:boolean, version:number, applied?:string[]}>}
 */
function pull(gameId, opts) {
  const store = storeFor(gameId)
  if (!store) return Promise.resolve({ changed: false, skipped: 'no-store' })

  const since = (opts && opts.force) ? 0 : localVersion(gameId)
  return api.get('/v1/config/' + gameId + '?since=' + since).then((r) => {
    if (!r || !r.changed || !r.config) {
      saveVersion(gameId, (r && r.version) || since)
      return { changed: false, version: (r && r.version) || since }
    }
    const applied = store.patch(r.config, 'remote')
    saveVersion(gameId, r.version)
    return { changed: true, version: r.version, applied }
  })
}

/** 全部游戏拉一遍。单个失败不影响其它。 */
function pullAll() {
  return Promise.all(GAMES.map((g) => pull(g).catch((e) => ({
    gameId: g,
    error: (e && e.message) || 'failed'
  }))))
}

/**
 * 把本机参数推给某个患者（仅治疗师）。
 * @param {string} gameId
 * @param {string} patientId
 * @param {number} expectedVersion 乐观锁，可选
 */
function push(gameId, patientId, expectedVersion) {
  const store = storeFor(gameId)
  if (!store) return Promise.reject(new Error('未知游戏：' + gameId))
  const body = { config: store.all() }
  if (typeof expectedVersion === 'number') body.expectedVersion = expectedVersion
  return api
    .put('/v1/config/' + gameId + '?patientId=' + encodeURIComponent(patientId), body)
    .then((r) => {
      saveVersion(gameId, r.version)
      return r
    })
}

module.exports = { GAMES, pull, pullAll, push, localVersion, attach, register }
