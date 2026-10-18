// utils/zero.js —— 全局虚拟零点（两个变量：zeroRoll / zeroPitch）
//
// 意义：传感器每次佩戴的安装角度都不一样，用两个全局偏移量把「当前姿势」定义成 0°：
//   roll_virtual  = wrap180(roll_raw  + zeroRoll)
//   pitch_virtual = wrap180(pitch_raw + zeroPitch)
// 也就是在传感器原始 roll / pitch 后面「加上」一个固定偏移（负值就是减）。
//
// 生效范围：在 utils/witble.js 的 emit() 里统一叠加，所以所有页面拿到的
// d.roll / d.pitch 都已经是扣掉零点后的角度；原始值保留在 d.rawRoll / d.rawPitch，
// 因此反复标定不会累加（标定永远基于原始值算偏移）。
//
// 持久化：wx 本地存储 wt_zero_v1，重启小程序依然有效，直到下次重新标定或清除。
// 标定入口：pages/calibrate（零点标定页）。

const KEY = 'wt_zero_v1'
const DEF = { roll: 0, pitch: 0, set: false }

let state = null

function wrap180(v) {
  let x = v % 360
  if (x > 180) x -= 360
  if (x < -180) x += 360
  return x
}

function round2(v) {
  return Math.round(v * 100) / 100
}

function syncApp(s) {
  const app = typeof getApp === 'function' ? getApp() : null
  if (app) {
    app.globalData = app.globalData || {}
    app.globalData.zero = s
  }
}

function persist(s) {
  try {
    wx.setStorageSync(KEY, s)
  } catch (e) { /* 忽略 */ }
}

// 读取（带缓存，50Hz 调用也没有 IO 开销）
function load() {
  if (state) return state
  let s = null
  try {
    s = wx.getStorageSync(KEY)
  } catch (e) { /* 忽略 */ }
  if (s && typeof s.roll === 'number' && typeof s.pitch === 'number') {
    state = { roll: wrap180(s.roll), pitch: wrap180(s.pitch), set: !!s.set }
  } else {
    state = { roll: DEF.roll, pitch: DEF.pitch, set: DEF.set }
  }
  syncApp(state)
  return state
}

// 取零点偏移量（度）：全 App 唯一读取入口
function get() {
  const s = load()
  return { roll: s.roll, pitch: s.pitch, set: s.set }
}

// 直接设置偏移量（度）：含义是在传感器 roll / pitch 上「加上」这两个值
function set(roll, pitch) {
  state = {
    roll: round2(wrap180(Number(roll) || 0)),
    pitch: round2(wrap180(Number(pitch) || 0)),
    set: true
  }
  persist(state)
  syncApp(state)
  return get()
}

// 清除零点：恢复传感器原始角度
function reset() {
  state = { roll: 0, pitch: 0, set: false }
  persist(state)
  syncApp(state)
  return get()
}

// 用「当前姿势」的原始角度标定：把此刻定义为 0°
function setFromAngles(rawRoll, rawPitch) {
  return set(-(Number(rawRoll) || 0), -(Number(rawPitch) || 0))
}

// 用一批原始采样（[{ roll, pitch }...]）取均值标定；返回新零点或 null
function setFromSamples(samples) {
  if (!samples || !samples.length) return null
  let sr = 0
  let sp = 0
  let n = 0
  samples.forEach((s) => {
    if (!s) return
    if (typeof s.roll === 'number') sr += s.roll
    if (typeof s.pitch === 'number') sp += s.pitch
    n++
  })
  if (!n) return null
  return set(-sr / n, -sp / n)
}

// 把零点应用到一帧传感器数据：返回新对象（不改原对象）
function apply(d) {
  if (!d) return d
  if (typeof d.roll !== 'number' && typeof d.pitch !== 'number') return d
  const z = load()
  const out = Object.assign({}, d)
  if (typeof d.roll === 'number') {
    out.rawRoll = d.rawRoll === undefined ? d.roll : d.rawRoll
    out.roll = wrap180(d.roll + z.roll)
  }
  if (typeof d.pitch === 'number') {
    out.rawPitch = d.rawPitch === undefined ? d.pitch : d.rawPitch
    out.pitch = wrap180(d.pitch + z.pitch)
  }
  return out
}

module.exports = {
  get,
  set,
  reset,
  setFromAngles,
  setFromSamples,
  apply,
  wrap180
}
