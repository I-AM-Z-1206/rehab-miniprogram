// ============================================================================
// games/fruit/engine.js —— 「接水果」游戏引擎
// ----------------------------------------------------------------------------
// 只做游戏逻辑，不画任何像素；画面在 renderer.js，页面只负责桥接。
//
// 状态机：
//   IDLE(介绍) → READY(设备准备) → CALIBRATING(零点标定) → COUNTDOWN(3-2-1)
//        → PLAYING ⇄ PAUSED
//             ↓
//        SENSOR_ERROR（数据中断，冻结判定，不静默切换模拟）
//             ↓
//        RESULT / ABORTED
//
// 玩法：左右倾身移动果篮（不是静态保持）
//   身体向左右倾 → 果篮在屏幕上左右移动（nx ∈ [-1,1] 线性映射到可移动范围）。
//   水果从上方不同位置落下，玩家要把果篮移到水果正下方，落下时对准才能接住。
//   因此判定的变量只有一个：落下那一帧果篮有没有在水果下方。
//
// 输入量（都是姿态代理，不是真实位移）：
//   nx = 左右轴角度 / 活动边界（-1 左 … +1 右，已扣零点，做了死区与一阶低通）
//   devX = |左右轴角度|（只用于统计稳定率，不再影响接取）
//
// 碰撞（以逻辑位置为准，不用动画假装成功）：
//   水果中心 y 跨过篮子口高度（CATCH_LINE）的那一帧：
//     · 水果横向落在篮口范围内（|水果x - 果篮x| ≤ 半口宽 + 半径容差）→ 接住
//     · 否则记漏接（reason = 'outside'）
//   跨线检测避免高速下落时「穿过」判定
// ============================================================================

const { MotionTracker } = require('../../../utils/motion.js')
const { ScoreManager } = require('./score.js')
const { FruitSpawner, FRUIT_TYPES, DESIGN_WIDTH, scoreOf } = require('./spawner.js')

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
const CATCH_LINE = 1 // 归一化：篮子口所在高度
const MISS_AFTER = 0.035 // 越过篮子口这么多仍没接住 → 记漏接
const REMOVE_AFTER = 1.3 // 落到这里之后从数组移除
const CATCH_ANIM_SEC = 0.36 // 入篮动画时长（渲染层用）
const BASKET_EDGE = 0.02 // 果篮中心离屏幕边缘至少留出的余量（归一化）

// 每种水果的归一化半径（相对 390 设计宽度），与渲染层缩放保持一致
const RADIUS_MAP = {}
FRUIT_TYPES.forEach((t) => { RADIUS_MAP[t.id] = t.r / DESIGN_WIDTH })

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

function round(v, d) {
  const p = Math.pow(10, d || 0)
  return Math.round(v * p) / p
}

