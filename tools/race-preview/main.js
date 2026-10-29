// ============================================================================
// tools/race-preview/main.js —— 在浏览器里跑赛车引擎（不跑小程序页面）
// ----------------------------------------------------------------------------
// 赛车是横屏游戏，设计尺寸 1334×750。这里桩掉 wx，直接 new GameEngine(canvas)，
// 然后按固定步长推进，截图就是这一帧。
//
// 参数：
//   ?w=844&h=390&dpr=2     视口（默认横屏手机）
//   ?state=menu|play|pause|result    默认 play
//   ?level=1..5            难度（只对 play 生效）
//   ?frames=180            推进帧数（60fps 下 180 = 3 秒）
//   ?angle=6               侧屈角度（模拟传感器；不传就 0）
//   ?throttle=0.7          前倾量（模拟油门）
// ============================================================================

const params = new URLSearchParams(location.search)
const W = Number(params.get('w') || 844)
const H = Number(params.get('h') || 390)
const DPR = Number(params.get('dpr') || 2)
const STATE = (params.get('state') || 'play').toLowerCase()
const LEVEL = Number(params.get('level') || 2)
const FRAMES = Number(params.get('frames') || 180)
const ANGLE = Number(params.get('angle') || 0)
const THROTTLE = Number(params.get('throttle') || 0.7)

// ------------------------------------------------------------------ wx 桩
const store = {}
const listeners = {}

// 极简 AudioContext：引擎的音频是合成音，预览里不需要出声，
// 只要不抛错、gain 能读写即可。
function fakeAudioParam() {
  return {
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
    setValueCurveAtTime() {},
    cancelScheduledValues() {}
  }
}
function fakeNode() {
  return {
    connect() { return this },
    disconnect() {},
    start() {},
    stop() {},
    gain: fakeAudioParam(),
    frequency: fakeAudioParam(),
    type: 'sine',
    buffer: null,
    onended: null
  }
}

global.wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v },
  removeStorageSync: (k) => { delete store[k] },
  getSystemInfoSync: () => ({ windowWidth: W, windowHeight: H, pixelRatio: DPR, platform: 'devtools' }),
  getWindowInfo: () => ({ windowWidth: W, windowHeight: H, pixelRatio: DPR }),
  onTouchStart: (fn) => { listeners.touchstart = fn },
  onTouchMove: (fn) => { listeners.touchmove = fn },
  onTouchEnd: (fn) => { listeners.touchend = fn },
  onKeyDown: () => {},
  onKeyUp: () => {},
  onWindowResize: () => {},
  vibrateShort: () => {},
  showToast: () => {},
  onNeedPrivacyAuthorization: (fn) => { listeners.privacy = fn },
  createInnerAudioContext: () => ({
    play() {}, pause() {}, stop() {}, seek() {}, destroy() {},
    onEnded() {}, onError() {}, onPlay() {}, onStop() {}, offEnded() {}, offError() {}
  }),
  createWebAudioContext: () => ({
    currentTime: 0,
    sampleRate: 44100,
    state: 'running',
    destination: fakeNode(),
    resume() {},
    suspend() {},
    close() {},
    createGain: fakeNode,
    createOscillator: fakeNode,
    createBuffer: () => ({ getChannelData: () => new Float32Array(1024) }),
    createBufferSource: fakeNode,
    createBiquadFilter: fakeNode,
    createDynamicsCompressor: fakeNode
  })
}

// ------------------------------------------------------------------ 画布
const canvas = document.getElementById('c')
canvas.style.width = W + 'px'
canvas.style.height = H + 'px'
canvas.width = Math.floor(W * DPR)
canvas.height = Math.floor(H * DPR)
canvas.requestAnimationFrame = (fn) => window.requestAnimationFrame(fn)
canvas.cancelAnimationFrame = (id) => window.cancelAnimationFrame(id)

function fail(msg, err) {
  const box = document.createElement('pre')
  box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:60%;overflow:auto;' +
    'margin:0;padding:10px;background:rgba(160,20,20,.94);color:#fff;font:12px/1.5 monospace;z-index:99'
  box.textContent = msg + (err ? '\n\n' + (err.stack || err.message || err) : '')
  document.body.appendChild(box)
  console.error(msg, err)
}

// ------------------------------------------------------------------ 启动
// 指向打包产物，验证的就是小程序真正加载的那份文件
const { GameEngine } = require('../../pkgRace/race/engine.js')

let engine
try {
  engine = new GameEngine(canvas)
} catch (e) {
  fail('引擎创建失败', e)
  throw e
}

// 引擎构造里 resize() 已经按 wx 尺寸设过 canvas.width/height 与 letterbox，
// 这里只做一次校正，避免页面 CSS 尺寸与缓冲区不一致。
engine.dpr = DPR
engine.canvasSize = { w: canvas.width, h: canvas.height }
engine.scale = Math.min(canvas.width / engine.view.width, canvas.height / engine.view.height)
engine.offsetX = (canvas.width - engine.view.width * engine.scale) / 2
engine.offsetY = (canvas.height - engine.view.height * engine.scale) / 2
// 页面 fit() 在「取不到胶囊」时是居中的；只有拿到胶囊才右对齐。
// 预览里没有胶囊，就必须居中，否则左边会留一条黑边（看起来像画面缺了一块）。
engine.offsetX = (canvas.width - engine.view.width * engine.scale) / 2

global.__engine = engine

// 模拟传感器：先标记已连接，否则 motion 会认为没数据
try {
  engine.ble.state = 'connected'
  engine.ble.preferMock = false
} catch (e) { /* 忽略 */ }

function feedSensor() {
  try {
    if (engine.ble && engine.ble.injectSample) {
      engine.ble.injectSample({
        angle: { roll: ANGLE, pitch: THROTTLE * 12, yaw: 0 }
      })
    }
  } catch (e) { /* 忽略 */ }
}

function advance(frames) {
  const dt = 1 / 60
  for (let i = 0; i < frames; i++) {
    feedSensor()
    engine.update(dt)
  }
}

try {
  if (STATE === 'play' || STATE === 'pause' || STATE === 'result') {
    engine.motion.setParams({ difficulty: LEVEL })
    engine.startSession()
    advance(FRAMES)
    if (STATE === 'pause') engine.setState('pause')
    if (STATE === 'result') {
      // 让倒计时与时间都走完，进入结算
      engine.countdown = 0
      for (let i = 0; i < 40; i++) {
        feedSensor()
        engine.update(1 / 60)
      }
      try { engine.finishSession() } catch (e) { fail('结算失败', e) }
    }
  } else if (STATE === 'menu') {
    engine.setState('menu')
  }
} catch (e) {
  fail('推进失败（' + STATE + '）', e)
}

try {
  engine.render()
} catch (e) {
  fail('渲染失败', e)
}
