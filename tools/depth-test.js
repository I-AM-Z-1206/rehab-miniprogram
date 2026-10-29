// ============================================================================
// tools/depth-test.js —— 2.5D 纵深底座与三个渲染器的画面自检（Node 运行）
// ----------------------------------------------------------------------------
// 为什么单独一套：
//   现有的 fruit/wire/rhythm 无头测试用的是「哑 ctx」——参数传 NaN 也照收，
//   画面上就是某个元素静默消失或跑到屏幕外，本地看不出、真机才发现。
//   这里换成「严格 ctx」：任何一次绘制调用里出现 NaN / Infinity 就判红。
//
// 覆盖：
//   1. utils/scene/depth.js 每个原语在 5 种尺寸 × 极端入参下都不产生 NaN；
//   2. 静态扫描：底座不许 require three / 碰 WebGL / 碰 wx、document、window；
//   3. 三个渲染器（接水果 / 走钢丝 / 节奏训练）真实跑 render()，同样不许 NaN；
//   4. 三个渲染器都必须走共享底座（防止以后有人另起一套画法）。
//
// 用法：node tools/depth-test.js
// ============================================================================

/* eslint-disable no-console */

const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..')

let pass = 0
let fail = 0
function ok(cond, msg, extra) {
  if (cond) {
    pass += 1
  } else {
    fail += 1
    console.log('  ✗ ' + msg + (extra === undefined ? '' : '  → ' + extra))
  }
}

// ---------------------------------------------------------------- Mock Canvas
function makeGradient() {
  return {
    addColorStop(pos, color) {
      // 色标位置必须是 0~1 的有限数，否则画布会整段丢色
      if (!isFinite(pos) || pos < 0 || pos > 1) {
        throw new Error('addColorStop 位置非法: ' + pos + ' (' + color + ')')
      }
    }
  }
}

/** 严格 ctx：任何 NaN / Infinity 数值参数都记进 bad */
function makeStrictCtx(label) {
  const bad = []
  const calls = {}
  const push = (name, args) => {
    calls[name] = (calls[name] || 0) + 1
    for (let i = 0; i < args.length; i++) {
      const v = args[i]
      if (typeof v === 'number' && !isFinite(v)) {
        bad.push(name + '#' + i + ' = ' + v)
      }
    }
  }
  const target = {
    measureText: (t) => ({ width: String(t).length * 6.2 }),
    createLinearGradient: function () { push('createLinearGradient', arguments); return makeGradient() },
    createRadialGradient: function () { push('createRadialGradient', arguments); return makeGradient() },
    createPattern: () => null,
    getImageData: () => ({ data: [] })
  }
  const methods = [
    'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
    'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'rect', 'fill', 'stroke', 'clip',
    'translate', 'scale', 'rotate', 'setTransform', 'transform', 'resetTransform',
    'clearRect', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage',
    'setLineDash', 'putImageData', 'createImageData'
  ]
  methods.forEach((m) => {
    target[m] = function () { push(m, arguments) }
  })
  const ctx = new Proxy(target, {
    get(t, k) { return t[k] },
    set(t, k, v) { t[k] = v; return true }
  })
  return {
    ctx,
    bad,
    calls,
    label: label || 'ctx',
    reset() { bad.length = 0 },
    // 只报前三条，避免刷屏
    report() { return bad.slice(0, 3).join(' | ') + (bad.length > 3 ? ' …共 ' + bad.length + ' 处' : '') }
  }
}

function makeCanvas(w, h) {
  const strict = makeStrictCtx('canvas')
  const canvas = {
    width: w || 300,
    height: h || 150,
    getContext: () => strict.ctx,
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: () => {}
  }
  canvas.__strict = strict
  return canvas
}

// 渲染器和引擎在模块加载期就会摸 wx，必须先装桩
const storage = {}
global.wx = {
  getStorageSync: (k) => (storage[k] === undefined ? '' : storage[k]),
  setStorageSync: (k, v) => { storage[k] = v },
  removeStorageSync: (k) => { delete storage[k] },
  createOffscreenCanvas: (o) => makeCanvas(o.width, o.height),
  getWindowInfo: () => ({ pixelRatio: 2, statusBarHeight: 44, windowWidth: 390, windowHeight: 844 }),
  getSystemInfoSync: () => ({ pixelRatio: 2, statusBarHeight: 44, windowWidth: 390, windowHeight: 844 }),
  getMenuButtonBoundingClientRect: () => ({ top: 48, bottom: 80, left: 281, width: 87 }),
  createInnerAudioContext: () => ({
    play() {}, pause() {}, stop() {}, seek() {}, destroy() {},
    onEnded() {}, onError() {}, onTimeUpdate() {}, onCanplay() {},
    set src(v) { this._src = v }, get src() { return this._src }
  }),
  vibrateShort: () => {},
  showToast: () => {},
  showModal: () => {}
}
global.getApp = () => ({ globalData: {} })