class FruitEngine {
  constructor(opts) {
    const o = opts || {}
    this.cfg = o.cfg
    this.motion = new MotionTracker(this.cfg)
    this.score = new ScoreManager(this.cfg)
    this.spawner = new FruitSpawner(this.cfg, { seed: o.seed })

    this.state = STATE.IDLE
    this.prevState = STATE.IDLE
    this.events = []
    this.time = 0 // 状态内计时（倒计时、界面动画）
    this.t = 0 // 引擎累计时间（动画用，暂停也推进，避免画面僵住）

    this.elapsedSec = 0
    this.countdown = COUNTDOWN_SEC
    this.startedAt = 0
    this.sessionSeed = ''
    this.summary = null
    this.finished = false

    this.fruits = []
    this.pops = []
    this.bursts = []
    this.fxSeq = 0

    this.basket = {
      x: 0.5,
      nx: 0, // 当前控制量（-1 左 … +1 右），渲染层画位置指示
      vx: 0, // 横向速度（屏宽/秒），渲染层用来做倾斜
      tilt: 0, // -1 左 … 1 右（渲染层用来倾斜篮子）
      squash: 0, // 接住时的压缩动画 0~1
      flash: 0 // 接住时的暖色高光 0~1
    }
    this.basketHalf = 0.12
    this.catchHalf = 0.11
    this.basketMinX = 0.5 - this.basketHalf - BASKET_EDGE
    this.basketMaxX = 0.5 + this.basketHalf + BASKET_EDGE
    // 对位提示：最低的那颗水果是否已经在篮口正上方（渲染层用）
    this.align = { under: false, dx: 0, targetId: '' }
    // 稳定统计（只用于记录，不参与接取判定）
    this.hold = {
      devX: 0, // 平滑后的左右偏离（°）
      devY: 0, // 平滑后的前后偏离（°）
      inRange: true, // 当前是否在容差内
      holding: true, // 是否已经进入"稳定"状态（连续在容差内够时间）
      since: 0, // 已连续在容差内多久（秒）
      grace: 0, // 越界后剩余的宽限时间（秒）
      progress: 0, // 0~1，稳定计时进度
      timeSec: 0, // 本局在容差内的累计时间
      bestSec: 0, // 最长连续稳定
      runSec: 0, // 当前连续稳定
      outCount: 0, // 偏离超限次数
      devSum: 0,
      devSamples: 0,
      maxDev: 0,
      lostAt: 0
    }
    this.missFlash = 0
    this.comboFlash = 0

    this.comboMilestones = [3, 5, 8, 12, 16]
    this._milestoneIdx = 0

    this.simMode = false
    this.calibrated = false
    this.lastCalibration = null

    this.interruption = { count: 0, totalSec: 0, active: false, startedAt: 0 }
    this._resumeAt = 0
    this._lowTimeWarned = false

    this.refreshGeometry()
  }

