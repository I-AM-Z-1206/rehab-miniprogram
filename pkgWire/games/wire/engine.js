// ============================================================================
// games/wire/engine.js —— 「走钢丝」游戏引擎
// ----------------------------------------------------------------------------
// 只做游戏逻辑，不画任何像素；渲染在 renderer.js，页面只负责桥接与转发。
//
// 状态机：
//   IDLE → READY → CALIBRATING → COUNTDOWN → PLAYING ⇄ PAUSED
//                                   ↓                     ↓
//                              SENSOR_ERROR ──────────→  RESULT / ABORTED
//
// 平衡模型（连续值，不是二元判断）：
//   load      归一化偏移（0~1，来自 utils/motion.js）
//   balance   平衡值（1 = 完全稳定，0 = 即将失稳）
//   偏移越大、持续越久 → balance 下降越快；回到有效区域 → 按 recoveryRate 回升
//   保险绳介入时抑制控制量，balance 不再继续恶化
//
// 时间口径：所有计时都用 Date.now 的真实间隔 dt 累加，不按帧数计数；
// 暂停、传感器中断期间不累加训练时长。
// ============================================================================

const { MotionTracker } = require('../../../utils/motion.js')
const { SafetyRope } = require('./safety.js')
const { ScoreManager } = require('./score.js')

const STATE = {
  IDLE: 'IDLE',
  READY: 'READY',
  CALIBRATING: 'CALIBRATING',
  COUNTDOWN: 'COUNTDOWN',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  SENSOR_ERROR: 'SENSOR_ERROR',
  RESULT: 'RESULT',
  ABORTED: 'ABORTED'
}

const COUNTDOWN_SEC = 3
const SENSOR_RESUME_MS = 600

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

function round(v, d) {
  const p = Math.pow(10, d || 0)
  return Math.round(v * p) / p
}

class WireEngine {
  constructor(opts) {
    const o = opts || {}
    this.cfg = o.cfg
    this.motion = new MotionTracker(this.cfg)
    this.safety = new SafetyRope(this.cfg)
    this.score = new ScoreManager(this.cfg)

    this.state = STATE.IDLE
    this.prevState = STATE.IDLE
    this.events = []
    this.time = 0 // 通用计时器（倒计时/结算动画）
    this.t = 0 // 引擎内累计时间（渲染动画用，暂停也走，避免表情僵住）

    this.elapsedSec = 0
    this.balance = 1
    this.lean = 0
    this.walkPhase = 0
    this.speed = 0
    this.stable = true
    this.offCount = 0
    this.offSec = 0
    this._offActive = false
    this._overBoundarySec = 0

    this.countdown = COUNTDOWN_SEC
    this.lastFrameAt = Date.now()
    this.distance = 0
    this.progress = 0
    this.completed = false
    this.finished = false

    this.interruption = { count: 0, totalSec: 0, active: false, startedAt: 0 }
    this._resumeAt = 0
    this.summary = null
    this.startedAt = 0
    this.sessionSeed = ''

    this.simMode = false
    this.calibrated = false
    this.lastCalibration = null
    this.warnCooldown = 0
    this.penaltyCooldown = 0
  }

  // ---------------------------------------------------------------- 状态
  setState(next) {
    if (this.state === next) return
    this.prevState = this.state
    this.state = next
    this.time = 0
    this._emit('state', { state: next, prev: this.prevState })
  }

  _emit(type, extra) {
    this.events.push(Object.assign({ type: type, at: Date.now() }, extra || {}))
  }

  /** 页面每帧把事件取走 */
  drainEvents() {
    const list = this.events
    this.events = []
    return list
  }

  get isPlaying() {
    return this.state === STATE.PLAYING
  }

  get canPlay() {
    return this.state === STATE.READY || this.state === STATE.IDLE ||
      this.state === STATE.RESULT || this.state === STATE.ABORTED
  }

  // ---------------------------------------------------------------- 流程
  /** 进入设备准备页 */
  prepare() {
    this.setState(STATE.READY)
    this.motion.reset()
    // 零点全 App 共用一份：标定页或别的游戏标过就直接用，不再要求本游戏内重标
    this.calibrated = this.motion.hasZero()
    return this.state
  }

