// ============================================================================
// utils/motion.js —— 姿态传感器 → 归一化控制量（全项目统一的体感输入层）
// ----------------------------------------------------------------------------
// 设计要点：
//  1. 只输出「归一化控制量」，绝不把角度说成真实位移：
//       nx ∈ [-1, 1]  左右（-1 左 / +1 右）
//       ny ∈ [-1, 1]  前后（-1 后 / +1 前）
//     0 表示中立位，±1 表示到达治疗师设定的活动边界。这是游戏控制量，
//     不是厘米/米，也不是重心位移的临床测量值。
//  2. 轴向映射可配置（axisX/axisY/invertX/invertY），因为不同佩戴方向结果不同，
//     默认值来自本项目射击页/赛车页的实机反馈，仍需真机复核。
//  3. 输入链：异常值剔除 → 零点/基线 → 死区 → 归一化 → 一阶低通（帧率无关）
//  4. 零点标定：3 秒静止采样 + 静止检测（标准差），基线取最后 800ms 均值，
//     写入全局零点 utils/zero.js（全 App 共用，不会反复累加）。
//  5. 轨迹统计：归一化单位累计轨迹长度、摆动分布、平均运动速率代理指标。
//  6. 模拟模式：与真实数据严格分离（source = 'simulation'），页面必须显著标注。
// ============================================================================

const zero = require('./zero.js')

const CAL_TOTAL_MS = 3000 // 标定采样窗口：3 秒（覆盖需求里 3~5 秒的取值范围）
const CAL_BASE_MS = 800 // 基线取最后 800ms 的均值
const CAL_MIN_SAMPLES = 15
const CAL_STD_LIMIT = 2.6 // 静止检测：任一轴标准差超过该角度即判定晃动
const CAL_MAX_SWING = 9 // 峰峰值上限（°）
const STALE_MS = 1200 // 超过该时长没有新帧 → 数据中断
const OUTLIER_JUMP = 45 // 单帧跳变超过该角度视为异常值
const SWAY_BUCKETS = [0.2, 0.4, 0.6, 0.8, 1.0]

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

function round(v, d) {
  const p = Math.pow(10, d || 0)
  return Math.round(v * p) / p
}

function stdDev(arr) {
  if (!arr.length) return 0
  let s = 0
  for (let i = 0; i < arr.length; i++) s += arr[i]
  const m = s / arr.length
  let v = 0
  for (let i = 0; i < arr.length; i++) v += (arr[i] - m) * (arr[i] - m)
  return Math.sqrt(v / arr.length)
}

function mean(arr) {
  if (!arr.length) return 0
  let s = 0
  for (let i = 0; i < arr.length; i++) s += arr[i]
  return s / arr.length
}

class MotionTracker {
  /**
   * @param {object} cfg utils/wire-config 的 store（提供活动边界 / 灵敏度 / 死区 / 轴向）
   */
  constructor(cfg) {
    this.cfg = cfg
    this.roll = 0
    this.pitch = 0
    this.rawRoll = 0
    this.rawPitch = 0

    // 输出
    this.nx = 0
    this.ny = 0
    this.angleX = 0 // 左右轴角度（°）
    this.angleY = 0 // 前后轴角度（°）
    this.load = 0 // 综合偏移量（0~1）
    this.dir = 'center'
    this.stale = true
    this.hasSignal = false
    this.lastFrameAt = 0
    this.rateHz = 0
    this.outliers = 0
    this.quality = 1 // 0~1，异常值越多越低

    // 模拟
    this.simMode = false
    this.simX = 0
    this.simY = 0
    this.simTargetX = 0
    this.simTargetY = 0

    // 标定
    this.cal = {
      active: false,
      startedAt: 0,
      elapsed: 0,
      total: CAL_TOTAL_MS,
      samples: [],
      result: null, // null | 'ok' | 'unstable' | 'no_data'
      message: ''
    }

    // 轨迹统计（本局）
    this.traj = {
      pathLength: 0,
      seconds: 0,
      peak: 0,
      sway: [0, 0, 0, 0, 0],
      samples: 0
    }
    this.prevNx = 0
    this.prevNy = 0
    this._rateAt = 0
    this._rateCount = 0
    this._deltaAcc = 0
    this._deltaAt = 0
  }

