// ============================================================================
// tools/shoot-preview/main.js —— 在浏览器里跑真正的 pages/shoot（整屏画布版）
// ----------------------------------------------------------------------------
// 页面现在只有一个 canvas，所以这个预览也很薄：桩掉 wx / Page，把页面 JS
// 原样 require 进来跑 onLoad → onReady，再把点击换算成 touch 事件。
//
// 参数：
//   ?screen=ready|running|paused|ended   默认 ready（进来后自己点一下也行）
//   ?bare=1                              去掉外框留白
//   ?angle=4                             模拟倾角（不传就慢慢左右摆）
//   ?hz=50                               模拟传感器帧率（0 = 不喂数据，看未连接态）
// ============================================================================

const params = new URLSearchParams(location.search)
const screen = (params.get('screen') || 'ready').toLowerCase()
const simAngle = params.get('angle') === null ? null : Number(params.get('angle'))
const hz = params.get('hz') === null ? 50 : Number(params.get('hz'))

if (/[?&]bare=1/.test(location.search)) document.body.classList.add('bare')

const canvasEl = document.getElementById('gameCanvas')
canvasEl.requestAnimationFrame = (fn) => window.requestAnimationFrame(fn)
canvasEl.cancelAnimationFrame = (id) => window.cancelAnimationFrame(id)

// ------------------------------------------------------------------ 工具
function fail(msg, err) {
  const box = document.createElement('pre')
  box.style.cssText = 'position:absolute;left:0;right:0;bottom:0;max-height:45%;overflow:auto;' +
    'margin:0;padding:10px;background:rgba(160,20,20,.92);color:#fff;font:12px/1.5 monospace;z-index:99'
  box.textContent = msg + (err ? '\n\n' + (err.stack || err.message || err) : '')
  document.getElementById('phone').appendChild(box)
  console.error(msg, err)
}

function toast(text) {
  const el = document.getElementById('toast')
  el.textContent = text
  el.classList.add('show')
  clearTimeout(el._t)
  el._t = setTimeout(() => el.classList.remove('show'), 1600)
}

// ------------------------------------------------------------------ wx 桩
const store = {}
const STATUS = 44 // 模拟 iPhone 刘海状态栏
global.wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v },
  removeStorageSync: (k) => { delete store[k] },
  getWindowInfo: () => ({
    windowWidth: 390,
    windowHeight: 844,
    pixelRatio: 2,
    statusBarHeight: STATUS,
    screenHeight: 844,
    safeArea: { top: STATUS, bottom: 810, left: 0, right: 390, width: 390, height: 766 }
  }),
  getSystemInfoSync: () => ({
    windowWidth: 390, windowHeight: 844, pixelRatio: 2, statusBarHeight: STATUS, platform: 'devtools'
  }),
  getMenuButtonBoundingClientRect: () => ({ top: STATUS + 4, bottom: STATUS + 36, left: 300, right: 380, width: 80, height: 32 }),
  createSelectorQuery: () => {
    const q = {
      in() { return q },
      select() { return q },
      selectAll() { return q },
      fields() { return q },
      boundingClientRect() { return q },
      exec(cb) {
        const r = canvasEl.getBoundingClientRect()
        cb([{ node: canvasEl, width: r.width, height: r.height, left: r.left, top: r.top }])
      }
    }
    return q
  },
  createOffscreenCanvas: ({ width, height }) => {
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    return c
  },
  createImage: () => new Image(),
  createInnerAudioContext: () => ({
    src: '', volume: 1, loop: false,
    play() {}, pause() {}, stop() {}, seek() {}, destroy() {},
    onEnded() {}, onError() {}, onPlay() {}, onStop() {}, offEnded() {}, offError() {}
  }),
  getFileSystemManager: () => ({ readFileSync() { throw new Error('no fs') } }),
  showToast: (o) => toast((o && o.title) || ''),
  showModal: (o) => {
    toast('[modal] ' + ((o && o.title) || ''))
    if (o && o.success) setTimeout(() => o.success({ confirm: false, cancel: true }), 0)
  },
  showLoading() {}, hideLoading() {},
  navigateTo: (o) => toast('→ ' + (o && o.url)),
  redirectTo: (o) => toast('→ ' + (o && o.url)),
  navigateBack: () => toast('← 返回'),
  switchTab: (o) => toast('→ ' + (o && o.url)),
  vibrateShort() {}, vibrateLong() {},
  setNavigationBarColor() {}, setNavigationBarTitle() {},
  request() {}, nextTick: (fn) => setTimeout(fn, 0),
  onWindowResize() {}, offWindowResize() {}, onThemeChange() {}, offThemeChange() {},
  getAppBaseInfo: () => ({ SDKVersion: '3.0.0' }),
  canIUse: () => true
}

