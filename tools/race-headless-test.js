// ============================================================================
// tools/race-headless-test.js —— 赛车引擎无头自检（Node 运行，不需要微信/真机）
// ----------------------------------------------------------------------------
// 为什么要有这一套：
//   赛车是五个游戏里唯一零测试的。它是横屏 + 蓝牙 + Canvas + 一份外部打包产物，
//   改了任何东西都只能靠肉眼看，而「肉眼看着能跑」和「患者能用」是两回事。
//
// 这里测的不是「能不能跑」，而是「康复参数有没有被悄悄改坏」：
//   · 跟手延迟 —— 患者侧屈后多久车才转向（旧滤波 210ms+，患者会觉得失控）
//   · 死区     —— 呼吸级别的抖动不能变成转向指令
//   · 巡航     —— 患者不发力车也要缓慢前进，不能原地不动
//   · 确定性   —— 路旁景物每帧位置必须一致，否则满屏闪烁
//   · 数值健康 —— 投影数学里任何 NaN/Infinity 都判红（真机上表现为元素凭空消失）
//   · 长跑稳定 —— 2000 帧不崩、粒子池不无限增长
//
// 用「严格 ctx」：每次绘制调用的数字参数必须是有限数，否则抛错并指出方法名。
// 哑 ctx 会照单全收 NaN，画面上就是某个元素静默消失，本地永远发现不了。
//
// 测的是**打包产物** pkgRace/race/engine.js，即小程序真正加载的那份文件。
//
// 用法：node tools/race-headless-test.js
// ============================================================================

/* eslint-disable no-console */

const path = require('path')

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
function near(a, b, eps) {
  return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= (eps || 1e-6)
}

// ============================================================== wx 桩
// 必须在 require 引擎之前装好：引擎模块顶层会探测 typeof wx 决定存储走哪条路
const store = {}
const bleCalls = []

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
  const n = {
    connect() { return n },
    disconnect() {},
    start() {},
    stop() {},
    gain: fakeAudioParam(),
    frequency: fakeAudioParam(),
    type: 'sine',
    buffer: null,
    onended: null
  }
  return n
}

global.wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v },
  removeStorageSync: (k) => { delete store[k] },
  getSystemInfoSync: () => ({ windowWidth: 844, windowHeight: 390, pixelRatio: 2, platform: 'devtools' }),
  getWindowInfo: () => ({ windowWidth: 844, windowHeight: 390, pixelRatio: 2 }),
  // 蓝牙必须由小程序侧单例（utils/witble.js）统一管，游戏自己再开一次会二次弹权限、
  // 还会和已连接实例抢设备。这里把 BLE 接口全部记数，最后断言一次都没被调用。
  openBluetoothAdapter: () => { bleCalls.push('openBluetoothAdapter') },
  startBluetoothDevicesDiscovery: () => { bleCalls.push('startBluetoothDevicesDiscovery') },
  createBLEConnection: () => { bleCalls.push('createBLEConnection') },
  onBluetoothDeviceFound: () => { bleCalls.push('onBluetoothDeviceFound') },
  onTouchStart: () => {},
  onTouchMove: () => {},
  onTouchEnd: () => {},
  onWindowResize: () => {},
  vibrateShort: () => {},
  showToast: () => {},
  request: () => {},
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

// ============================================================== 严格 Canvas
const MAX_LOG = 40000

// 这些是画布上的「数据属性」，读出来必须是值而不是函数
const ACCESSORS = new Set([
  'canvas', 'fillStyle', 'strokeStyle', 'globalAlpha', 'globalCompositeOperation',
  'lineWidth', 'lineCap', 'lineJoin', 'miterLimit', 'lineDashOffset', 'lineDash',
  'font', 'textAlign', 'textBaseline', 'direction', 'filter',
  'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY',
  'imageSmoothingEnabled', 'imageSmoothingQuality', 'fontKerning',
  'letterSpacing', 'wordSpacing', 'textRendering'
])

function fmtNum(v) {
  if (typeof v !== 'number') return String(v)
  return Number.isInteger(v) ? String(v) : v.toFixed(4)
}
function fmtArg(v) {
  if (v === null) return 'null'
  if (v === undefined) return 'undef'
  if (typeof v === 'object') return Array.isArray(v) ? '[' + v.map(fmtNum).join(' ') + ']' : '{obj}'
  return fmtNum(v)
}