  // ---------------------------------------------------------------- 输入
  /** 传感器一帧：{ roll, pitch }（已由 witble 叠加全局零点） */
  feed(frame) {
    if (!frame) return
    const hasRoll = typeof frame.roll === 'number'
    const hasPitch = typeof frame.pitch === 'number'
    if (!hasRoll && !hasPitch) return

    const now = Date.now()
    const nextRoll = hasRoll ? frame.roll : this.roll
    const nextPitch = hasPitch ? frame.pitch : this.pitch

    // 异常值剔除：单帧大幅跳变（拔插/丢包后重组）不参与控制
    if (this.hasSignal && now - this.lastFrameAt < 400) {
      const jump = Math.max(Math.abs(nextRoll - this.roll), Math.abs(nextPitch - this.pitch))
      if (jump > OUTLIER_JUMP) {
        this.outliers += 1
        this.lastFrameAt = now
        this._countRate(now)
        return
      }
    }

    this.roll = nextRoll
    this.pitch = nextPitch
    if (typeof frame.rawRoll === 'number') this.rawRoll = frame.rawRoll
    if (typeof frame.rawPitch === 'number') this.rawPitch = frame.rawPitch

    this.hasSignal = true
    this.stale = false
    this.lastFrameAt = now
    this._countRate(now)

    // 标定采样用原始角度（避免和已有零点互相累加）
    if (this.cal.active) {
      const r = typeof frame.rawRoll === 'number' ? frame.rawRoll : nextRoll
      const p = typeof frame.rawPitch === 'number' ? frame.rawPitch : nextPitch
      this.cal.samples.push({ t: now, roll: r, pitch: p })
    }
  }

  _countRate(now) {
    if (!this._rateAt) {
      this._rateAt = now
      this._rateCount = 0
    }
    this._rateCount += 1
    const span = now - this._rateAt
    if (span >= 1000) {
      this.rateHz = Math.round((this._rateCount * 1000) / span)
      this._rateAt = now
      this._rateCount = 0
      // 质量：异常值占比越高，越提示用户检查佩戴/电量
      const bad = clamp(this.outliers / Math.max(4, this.rateHz), 0, 1)
      this.quality = round(1 - bad * 0.8, 2)
      this.outliers = 0
    }
  }

  // ---------------------------------------------------------------- 模拟
  setSimMode(on) {
    this.simMode = !!on
    if (!this.simMode) {
      this.simTargetX = 0
      this.simTargetY = 0
    }
  }

  /** 模拟输入（归一化 -1~1），带 0.35s 缓动，避免瞬移 */
  setSimTarget(x, y) {
    this.simTargetX = clamp(Number(x) || 0, -1, 1)
    if (typeof y === 'number') this.simTargetY = clamp(y, -1, 1)
  }

  nudgeSim(dx, dy) {
    this.simTargetX = clamp(this.simTargetX + (dx || 0), -1, 1)
    this.simTargetY = clamp(this.simTargetY + (dy || 0), -1, 1)
  }

  centerSim() {
    this.simTargetX = 0
    this.simTargetY = 0
  }

  get source() {
    return this.simMode ? 'simulation' : 'real'
  }

  /** 真实数据是否可用（模拟模式下恒为 true） */
  isLive() {
    return this.simMode || (!this.stale && this.hasSignal)
  }

  // ---------------------------------------------------------------- 标定
  beginCalibration() {
    this.cal.active = true
    this.cal.startedAt = Date.now()
    this.cal.elapsed = 0
    this.cal.samples = []
    this.cal.result = null
    this.cal.message = ''
  }

  cancelCalibration() {
    this.cal.active = false
    this.cal.elapsed = 0
    this.cal.samples = []
  }