const depth = require(path.join(ROOT, 'utils/scene/depth.js'))

// ============================================================================
// 1. 原语：5 种尺寸 × 极端入参
// ============================================================================
console.log('\n[1] 纵深原语：极端入参与多尺寸')
{
  const sizes = [
    { w: 320, h: 568 },
    { w: 375, h: 667 },
    { w: 390, h: 844 },
    { w: 414, h: 896 },
    { w: 768, h: 1024 }
  ]
  let total = 0
  sizes.forEach((s) => {
    const st = makeStrictCtx('primitives')
    const ctx = st.ctx
    const w = s.w
    const h = s.h
    const cx = w * 0.5
    ;[0.30, 0.52, 0.72].forEach((ratio) => {
      const hz = h * ratio
      const cx = w * 0.5
      // 雾
      depth.haze(ctx, { cx, y: hz, rx: w * 0.7, ry: 0.08, color: '255,247,219', alpha: 0.3, lineAlpha: 0.16, w: w * 1.1 })
      // 剪影（三层 + 多频）
      depth.ridge(ctx, {
        w, hz,
        bands: [
          { amp: 0.24, rise: 0.02, freq: 3.6, alpha: 0.4, color: '150,186,208', seed: 0.8 },
          { amp: 0.05, rise: 0, freq: 21, alpha: 0.5, color: '78,112,106', seed: 3.9 },
          { amp: 0.06, rise: 0.01, freq: 9.2, alpha: 0.3, color: '100,130,150', seed: 2.2 }
        ]
      })
      // 透视地面（含隔带 / 两侧 / 底部压暗）
      depth.perspectiveFloor(ctx, {
        w, h, hz, cx, rows: 9, cols: 5, spread: 0.3, topSpread: 0.05,
        color: '72,104,58', farAlpha: 0.05, nearAlpha: 0.17,
        stripe: { color: '52,90,46', alpha: 0.075 },
        phase: 0.37, fadeSide: 0.8, fadeBottom: 0.7, fadeColor: '3,9,15'
      })
      // 云团 / 云层
      depth.cloudSea(ctx, { w, y: hz + 40, h: 20, count: 5, alpha: 0.4, seed: 2.3, jitter: 8 })
      depth.cloudBank(ctx, { w, y: hz + 90, h: Math.max(8, h * 0.12), wave: 10, freq: 4.6, alpha: 0.4, rimAlpha: 0.16 })
      // 阴影 / 边缘光 / 暗角
      depth.softShadow(ctx, cx, hz + 60, 30, 8, 0.26, '44,72,40')
      depth.rimLight(ctx, { x: cx, y: hz, rx: 40, ry: 40, color: '255,255,255', alpha: 0.34 })
      depth.vignette(ctx, { w, h, color: '32,60,40', alpha: 0.17, cy: 0.55 })
      // 浮尘
      const dust = depth.buildDust(w, h, hz, h, 20, 5)
      for (let k = 0; k < 6; k++) {
        depth.drawDust(ctx, dust, k * 1.7, { top: hz, bottom: h, color: '255,252,214', alpha: 0.6 })
      }
      total += 1
    })
    ok(st.bad.length === 0, w + '×' + h + ' 原语无 NaN', st.report())
  })
  ok(total === 15, '15 组尺寸×地平线组合都跑过', total)
}