function makeGradient(label) {
  return {
    addColorStop(pos, color) {
      if (typeof pos !== 'number' || !isFinite(pos) || pos < 0 || pos > 1) {
        throw new Error(label + '.addColorStop 位置非法：' + pos + '（' + color + '）')
      }
    }
  }
}

function makeCtx(canvas) {
  const state = { canvas }
  const stats = Object.create(null)
  const log = []

  // 给测试用的清空入口（挂在 target 上，Proxy 会原样返回）
  state.__reset = () => {
    Object.keys(stats).forEach((k) => { delete stats[k] })
    log.length = 0
  }
  state.__snapshot = () => ({
    total: Object.keys(stats).reduce((s, k) => s + stats[k], 0),
    stats: Object.assign({}, stats),
    log: log.slice()
  })

  function assertFinite(name, args) {
    for (let i = 0; i < args.length; i++) {
      const v = args[i]
      if (typeof v === 'number' && !isFinite(v)) {
        throw new Error('ctx.' + name + ' 第 ' + (i + 1) + ' 个参数是 ' + v +
          '（完整参数：' + args.map(fmtArg).join(', ') + '）')
      }
      if (Array.isArray(v)) {
        for (const x of v) {
          if (typeof x === 'number' && !isFinite(x)) {
            throw new Error('ctx.' + name + ' 的数组参数含 ' + x)
          }
        }
      }
    }
  }

  const special = {
    createLinearGradient(x0, y0, x1, y1) {
      assertFinite('createLinearGradient', [x0, y0, x1, y1])
      return makeGradient('线性渐变')
    },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      assertFinite('createRadialGradient', [x0, y0, r0, x1, y1, r1])
      if (r0 < 0 || r1 < 0) throw new Error('径向渐变半径为负：' + r0 + ' / ' + r1)
      return makeGradient('径向渐变')
    },
    createConicGradient() { return makeGradient('锥形渐变') },
    createPattern() { return { setTransform() {} } },
    measureText(t) { return { width: String(t == null ? '' : t).length * 7 } },
    getImageData(x, y, w, h) {
      const n = Math.max(4, (w | 0) * (h | 0) * 4)
      return { data: new Uint8ClampedArray(n), width: w | 0, height: h | 0 }
    },
    createImageData(w, h) {
      const n = Math.max(4, (w | 0) * (h | 0) * 4)
      return { data: new Uint8ClampedArray(n), width: w | 0, height: h | 0 }
    },
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } },
    isPointInPath() { return false },
    // 图片素材在无头环境里永远没加载，传进来的是 null；只要不崩就算通过
    drawImage() { return undefined }
  }

  return new Proxy(state, {
    get(t, k) {
      if (typeof k !== 'string') return t[k]
      if (k in t) return t[k]
      if (ACCESSORS.has(k)) return undefined
      return function recorder(...args) {
        stats[k] = (stats[k] || 0) + 1
        if (log.length < MAX_LOG) log.push(k + '|' + args.map(fmtArg).join(','))
        if (special[k]) return special[k].apply(null, args)
        assertFinite(k, args)
        return undefined
      }
    },
    set(t, k, v) {
      if (typeof v === 'number' && !isFinite(v)) {
        throw new Error('设置 ctx.' + k + ' = ' + v + '（非有限数会让整层绘制消失）')
      }
      t[k] = v
      return true
    }
  })
}

function makeCanvas(w, h) {
  let ctx = null
  const c = {
    width: w,
    height: h,
    getContext(type) {
      if (type !== '2d') return null
      if (!ctx) ctx = makeCtx(c)
      return ctx
    },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    toDataURL: () => ''
  }
  return c
}

// ============================================================== 加载产物
const ENGINE_PATH = path.resolve(__dirname, '..', 'pkgRace', 'race', 'engine.js')
const { GameEngine } = require(ENGINE_PATH)

const DESIGN = { width: 1334, height: 750 }

// 页面里 MOTION_TUNE 的那套康复参数（pkgRace/pages/race/race.js）
const MOTION_TUNE = {
  maxAngle: 10,
  deadZone: 1.5,
  brakeAngle: 999,
  smoothing: 0.18,
  assist: 0,
  rollSensitivity: 1.1,
  pitchSensitivity: 1.1,
  invertRoll: true
}

function newEngine(w, h) {
  const canvas = makeCanvas(w || 1688, h || 780)
  const engine = new GameEngine(canvas)
  engine.audio.musicEnabled = false
  engine.audio.enabled = false
  engine.motion.setParams(MOTION_TUNE)
  return { engine, canvas }
}