  // ---------------------------------------------------------------- 派生参数
  /** 篮子宽度 / 可移动范围随配置实时变化（治疗师改完立刻生效） */
  refreshGeometry() {
    const widthPct = Number(this.cfg.get('basketWidthPct')) || 24
    this.basketHalf = clamp(widthPct / 200, 0.06, 0.20)
    this.catchHalf = this.basketHalf * 0.94
    // 可移动范围：中心离边缘至少留出半个篮宽，果篮始终完整留在屏幕里
    const edge = this.basketHalf + BASKET_EDGE
    this.basketMinX = edge
    this.basketMaxX = 1 - edge
    this.basket.x = clamp(this.basket.x, this.basketMinX, this.basketMaxX)
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

  drainEvents() {
    const list = this.events
    this.events = []
    return list
  }

  get isPlaying() {
    return this.state === STATE.PLAYING
  }

  get catchAnimSec() {
    return CATCH_ANIM_SEC
  }

  // ---------------------------------------------------------------- 流程
  prepare() {
    this.refreshGeometry()
    this.setState(STATE.READY)
    this.motion.reset()
    this.calibrated = !!this.lastCalibration && this.lastCalibration.ok
    return this.state
  }

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

  /** 校验配置并进入倒计时；返回 { ok, errors, warnings } */
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
    this.refreshGeometry()
    this.score.reset()
    this.spawner.reset()
    this.motion.resetTrajectory()
    this.elapsedSec = 0
    this.fruits.length = 0
    this.pops.length = 0
    this.bursts.length = 0
    this.basket.x = 0.5
    this.basket.nx = 0
    this.basket.vx = 0
    this.basket.tilt = 0
    this.basket.squash = 0
    this.basket.flash = 0
    this.align = { under: false, dx: 0, targetId: '' }
    this._resetHold()
    this.missFlash = 0
    this.comboFlash = 0
    this._milestoneIdx = 0
    this._lowTimeWarned = false
    this.finished = false
    this.summary = null
    this.startedAt = Date.now()
    this.sessionSeed = 'fruit_' + this.startedAt + '_' + Math.random().toString(36).slice(2, 7)
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

  restart() {
    this.beginRound()
    return this.startCountdown()
  }

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

  enterSensorError() {
    if (this.state === STATE.PLAYING) this._enterSensorError()
  }

  /** 结算：只执行一次（防重复加分 / 重复写记录） */
  finish(reason) {
    if (this.state === STATE.RESULT || this.state === STATE.ABORTED) return this.summary
    if (this.score.settled) return this.summary
    this.score.settled = true
    this.finished = true
    this._closeInterruption()

    const plannedSec = Number(this.cfg.get('durationSec')) || 90
    const completed = reason !== 'aborted' && this.elapsedSec >= plannedSec - 0.05
    if (completed) this.score.addFinish()
    // 先计入完成奖励再取快照，保证分项之和与总分一致
    const snap = this.score.snapshot()
    const traj = this.motion.getTrajectory()

    const acc = this.score.accuracy
    const grade = acc >= 0.9 ? 'S' : acc >= 0.78 ? 'A' : acc >= 0.6 ? 'B' : 'C'

    this.summary = {
      recordId: this.sessionSeed || ('fruit_' + Date.now()),
      gameId: 'fruit',
      scene: 'fruit-orchard-01',
      difficulty: Number(this.cfg.get('difficulty')) || 2,
      rangeConfig: {
        basketWidthPct: this.cfg.get('basketWidthPct'),
        holdToleranceDeg: this.cfg.get('holdToleranceDeg'),
        holdToleranceYDeg: this.cfg.get('holdToleranceYDeg'),
        holdBothAxis: this.cfg.get('holdBothAxis'),
        holdStableSec: this.cfg.get('holdStableSec'),
        holdGraceSec: this.cfg.get('holdGraceSec'),
        deadzoneDeg: this.cfg.get('deadzoneDeg'),
        spawnInterval: this.cfg.get('spawnInterval'),
        fallSpeed: this.cfg.get('fallSpeed'),
        maxFruits: this.cfg.get('maxFruits')
      },
      score: this.score.total,
      breakdown: snap,
      hits: snap.hits,
      misses: snap.misses,
      accuracy: snap.accuracy,
      comboMax: snap.maxCombo,
      // ---- 稳定统计（辅助指标，不影响接取）----
      holdRate: this.elapsedSec > 0.2 ? round(this.hold.timeSec / this.elapsedSec, 3) : 0,
      holdTimeSec: round(this.hold.timeSec, 1),
      holdBestSec: round(this.hold.bestSec, 1),
      holdOutCount: this.hold.outCount,
      deviationAvgDeg: this.hold.devSamples ? round(this.hold.devSum / this.hold.devSamples, 1) : 0,
      deviationMaxDeg: round(this.hold.maxDev, 1),
      holdToleranceDeg: Number(this.cfg.get('holdToleranceDeg')) || 6,
      durationSec: round(this.elapsedSec, 1),
      plannedSec: plannedSec,
      completed: completed,
      reason: reason || (completed ? 'timeout' : 'aborted'),
      aborted: reason === 'aborted',
      pathLength: traj.pathLength,
      avgRate: traj.avgRate,
      peak: traj.peak,
      sway: traj.sway,
      trajectorySummary: {
        pathLength: traj.pathLength,
        avgRate: traj.avgRate,
        peak: traj.peak,
        sway: traj.sway,
        note: traj.note
      },
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
      if (!this.lastCalibration || !this.lastCalibration.ok) {
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

  // ---------------------------------------------------------------- 模拟测试入口
  // 说明：这些方法只在模拟模式下可用，且不会跳过真实逻辑——
  // 它们只是改变水果位置，接取/漏接仍由 _tickPlaying 的碰撞判定决定。
  /** 在篮子正上方（或随机位置）补充若干个水果 */
  debugSpawn(count, opts) {
    if (!this.simMode || this.state !== STATE.PLAYING) return 0
    const o = opts || {}
    const n = clamp(Math.round(Number(count) || 1), 1, 6)
    for (let i = 0; i < n; i++) {
      this.spawner.serial += 1
      this.fruits.push(this._makeFruit({
        id: 'dbg' + this.spawner.serial,
        type: FRUIT_TYPES[(this.spawner.serial + i) % FRUIT_TYPES.length].id,
        x: o.atBasket ? clamp(this.basket.x + (i - (n - 1) / 2) * 0.02, 0.08, 0.92) : 0.2 + 0.6 * ((i + 1) / (n + 1)),
        // 从半空补出来，1 秒左右到达篮口，方便观察接取动画与判定
        y: Math.max(0.12, 0.72 - i * 0.16),
        vy: Number(this.cfg.get('fallSpeed')) || 0.26,
        rot: 0,
        vrot: 0.6,
        swayAmp: 0,
        swayPhase: 0,
        swaySpeed: 1
      }))
    }
    return n
  }

  /** 把最低的水果挪到篮子正上方：下一帧走真实接取判定 */
  debugAlignToBasket() {
    if (!this.simMode || this.state !== STATE.PLAYING) return false
    const f = this._lowestFruit()
    if (!f) return false
    f.baseX = this.basket.x
    f.x = this.basket.x
    f.y = Math.max(f.y, CATCH_LINE - 0.02)
    f.swayAmp = 0
    return true
  }

  /** 把最低的水果挪到远离篮子的位置：下一帧走真实漏接判定 */
  debugAlignAway() {
    if (!this.simMode || this.state !== STATE.PLAYING) return false
    const f = this._lowestFruit()
    if (!f) return false
    // 挪到篮口外一点点即可（不用飞到屏幕边缘，视觉上更像"擦着篮沿掉下去"）
    const away = clamp(this.basket.x + (this.catchHalf + 0.14) * (this.basket.x >= 0.5 ? 1 : -1), 0.08, 0.92)
    f.baseX = away
    f.x = away
    f.y = Math.max(f.y, CATCH_LINE - 0.02)
    f.swayAmp = 0
    return true
  }

  _lowestFruit() {
    let target = null
    for (let i = 0; i < this.fruits.length; i++) {
      const f = this.fruits[i]
      if (f.state !== 'fall') continue
      if (!target || f.y > target.y) target = f
    }
    return target
  }

  // ---------------------------------------------------------------- 每帧
  update(dt) {
    const step = clamp(Number(dt) || 0, 0, 0.1)
    this.t += step
    this.time += step

    // 视觉衰减（暂停时也让接住动画收尾，但不动游戏数据）
    this.basket.squash = Math.max(0, this.basket.squash - step * 3.6)
    this.basket.flash = Math.max(0, this.basket.flash - step * 2.4)
    this.missFlash = Math.max(0, this.missFlash - step * 1.6)
    this.comboFlash = Math.max(0, this.comboFlash - step * 1.2)
    this._pruneFx()

    this.motion.update(step)

    // 标定
    if (this.state === STATE.CALIBRATING) {
      if (!this.motion.cal.active && this.motion.cal.result) {
        this.lastCalibration = {
          ok: this.motion.cal.result === 'ok',
          result: this.motion.cal.result,
          message: this.motion.cal.message,
          at: Date.now()
        }
        this.calibrated = !!this.lastCalibration.ok
        this._emit('calibrate', this.lastCalibration)
        this.setState(STATE.READY)
      }
      return
    }

    // 倒计时
    if (this.state === STATE.COUNTDOWN) {
      this.countdown -= step
      // 倒计时期间果篮就跟着身体走，玩家可以先试一下左右倾的手感
      this._updateHold(step)
      if (this.countdown <= 0) {
        this.countdown = 0
        // 倒计时只是热身，正式开始时重置稳定统计，
        // 否则预备的 3 秒会被算成"已经稳定"，白送一段稳定率
        this._resetHold()
        this.setState(STATE.PLAYING)
        this.lastFrameAt = Date.now()
        this._emit('go')
      }
      return
    }

    // 真实数据模式下，数据超时 → 进入中断态（不静默用模拟数据）
    if (this.state === STATE.PLAYING && !this.simMode && this.motion.stale) {
      this._enterSensorError()
      return
    }

    if (this.state !== STATE.PLAYING) return

    this._tickPlaying(step)
  }

  _tickPlaying(step) {
    const cfg = this.cfg

    this._updateHold(step)
    this.motion.tickTrajectory(step)
    this.elapsedSec += step
    this.score.update(step)

    const plannedSec = Number(cfg.get('durationSec')) || 90

    // ---- 生成 ----
    const progress = clamp(this.elapsedSec / Math.max(1, plannedSec), 0, 1)
    // 传入果篮当前横向位置：生成器会避开"篮口正下方"，让原地不动接不到
    const spawns = this.spawner.tick(step, {
      fruits: this.fruits,
      progress: progress,
      basketX: this.basket.x,
      basketHalf: this.basketHalf
    })
    for (let i = 0; i < spawns.length; i++) this.fruits.push(this._makeFruit(spawns[i]))

    // ---- 下落 / 摆动 / 旋转 ----
    for (let i = 0; i < this.fruits.length; i++) {
      const f = this.fruits[i]
      if (f.state === 'caught') continue

      // 漏接的果子也要继续往下掉：之前这里直接 continue，
      // 果子会永远卡在篮口下方不动（y 停在 1.03，永远到不了回收线 1.3）
      const missed = f.state === 'missed'

      const prevY = f.y
      // 漏接的果子落得更快一点，读起来是"掉下去"而不是"慢慢飘"
      f.y += f.vy * (missed ? 1.7 : 1) * step
      f.swayPhase += f.swaySpeed * step
      f.x = clamp(f.baseX + Math.sin(f.swayPhase) * f.swayAmp, 0.02, 0.98)
      f.rot += f.vrot * step

      // 已经记过漏接：只下落，不再参与接取判定
      if (missed) continue

      // 跨线检测：这一帧是否越过篮子口
      if (prevY < CATCH_LINE && f.y >= CATCH_LINE) {
        const rExtra = (RADIUS_MAP[f.type] || 0.06) * 0.55
        // 关键：接住的条件是「果篮此刻在水果下方」，与身体是否"稳住"无关
        const inWidth = Math.abs(f.x - this.basket.x) <= this.catchHalf + rExtra
        if (inWidth) {
          this._catch(f)
          continue
        }
        f.missReason = 'outside'
      }

      // 越过篮子口仍未接住 → 漏接（只记一次）
      if (!f.scored && f.y > CATCH_LINE + MISS_AFTER) {
        f.scored = true
        f.state = 'missed'
        f.missedAt = this.t
        this.score.miss()
        this.missFlash = 1
        this._emit('miss', {
          x: f.x,
          type: f.type,
          reason: f.missReason || 'outside',
          dx: round(f.x - this.basket.x, 3)
        })
      }
    }

    this._updateAlign()
    this._cleanup()

    // ---- 结束条件 ----
    if (this.elapsedSec >= plannedSec) {
      this.finish('timeout')
      return
    }
    const left = plannedSec - this.elapsedSec
    if (!this._lowTimeWarned && left <= 10) {
      this._lowTimeWarned = true
      this._emit('warn', { left: Math.ceil(left) })
    }
  }

  _makeFruit(spec) {
    return {
      id: spec.id,
      type: spec.type,
      x: spec.x,
      baseX: spec.x,
      y: spec.y,
      vy: spec.vy,
      rot: spec.rot,
      vrot: spec.vrot,
      swayAmp: spec.swayAmp,
      swayPhase: spec.swayPhase,
      swaySpeed: spec.swaySpeed,
      state: 'fall',
      scored: false,
      caughtAt: 0
    }
  }

  /**
   * 稳定统计：每帧更新偏离量 / 是否在容差内。
   * 只写进训练记录，不参与接取判定——接取只看果篮有没有对准水果。
   */
  _updateHold(step) {
    const cfg = this.cfg
    const h = this.hold
    const tol = Math.max(1, Number(cfg.get('holdToleranceDeg')) || 6)
    const tolY = Math.max(1, Number(cfg.get('holdToleranceYDeg')) || 12)
    const bothAxis = !!cfg.get('holdBothAxis')
    const stable = Math.max(0.05, Number(cfg.get('holdStableSec')) || 0.4)
    const grace = Math.max(0, Number(cfg.get('holdGraceSec')) || 0)
    const dead = Math.max(0, Number(cfg.get('deadzoneDeg')) || 0)
    const smooth = clamp(Number(cfg.get('smooth')) || 0.55, 0.2, 1)

    // 一阶低通：和 motion.js 同一套时间换算，30/60fps 手感一致
    const a = 1 - Math.pow(1 - smooth, step * 60)
    h.devX += (Math.abs(this.motion.angleX) - h.devX) * a
    h.devY += (Math.abs(this.motion.angleY) - h.devY) * a

    // 死区：小于该角度的呼吸抖动不计入偏离
    const devX = h.devX < dead ? 0 : h.devX
    const devY = h.devY < dead ? 0 : h.devY
    const inRange = devX <= tol && (!bothAxis || devY <= tolY)
    h.inRange = inRange

    h.devSum += devX
    h.devSamples += 1
    if (devX > h.maxDev) h.maxDev = devX

    if (inRange) {
      h.timeSec += step
      h.runSec += step
      if (h.runSec > h.bestSec) h.bestSec = h.runSec
      h.since = Math.min(stable + 1, h.since + step)
      h.grace = grace
      if (!h.holding && h.since >= stable) h.holding = true
    } else {
      h.runSec = 0
      if (h.holding) {
        // 刚越界：先给一点宽限，抖一下不至于把稳定时间打断
        h.grace -= step
        if (h.grace <= 0) {
          h.holding = false
          h.since = 0
          h.outCount += 1
          h.lostAt = this.t
        }
      } else {
        h.since = Math.max(0, h.since - step * 2)
      }
    }
    h.progress = clamp(h.since / stable, 0, 1)

    // 果篮位置由身体左右倾决定（这一步才是真正驱动玩法的输入）
    this._followBasket(step)
  }

  /**
   * 果篮跟随：nx = -1 在最左、+1 在最右，线性映射到可移动范围。
   * nx 在 motion 层已经过死区 + 一阶低通，这里只做边界收口和倾斜动画。
   */
  _followBasket(step) {
    const b = this.basket
    const nx = clamp(Number(this.motion.nx) || 0, -1, 1)
    const travel = (this.basketMaxX - this.basketMinX) / 2
    const target = clamp(0.5 + nx * travel, this.basketMinX, this.basketMaxX)
    const prev = b.x
    b.x = target
    b.nx = clamp((b.x - 0.5) / Math.max(1e-6, travel), -1, 1)
    b.vx = step > 0 ? (b.x - prev) / step : 0
    // 横向速度越快，篮子往运动方向倾一点（纯视觉）
    b.tilt = clamp(b.vx * 0.12, -0.5, 0.5)
  }

  /** 对位提示：最低那颗下落水果是否已在篮口正上方 */
  _updateAlign() {
    const a = this.align
    const f = this._lowestFruit()
    if (!f) {
      a.under = false
      a.dx = 0
      a.targetId = ''
      return
    }
    a.dx = f.x - this.basket.x
    a.targetId = f.id
    a.under = Math.abs(a.dx) <= this.catchHalf
  }

  _resetHold() {
    const h = this.hold
    h.devX = 0
    h.devY = 0
    h.inRange = true
    h.holding = false
    h.since = 0
    h.grace = Number(this.cfg.get('holdGraceSec')) || 0
    h.progress = 0
    h.timeSec = 0
    h.bestSec = 0
    h.runSec = 0
    h.outCount = 0
    h.devSum = 0
    h.devSamples = 0
    h.maxDev = 0
    h.lostAt = 0
  }

  _catch(f) {
    f.scored = true
    f.state = 'caught'
    f.caughtAt = this.t
    f.catchFromX = f.x
    const value = scoreOf(this.cfg, f.type)
    const r = this.score.hit(value, f.type)

    this.basket.squash = 1
    this.basket.flash = 1
    this.comboFlash = 1

    this.fxSeq += 1
    this.pops.push({
      id: 'p' + this.fxSeq,
      text: '+' + r.gain,
      x: f.x,
      at: this.t,
      combo: r.combo,
      mul: r.mul
    })
    this.bursts.push({
      id: 'b' + this.fxSeq,
      x: f.x,
      at: this.t,
      seed: this.fxSeq * 977 + 13,
      type: f.type
    })

    // 连击里程碑：只触发音效/提示，不额外加分（避免计分不可复现）
    if (this._milestoneIdx < this.comboMilestones.length &&
        r.combo >= this.comboMilestones[this._milestoneIdx]) {
      this._emit('combo', { value: r.combo })
      this._milestoneIdx += 1
    }

    this._emit('hit', { gain: r.gain, combo: r.combo, mul: r.mul, type: f.type, x: f.x })
  }

  _pruneFx() {
    if (this.pops.length && this.t - this.pops[0].at > 1.2) {
      this.pops = this.pops.filter((p) => this.t - p.at <= 1.2)
    }
    if (this.bursts.length && this.t - this.bursts[0].at > 1.1) {
      this.bursts = this.bursts.filter((b) => this.t - b.at <= 1.1)
    }
  }

  _cleanup() {
    const anim = CATCH_ANIM_SEC
    const MISS_FADE_SEC = 0.9 // 漏接后再留这么久（够它落下去并淡出）
    this.fruits = this.fruits.filter((f) => {
      if (f.state === 'caught') return this.t - f.caughtAt <= anim
      // 漏接：落出画面或淡出结束就回收；两个条件都要有，
      // 防止 fallSpeed 被调成 0 时又卡住
      if (f.state === 'missed') {
        return f.y <= REMOVE_AFTER && this.t - (f.missedAt || 0) <= MISS_FADE_SEC
      }
      return f.y <= REMOVE_AFTER
    })
    // 极端情况下的兜底：绝不让数组无限增长
    const cap = Math.max(8, Math.round(Number(this.cfg.get('maxFruits')) || 3) * 4)
    if (this.fruits.length > cap) this.fruits.splice(0, this.fruits.length - cap)
  }

  // ---------------------------------------------------------------- 视图数据
  getViewModel() {
    const cfg = this.cfg
    const plannedSec = Number(cfg.get('durationSec')) || 90
    const timeLeft = Math.max(0, plannedSec - this.elapsedSec)
    return {
      state: this.state,
      timeLeft: timeLeft,
      timeLeftText: this._fmtTime(timeLeft),
      elapsed: this.elapsedSec,
      plannedSec: plannedSec,
      score: this.score.total,
      hits: this.score.hits,
      misses: this.score.misses,
      accuracy: this.score.accuracy,
      combo: this.score.combo,
      comboMul: this.score.comboMul,
      maxCombo: this.score.maxCombo,
      // 稳定统计（只用于记录，不影响接取）
      hold: {
        devX: round(this.hold.devX, 1),
        devY: round(this.hold.devY, 1),
        inRange: this.hold.inRange,
        holding: this.hold.holding,
        progress: this.hold.progress,
        since: round(this.hold.since, 2),
        timeSec: round(this.hold.timeSec, 1),
        outCount: this.hold.outCount,
        bestSec: round(this.hold.bestSec, 1),
        lostAt: this.hold.lostAt
      },
      holdRate: this.elapsedSec > 0.5 ? this.hold.timeSec / this.elapsedSec : null,
      holdToleranceDeg: Number(cfg.get('holdToleranceDeg')) || 6,
      holdToleranceYDeg: Number(cfg.get('holdToleranceYDeg')) || 12,
      holdBothAxis: !!cfg.get('holdBothAxis'),
      holdStableSec: Math.max(0.05, Number(cfg.get('holdStableSec')) || 0.4),
      catchHalf: this.catchHalf,
      // 身体控制量（归一化，驱动果篮左右移动）
      nx: this.motion.nx,
      load: this.motion.load,
      dir: this.motion.dir,
      basket: this.basket,
      basketHalf: this.basketHalf,
      basketMinX: this.basketMinX,
      basketMaxX: this.basketMaxX,
      // 对位提示：最低那颗水果是否在篮口正上方
      aligned: this.align.under,
      alignDx: round(this.align.dx, 3),
      alignTargetId: this.align.targetId,
      fruits: this.fruits,
      pops: this.pops,
      bursts: this.bursts,
      catchAnimSec: CATCH_ANIM_SEC,
      catchLine: CATCH_LINE,
      missFlash: this.missFlash,
      comboFlash: this.comboFlash,
      // 设备与状态
      rateHz: this.motion.rateHz,
      stale: this.motion.stale,
      quality: this.motion.quality,
      source: this.motion.source,
      sim: this.simMode,
      countdown: this.countdown,
      difficulty: Number(cfg.get('difficulty')) || 2,
      calibrated: this.calibrated,
      calibration: this.lastCalibration,
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

module.exports = { FruitEngine, STATE, CATCH_LINE, CATCH_ANIM_SEC }
