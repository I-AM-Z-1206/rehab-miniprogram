// tools/wire-preview/main.js —— 在浏览器里跑真实的走钢丝渲染层（开发预览用）
// 与小程序共用 games/wire/* 与 utils/*，不是另外画的示意稿。

import { installWx } from './wx-stub.js'

installWx()

const { getStore } = require('../../utils/wire-config.js')
const { WireEngine } = require('../../pkgWire/games/wire/engine.js')
const { WireRenderer } = require('../../pkgWire/games/wire/renderer.js')

const params = new URLSearchParams(window.location.search)
const CSS_W = Math.max(280, Number(params.get('w')) || 390)
const CSS_H = Math.max(480, Number(params.get('h')) || 844)
const canvas = document.getElementById('stage')
const dpr = Math.min(window.devicePixelRatio || 2, 2)

// 截图模式（?bare=1）时让手机外框跟随画布尺寸，避免被固定 390×844 裁掉
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
const engine = new WireEngine({ cfg: cfg })
engine.setSimMode(true)

const renderer = new WireRenderer({
  canvas: canvas,
  ctx: canvas.getContext('2d'),
  engine: engine,
  cfg: cfg
})
renderer.resize(CSS_W, CSS_H, dpr)

// ---------------------------------------------------------------- 场景预设
// 用 ?screen=prepare|play|rope|result 直接进入某个画面，方便截图核对视觉
function simulate(seconds, inputFn) {
  const dt = 1 / 60
  const steps = Math.round(seconds / dt)
  for (let i = 0; i < steps; i++) {
    if (inputFn) inputFn((i + 1) * dt, i)
    engine.update(dt)
    engine.drainEvents()
  }
}

const scenario = (params.get('screen') || '').toLowerCase()
if (scenario === 'prepare') {
  engine.prepare()
  engine.calibrate()
} else if (scenario === 'play') {
  engine.prepare()
  const r = engine.startCountdown()
  if (r.ok) {
    simulate(9, (t) => engine.setSimTarget(Math.sin(t * 0.9) * 0.42, Math.sin(t * 0.4) * 0.2))
  }
} else if (scenario === 'rope') {
  engine.prepare()
  const r = engine.startCountdown()
  if (r.ok) {
    simulate(4, () => engine.setSimTarget(0.1, 0))
    simulate(2.4, () => engine.setSimTarget(0.97, 0.1))
  }
} else if (scenario === 'result') {
  engine.prepare()
  const r = engine.startCountdown()
  if (r.ok) {
    simulate(26, (t) => engine.setSimTarget(Math.sin(t * 0.7) * 0.35, Math.sin(t * 0.3) * 0.15))
    engine.finish('timeout')
  }
}

// ---------------------------------------------------------------- 循环
let last = 0
function loop(ts) {
  const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60
  last = ts
  engine.update(dt)
  const events = engine.drainEvents()
  events.forEach((ev) => {
    if (ev.type === 'warn') renderer.showHint('已接近失衡 · 慢慢回正', '#DF5540')
    if (ev.type === 'rope:in') renderer.showHint('保险绳已介入，已帮你扶稳', '#9A6414')
    if (ev.type === 'rope:out') renderer.showHint('已恢复平衡', '#0A7E72')
  })
  renderer.render(dt, Date.now())
  updateStateText()
  window.requestAnimationFrame(loop)
}
window.requestAnimationFrame(loop)

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
  el.textContent = STATE_TEXT[engine.state] || engine.state
  const score = document.getElementById('live')
  if (score) {
    score.textContent = '得分 ' + engine.score.total +
      ' · 平衡 ' + engine.balance.toFixed(2) +
      ' · 保险绳 ' + engine.safety.snapshot().short +
      ' · ' + (engine.distance).toFixed(1) + '/' + cfg.get('trackLength') + 'm'
  }
}

function bind(id, fn) {
  const el = document.getElementById(id)
  if (el) el.addEventListener('click', fn)
}

bind('btn-intro', () => engine.toIntro())
bind('btn-prepare', () => {
  engine.prepare()
  engine.calibrate()
})
bind('btn-play', () => {
  engine.prepare()
  if (engine.state === 'CALIBRATING') engine.cancelCalibration()
  const r = engine.startCountdown()
  if (r.ok) engine.countdown = 0.05
})
bind('btn-rope', () => {
  if (engine.state !== 'PLAYING') return
  engine.setSimTarget(1, 0)
  syncSliders(1, 0)
})
bind('btn-pause', () => {
  if (engine.state === 'PLAYING') engine.pause()
  else if (engine.state === 'PAUSED') engine.resume()
})
bind('btn-result', () => {
  if (engine.state === 'PLAYING' || engine.state === 'PAUSED') engine.finish('timeout')
})

const sx = document.getElementById('sim-x')
const sy = document.getElementById('sim-y')
function syncSliders(x, y) {
  if (sx) sx.value = String(x)
  if (sy) sy.value = String(y)
  paintSlider()
}
function paintSlider() {
  const lx = document.getElementById('sim-x-val')
  const ly = document.getElementById('sim-y-val')
  if (lx) lx.textContent = Number(sx.value).toFixed(2)
  if (ly) ly.textContent = Number(sy.value).toFixed(2)
}
if (sx && sy) {
  const apply = () => {
    engine.setSimTarget(Number(sx.value), Number(sy.value))
    paintSlider()
  }
  sx.addEventListener('input', apply)
  sy.addEventListener('input', apply)
  paintSlider()
}

bind('btn-center', () => {
  syncSliders(0, 0)
  engine.setSimTarget(0, 0)
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
  if (id === 'again') { 
    const r = engine.startCountdown()
    if (r.ok) engine.countdown = 0.05
    return
  }
  if (id === 'sim:left') { engine.nudgeSim(-0.3, 0); return }
  if (id === 'sim:right') { engine.nudgeSim(0.3, 0); return }
  if (id === 'sim:up') { engine.nudgeSim(0, 0.3); return }
  if (id === 'sim:down') { engine.nudgeSim(0, -0.3); return }
  if (id === 'sim:center') { engine.centerSim(); return }
  if (id === 'sim:rope') { engine.setSimTarget(1, engine.motion.ny); return }
  if (id === 'quit' || id === 'exit') { engine.finish('aborted'); return }
  // 其余按钮（设置 / 记录 / 连接 / 重连）在预览页里只做提示
  renderer.showHint('预览页不跳转：' + id, '#3F586B')
}