// ============================================================== 1. 构造与视口
console.log('== 1. 构造与 letterbox ==')
{
  const { engine, canvas } = newEngine()

  ok(engine.state === 'menu', '初始状态是菜单', engine.state)
  ok(engine.view.width === DESIGN.width && engine.view.height === DESIGN.height,
    '设计尺寸 1334×750', engine.view.width + '×' + engine.view.height)
  ok(canvas.width === 1688 && canvas.height === 780,
    '画布按 windowWidth×dpr 设置', canvas.width + '×' + canvas.height)
  ok(engine.dpr === 2, 'dpr 取 pixelRatio 且不超过 2', engine.dpr)

  const sc = Math.min(canvas.width / DESIGN.width, canvas.height / DESIGN.height)
  ok(near(engine.scale, sc, 1e-9), 'scale = min(w/1334, h/750)', engine.scale + ' vs ' + sc)
  ok(engine.scale > 0 && isFinite(engine.scale), 'scale 是正有限数', engine.scale)

  // 横屏 844×390（dpr2 → 1688×780）：750 高是瓶颈，上下不留黑边，左右留边
  const contentW = DESIGN.width * engine.scale
  const contentH = DESIGN.height * engine.scale
  ok(contentH <= canvas.height + 1e-6, 'letterbox 纵向不溢出', contentH)
  ok(contentW <= canvas.width + 1e-6, 'letterbox 横向不溢出', contentW)
  ok(near(engine.offsetX, (canvas.width - contentW) / 2, 1e-6),
    '无胶囊信息时画面居中（不是贴右）', engine.offsetX)
  ok(near(engine.offsetY, (canvas.height - contentH) / 2, 1e-6),
    '纵向居中', engine.offsetY)

  // toDesign 必须与 render 用的变换严格互逆，否则点击位置整体偏移
  let worst = 0
  const pts = [
    [0, 0], [DESIGN.width, 0], [0, DESIGN.height], [DESIGN.width, DESIGN.height],
    [667, 375], [1300, 40], [40, 720]
  ]
  for (const [dx, dy] of pts) {
    const cx = (dx * engine.scale + engine.offsetX) / engine.dpr
    const cy = (dy * engine.scale + engine.offsetY) / engine.dpr
    const back = engine.toDesign(cx, cy)
    worst = Math.max(worst, Math.abs(back.x - dx), Math.abs(back.y - dy))
  }
  ok(worst < 1e-6, 'toDesign 与渲染变换严格互逆（点击不偏移）', '最大误差 ' + worst.toExponential(2))
}