  /** 开始零点标定（需要真实数据；模拟模式直接判定通过） */
  calibrate() {
    if (this.state !== STATE.READY && this.state !== STATE.CALIBRATING) return false
    if (this.simMode) {
      this.lastCalibration = { ok: true, message: '模拟模式：跳过真实标定', at: Date.now(), simulated: true }
      this.calibrated = true
      this._emit('calibrate', this.lastCalibration)
      return true
    }
    this.motion.beginCalibration()
    this.setState(STATE.CALIBRATING)
    return true
  }

  cancelCalibration() {
    if (this.state !== STATE.CALIBRATING) return
    this.motion.cancelCalibration()
    this.setState(STATE.READY)
  }

  /** 校验配置并进入倒计时；返回 { ok, errors } */
  startCountdown() {
    const v = this.cfg.validate()
    if (!v.ok) return { ok: false, errors: v.errors }
    if (!this.simMode && !this.motion.isLive()) {
      return { ok: false, errors: ['没有可用的传感器数据，请先连接设备或切换到模拟模式'] }
    }
    this.beginRound()
    this.setState(STATE.COUNTDOWN)
    this.countdown = COUNTDOWN_SEC
    return { ok: true, warnings: v.warnings }
  }

  beginRound() {
    this.score.reset()
    this.safety.reset()
    this.motion.resetTrajectory()
    this.elapsedSec = 0
    this.balance = 1
    this.lean = 0
    this.walkPhase = 0
    this.speed = 0
    this.stable = true
    this.offCount = 0
    this.offSec = 0
    this._offActive = false
    this._overBoundarySec = 0
    this.distance = 0
    this.progress = 0
    this.completed = false
    this.finished = false
    this.summary = null
    this.startedAt = Date.now()
    this.sessionSeed = 'wire_' + this.startedAt + '_' + Math.random().toString(36).slice(2, 7)
    this.interruption = { count: 0, totalSec: 0, active: false, startedAt: 0 }
    this._resumeAt = 0
  }

  pause() {
    if (this.state !== STATE.PLAYING && this.state !== STATE.SENSOR_ERROR) return false
    this._closeInterruption()
    this.setState(STATE.PAUSED)
    return true
  }

  resume() {
    if (this.state !== STATE.PAUSED) return false
    this.setState(STATE.PLAYING)
    this.lastFrameAt = Date.now()
    return true
  }

  togglePause() {
    if (this.state === STATE.PLAYING) return this.pause()
    if (this.state === STATE.PAUSED) return this.resume()
    return false
  }

  /** 中止本局：保留已产生的成绩，但标记未完成 */
  abort() {
    if (this.state === STATE.RESULT || this.state === STATE.ABORTED) return
    this.finish('aborted')
  }

  restart() {
    this.beginRound()
    return this.startCountdown()
  }

  /** 回到介绍页（准备页点「返回」时用） */
  toIntro() {
    if (this.state === STATE.PLAYING || this.state === STATE.PAUSED ||
        this.state === STATE.COUNTDOWN || this.state === STATE.SENSOR_ERROR) {
      this.finish('aborted')
    }
    this.summary = null
    this.motion.cancelCalibration()
    this.setState(STATE.IDLE)
    return this.state
  }

  /** 蓝牙被动断开时由页面调用：进入安全中断态 */
  enterSensorError() {
    if (this.state === STATE.PLAYING) this._enterSensorError()
  }

