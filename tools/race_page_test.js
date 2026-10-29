// ============================================================================
// tools/race_page_test.js —— 赛车页集成冒烟测试（node 直接跑）
//   node tools/race_page_test.js
// 用桩 wx / Page / canvas，完整走一遍 pages/race 的
// onLoad → onReady → initCanvas → 引擎创建 → 帧循环 → 触摸 → 旋转 → onHide → onUnload，
// 重点回归：原生横屏下窗口尺寸/画布尺寸/touch 坐标三者一致（曾经因为 CSS 旋转
// 导致画面塌成一条竖条）。
// ============================================================================

const path = require('path')

let pageObj = null
global.Page = (obj) => { pageObj = obj }

function makeCtx() {
  const grad = { addColorStop() {} }
  const target = {
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: () => ({ width: 40 })
  }
  return new Proxy(target, {
    get(t, k) { if (k in t) return t[k]; return function () {} },
    set() { return true }
  })
}

const canvasStub = {
  width: 0,
  height: 0,
  getContext: () => makeCtx(),
  requestAnimationFrame(fn) { return setTimeout(() => fn(Date.now()), 16) },
  cancelAnimationFrame(id) { clearTimeout(id) }
}

// 视口尺寸：可切换成竖屏来模拟「还没转完屏 / 横屏没生效」
let viewSize = { width: 844, height: 390 }
let resizeHandlers = []
let bleCalls = 0

const store = {}

global.wx = {
  getWindowInfo: () => ({
    windowWidth: viewSize.width,
    windowHeight: viewSize.height,
    pixelRatio: 2
  }),
  getSystemInfoSync: () => ({
    windowWidth: viewSize.width,
    windowHeight: viewSize.height,
    pixelRatio: 2,
    platform: 'devtools'
  }),
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v },
  removeStorageSync: (k) => { delete store[k] },
  vibrateShort: () => {},
  request: () => {},
  showToast: () => {},
  navigateBack: () => {},
  getPrivacySetting: (o) => o && o.success && o.success({ needAuthorization: false }),
  createInnerAudioContext: () => ({ play() {}, stop() {}, destroy() {}, pause() {} }),
  openBluetoothAdapter: () => { bleCalls += 1 },
  startBluetoothDevicesDiscovery: () => { bleCalls += 1 },
  createBLEConnection: () => { bleCalls += 1 },
  closeBLEConnection: () => {},
  getMenuButtonBoundingClientRect: () => ({
    left: viewSize.width - 100,
    top: 8,
    width: 87,
    height: 32
  }),
  onWindowResize: (fn) => { resizeHandlers.push(fn) },
  offWindowResize: (fn) => { resizeHandlers = resizeHandlers.filter((h) => h !== fn) },
  createSelectorQuery: () => {
    const q = {
      in: () => q,
      select: () => q,
      fields: () => q,
      exec: (cb) => setTimeout(() => cb([{ node: canvasStub, width: viewSize.width, height: viewSize.height }]), 0)
    }
    return q
  }
}

require(path.join(__dirname, '..', 'pkgRace', 'pages', 'race', 'race.js'))

if (!pageObj) {
  console.error('Page() 未被调用')
  process.exit(1)
}

pageObj.data = pageObj.data || {}
pageObj.setData = function (d) { Object.assign(pageObj.data, d) }