// ============================================================== 2. 姿态链路
console.log('== 2. 姿态链路（BLE 注入 → 解算 → 控制量）==')
{
  const { engine } = newEngine()
  const m = engine.motion

  // 采样必须真的走到 motion.raw：这是 injectSample → emit('sample') → onSample 的整条链
  engine.ble.state = 'connected'
  engine.ble.injectSample({ angle: { roll: 4.2, pitch: -3.1, yaw: 0 } })
  ok(near(m.raw.roll, 4.2, 1e-9) && near(m.raw.pitch, -3.1, 1e-9),
    'injectSample 把角度写进 motion.raw', m.raw.roll + ' / ' + m.raw.pitch)
  ok(m.connected === true, '收到样本后标记 connected')

  // 跟手延迟：阶跃到 maxAngle，测达到 90% 用了多久
  m.reset()
  m.neutral.roll = 0
  m.neutral.pitch = 0
  const STEP = MOTION_TUNE.maxAngle
  const DT = 1 / 60
  let t90 = -1
  let first = 0
  for (let i = 1; i <= 60; i++) {
    m.raw.roll = STEP
    m.update(DT)
    if (i === 1) first = Math.abs(m.smoothed.roll)
    if (t90 < 0 && Math.abs(m.smoothed.roll) >= STEP * 0.9) t90 = i * DT * 1000
  }
  ok(t90 > 0 && t90 <= 160,
    '阶跃响应 90% ≤ 160ms（旧滤波 210ms+ 会让患者觉得失控）',
    t90 < 0 ? '60 帧内没到 90%' : t90.toFixed(0) + 'ms')
  ok(first < STEP * 0.9,
    '第一帧不会瞬移到目标（说明滤波真的在起作用，不是直通）',
    (first / STEP * 100).toFixed(0) + '%')

  // 稳态必须收敛到目标，不能有静差（否则打不满方向盘）
  ok(Math.abs(m.smoothed.roll - STEP) < STEP * 0.02,
    '稳态收敛到目标角度（无静差）', m.smoothed.roll.toFixed(3))

  // 死区：低于 deadZone 的抖动不能产生转向
  m.reset()
  m.raw.roll = MOTION_TUNE.deadZone * 0.8
  for (let i = 0; i < 60; i++) m.update(DT)
  ok(Math.abs(m.control.steer) < 1e-6,
    '死区内（' + (MOTION_TUNE.deadZone * 0.8).toFixed(1) + '°）不产生转向', m.control.steer)

  // 满打：达到 maxAngle 时方向盘应打满
  m.reset()
  m.raw.roll = MOTION_TUNE.maxAngle
  for (let i = 0; i < 60; i++) m.update(DT)
  ok(Math.abs(Math.abs(m.control.steer) - 1) < 0.06,
    '到 maxAngle 时方向盘接近打满', m.control.steer)

  // 转向方向：invertRoll=true 时，正角度 → 负转向（实机左右颠倒过，别再翻回去）
  ok(Math.sign(m.control.steer) < 0,
    'invertRoll 生效：正侧屈 → 负转向（实机方向对得上）', m.control.steer)

  // 油门：前倾产生油门，且不该超过 1
  m.reset()
  m.raw.roll = 0
  m.raw.pitch = MOTION_TUNE.maxAngle
  for (let i = 0; i < 60; i++) m.update(DT)
  ok(m.control.throttle > 0.5 && m.control.throttle <= 1,
    '前倾产生油门且被钳在 1 以内', m.control.throttle)

  // 康复期不设刹车：brakeAngle 999 时后倾只收油门，不产生刹车
  ok(m.control.brake === 0, 'brakeAngle=999 时不产生刹车（车不会停死）', m.control.brake)
}

// ============================================================== 3. 会话与巡航
console.log('== 3. 会话、巡航与难度 ==')
{
  const { engine } = newEngine()

  engine.startSession()
  ok(engine.state === 'play', 'startSession 进入 play', engine.state)
  ok(engine.countdown > 0, '开局有倒计时（给患者准备时间）', engine.countdown)
  ok(near(engine.player.speed, engine.diff.maxSpeed * 0.3, 1e-6),
    '开局带 30% 初速度（患者不发力也会缓慢前进）',
    engine.player.speed + ' / ' + engine.diff.maxSpeed)
  ok(engine.timeLeft === engine.motion.params.sessionSeconds,
    'timeLeft 重置为会话时长', engine.timeLeft)

  // 倒计时期间车就该动，不该原地等
  const z0 = engine.player.z
  for (let i = 0; i < 60; i++) engine.update(1 / 60)
  ok(engine.player.z > z0, '倒计时期间车已开始前进', (engine.player.z - z0).toFixed(0))

  // 倒计时结束后，患者完全不动（roll=0/pitch=0）也应靠巡航继续走
  engine.countdown = 0
  engine.ble.state = 'connected'
  const z1 = engine.player.z
  for (let i = 0; i < 120; i++) {
    engine.ble.injectSample({ angle: { roll: 0, pitch: 0, yaw: 0 } })
    engine.update(1 / 60)
  }
  ok(engine.player.z > z1, '患者不发力也有巡航前进（不会卡在原地）',
    '+' + (engine.player.z - z1).toFixed(0))
  ok(engine.player.speedPct > 0.05 && engine.player.speedPct <= 1,
    'speedPct 在合理区间', engine.player.speedPct.toFixed(3))

  // 难度：5 档速度上限递增，且切换难度会同步给姿态参数
  let prev = 0
  let mono = true
  for (let lv = 1; lv <= 5; lv++) {
    engine.setDifficulty(lv)
    if (!(engine.diff.maxSpeed > prev)) mono = false
    prev = engine.diff.maxSpeed
    ok(engine.motion.params.difficulty === lv, '难度 ' + lv + ' 同步给姿态参数',
      engine.motion.params.difficulty)
  }
  ok(mono, '5 档难度速度上限严格递增')

  // 越界/非法难度要被钳住，不能出现 0 档或 NaN 配置
  engine.setDifficulty(99)
  ok(engine.diff.level >= 1 && engine.diff.level <= 5, '难度越界被钳到 1~5', engine.diff.level)
  engine.setDifficulty(NaN)
  ok(engine.diff && isFinite(engine.diff.maxSpeed), '难度传 NaN 不产生 NaN 配置',
    String(engine.diff && engine.diff.level))

  // dt 钳制：切后台回来常常给一个巨大的 dt，不能让它把车瞬移穿模
  const { engine: e2 } = newEngine()
  e2.startSession()
  e2.countdown = 0
  const za = e2.player.z
  e2.update(5)
  const jump = e2.player.z - za
  const maxStep = (e2.diff.maxSpeed / 20) * 1.2
  ok(jump <= maxStep, 'dt 被钳到 1/20（大 dt 不穿模）',
    jump.toFixed(0) + ' ≤ ' + maxStep.toFixed(0))
  ok(isFinite(e2.player.x) && isFinite(e2.player.z), '大 dt 后坐标仍有限')
}

