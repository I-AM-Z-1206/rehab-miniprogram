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

// 放大核对细节（?zoom=2.2&zo=72 以画面 72% 高度处为中心放大），
// 截图时放大区域会溢出视口被裁掉，正好只留下要看的部分。
const zoom = Number(params.get('zoom')) || 0
if (zoom > 0 && screenEl) {
  screenEl.style.transform = 'scale(' + zoom + ')'
  screenEl.style.transformOrigin = '50% ' + (params.get('zo') || '72') + '%'
}

canvas.width = Math.round(CSS_W * dpr)
canvas.height = Math.round(CSS_H * dpr)
canvas.style.width = CSS_W + 'px'
canvas.style.height = CSS_H + 'px'

const cfg = getStore()
cfg.reset()
// 角色（?char=fox|rabbit|panda）
if (params.get('char')) cfg.set('characterId', params.get('char'), 'preview')

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

// 快进到指定里程（?dist=22），用来核对「走过的路」光带与里程标点亮的分布
const wantDist = Number(params.get('dist')) || 0
if (wantDist > 0 && engine.state === 'PLAYING') {
  let guard = 0
  while (engine.distance < wantDist && guard < 30000) {
    engine.setSimTarget(0, 0.25) // 略前倾，行进快一些
    engine.update(1 / 60)
    engine.drainEvents()
    guard++
  }
}

// 里程碑飘字演示（?mile=20 钉住显示，方便截图核对）
const mileDemo = Number(params.get('mile')) || 0
// 失衡风线演示（?warn=0.8 强制 warnGlow，方便截图核对风线强度/方向）
const warnDemo = Number(params.get('warn')) || 0

// ---------------------------------------------------------------- 循环
//
// ?freeze=1 —— 只冻结**状态**，不冻结**绘制**。
// 原来的截图流程没有这个东西，`freeze` 参数写了也没人读：循环一直跑，
// 图集还没解码完就截图了 —— 表现为「角色时有时无」，看起来像加载 bug，
// 其实只是截早了一帧（真机上循环一直跑，永远不会有这个问题）。
// 现在冻结后仍然每帧重绘，图集一就位画面就补上。
const freeze = /[?&]freeze=1/.test(window.location.search)
let last = 0
function loop(ts) {
  const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60
  last = ts
  if (!freeze) engine.update(dt)
  const events = freeze ? [] : engine.drainEvents()
  events.forEach((ev) => {
    // 文案与真实页面一致（自动回正已撤掉，不再说「已帮你扶稳」）
    const gt = (d) => (d < 0 ? '往左压一点' : (d > 0 ? '往右压一点' : '把重心收回中间'))
    if (ev.type === 'warn') renderer.showHint(gt(ev.guide), '#8FB8CE')
    if (ev.type === 'rope:in') renderer.showHint('已越界 · ' + gt(ev.guide) + '（自己回正才能继续走）', '#B8792E')
    if (ev.type === 'rope:out') renderer.showHint('回正了，继续走', '#0A7E72')
  })
  if (mileDemo > 0) {
    // 钉住里程碑演示（?mile=20）：飘字 + 脚下金尘同帧触发，方便截图核对
    const at = Date.now() - 450
    renderer.milestone = { m: mileDemo, at: at }
    renderer.goldBurst = {
      at: at,
      x: renderer.L.cx,
      y: renderer._feetY || renderer.L.charY
    }
  }
  if (warnDemo > 0) renderer.fx.warnGlow = Math.min(1, warnDemo)
  // 渲染层一旦抛错，requestAnimationFrame 就断了，画面上只剩半帧背景，
  // 看起来像「写错样式」。开发预览必须把错误喊出来。
  try {
    renderer.render(freeze ? 0 : dt, Date.now())
  } catch (err) {
    const el = document.getElementById('state')
    if (el) el.textContent = 'RENDER ERROR: ' + (err && err.message)
    document.title = 'RENDER ERROR: ' + (err && err.message)
    console.error(err)
    return
  }
  updateStateText()
  // 预览专用：先把三张图集拉进浏览器缓存，再开始跑循环。
// 不做这一步的话，加载是在循环跑起来之后才开始的：某几帧刚好落在
// 「图集解码完成」和「最后一帧渲染」之间，截图上就只剩兜底圆点 ——
// 真机循环不会停，所以遇不到；这是截图工具的时序问题，不是产品问题。
const SPRITES = ['fox-walk-190', 'char-rabbit', 'char-panda']
Promise.all(SPRITES.map((n) => new Promise((res) => {
  const im = new Image()
  im.onload = () => { (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(true)) }
  im.onerror = () => res(false)
  im.src = '../../assets/wire/' + n + '.png'
}))).then(() => {
  last = 0
  window.requestAnimationFrame(loop)
})
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

// ?dbg=1：把角色图集的加载状态写进标题，用 --dump-dom 就能读到
// （截图只能看到「有没有画出来」，看不到「卡在哪一档」）
const DBG = /[?&]dbg=1/.test(window.location.search)

function updateStateText() {
  if (DBG) {
    try {
      const cs = require('../../pkgWire/games/wire/character-sprite.js')
      document.title = 'DBG ' + JSON.stringify(cs._debug())
    } catch (e) { document.title = 'DBGERR ' + e.message }
  }
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