let bad = 0
const pass = (name, ok, extra) => {
  if (!ok) bad += 1
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra === undefined ? '' : '  (' + extra + ')'))
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  pageObj.onLoad()
  pageObj.onReady()
  await wait(140)

  const engine = pageObj.engine
  const dpr = 2
  const cap = { left: viewSize.width - 100 }
  const contentRight = engine.offsetX + engine.view.width * engine.scale
  pass('引擎已创建', !!engine)
  pass('画布缓冲区 = 844×390 CSS × dpr2', canvasStub.width === 1688 && canvasStub.height === 780,
    canvasStub.width + '×' + canvasStub.height)
  pass('画面没有超出画布', engine.offsetX >= -0.5 && engine.offsetY >= -0.5 &&
    contentRight <= canvasStub.width + 0.5,
    'offsetX=' + Math.round(engine.offsetX))
  pass('右上角让开微信胶囊', contentRight <= cap.left * dpr + 0.5,
    '内容右边界 ' + Math.round(contentRight) + ' ≤ 胶囊左 ' + cap.left * dpr)
  pass('高度方向顶满（不留上下黑边）',
    Math.abs(engine.offsetY) < 1.5 && Math.abs(contentRight - engine.offsetX - 1334 * engine.scale) < 0.5,
    'offsetY=' + Math.round(engine.offsetY))
  pass('横屏下提示不带「请横过来」', pageObj.data.hintText === '左上角可返回', pageObj.data.hintText)

  // 帧循环
  const before = engine.state
  await wait(300)
  pass('帧循环在跑', !!engine.state && engine.state === before)
  pass('主循环已排帧', pageObj.raf !== 0)

  // 触摸：clientX/clientY 直接进 toDesign，不再手工旋转
  let downAt = null
  const rawDown = engine.onPointerDown.bind(engine)
  engine.onPointerDown = (x, y) => { downAt = { x, y }; rawDown(x, y) }
  const expect = engine.toDesign(100, 200)
  pageObj.onTouchStart({ touches: [{ clientX: 100, clientY: 200 }] })
  pass('触摸坐标直接映射（无旋转换算）',
    !!downAt && Math.abs(downAt.x - expect.x) < 0.01 && Math.abs(downAt.y - expect.y) < 0.01,
    'design=' + Math.round(expect.x) + ',' + Math.round(expect.y))

  // 画面中心（画布坐标）应换算回设计中心
  const cx = (engine.offsetX + engine.view.width * engine.scale / 2) / dpr
  const cy = (engine.offsetY + engine.view.height * engine.scale / 2) / dpr
  const c = engine.toDesign(cx, cy)
  pass('画面中心 ↔ 设计中心 一一对应',
    Math.abs(c.x - 667) < 1 && Math.abs(c.y - 375) < 1,
    Math.round(c.x) + ',' + Math.round(c.y))
  pageObj.onTouchEnd({ changedTouches: [{ clientX: 100, clientY: 200 }] })

  // 传感器：走小程序侧单例，游戏不自己连蓝牙
  pass('游戏未自己发起蓝牙连接', bleCalls === 0, 'bleCalls=' + bleCalls)
  pass('页面已接管传感器 handlers', !!(pageObj.wit && pageObj.wit.handlers.onData))
  let injected = null
  const rawInject = engine.ble.injectSample.bind(engine.ble)
  engine.ble.injectSample = (sample) => { injected = sample; rawInject(sample) }
  pageObj.wit.handlers.onData({ roll: 12, pitch: 4, yaw: 0, ax: 0.1, ay: 0.2, az: 1, wx: 5, wy: 6, wz: 7 })
  const motion = engine.motion
  pass('样本已注入引擎（轴已按佩戴方式对调）',
    Math.abs(motion.raw.roll - 4) < 1e-6 && Math.abs(motion.raw.pitch - 12) < 1e-6,
    'roll=' + motion.raw.roll + ' pitch=' + motion.raw.pitch)
  pass('姿态被标记为已连接', motion.connected === true)
  pass('只注入角度（不带加速度/角速度）',
    !!injected && !!injected.angle && injected.gyro === undefined && injected.accel === undefined,
    JSON.stringify(injected))

  // 康复参数：小角度就该有明显响应
  const mp = engine.motion.params
  pass('灵敏度已调到康复档',
    mp.maxAngle === 10 && mp.deadZone === 1.5 && mp.smoothing === 0.18 && mp.assist === 0,
    'maxAngle=' + mp.maxAngle + ' deadZone=' + mp.deadZone + ' smoothing=' + mp.smoothing + ' assist=' + mp.assist)
  pass('左右已反转', mp.invertRoll === true)
  pass('不设刹车（后倾只减速到巡航）', mp.brakeAngle > 90, 'brakeAngle=' + mp.brakeAngle)
  const seeded = JSON.parse(store['nrr_therapist_params_v1'] || '{}')
  pass('参数已落盘给治疗师面板复用',
    seeded.maxAngle === 10 && seeded.invertRoll === true)

  // 延迟：阶跃输入后转向要多久跟上（滤波链条太慢 = 实机「不跟手」）
  {
    const m = engine.motion
    m.rollFilter.reset(0)
    m.pitchFilter.reset(0)
    m.neutral = { roll: 0, pitch: 0 }
    engine.ble.injectSample({ angle: { roll: 0, pitch: 0, yaw: 0 } })
    for (let i = 0; i < 40; i++) m.update(1 / 60)   // 先稳到 0

    engine.ble.injectSample({ angle: { roll: 8, pitch: 0, yaw: 0 } })
    // 8° 侧屈的理论满舵量：sign * (8-1.5)/(10-1.5) * 1.1，再乘 -1（invertRoll）
    const goal = (8 - 1.5) / (10 - 1.5) * 1.1
    let t90 = -1
    for (let i = 1; i <= 60; i++) {
      m.update(1 / 60)
      if (t90 < 0 && Math.abs(m.control.steer) >= goal * 0.9) t90 = i / 60 * 1000
    }
    pass('侧屈后转向响应 <160ms（改前约 330ms）',
      t90 > 0 && t90 < 160, 't90=' + (t90 < 0 ? '未达到' : Math.round(t90) + 'ms'))
    pass('满舵幅度与角度换算一致',
      Math.abs(Math.abs(m.control.steer) - goal) < 0.02,
      'steer=' + m.control.steer.toFixed(3) + ' 期望≈' + (-goal).toFixed(3))
  }

  // 50Hz：连上之后要设一次输出频率
  let rateCalled = 0
  pageObj.wit.setOutputRate = (hz) => { rateCalled = hz; return hz }
  pageObj.wit.connectedId = 'stub-device'
  pageObj.wit.handlers.onReady()
  pass('传感器输出频率设为 50Hz', rateCalled === 50, 'hz=' + rateCalled)

  // 断开：引擎状态回落
  pageObj.wit.handlers.onDisconnected()
  pass('断开后状态回落', engine.ble.state === 'idle' && pageObj.sensorReady === false)

  // 旋转（模拟竖屏尺寸回来）：refit 应重算缓冲区与缩放
  viewSize = { width: 390, height: 844 }
  resizeHandlers.forEach((fn) => fn({ size: { windowWidth: 390, windowHeight: 844 } }))
  await wait(700)
  pass('旋转后缓冲区跟着变', canvasStub.width === 780 && canvasStub.height === 1688,
    canvasStub.width + '×' + canvasStub.height)
  pass('旋转后画面仍在画布内',
    engine.offsetX >= -0.5 && engine.offsetY >= -0.5 &&
    engine.offsetX + 1334 * engine.scale <= canvasStub.width + 0.5,
    'scale=' + engine.scale.toFixed(3))
  pass('竖屏时提示横过来', pageObj.data.hintText.indexOf('横过来') >= 0, pageObj.data.hintText)

  // 切后台 / 回前台（先进入对局，验证会自动暂停）
  engine.setState('play')
  engine.audio.master = { gain: { value: 0.35 } }
  engine.audio.bgmTimer = setInterval(() => {}, 20)
  pageObj.onHide()
  pass('切后台停掉 BGM', engine.audio.bgmTimer === null)
  pass('切后台音量归零', engine.audio.master.gain.value === 0)
  pass('切后台停帧并暂停', pageObj.raf === 0 && engine.state === 'pause')
  pageObj.onShow()
  await wait(60)
  pass('回前台恢复循环', pageObj.raf !== 0)

  engine.audio.bgmTimer = setInterval(() => {}, 20)
  const handlersBefore = resizeHandlers.length
  pageObj.onUnload()
  pass('卸载后音频彻底静音', engine.audio.bgmTimer === null && engine.audio.master.gain.value === 0)
  pass('卸载后清空引用', pageObj.engine === null && pageObj.raf === 0)
  pass('卸载后解绑旋转监听', resizeHandlers.length === handlersBefore - 1,
    handlersBefore + ' → ' + resizeHandlers.length)

  const bundle = require('fs').readFileSync(path.join(__dirname, '..', 'pkgRace', 'race', 'engine.js'), 'utf8')
  pass('引擎产物无蓝牙入口文案', bundle.indexOf('连接 WT9011 传感器') < 0)
  pass('引擎产物 HUD 已换成体感角度', bundle.indexOf('侧屈 ') >= 0)
  pass('引擎产物已注入开局初速度', bundle.indexOf('this.diff.maxSpeed*.3') >= 0)

  console.log('\n' + (bad ? '存在 ' + bad + ' 项失败' : '全部通过'))
  process.exit(bad ? 1 : 0)
})()