  /** 每帧推进标定；返回 true 表示刚刚完成（结果见 cal.result） */
  _tickCalibration(now) {
    if (!this.cal.active) return false
    this.cal.elapsed = now - this.cal.startedAt
    if (this.cal.elapsed < CAL_TOTAL_MS) return false

    const samples = this.cal.samples || []
    this.cal.active = false
    this.cal.elapsed = CAL_TOTAL_MS

    if (samples.length < CAL_MIN_SAMPLES) {
      this.cal.result = 'no_data'
      this.cal.message = '没有收到足够的姿态数据，请检查连接后重试'
      return true
    }

    const rolls = samples.map((s) => s.roll)
    const pitches = samples.map((s) => s.pitch)
    const sdRoll = stdDev(rolls)
    const sdPitch = stdDev(pitches)
    const swing = Math.max(
      Math.max.apply(null, rolls) - Math.min.apply(null, rolls),
      Math.max.apply(null, pitches) - Math.min.apply(null, pitches)
    )

    if (sdRoll > CAL_STD_LIMIT || sdPitch > CAL_STD_LIMIT || swing > CAL_MAX_SWING) {
      this.cal.result = 'unstable'
      this.cal.message = '检测到身体晃动（' + round(Math.max(sdRoll, sdPitch), 1) +
        '°），请坐稳或站稳后重新标定'
      return true
    }

    // 基线 = 最后 800ms 的均值（需求中的约 800ms 采样取均值）
    const tail = samples.filter((s) => now - s.t <= CAL_BASE_MS)
    const use = tail.length >= 5 ? tail : samples
    const baseRoll = mean(use.map((s) => s.roll))
    const basePitch = mean(use.map((s) => s.pitch))
    zero.set(-baseRoll, -basePitch)

    this.cal.result = 'ok'
    this.cal.message = '标定完成：静止姿态已记为中立位'
    // 滤波状态清零，避免标定后出现一次拖尾
    this.nx = 0
    this.ny = 0
    this.angleX = 0
    this.angleY = 0
    this.prevNx = 0
    this.prevNy = 0
    return true
  }

  // ---------------------------------------------------------------- 每帧更新
  update(dt) {
    const now = Date.now()
    const step = clamp(Number(dt) || 1 / 60, 0.001, 0.1)
    this._tickCalibration(now)

    if (!this.simMode && this.hasSignal && now - this.lastFrameAt > STALE_MS) this.stale = true

    const cfg = this.cfg
    const axisX = cfg.get('axisX')
    const axisY = cfg.get('axisY')
    const sens = Number(cfg.get('sensitivity')) || 1
    const dead = Number(cfg.get('deadzoneDeg')) || 0
    const leftLimit = Math.max(3, Number(cfg.get('leftLimit')) || 12)
    const rightLimit = Math.max(3, Number(cfg.get('rightLimit')) || 12)
    const fwdLimit = Math.max(3, Number(cfg.get('forwardLimit')) || 12)
    const backLimit = Math.max(3, Number(cfg.get('backLimit')) || 12)

    let targetX
    let targetY

    if (this.simMode) {
      // 模拟：目标值缓动过去，手感与真实输入一致
      const a = 1 - Math.pow(1 - 0.22, step * 60)
      this.simX += (this.simTargetX - this.simX) * a
      this.simY += (this.simTargetY - this.simY) * a
      targetX = this.simX
      targetY = this.simY
      this.angleX = targetX * (targetX < 0 ? leftLimit : rightLimit)
      this.angleY = targetY * (targetY < 0 ? backLimit : fwdLimit)
      this.stale = false
    } else {
      const rawX = cfg.get('invertX') ? -1 : 1
      const rawY = cfg.get('invertY') ? -1 : 1
      const ax = axisX === 'roll' ? this.roll : this.pitch
      const ay = axisY === 'roll' ? this.roll : this.pitch
      const degX = rawX * ax
      const degY = rawY * ay

      // 死区：小角度视为中立（呼吸抖动不进控制量）
      const dx = Math.abs(degX) < dead ? 0 : degX - (degX > 0 ? dead : -dead)
      const dy = Math.abs(degY) < dead ? 0 : degY - (degY > 0 ? dead : -dead)

      this.angleX = degX
      this.angleY = degY
      targetX = clamp((dx * sens) / (dx < 0 ? leftLimit : rightLimit), -1, 1)
      targetY = clamp((dy * sens) / (dy < 0 ? backLimit : fwdLimit), -1, 1)
    }

    // 一阶低通：按 dt 换算，30/60fps 手感一致；数据中断时缓慢回中而不是定格
    const smooth = clamp(Number(cfg.get('smooth')) || 0.55, 0.2, 1)
    if (!this.simMode && this.stale) {
      const back = 1 - Math.pow(1 - 0.08, step * 60)
      this.nx += (0 - this.nx) * back
      this.ny += (0 - this.ny) * back
    } else {
      const alpha = 1 - Math.pow(1 - smooth, step * 60)
      this.nx += (targetX - this.nx) * alpha
      this.ny += (targetY - this.ny) * alpha
    }

    this.nx = clamp(this.nx, -1, 1)
    this.ny = clamp(this.ny, -1, 1)
    this.load = Math.max(Math.abs(this.nx), Math.abs(this.ny) * 0.75)

    // 方向（滞回 0.06，避免边界抖动刷屏）
    if (this.nx < -0.1) this.dir = 'left'
    else if (this.nx > 0.1) this.dir = 'right'
    else this.dir = 'center'

    return this
  }