// ============================================================== 4. 渲染
console.log('== 4. 渲染（严格 ctx：任何 NaN 都判红）==')
{
  const { engine, canvas } = newEngine()
  engine.startSession()
  engine.countdown = 0
  engine.ble.state = 'connected'
  for (let i = 0; i < 90; i++) {
    engine.ble.injectSample({ angle: { roll: 6, pitch: 8, yaw: 0 } })
    engine.update(1 / 60)
  }

  const ctx = canvas.getContext('2d')
  ctx.__reset()

  let renderErr = null
  try {
    engine.render()
  } catch (e) {
    renderErr = e
  }
  ok(!renderErr, '对局中渲染无异常 / 无 NaN', renderErr && renderErr.message)

  if (!renderErr) {
    const snap = ctx.__snapshot()
    const used = Object.keys(snap.stats)
    ok(used.length >= 8, '渲染确实调用了多种绘制方法', used.length + ' 种：' + used.slice(0, 10).join(','))
    ok(snap.total > 400, '单帧绘制调用量 > 400（画面不是一片空白）', snap.total)
    ok(snap.log.length > 0, '绘制序列已记录', snap.log.length)
    // 关键层次缺一不可
    ok((snap.stats.fillRect || 0) > 0, '有矩形填充（背景/路面）', snap.stats.fillRect)
    ok((snap.stats.createLinearGradient || 0) + (snap.stats.createRadialGradient || 0) > 0,
      '有渐变（天空/光池/地平线雾）',
      (snap.stats.createLinearGradient || 0) + '+' + (snap.stats.createRadialGradient || 0))
    ok((snap.stats.arc || 0) + (snap.stats.ellipse || 0) > 0, '有弧形绘制（灯光/粒子）',
      (snap.stats.arc || 0) + '+' + (snap.stats.ellipse || 0))
  }

  ok(typeof engine.render === 'function', 'render 是可调用方法')
}

// ============================================================== 5. 确定性
console.log('== 5. 同帧渲染确定性（景物不闪）==')
{
  const { engine, canvas } = newEngine()
  engine.startSession()
  engine.countdown = 0
  engine.ble.state = 'connected'
  for (let i = 0; i < 90; i++) {
    engine.ble.injectSample({ angle: { roll: 3, pitch: 6, yaw: 0 } })
    engine.update(1 / 60)
  }
  const ctx = canvas.getContext('2d')

  ctx.__reset()
  engine.render()
  const a = ctx.__snapshot()

  ctx.__reset()
  engine.render()
  const b = ctx.__snapshot()

  ok(a.total > 0 && a.total === b.total, '同一状态连续渲染两次，绘制调用数一致',
    a.total + ' vs ' + b.total)
  ok(a.log.length === b.log.length, '绘制序列长度一致', a.log.length + ' vs ' + b.log.length)

  // 逐条比对参数。若景物位置用了 Math.random()，这里必然对不上——
  // 真机上的表现就是路旁灯柱/广告牌每帧乱跳。
  let diff = -1
  const n = Math.min(a.log.length, b.log.length)
  for (let i = 0; i < n; i++) {
    if (a.log[i] !== b.log[i]) { diff = i; break }
  }
  ok(diff < 0, '绘制序列逐条完全一致（路旁景物不闪烁）',
    diff < 0 ? '' : '第 ' + diff + ' 条：' + a.log[diff] + ' vs ' + b.log[diff])

  // 推进一帧后序列必须变化，否则说明画面是死的
  engine.ble.injectSample({ angle: { roll: -5, pitch: 9, yaw: 0 } })
  engine.update(1 / 60)
  ctx.__reset()
  engine.render()
  const c = ctx.__snapshot()
  ok(c.log.length !== a.log.length || c.log.some((v, i) => v !== a.log[i]),
    '推进一帧后绘制内容发生变化（画面在动，不是静帧）')
}

