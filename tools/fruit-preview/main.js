// tools/fruit-preview/main.js —— 在浏览器里跑真实的接水果渲染层（开发预览用）
// 与小程序共用 games/fruit/* 与 utils/*，不是另外画的示意稿。

import { installWx } from './wx-stub.js'

installWx()

const { getStore } = require('../../utils/fruit-config.js')
const { FruitEngine } = require('../../pkgFruit/games/fruit/engine.js')
const { FruitRenderer } = require('../../pkgFruit/games/fruit/renderer.js')

const params = new URLSearchParams(window.location.search)
const CSS_W = Math.max(280, Number(params.get('w')) || 390)
const CSS_H = Math.max(480, Number(params.get('h')) || 844)
const FROZEN = /[?&]freeze=1/.test(window.location.search)
const canvas = document.getElementById('stage')
const dpr = Math.min(window.devicePixelRatio || 2, 2)

// 截图模式（?bare=1）时让手机外框跟随画布尺寸
const screenEl = document.querySelector('.screen')
if (screenEl && /[?&]bare=1/.test(window.location.search)) {
  screenEl.style.width = CSS_W + 'px'
  screenEl.style.height = CSS_H + 'px'
}

canvas.width = Math.round(CSS_W * dpr)
canvas.height = Math.round(CSS_H * dpr)
canvas.style.width = CSS_W + 'px'
canvas.style.height = CSS_H + 'px'

const cfg = getStore()
cfg.reset()
const engine = new FruitEngine({ cfg: cfg })
engine.setSimMode(true)

const renderer = new FruitRenderer({
  canvas: canvas,
  ctx: canvas.getContext('2d'),
  engine: engine,
  cfg: cfg
})
renderer.resize(CSS_W, CSS_H, dpr)

// ---------------------------------------------------------------- 场景预设
function simulate(seconds, inputFn) {
  const dt = 1 / 60
  const steps = Math.round(seconds / dt)
  for (let i = 0; i < steps; i++) {
    if (inputFn) inputFn((i + 1) * dt, i)
    engine.update(dt)
    engine.drainEvents()
  }
}

/**
 * 预览里的"玩家"：自动把果篮移向最低的那颗水果（效果=左右倾身）。
 * ?break=1 时把果篮推到一侧，用来看"水果从旁边漏下去"的样子。
 */
let breakHold = /[?&]break=1/.test(window.location.search)

function autoInput() {
  if (breakHold) {
    engine.setSimTarget(0.95, 0)
    return
  }
  const f = engine._lowestFruit()
  if (!f) {
    engine.setSimTarget(0, 0)
    return
  }
  const travel = (engine.basketMaxX - engine.basketMinX) / 2
  const nx = (f.x - 0.5) / Math.max(0.01, travel)
  engine.setSimTarget(Math.max(-1, Math.min(1, nx)), 0)
}

/** 模拟到某个条件成立为止（最多 maxSec 秒） */
function simulateUntil(maxSec, cond) {
  const dt = 1 / 60
  const steps = Math.round(maxSec / dt)
  for (let i = 0; i < steps; i++) {
    autoInput()
    engine.update(dt)
    engine.drainEvents()
    if (cond()) return true
  }
  return false
}

const scenario = (params.get('screen') || '').toLowerCase()
let frozen = FROZEN

if (scenario === 'prepare') {
  engine.prepare()
  engine.calibrate()
} else if (scenario === 'playing' || scenario === 'play') {
  engine.prepare()
  const r = engine.startCountdown()
  if (r.ok) {
    simulate(3.4, autoInput)
    simulateUntil(14, () => engine.score.hits >= 4)
  }
} else if (scenario === 'combo') {
  engine.prepare()
  const r = engine.startCountdown()
  if (r.ok) {
    simulate(3.4, autoInput)
    simulateUntil(20, () => engine.score.combo >= 4)
  }
} else if (scenario === 'result') {
  cfg.patch({ durationSec: 40, spawnInterval: 1.1 }, 'preview')
  engine.refreshGeometry()
  engine.prepare()
  const r = engine.startCountdown()
  if (r.ok) {
    simulate(3.4, autoInput)
    simulate(30, autoInput)
    engine.finish('timeout')
  }
  frozen = true
} else if (scenario === 'break') {
  breakHold = true
  engine.prepare()
  engine.startCountdown()
  // 倒数 3 秒 + 果篮推到一侧 5 秒：应该看到水果从篮子旁边漏下去
  simulate(3.4)
  simulate(5, autoInput)
} else if (scenario === 'pause') {
  engine.prepare()
  const r = engine.startCountdown()
  if (r.ok) {
    simulate(3.4, autoInput)
    simulate(8, autoInput)
    engine.pause()
  }
  frozen = true
} else if (scenario === 'sensor') {
  engine.prepare()
  const r = engine.startCountdown()
  if (r.ok) {
    simulate(3.4, autoInput)
    simulate(7, autoInput)
    engine.enterSensorError()
  }
  frozen = true
}