  /** 结算：只执行一次，防止重复加分/重复写记录 */
  finish(reason) {
    if (this.state === STATE.RESULT || this.state === STATE.ABORTED) return this.summary
    if (this.score.settled) return this.summary
    this.score.settled = true
    this._closeInterruption()

    const total = this.score.total
    const snap = this.score.snapshot()
    const traj = this.motion.getTrajectory()
    const trackLength = Number(this.cfg.get('trackLength')) || 40
    const durationSec = Number(this.cfg.get('durationSec')) || 90

    // 参考分：按当前配置「全程 + 全程稳定」的理论值，仅用于游戏评级
    const reference =
      trackLength * (Number(this.cfg.get('scorePerMeter')) || 0) +
      Math.min(durationSec, trackLength / Math.max(0.1, Number(this.cfg.get('forwardSpeed')) || 0.5)) *
      (Number(this.cfg.get('stableScorePerSec')) || 0)
    const ratio = reference > 0 ? total / reference : 0
    const grade = ratio >= 0.85 ? 'S' : ratio >= 0.7 ? 'A' : ratio >= 0.5 ? 'B' : 'C'

    this.summary = {
      recordId: this.sessionSeed || ('wire_' + Date.now()),
      gameId: 'wire',
      scene: 'wire-fixed-01',
      difficulty: Number(this.cfg.get('difficulty')) || 2,
      rangeConfig: {
        left: this.cfg.get('leftLimit'),
        right: this.cfg.get('rightLimit'),
        forward: this.cfg.get('forwardLimit'),
        back: this.cfg.get('backLimit'),
        sensitivity: this.cfg.get('sensitivity'),
        deadzoneDeg: this.cfg.get('deadzoneDeg')
      },
      score: total,
      breakdown: snap,
      durationSec: round(this.elapsedSec, 1),
      plannedSec: durationSec,
      distance: round(this.distance, 1),
      trackLength: trackLength,
      completed: !!this.completed,
      reason: reason || (this.completed ? 'goal' : 'timeout'),
      aborted: reason === 'aborted',
      stableSec: round(this.score.stableSec, 1),
      offCount: this.offCount,
      offSec: round(this.offSec, 1),
      ropeTriggers: this.safety.triggers,
      ropeEngagedSec: round(this.safety.engagedSec, 1),
      pathLength: traj.pathLength,
      avgRate: traj.avgRate,
      sway: traj.sway,
      swayNote: traj.note,
      dataSource: this.motion.source,
      interrupted: this.interruption.count > 0,
      interruptedSec: round(this.interruption.totalSec, 1),
      interruptedCount: this.interruption.count,
      sensorInterrupted: this.interruption.count > 0,
      grade: grade,
      startedAt: this.startedAt || Date.now(),
      endedAt: Date.now(),
      calibration: this.lastCalibration || null
    }

    this.setState(reason === 'aborted' ? STATE.ABORTED : STATE.RESULT)
    this._emit('finish', { summary: this.summary, reason: reason || 'end' })
    return this.summary
  }

  // ---------------------------------------------------------------- 传感器
  feedSensor(frame) {
    this.motion.feed(frame)
    if (this.state === STATE.SENSOR_ERROR) {
      // 连续收到数据一小段时间后自动恢复
      if (!this._resumeAt) this._resumeAt = Date.now()
      if (Date.now() - this._resumeAt > SENSOR_RESUME_MS) this._autoResume()
    }
  }

  _autoResume() {
    this._resumeAt = 0
    if (this.state !== STATE.SENSOR_ERROR) return
    this._closeInterruption()
    this.setState(STATE.PLAYING)
    this.lastFrameAt = Date.now()
    this._emit('sensor:resume')
  }

  _closeInterruption() {
    const it = this.interruption
    if (it.active && it.startedAt) {
      it.totalSec += (Date.now() - it.startedAt) / 1000
      it.active = false
      it.startedAt = 0
    }
  }

  _enterSensorError() {
    const it = this.interruption
    if (it.active) return
    it.active = true
    it.startedAt = Date.now()
    it.count += 1
    this.setState(STATE.SENSOR_ERROR)
    this._resumeAt = 0
    this._emit('sensor:lost')
  }

  setSimMode(on) {
    this.simMode = !!on
    this.motion.setSimMode(this.simMode)
    if (this.simMode) {
      this.calibrated = true
      if (!this.lastCalibration) {
        this.lastCalibration = { ok: true, message: '模拟模式：跳过真实标定', at: Date.now(), simulated: true }
      }
    } else {
      this.motion.cancelCalibration()
      if (this.state === STATE.CALIBRATING) this.setState(STATE.READY)
      if (this.state === STATE.SENSOR_ERROR) this.setState(STATE.PAUSED)
    }
    this._emit('source', { source: this.motion.source })
  }

  setSimTarget(x, y) {
    this.motion.setSimTarget(x, y)
  }

  nudgeSim(dx, dy) {
    this.motion.nudgeSim(dx, dy)
  }

  centerSim() {
    this.motion.centerSim()
  }

  /** 模拟一次保险绳触发（测试用） */
  triggerRopeSim() {
    if (!this.simMode) return false
    this.motion.setSimTarget(1, 0)
    return true
  }