// ============================================================== 6. 长跑稳定
console.log('== 6. 长跑稳定（2000 帧 ≈ 33 秒）==')
{
  const { engine } = newEngine()
  engine.startSession()
  engine.countdown = 0
  engine.ble.state = 'connected'

  let err = null
  const t0 = Date.now()
  try {
    for (let i = 0; i < 2000; i++) {
      // 模拟患者来回侧屈 + 前倾，把转向/漂移/碰撞/氮气分支都走到
      const roll = Math.sin(i / 37) * 8
      const pitch = 4 + Math.sin(i / 53) * 5
      engine.ble.injectSample({ angle: { roll, pitch, yaw: 0 } })
      engine.update(1 / 60)
      if (i % 20 === 0) engine.render()
    }
  } catch (e) {
    err = e
  }
  const ms = Date.now() - t0
  ok(!err, '2000 帧不抛异常', err && err.message)
  ok(isFinite(engine.player.z) && isFinite(engine.player.x), '长跑后坐标仍有限',
    engine.player.x.toFixed(1) + ',' + engine.player.z.toFixed(0))

  const fx = engine.fx
  ok(fx.active.length <= 400, '活跃粒子数有上界（不无限增长）', fx.active.length)
  ok(fx.pool.length <= 400, '粒子池有上界', fx.pool.length)
  ok(fx.rings.length <= 40, '能量环队列有上界', fx.rings.length)
  ok(fx.popups.length <= 40, '飘字队列有上界', fx.popups.length)
  ok(engine.score.history.length <= 600, '分数历史有上界', engine.score.history.length)

  console.log('    （2000 帧 + 100 次渲染耗时 ' + ms + 'ms）')
}

// ============================================================== 7. 结算
console.log('== 7. 结算与结果字段 ==')
{
  const { engine } = newEngine()
  engine.startSession()
  engine.countdown = 0
  engine.ble.state = 'connected'
  for (let i = 0; i < 300; i++) {
    engine.ble.injectSample({ angle: { roll: Math.sin(i / 30) * 6, pitch: 7, yaw: 0 } })
    engine.update(1 / 60)
  }

  engine.finishSession()
  ok(engine.state === 'result', 'finishSession 进入 result', engine.state)

  const r = engine.result || {}
  // 页面 persistRecord() 直接读这些 key，缺一个记录就是 undefined
  const required = [
    'score', 'level', 'levelName', 'combo', 'perfect', 'hits', 'rings',
    'accuracy', 'calories', 'distance', 'stableTime', 'duration', 'date', 'rank'
  ]
  const missing = required.filter((k) => r[k] === undefined)
  ok(missing.length === 0, '结果字段齐全（页面记录直接依赖这些 key）', missing.join(',') || '无缺失')

  ok(isFinite(r.score) && r.score >= 0, 'score 是非负有限数', r.score)
  ok(r.level >= 1 && r.level <= 5, 'level 在 1~5', r.level)
  ok(typeof r.levelName === 'string' && r.levelName.length > 0, 'levelName 非空', r.levelName)
  ok(isFinite(r.duration) && r.duration >= 0, 'duration 秒数有限', r.duration)
  ok(r.rank >= 1, 'rank 从 1 开始（本地榜内名次）', r.rank)
  ok(r.date > 0 && r.date <= Date.now() + 1000, 'date 是合理时间戳', r.date)

  // 同一局再结算一次不应崩（页面在结算页停留很久，别让重复调用炸掉）
  let again = null
  try { engine.finishSession() } catch (e) { again = e }
  ok(!again, '重复结算不抛异常', again && again.message)

  const board = engine.score.getMergedBoard(10)
  ok(Array.isArray(board) && board.length >= 1, '结算后本地榜可读', Array.isArray(board))
  ok(board[0] && isFinite(board[0].score), '榜首记录分数有限', board[0] && board[0].score)
}