// ---------------------------------------------------------------- 循环
let last = 0
function loop(ts) {
  const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60
  last = ts
  if (!frozen) {
    if (simX) engine.setSimTarget(Number(simX.value) || 0, 0)
    else if (engine.state === 'PLAYING') autoInput()
    engine.update(dt)
    engine.drainEvents()
  }
  renderer.render(frozen ? 0 : dt, Date.now())
  updateStateText()
  window.requestAnimationFrame(loop)
}

// ---------------------------------------------------------------- 交互
const STATE_TEXT = {
  IDLE: '介绍页',
  READY: '设备准备页',
  CALIBRATING: '标定中',
  COUNTDOWN: '倒计时',
  PLAYING: '游戏进行中',
  PAUSED: '已暂停',
  SENSOR_ERROR: '信号中断',
  RESULT: '结算页',
  ABORTED: '已中止'
}

function updateStateText() {
  const el = document.getElementById('state')
  if (!el) return
  el.textContent = (frozen ? '（已定格）' : '') + (STATE_TEXT[engine.state] || engine.state)
  const live = document.getElementById('live')
  if (live) {
    live.textContent = '得分 ' + engine.score.total +
      ' · 接住 ' + engine.score.hits + ' · 漏接 ' + engine.score.misses +
      ' · 连击 ' + (engine.score.combo || 0) +
      ' · 水果 ' + engine.fruits.length
  }
}

function bind(id, fn) {
  const el = document.getElementById(id)
  if (el) el.addEventListener('click', fn)
}

bind('btn-intro', () => { frozen = false; engine.toIntro() })
bind('btn-prepare', () => { frozen = false; engine.prepare(); engine.calibrate() })
bind('btn-play', () => {
  frozen = false
  engine.prepare()
  if (engine.state === 'CALIBRATING') engine.cancelCalibration()
  const r = engine.startCountdown()
  if (r.ok) engine.countdown = 0.05
})
bind('btn-combo', () => {
  frozen = false
  if (engine.state !== 'PLAYING') return
  engine.debugSpawn(3, { atBasket: true })
})
bind('btn-pause', () => { frozen = false; engine.togglePause() })
bind('btn-result', () => {
  frozen = false
  if (engine.state === 'PLAYING' || engine.state === 'PAUSED') engine.finish('timeout')
})
bind('btn-freeze', () => { frozen = true })

const simX = document.getElementById('sim-x')
function paintSlider() {
  const lx = document.getElementById('sim-x-val')
  if (lx && simX) lx.textContent = Number(simX.value).toFixed(2)
  if (simX) engine.setSimTarget(Number(simX.value), 0)
}
if (simX) {
  simX.addEventListener('input', paintSlider)
  paintSlider()
}
bind('btn-center', () => {
  if (simX) simX.value = '0'
  paintSlider()
})

// 画布点击：直接命中 Canvas 里的按钮热区
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  const x = (e.clientX - rect.left) * (CSS_W / rect.width)
  const y = (e.clientY - rect.top) * (CSS_H / rect.height)
  const id = renderer.hitTest(x, y)
  if (!id) return
  renderer.markPress(id)
  handleAction(id)
})

function handleAction(id) {
  if (id === 'start') { engine.prepare(); return }
  if (id === 'back') { engine.toIntro(); return }
  if (id === 'calibrate') { engine.calibrate(); return }
  if (id === 'enter') {
    const r = engine.startCountdown()
    if (r.ok) engine.countdown = 0.05
    return
  }
  if (id === 'pause') { engine.togglePause(); return }
  if (id === 'resume') { engine.resume(); return }
  if (id === 'again' || id === 'restart') {
    const r = engine.startCountdown()
    if (r.ok) engine.countdown = 0.05
    return
  }
  if (id === 'sim:left') { engine.nudgeSim(-0.35, 0); return }
  if (id === 'sim:right') { engine.nudgeSim(0.35, 0); return }
  if (id === 'sim:center') { engine.centerSim(); return }
  if (id === 'sim:spawn') { engine.debugSpawn(3); return }
  if (id === 'sim:catch') { engine.debugAlignToBasket(); return }
  if (id === 'sim:miss') { engine.debugAlignAway(); return }
  if (id === 'sim:combo') { engine.debugSpawn(3, { atBasket: true }); return }
  if (id === 'sim:lost') { engine.enterSensorError(); return }
  if (id === 'quit' || id === 'exit') { engine.finish('aborted'); return }
  renderer.showHint('预览页不跳转：' + id, '#3E5849')
}

if (scenario !== 'bg') window.requestAnimationFrame(loop)

// 调试：?screen=bg 只画背景层到主画布，用于逐层核对配色
if (scenario === 'bg') {
  frozen = true
  const mainCtx = canvas.getContext('2d')
  mainCtx.save()
  mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  mainCtx.clearRect(0, 0, CSS_W, CSS_H)
  renderer._paintSky(mainCtx)
  mainCtx.restore()
}