console.log('\n[2] 原语：非法入参必须静默返回，不能抛也不能画 NaN')
{
  const st = makeStrictCtx('bad-input')
  const ctx = st.ctx
  const cases = [
    () => depth.haze(ctx, { cx: NaN, y: 10, rx: 10 }),
    () => depth.haze(ctx, null),
    () => depth.ridge(ctx, { w: 390, hz: NaN, bands: [{ amp: 0.1 }] }),
    () => depth.perspectiveFloor(ctx, { w: 390, h: 844, hz: 900, cx: 195 }), // 地平线在屏幕外
    () => depth.perspectiveFloor(ctx, { w: 390, h: 844, hz: 400, cx: Infinity }),
    () => depth.softShadow(ctx, 10, 10, 0, 0, 0.4),
    () => depth.softShadow(ctx, NaN, 10, 20, 5, 0.4),
    () => depth.fillEllipse(ctx, 10, 10, -5, 5, '#fff'),
    () => depth.ringEllipse(ctx, 10, 10, 0, 0, '#fff', 1),
    () => depth.cloudBank(ctx, { w: 390, y: 100, h: 0 }),
    () => depth.cloudSea(ctx, { w: NaN, y: 100 }),
    () => depth.rimLight(ctx, { x: 10, y: 10, rx: 0, ry: 0 }),
    () => depth.vignette(ctx, { w: 0, h: 0 }),
    () => depth.drawDust(ctx, null, 1, {}),
    () => depth.drawDust(ctx, [], 1, {})
  ]
  let threw = ''
  cases.forEach((fn, i) => {
    try {
      fn()
    } catch (e) {
      threw = '#' + i + ' ' + e.message
    }
  })
  ok(!threw, '非法入参不抛异常', threw)
  ok(st.bad.length === 0, '非法入参不产生 NaN 绘制', st.report())

  ok(depth.depthT(-10, 400, 844) === 0, 'depthT 屏幕外上方夹到 0')
  ok(depth.depthT(900, 400, 844) === 1, 'depthT 屏幕外下方夹到 1')
  ok(depth.depthT(400, 400, 844) === 0, 'depthT 地平线处为 0')
  ok(depth.depthT(0, 400, 400) === 0, 'depthT 零高度不自除零')
}

// ============================================================================
// 3. 静态扫描
// ============================================================================
console.log('\n[3] 静态扫描：底座不引三方库 / 渲染器必须走底座')
{
  const src = fs.readFileSync(path.join(ROOT, 'utils/scene/depth.js'), 'utf-8')
  // 只看代码，注释里允许提 three（文件头就是在解释「为什么不用」）
  // ⚠️ 必须先统一换行：Windows 下是 \r\n，而 `.` 不匹配 \r，
  //    直接 `//.*$` 会整行匹配失败，注释残留导致误判（这个坑踩过一次）。
  const code = src
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')
  const banned = ['three', 'WebGL', 'webgl', 'requestAnimationFrame', 'document.', 'window.', 'wx.']
  banned.forEach((b) => ok(code.indexOf(b) < 0, '底座代码里没有 ' + b))

  const users = [
    'pkgFruit/games/fruit/renderer.js',
    'pkgWire/games/wire/renderer.js',
    'pkgRhythm/games/rhythm/renderer.js'
  ]
  users.forEach((rel) => {
    const t = fs.readFileSync(path.join(ROOT, rel), 'utf-8')
    ok(/require\(['"][^'"]*utils\/scene\/depth\.js['"]\)/.test(t), rel + ' 走了共享纵深底座')
  })
}

// ============================================================================
// 4. 三个渲染器真实渲染，不允许 NaN
// ============================================================================
console.log('\n[4] 渲染器集成：真实引擎 + 严格 Canvas')

function renderCases(name, makeRenderer, sizes) {
  const st = makeStrictCtx(name)
  let badMsg = ''
  sizes.forEach((s) => {
    try {
      const { renderer, canvas } = makeRenderer(s.w, s.h)
      st.reset()
      for (let i = 0; i < 3; i++) renderer.render(0.016, Date.now() + i * 16)
      // 渲染器的 canvas 自带一份 strict，两边都要看
      const inner = canvas && canvas.__strict ? canvas.__strict : null
      const innerBad = inner ? inner.bad.length : 0
      const outerBad = st.bad.length
      if (innerBad || outerBad) {
        throw new Error('NaN 绘制: ' + (inner ? inner.report() : '') + ' / ' + st.report())
      }
      const n = inner ? Object.keys(inner.calls).length : 0
      ok(n > 20, name + ' ' + s.w + '×' + s.h + ' 真的画了东西', n + ' 种调用')
    } catch (e) {
      badMsg = s.w + '×' + s.h + ' → ' + e.message
      ok(false, name + ' ' + s.w + '×' + s.h + ' 渲染无 NaN', badMsg)
    }
  })
}

const SIZES = [
  { w: 320, h: 568 },
  { w: 390, h: 844 },
  { w: 414, h: 896 }
]