global.getApp = () => ({ globalData: {} })
global.getCurrentPages = () => [{}, {}]
global.Page = (obj) => { global.__page = obj }

// ------------------------------------------------------------------ 加载页面
let page = null
try {
  // 页面已经挪进分包：pkgShoot/pages/shoot（早期在 pages/shoot，路径过期会导致
  // esbuild 保留 dynamic require，预览页直接报「页面 JS 加载失败」）
  require('../../pkgShoot/pages/shoot/shoot.js')
  page = global.__page
} catch (e) {
  fail('页面 JS 加载失败', e)
}

// setData 桩：浏览器里没有小程序运行时，只把数据合并回去
if (page) {
  page.setData = function (patch, cb) {
    Object.assign(this.data, patch || {})
    if (cb) setTimeout(cb, 0)
  }
}

// ------------------------------------------------------------------ 启动
function tap(x, y) {
  if (!page) return
  page.onTouchStart({ touches: [{ x: x, y: y }] })
  page.onTouchEnd({ changedTouches: [{ x: x, y: y }] })
}

function boot() {
  if (!page) return
  try {
    page.onLoad()
    page.onReady()
  } catch (e) {
    fail('页面生命周期报错', e)
    return
  }

  setTimeout(() => {
    const g = page.game
    if (!g) {
      fail('引擎没有创建出来（page.game 为空）')
      return
    }
    document.getElementById('boot').style.display = 'none'

    if (screen === 'running' || screen === 'paused' || screen === 'ended') {
      page.dispatch('start')
      // headless 下 requestAnimationFrame 几乎不推进，这里手动推 2.5 秒，
      // 让子弹 / 得分 / 连击都有内容，截图才有意义
      for (let i = 0; i < 150; i++) {
        page.game.feedSensor({ pitch: 2, roll: 0 })
        page.game.update(1 / 60)
      }
      if (page.game._stopLoop) page.game._stopLoop()
      page.game.render()
    }
    if (screen === 'paused') page.dispatch('pause')
    if (screen === 'ended') {
      // 直接推 3 秒再结束，结算页有真实数据
      for (let i = 0; i < 180; i++) {
        page.game.feedSensor({ pitch: 2, roll: 0 })
        page.game.update(1 / 60)
      }
      page.game._end()
      page.game.render()
    }

    // 喂传感器：按 hz 给帧，角度缓慢摆动（?angle= 固定）
    if (hz > 0) {
      let t = 0
      setInterval(() => {
        if (!page.game) return
        t += 1
        const a = simAngle === null ? Math.sin(t / 22) * 5 : simAngle
        page.game.feedSensor({ pitch: a, roll: 0 })
      }, Math.max(10, Math.round(1000 / hz)))
    }

    // 点击换算：canvas 里的坐标直接对应页面逻辑坐标
    canvasEl.addEventListener('click', (e) => {
      const r = canvasEl.getBoundingClientRect()
      tap(e.clientX - r.left, e.clientY - r.top)
    })
  }, 120)

  // 调试信息（--dump-dom 用）
  setTimeout(() => {
    const g = page && page.game
    const r = canvasEl.getBoundingClientRect()
    const d = document.createElement('div')
    d.id = 'dbg'
    d.style.display = 'none'
    d.textContent = JSON.stringify({
      rect: { w: Math.round(r.width), h: Math.round(r.height) },
      canvas: { w: canvasEl.width, h: canvasEl.height },
      engine: g ? { w: g.width, h: g.height, dpr: g.dpr, scale: Number(g.scale.toFixed(2)), state: g.state, insetTop: g.insetTop } : null,
      buttons: page && page.ui ? page.ui.buttons.map((b) => b.id) : null
    })
    document.body.appendChild(d)
  }, 2200)
}

if (document.readyState === 'complete') boot()
else window.addEventListener('load', boot)