  // ---------------------------------------------------------------- 每帧
  update(dt) {
    const step = clamp(Number(dt) || 0, 0, 0.1)
    this.t += step
    this.time += step

    this.motion.update(step)

    // 标定过程
    if (this.state === STATE.CALIBRATING) {
      if (!this.motion.cal.active && this.motion.cal.result) {
        this.lastCalibration = {
          ok: this.motion.cal.result === 'ok',
          result: this.motion.cal.result,
          message: this.motion.cal.message,
          at: Date.now()
        }
        // 重标失败不该把旧零点也一起作废：旧零点还在，就仍然可以开始
        this.calibrated = !!this.lastCalibration.ok || this.motion.hasZero()
        this._emit('calibrate', this.lastCalibration)
        this.setState(STATE.READY)
      }
      return
    }

    // 倒计时
    if (this.state === STATE.COUNTDOWN) {
      this.countdown -= step
      if (this.countdown <= 0) {
        this.countdown = 0
        this.setState(STATE.PLAYING)
        this.lastFrameAt = Date.now()
        this._emit('go')
      }
      return
    }

    // 传感器中断检测（真实数据模式）
    if (this.state === STATE.PLAYING && !this.simMode && this.motion.stale) {
      this._enterSensorError()
      return
    }

    if (this.state !== STATE.PLAYING) {
      // 暂停时仍然让角色缓慢回正，避免画面定格在夸张姿态
      const back = 1 - Math.pow(1 - 0.05, step * 60)
      this.lean += (0 - this.lean) * back
      return
    }

    this._tickPlaying(step)
  }

  _tickPlaying(step) {
    const cfg = this.cfg
    const nx = this.motion.nx
    const ny = this.motion.ny
    const load = this.motion.load

    // ---- 保险绳状态机（用原始 load，保证迟滞判断不被抑制值影响） ----
    this.safety.update(step, load)
    const ropeEvents = this.safety.events
    for (let i = 0; i < ropeEvents.length; i++) {
      const ev = ropeEvents[i]
      if (ev.type === 'warn') {
        this.offCount += 1
        this._offActive = true
        this._emit('warn', { dir: this.motion.dir, load: load })
      } else if (ev.type === 'warnEnd') {
        this._offActive = false
        this._emit('warnEnd')
      } else if (ev.type === 'rope:in') {
        const penalty = Number(cfg.get('penaltyScore')) || 0
        if (penalty > 0) this.score.penaltyBy(penalty, '保险绳介入')
        this._emit('rope:in', { count: this.safety.triggers, dir: this.motion.dir })
      } else if (ev.type === 'rope:out') {
        this._emit('rope:out')
      }
    }
    if (this._offActive) this.offSec += step

    const suppression = this.safety.getSuppression()
    const effNx = nx * (1 - suppression)
    const effNy = ny * (1 - suppression * 0.5)
    const effLoad = Math.max(Math.abs(effNx), Math.abs(effNy) * 0.75)

    // ---- 平衡模型 ----
    const warn = Number(cfg.get('warnThreshold')) || 0.66
    const recovery = Number(cfg.get('recoveryRate')) || 0.5
    const instability = Number(cfg.get('instability')) || 0.95

    const excess = Math.max(0, effLoad - 0.18)
    if (excess <= 0.001) {
      // 完全在舒适区：按恢复速度回升
      this.balance += (recovery * (1 - this.balance) + 0.05) * step
    } else {
      const push = Math.pow(excess, 1.35) * instability
      const hold = 1 + Math.min(1, this.offSec / 6) * 0.35 // 偏移持续越久越难恢复
      this.balance -= push * hold * step
    }
    // 保险绳介入：托底，不再继续恶化
    if (this.safety.engaged) this.balance = Math.max(this.balance, 0.22)
    this.balance = clamp(this.balance, 0, 1)

    // ---- 稳定判定（用于计分与提示） ----
    this.stable = effLoad < warn * 0.82 && this.balance > 0.55

    // ---- 前进 ----
    const baseSpeed = Number(cfg.get('forwardSpeed')) || 0.5
    let speedFactor = 0.35 + 0.65 * this.balance
    if (this.safety.engaged) speedFactor *= 0.5
    if (this.balance < 0.18) speedFactor *= 0.35
    const forward = clamp(1 + effNy * 0.22, 0.62, 1.32)
    this.speed = baseSpeed * speedFactor * forward

    // 关闭保险绳时的越界失败规则
    const ropeEnabled = !!cfg.get('ropeEnabled')
    if (!ropeEnabled && effLoad >= Math.min(1, Number(cfg.get('ropeTrigger')) || 0.88)) {
      this._overBoundarySec += step
      const grace = Number(cfg.get('failGraceSec')) || 0.8
      if (this._overBoundarySec >= grace) {
        const rule = cfg.get('failRule')
        if (rule === 'terminate') {
          this._emit('fail', { reason: 'boundary' })
          this.finish('boundary')
          return
        }
        // penalty：越界期间不前进，并扣一次分（有冷却，避免持续扣分）
        this.penaltyCooldown -= step
        if (this.penaltyCooldown <= 0) {
          this.score.penaltyBy(Number(cfg.get('penaltyScore')) || 0, '越界')
          this.penaltyCooldown = 2
          this._emit('penalty', { reason: '越界' })
        }
        this.speed = 0
      }
    } else {
      this._overBoundarySec = 0
    }

    const dm = this.speed * step
    this.distance += dm
    this.score.addDistance(dm)
    this.score.update(step, this.stable)
    this.motion.tickTrajectory(step)
    this.elapsedSec += step

    // 行走相位与姿态动画（连续的，不做瞬移）
    this.walkPhase += step * (2.1 + this.speed * 3.4)
    const targetLean = clamp(effNx, -1, 1) * 0.34 +
      Math.sin(this.t * 2.2) * (1 - this.balance) * (1 - this.balance) * 0.06
    const alpha = 1 - Math.pow(1 - 0.34, step * 60)
    this.lean += (targetLean - this.lean) * alpha

    // 进度与结束条件
    const trackLength = Number(cfg.get('trackLength')) || 40
    const durationSec = Number(cfg.get('durationSec')) || 90
    this.progress = clamp(this.distance / trackLength, 0, 1)

    if (this.distance >= trackLength) {
      this.completed = true
      this.score.addFinish()
      this._emit('goal')
      this.finish('goal')
      return
    }
    if (this.elapsedSec >= durationSec) {
      this.finish('timeout')
      return
    }

    // 长时间处于临界平衡：只提示，不判负
    this.warnCooldown -= step
    if (this.balance < 0.2 && this.warnCooldown <= 0) {
      this.warnCooldown = 6
      this._emit('critical')
    }
  }

