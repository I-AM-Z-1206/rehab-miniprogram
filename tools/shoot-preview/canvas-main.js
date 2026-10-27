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

const { getStore } = require('../../utils/game/config.js')
const { GameEngine } = require('../../utils/game/engine.js')

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

engine.render()

// 状态用公开方法推进到目标，不直接改内部字段
if (STATE === 'running' || STATE === 'paused' || STATE === 'ended') {
  engine.start()
  // 用固定步长推 3 秒，让子弹/分数/连击有内容
  for (let i = 0; i < 180; i++) {
    engine.feedSensor({ pitch: ANGLE, roll: 0 })
    engine.update(1 / 60, performance.now() + i * 16.7)
  }
  engine.stopLoop && engine.stopLoop()
  if (STATE === 'paused') engine.pause()
  if (STATE === 'ended') { engine._end(); engine.stopLoop && engine.stopLoop() }
  engine.render()
}

// 冻结：停掉内部循环后自己再画一次，保证截图就是这一帧
const raf = window.requestAnimationFrame
window.requestAnimationFrame = () => 0
engine.render()
window.requestAnimationFrame = raf
