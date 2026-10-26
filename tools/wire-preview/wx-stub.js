// tools/wire-preview/wx-stub.js —— 浏览器里模拟小程序 API 的最小桩
// 只给「渲染预览」用，不参与小程序运行

export function installWx() {
  if (typeof window === 'undefined') return
  const read = (k) => {
    try {
      const raw = window.localStorage.getItem('wireprev:' + k)
      return raw === null ? '' : JSON.parse(raw)
    } catch (e) {
      return ''
    }
  }
  const write = (k, v) => {
    try { window.localStorage.setItem('wireprev:' + k, JSON.stringify(v)) } catch (e) { /* 忽略 */ }
  }

  window.wx = {
    getStorageSync: read,
    setStorageSync: write,
    getWindowInfo: () => ({
      pixelRatio: Math.min(window.devicePixelRatio || 2, 2),
      statusBarHeight: 24,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    }),
    getMenuButtonBoundingClientRect: () => ({ top: 30, bottom: 62, left: window.innerWidth - 110, width: 90 }),
    createOffscreenCanvas: ({ width, height }) => {
      const c = document.createElement('canvas')
      c.width = width
      c.height = height
      return c
    },
    vibrateShort: () => {},
    setInnerAudioOption: () => {},
    createInnerAudioContext: () => ({
      play() {}, pause() {}, stop() {}, destroy() {}, seek() {},
      set src(v) {}, set volume(v) {}, set loop(v) {}
    })
  }
  window.getApp = () => ({ globalData: {} })
}