  // ---------------------------------------------------------------- 视图数据
  getViewModel() {
    const cfg = this.cfg
    const durationSec = Number(cfg.get('durationSec')) || 90
    const trackLength = Number(cfg.get('trackLength')) || 40
    const timeLeft = Math.max(0, durationSec - this.elapsedSec)
    return {
      state: this.state,
      timeLeft: timeLeft,
      timeLeftText: this._fmtTime(timeLeft),
      elapsed: this.elapsedSec,
      speed: this.speed,
      distance: this.distance,
      trackLength: trackLength,
      progress: this.progress,
      score: this.score.total,
      balance: this.balance,
      lean: this.lean,
      nx: this.motion.nx,
      ny: this.motion.ny,
      load: this.motion.load,
      dir: this.motion.dir,
      stable: this.stable,
      combo: this.score.combo,
      maxCombo: this.score.maxCombo,
      stableSec: this.score.stableSec,
      offCount: this.offCount,
      rope: this.safety.snapshot(),
      ropeTension: this.safety.tension,
      rateHz: this.motion.rateHz,
      stale: this.motion.stale,
      quality: this.motion.quality,
      source: this.motion.source,
      sim: this.simMode,
      countdown: this.countdown,
      difficulty: Number(cfg.get('difficulty')) || 2,
      warnThreshold: Number(cfg.get('warnThreshold')) || 0.66,
      ropeTrigger: Number(cfg.get('ropeTrigger')) || 0.88,
      calibrated: this.calibrated,
      calibration: this.lastCalibration,
      zero: this.motion.zeroInfo(),
      calibrationProgress: this.state === STATE.CALIBRATING
        ? clamp(this.motion.cal.elapsed / this.motion.cal.total, 0, 1) : 0,
      interrupted: this.interruption,
      canResume: this.state === STATE.SENSOR_ERROR && !this.motion.stale
    }
  }

  _fmtTime(sec) {
    const s = Math.max(0, Math.ceil(sec))
    const m = Math.floor(s / 60)
    const r = s % 60
    return (m < 10 ? '0' + m : m) + ':' + (r < 10 ? '0' + r : r)
  }
}

module.exports = { WireEngine, STATE }
