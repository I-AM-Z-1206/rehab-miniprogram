// ============================================================================
// tools/shoot-preview/canvas-main.js —— 只跑引擎、不跑页面 DOM
// ----------------------------------------------------------------------------
// 用来确认「引擎自己的绘制」是否正常：给定 width/height/dpr，画一帧。
//   ?w=390&h=600&dpr=2&state=ready|running|paused|ended&angle=0
// 页面层的问题（画布尺寸、面板挤压）不在这个文件里，见 main.js。
// ============================================================================
const params = new URLSearchParams(location.search)
const W = Number(params.get('w') || 390)
const H = Number(params.get('h') || 600)
const DPR = Number(params.get('dpr') || 2)
const STATE = (params.get('state') || 'ready').toLowerCase()
const ANGLE = Number(params.get('angle') || 0)

const store = {}
global.wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v },
  removeStorageSync: (k) => { delete store[k] },
  getWindowInfo: () => ({ windowWidth: W, windowHeight: H, pixelRatio: DPR }),
  getSystemInfoSync: () => ({ windowWidth: W, windowHeight: H, pixelRatio: DPR }),
  createInnerAudioContext: () => ({
    play() {}, pause() {}, stop() {}, seek() {}, destroy() {},
    onEnded() {}, onError() {}, onPlay() {}, onStop() {}, offEnded() {}, offError() {}
  }),
  showToast() {}, vibrateShort() {}, nextTick: (fn) => setTimeout(fn, 0)
}

const canvas = document.getElementById('c')
canvas.style.width = W + 'px'
canvas.style.height = H + 'px'
canvas.width = Math.floor(W * DPR)
canvas.height = Math.floor(H * DPR)
canvas.requestAnimationFrame = (fn) => window.requestAnimationFrame(fn)
canvas.cancelAnimationFrame = (id) => window.cancelAnimationFrame(id)

const { getStore } = require('../../pkgShoot/games/shoot/config.js')
// 浏览器里 '/assets/...' 会被解析成 file:///assets/... → 404，贴图全部退回矢量兜底，
// 预览画面就和真机不是一回事了。改成相对本 html 的路径。
require('../../pkgShoot/games/shoot/sprites.js').setBase('../../assets/games/shoot/')
const { GameEngine } = require('../../pkgShoot/games/shoot/engine.js')

const cfg = getStore()
const ctx = canvas.getContext('2d')

const engine = new GameEngine({
  canvas,
  ctx,
  width: W,
  height: H,
  dpr: DPR,
  cfg,
  handlers: { onState() {}, onEvent() {} }
})

// 表情定格：?face=normal|smug|hit
// 自动开火下靶子几乎一直在「受击闪烁」，常态脸基本截不到，
// 不强行定格就会把受击表情当成常态去评审。
function freezeEngine() {
  if (typeof engine._stopLoop === 'function') engine._stopLoop()
}

// 城市点亮进度：?light=0.7 直接设定。
// 不传就按真实推进 —— 预览只推 3 秒，light 才 0.06，画面上几乎全黑，
// 评审「点亮一座城」的效果必须能直接指定。
const LIGHT_RAW = params.get('light')
const LIGHT = (LIGHT_RAW === null || LIGHT_RAW === '')
  ? null
  : Math.max(0, Math.min(1, Number(LIGHT_RAW) || 0))

const FACE = (params.get('face') || '').toLowerCase()
function lockFace() {
  if (!engine.monster || !FACE) return
  engine.monster.sad = FACE === 'hit' ? 0.7 : 0
  engine.monster.smug = FACE === 'smug'
}

engine.render()

// 状态用公开方法推进到目标，不直接改内部字段
if (STATE === 'running' || STATE === 'paused' || STATE === 'ended') {
  engine.start()
  // 用固定步长推 3 秒，让子弹/分数/连击有内容
  for (let i = 0; i < 180; i++) {
    engine.feedSensor({ pitch: ANGLE, roll: 0 })
    engine.update(1 / 60, performance.now() + i * 16.7)
  }
  freezeEngine()
  if (STATE === 'paused') engine.pause()
  if (STATE === 'ended') { engine._end(); freezeEngine() }
  lockFace()
  engine.render()
}
lockFace()

// 冻结：停掉内部循环后自己再画一次，保证截图就是这一帧
// 贴图是异步加载的：等它们就绪后再冻结，否则截图会停在矢量兜底
// （只看引擎时最容易误判「素材没生效」，其实就是图还没读进来）
setTimeout(function () {
  const raf = window.requestAnimationFrame
  window.requestAnimationFrame = () => 0
  // 必须在冻结这一刻再定一次表情：引擎内部循环仍在跑，
  // 400ms 里足够再命中几次，锁定会被覆盖回「受击」。
  lockFace()
  if (LIGHT !== null) engine.light = LIGHT
  engine.render()
  window.requestAnimationFrame = raf
}, 400)

// 放大镜：?zoom=4&zx=195&zy=280 把指定点放到窗口中心放大。
// 用来检查小尺寸元素的细节（外星人的眼睛、战机的翼尖灯）——
// 整屏截图无论多高分辨率，看起来都是缩略图。
const ZOOM = Number(params.get('zoom') || 1)
if (ZOOM > 1) {
  const zx = Number(params.get('zx') || W / 2)
  const zy = Number(params.get('zy') || H / 2)
  document.body.style.overflow = 'hidden'
  canvas.style.position = 'absolute'
  canvas.style.transformOrigin = '0 0'
  canvas.style.transform = 'scale(' + ZOOM + ')'
  canvas.style.left = (W / 2 - zx * ZOOM) + 'px'
  canvas.style.top = (H / 2 - zy * ZOOM) + 'px'
  setTimeout(function () {
    const raf = window.requestAnimationFrame
    window.requestAnimationFrame = () => 0
    if (LIGHT !== null) engine.light = LIGHT
    engine.render()
    window.requestAnimationFrame = raf
  }, 500)
}
