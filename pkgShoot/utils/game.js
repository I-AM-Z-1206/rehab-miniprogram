// ============================================================================
// utils/game/index.js —— 游戏能力对外的统一门面（给治疗师端 / 管理端 / 后台调用）
// ----------------------------------------------------------------------------
// 使用方式一（页面内）：
//   const game = require 相对分包路径 '../../utils/game.js'
//   game.setHitArea(80)        // 游戏进行中立即生效，不用重启
//
// 使用方式二（控制台 / 远程指令 / 其他页面）：
//   getApp().globalData.gameApi.setHitArea(80)
//   getApp().globalData.gameApi.setDifficulty('hard')
//   getApp().globalData.gameApi.setScoreRange(2, 6)
//
// 所有 setter 都是「写配置 + 广播」：ConfigStore 一变，
// 运行中的 GameEngine 下一帧就按新参数跑（判定范围、发射频率、保持范围都不需要重启）。
// ============================================================================

const { getStore } = require('../games/shoot/config.js')
const { GameEngine } = require('../games/shoot/engine.js')
const { AudioKit } = require('../../utils/game/audio.js')
const { ScoreManager } = require('../games/shoot/score.js')
const { BulletSystem } = require('../games/shoot/bullet.js')
const { HitDetector } = require('../games/shoot/hit.js')
const { PoseTracker } = require('../games/shoot/pose.js')

let engine = null

function attach(e) {
  engine = e || null
  return engine
}

function detach(e) {
  if (!e || engine === e) engine = null
}

function getEngine() {
  return engine
}

function cfgStore() {
  return getStore()
}

function isMounted() {
  return !!engine
}

// ---------------------------------------------------------------------------
// 实时调整 API（FR-GAME-01 第 3 条：判定范围无需重启即可改动）
// ---------------------------------------------------------------------------
/** 设置击中判定半径（px）。传入 8~200 之外的数值会被自动收敛 */
function setHitArea(range) {
  if (engine) return engine.setHitArea(range)
  return cfgStore().set('hitRange', range, 'api:setHitArea')
}

function getHitArea() {
  return cfgStore().get('hitRange')
}

/** 设置发射频率（发/秒），立即改变自动开火节奏 */
function setFireRate(fps) {
  if (engine) return engine.setFireRate(fps)
  return cfgStore().set('fireRate', fps, 'api:setFireRate')
}

/** 设置难度档位：'easy' | 'normal' | 'hard' | 'expert' */
function setDifficulty(level, applyPreset) {
  if (engine) return engine.setDifficulty(level, applyPreset)
  const changed = cfgStore().applyDifficulty(level, applyPreset !== false)
  return { level: cfgStore().get('difficulty'), scoreMul: cfgStore().getScoreMul(), changed: changed }
}

/** 设置得分浮动区间 [min, max] */
function setScoreRange(min, max) {
  if (engine) return engine.setScoreRange(min, max)
  cfgStore().patch({ scoreMin: min, scoreMax: max }, 'api:setScoreRange')
  return cfgStore().getScoreRange()
}

/** 设置保持范围（允许偏离 ±度） */
function setKeepRange(deg) {
  if (engine) return engine.setKeepRange(deg)
  return cfgStore().set('keepRangeDeg', deg, 'api:setKeepRange')
}

/** 设置满量程倾角（倾斜多少度对应屏幕边缘） */
function setMaxLean(deg) {
  if (engine) return engine.setMaxLean(deg)
  return cfgStore().set('maxLeanDeg', deg, 'api:setMaxLean')
}

/** 设置连击窗口(ms)，默认 100ms（0.1s 刻度） */
function setComboWindow(ms) {
  return cfgStore().set('comboWindowMs', ms, 'api:setComboWindow')
}

/** 任意配置项批量修改 */
function patch(partial) {
  return cfgStore().patch(partial, 'api:patch')
}

function getConfig() {
  return cfgStore().all()
}

function saveConfig() {
  cfgStore().save()
  return true
}

function resetConfig() {
  return cfgStore().reset()
}

// ---------------------------------------------------------------------------
// 运行控制 + 状态
// ---------------------------------------------------------------------------
function getState() {
  if (engine) return engine.getState()
  return { state: 'idle', running: false, score: 0, hits: 0, combo: 0, sensorStale: true }
}

function start() { if (engine) engine.start() }
function pause() { if (engine) engine.pause() }
function resume() { if (engine) engine.resume() }
function toggle() { if (engine) engine.toggle() }
function restart() { if (engine) engine.restart() }

// ---------------------------------------------------------------------------
// 创建引擎（页面用）
// ---------------------------------------------------------------------------
function createEngine(opts) {
  const o = opts || {}
  const cfg = o.cfg || cfgStore()
  const audio = o.audio || new AudioKit(cfg)
  const e = new GameEngine(Object.assign({}, o, { cfg: cfg, audio: audio }))
  attach(e)
  return e
}

/** 把 API 挂到 App 全局，便于其它页面 / 控制台调用 */
function mountGlobal() {
  if (typeof getApp !== 'function') return false
  const app = getApp()
  if (!app) return false
  app.globalData = app.globalData || {}
  app.globalData.gameApi = api
  return true
}

const api = {
  // 参数（治疗师实时调整）
  setHitArea,
  getHitArea,
  setFireRate,
  setDifficulty,
  setScoreRange,
  setKeepRange,
  setMaxLean,
  setComboWindow,
  patch,
  getConfig,
  saveConfig,
  resetConfig,
  // 运行
  start,
  pause,
  resume,
  toggle,
  restart,
  getState,
  // 引擎
  createEngine,
  attach,
  detach,
  getEngine,
  isMounted,
  mountGlobal,
  // 模块（便于复用 / 单测）
  GameEngine,
  ScoreManager,
  BulletSystem,
  HitDetector,
  PoseTracker,
  AudioKit,
  getStore
}

module.exports = api