// ============================================================== 8. 记录映射
console.log('== 8. 训练记录映射（pkgRace/utils/race-record.js）==')
{
  const records = require(path.resolve(__dirname, '..', 'pkgRace', 'utils', 'race-record.js'))

  const rec = {
    nickname: '测试患者',
    gameId: 'race',
    level: 3,
    levelName: '霓虹高架',
    difficulty: 3,
    score: 1234,
    combo: 7,
    perfect: 5,
    hits: 2,
    rings: 9,
    accuracy: 86,
    calories: 42,
    distance: 3,
    stableTime: 88,
    durationSec: 150,
    rank: 2,
    dataSource: 'sensor'
  }
  const rows = records.describeRace(rec)
  ok(Array.isArray(rows) && rows.length >= 14, '详情行数 ≥ 14', rows.length)
  ok(rows.every((r) => Array.isArray(r) && r.length === 2), '每行都是 [标签, 值]')

  const labels = rows.map((r) => r[0]).join('|')
  const needLabels = ['昵称', '得分', '排名', '最高连击', '完美闪避', '碰撞次数',
    '能量环', '稳定率', '行驶距离', '姿态稳定时长', '消耗', '训练时长', '数据来源']
  const lost = needLabels.filter((l) => labels.indexOf(l) < 0)
  ok(lost.length === 0, '详情包含全部康复指标', lost.join(',') || '完整')

  // 模拟数据必须被标出来且提示不上报（统计默认排除 simulation）
  const simRows = records.describeRace(Object.assign({}, rec, { dataSource: 'simulation' }))
  ok(simRows.map((r) => r[1]).join('|').indexOf('模拟数据') >= 0, '模拟数据被明确标注')
  ok(simRows.length === rows.length + 1, '模拟数据多一行「不上报」提示', simRows.length)

  // 存储键必须与其它四个游戏隔离
  const before = records.list().length
  const id = records.makeId('race', Date.now())
  records.save(Object.assign({}, rec, { recordId: id }))
  const after = records.list()
  ok(after.length === before + 1, 'save 后 list 能读回', before + ' → ' + after.length)
  ok(records.get(id) !== null, 'get 能按 recordId 取回')

  const keys = Object.keys(store).filter((k) => k.indexOf('race_records_v1') === 0)
  ok(keys.length === 1 && keys[0].indexOf(':') > 0,
    '记录写在 race_records_v1:<patientId> 键（按账号隔离）', keys.join(','))

  // 同一 recordId 重复 save 不能存两条（结算页可能重复触发）
  records.save(Object.assign({}, rec, { recordId: id }))
  ok(records.list().length === after.length, '重复 save 同一 recordId 不产生重复记录')

  // 缺字段不能让详情页崩（老记录/异常退出可能字段不全）
  let describeErr = null
  try { records.describeRace({}) } catch (e) { describeErr = e }
  ok(!describeErr, '空记录也不抛异常', describeErr && describeErr.message)
}

// ============================================================== 9. 音频
console.log('== 9. 音频生命周期（退出后不能还在响）==')
{
  const { engine } = newEngine()
  ok(engine.audio.ready === true, '音频上下文初始化成功（桩）')

  engine.audio.musicEnabled = true
  engine.audio.startBgm()
  ok(!!engine.audio.bgmTimer, 'startBgm 起了定时器')
  const t1 = engine.audio.bgmTimer
  engine.audio.startBgm()
  ok(engine.audio.bgmTimer === t1, '重复 startBgm 不会叠加定时器')

  engine.audio.stopBgm()
  ok(engine.audio.bgmTimer === null, 'stopBgm 清掉定时器（卸载后不会残留音乐）')

  // 页面 onHide 走这条：停 BGM + 主音量归零
  engine.audio.startBgm()
  engine.audio.setEnabled(false)
  ok(engine.audio.bgmTimer === null, 'setEnabled(false) 顺带停 BGM')
  ok(engine.audio.master.gain.value === 0, 'setEnabled(false) 主音量归零',
    engine.audio.master.gain.value)
}

// ============================================================== 收尾
console.log('== 10. 不碰蓝牙（统一由小程序侧连接）==')
{
  ok(bleCalls.length === 0,
    '整套流程（构造/开局/跑帧/结算/渲染）一次都没调用 wx 的 BLE 接口',
    bleCalls.join(','))
}

console.log('\n' + '-'.repeat(48))
if (fail) {
  console.log('有 ' + fail + ' 项未通过（通过 ' + pass + ' 项）')
  process.exitCode = 1
} else {
  console.log('全部通过：' + pass + ' 项')
}