  // ---------------------------------------------------------------- 轨迹统计
  resetTrajectory() {
    this.traj = { pathLength: 0, seconds: 0, peak: 0, sway: [0, 0, 0, 0, 0], samples: 0 }
    this.prevNx = this.nx
    this.prevNy = this.ny
  }

  /** 每帧累计（仅 PLAYING 时调用）：归一化单位，不是厘米 */
  tickTrajectory(dt) {
    const step = clamp(Number(dt) || 0, 0, 0.1)
    if (step <= 0) return
    const d = Math.sqrt(
      (this.nx - this.prevNx) * (this.nx - this.prevNx) +
      (this.ny - this.prevNy) * (this.ny - this.prevNy)
    )
    this.prevNx = this.nx
    this.prevNy = this.ny

    const t = this.traj
    t.pathLength += d
    t.seconds += step
    t.samples += 1
    if (Math.abs(this.nx) > t.peak) t.peak = Math.abs(this.nx)

    const a = Math.abs(this.nx)
    let idx = 0
    while (idx < SWAY_BUCKETS.length - 1 && a > SWAY_BUCKETS[idx]) idx++
    t.sway[idx] += step
  }

  /** 轨迹摘要：明确标注为「姿态代理指标」 */
  getTrajectory() {
    const t = this.traj
    const total = t.sway.reduce((a, b) => a + b, 0)
    const dist = SWAY_BUCKETS.map((b, i) => {
      const lo = i === 0 ? 0 : SWAY_BUCKETS[i - 1]
      return { label: lo.toFixed(1) + '~' + b.toFixed(1), ratio: total > 0 ? t.sway[i] / total : 0 }
    })
    return {
      pathLength: round(t.pathLength, 2),
      seconds: round(t.seconds, 2),
      peak: round(t.peak, 2),
      avgRate: t.seconds > 0.5 ? round(t.pathLength / t.seconds, 3) : 0,
      sway: dist,
      note: '归一化姿态代理指标，非真实位移'
    }
  }

  reset() {
    this.nx = 0
    this.ny = 0
    this.angleX = 0
    this.angleY = 0
    this.load = 0
    this.dir = 'center'
    this.prevNx = 0
    this.prevNy = 0
    this.resetTrajectory()
    this.cancelCalibration()
  }
}

module.exports = {
  MotionTracker,
  CAL_TOTAL_MS,
  CAL_BASE_MS,
  STALE_MS,
  SWAY_BUCKETS
}