// ---- 接水果 ----
{
  const { getStore } = require(path.join(ROOT, 'utils/fruit-config.js'))
  const { FruitEngine } = require(path.join(ROOT, 'pkgFruit/games/fruit/engine.js'))
  const { FruitRenderer } = require(path.join(ROOT, 'pkgFruit/games/fruit/renderer.js'))

  renderCases('接水果', (w, h) => {
    const cfg = getStore()
    cfg.reset()
    const engine = new FruitEngine({ cfg: cfg })
    engine.setSimMode(true)
    engine.startCountdown()
    for (let i = 0; i < 240; i++) {
      engine.setSimTarget(0, 0)
      engine.update(0.016)
      engine.drainEvents()
    }
    const canvas = makeCanvas(w * 2, h * 2)
    const renderer = new FruitRenderer({ canvas, ctx: canvas.getContext('2d'), engine, cfg })
    renderer.resize(w, h, 2)
    return { renderer, canvas }
  }, SIZES)
}

// ---- 走钢丝 ----
{
  const { getStore } = require(path.join(ROOT, 'utils/wire-config.js'))
  const { WireEngine } = require(path.join(ROOT, 'pkgWire/games/wire/engine.js'))
  const { WireRenderer } = require(path.join(ROOT, 'pkgWire/games/wire/renderer.js'))

  renderCases('走钢丝', (w, h) => {
    const cfg = getStore()
    cfg.reset()
    const engine = new WireEngine({ cfg: cfg })
    engine.setSimMode(true)
    engine.prepare()
    if (engine.calibrate) engine.calibrate()
    if (engine.startCountdown) engine.startCountdown()
    for (let i = 0; i < 180; i++) {
      if (engine.setSimTarget) engine.setSimTarget(0, 0)
      engine.update(0.016)
      if (engine.drainEvents) engine.drainEvents()
    }
    const canvas = makeCanvas(w * 2, h * 2)
    const renderer = new WireRenderer({ canvas, ctx: canvas.getContext('2d'), engine, cfg })
    renderer.resize(w, h, 2)
    return { renderer, canvas }
  }, SIZES)
}

// ---- 节奏训练 ----
{
  const { getStore } = require(path.join(ROOT, 'utils/rhythm-config.js'))
  const { RhythmEngine } = require(path.join(ROOT, 'pkgRhythm/games/rhythm/engine.js'))
  const { RhythmRenderer } = require(path.join(ROOT, 'pkgRhythm/games/rhythm/renderer.js'))

  // 模拟 BeatClock 的对外接口：时间由测试推进，不碰真实音频
  class FakeClock {
    constructor(song) {
      this.song = song || null
      this.t = 0
      this.state = 'idle'
      this.pausedAt = 0
      this.beatMs = 500
      this.mode = 'audio'
      this.isSilent = false
    }
    setSong(song) {
      this.song = song
      if (song && song.bpm) this.beatMs = 60000 / song.bpm
      return this
    }
    start() { this.state = 'playing'; this.t = 0; return this }
    pause() { if (this.state === 'playing') { this.pausedAt = this.t; this.state = 'paused' } return this }
    resume() { if (this.state === 'paused') this.state = 'playing'; return this }
    stop() { this.state = 'idle'; this.t = 0; return this }
    nowMs() { return this.state === 'paused' ? this.pausedAt : this.t }
    isPlaying() { return this.state === 'playing' }
    durationMs() { return this.song && this.song.durationMs ? this.song.durationMs : 90000 }
    advance(ms) { if (this.state === 'playing') this.t += ms }
    destroy() {}
  }

  renderCases('节奏训练', (w, h) => {
    const cfg = getStore({ fresh: true })
    cfg.reset()
    const clock = new FakeClock(null)
    const engine = new RhythmEngine({ cfg: cfg, clock: clock })
    engine.setSimMode(true)
    engine.prepare()
    if (engine.startCountdown) engine.startCountdown()
    for (let i = 0; i < 200; i++) {
      clock.advance(16)
      if (engine.setSimTarget) engine.setSimTarget(-1)
      engine.update(0.016)
      if (engine.drainEvents) engine.drainEvents()
    }
    const canvas = makeCanvas(w * 2, h * 2)
    const renderer = new RhythmRenderer({ canvas, ctx: canvas.getContext('2d'), engine, cfg })
    renderer.resize(w, h, 2)
    return { renderer, canvas }
  }, SIZES)
}

// ============================================================================
console.log('\n' + '-'.repeat(48))
if (fail) {
  console.log('有 ' + fail + ' 项未通过（通过 ' + pass + ' 项）')
  process.exitCode = 1
} else {
  console.log('全部通过：' + pass + ' 项')
}
