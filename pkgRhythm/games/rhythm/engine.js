// ============================================================================
// games/rhythm/engine.js —— 「左右节奏训练」核心引擎（门控版）
// ----------------------------------------------------------------------------
// 职责边界：
//   · 只管状态机、音符生命周期、判定编排、计分、结算摘要；
//   · 不碰 Canvas、不碰 wx API（音频通过注入的 clock 访问），可在 Node 里跑；
//   · 输入只用 utils/motion.js 输出的归一化量（nx / dir），不当成真实位移。
//
// 【2026-11-01 核心变更：时间表 → 门控】
//   旧：谱面预先排好每个音符的绝对时刻，引擎按时间把它们放出来，过窗口就 MISS。
//       患者接不接跟下一个音符什么时候来**没有关系** —— 接得快就堆着，
//       接不住就连着漏，主观上就是「一下子来一堆、一下子半天不来」。
//   新：场上永远只有**一个**音符。它飞到判定线就停在那里等，患者完成之后
//       才进入「喘息 gapMs」→「生成下一个」→「飞 approachMs」。
//       于是节奏由患者自己掌握，**不存在漏接**（音符不会自己溜走）。
//
//   随之作废的东西：miss 判定、时间窗口（perfectMs/greatMs/goodMs）、
//   提前容差（earlyFactor）、一次动作只结算一个音符（actionOk）、
//   呼吸间隔（restRate，机器不再插空）。
//
// 状态机：
//   IDLE ─prepare→ READY ─calibrate→ CALIBRATING ─→ READY
//   READY ─enter→ COUNTDOWN（预备）─→ PLAYING
//   PLAYING ⇄ PAUSED
//   PLAYING → SENSOR_ERROR（断线/超时，冻结时间与判定）─resume→ PLAYING
//   PLAYING / PAUSED → RESULT / ABORTED（只结算一次）
//
// 时间基准：一切以 clock.nowMs() 为准，绝不用帧数累加。
// ============================================================================

const { MotionTracker } = require('../../../utils/motion.js')
const { songById, beatMs } = require('../../../utils/rhythm-songs.js')
const { buildSequence } = require('./chart.js')
const { GateJudge, VERDICT } = require('./hit-judge.js')
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

const SENSOR_RESUME_MS = 600
// 完成后的音符在判定线上留多久做淡出（只是视觉，不影响判定）
const NOTE_TAIL_MS = 420
const END_TAIL_MS = 600 // 时间到点后再等多久收尾（让最后一个音符动画播完）
const FEEDBACK_KEEP_MS = 900
const GUIDE_GAP_MS = 9000

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

function round(v, d) {
  const p = Math.pow(10, d || 0)
  return Math.round(v * p) / p
}

function makeId() {
  return 'rt' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36)
}

class RhythmEngine {
  /**
   * @param {object} opts { cfg, clock, motion? }
   *   clock 必须实现 setSong / start / pause / resume / stop / nowMs
   */
  constructor(opts) {
    const o = opts || {}
    this.cfg = o.cfg
    this.clock = o.clock
    this.motion = o.motion || new MotionTracker(this.cfg)

    this.state = STATE.IDLE
    this.events = []
    this.simMode = false

    this.song = songById(this.cfg.get('songId'))
    this.chart = { notes: [], meta: null }
    this.notes = [] // 方向序列（不预排时间）
    this.pending = null // 场上唯一的那个音符
    this.fading = [] // 刚完成、正在淡出的音符（纯视觉）
    this.cursor = 0
    this.score = new ScoreManager(this.cfg)
    this.judge = new GateJudge(this.cfg)

    this.musicMs = 0
    this.elapsedSec = 0
    this.countdownMs = 0
    this.durationMs = 0
    this.feedback = null
    this.hitFlash = 0
    this.unsolvedFlash = 0
    this.beatFlash = 0
    this.lastBeat = -1
    this.guideAt = 0
    this.lastJudgeAt = 0
    this.recentSides = []

    this.nextSpawnAt = 0 // 下一个音符「出现」的时刻
    this.hintLevel = 0 // 当前等待提示等级 0~3
    this.waitMs = 0 // 当前音符在判定线上干等了多久

    this.action = { seq: 0, side: 'center', since: 0 }

    this.interrupted = false
    this.interruptedMs = 0
    this.interruptStart = 0
    this.interruptCount = 0
    this.sensorResumeAt = 0

    this.startedAt = ''
    this.endedAt = ''
    this.recordId = ''
    this.summary = null
    this.settled = false
    this.mode = 'melody' // melody | music | silent
    this.previewing = false
    this.previewMs = 0

    if (this.clock && this.clock.setSong) this.clock.setSong(this.song)
  }

  // ---------------------------------------------------------------- 基础
  get sim() {
    return this.simMode
  }

  get isPlaying() {
    return this.state === STATE.PLAYING
  }

  get beatMs() {
    return beatMs(this.song)
  }

  /** 音符飞行时间（毫秒）：从地平线飞到判定线 */
  get approachMs() {
    return clamp(Number(this.cfg.get('approachMs')) || 1800, 900, 4000)
  }

  /** 喘息：完成一个音符后隔多久出下一个 */
  get gapMs() {
    return clamp(Number(this.cfg.get('gapMs')) || 0, 0, 2000)
  }

  /** 保持要求：稳住之后还要保持多久才算完成 */
  get holdMs() {
    return clamp(Number(this.cfg.get('holdMs')) || 400, 120, 1600)
  }

  /** 一个完整周期（不含患者自己磨蹭的时间）—— 视觉呼吸用它 */
  get cycleMs() {
    return Math.max(1, this.approachMs + this.holdMs + this.gapMs)
  }

  _emit(type, payload) {
    this.events.push(Object.assign({ type: type, at: Date.now() }, payload || {}))
  }

  drainEvents() {
    const out = this.events
    this.events = []
    return out
  }

  setState(next) {
    if (this.state === next) return
    const prev = this.state
    this.state = next
    this._emit('state', { state: next, prev: prev })
  }

  setSimMode(on) {
    this.simMode = !!on
    this.motion.setSimMode(this.simMode)
    if (!this.simMode) this.motion.centerSim()
  }

  setSimTarget(x) {
    this.motion.setSimTarget(clamp(Number(x) || 0, -1, 1), 0)
  }

  nudgeSim(dx) {
    this.motion.nudgeSim(dx || 0, 0)
  }

  centerSim() {
    this.motion.centerSim()
  }

  feedSensor(frame) {
    if (!frame) return
    this.motion.feed(frame)
    if (this.state === STATE.SENSOR_ERROR) {
      if (!this.sensorResumeAt) this.sensorResumeAt = Date.now()
      else if (Date.now() - this.sensorResumeAt >= SENSOR_RESUME_MS) {
        this.resume()
        this._emit('sensor:resume')
      }
    }
  }

  /** 配置里的曲目被换掉时调用（介绍页/设置页返回后） */
  syncSong() {
    const next = songById(this.cfg.get('songId'))
    if (next.songId === this.song.songId) return false
    this.song = next
    if (this.clock && this.clock.setSong) this.clock.setSong(next)
    return true
  }

  // ---------------------------------------------------------------- 流程
  _resetRuntime() {
    this.notes = []
    this.pending = null
    this.fading = []
    this.cursor = 0
    this.hintLevel = 0
    this.waitMs = 0
    this.nextSpawnAt = 0
    this.score.reset()
    this.feedback = null
    this.motion.reset()
    this.action = { seq: 0, side: 'center', since: 0 }
  }

  toIntro() {
    this.stopPreview()
    if (this.clock) this.clock.stop()
    this.settled = false
    this.summary = null
    this._resetRuntime()
    this.setState(STATE.IDLE)
  }

  prepare() {
    this.stopPreview()
    this.syncSong()
    this.settled = false
    this.summary = null
    this._resetRuntime()
    this.setState(STATE.READY)
  }

  calibrate() {
    if (this.simMode) {
      this.motion.cal.result = 'ok'
      this.motion.cal.message = '模拟模式：无需标定'
      this._emit('calibrate', { ok: true, result: 'ok', simulated: true, message: '模拟模式：无需标定' })
      return { ok: true, simulated: true }
    }
    if (!this.motion.isLive()) return { ok: false, message: '请先连接传感器' }
    this.motion.beginCalibration()
    this.setState(STATE.CALIBRATING)
    return { ok: true }
  }

  cancelCalibration() {
    this.motion.cancelCalibration()
    if (this.state === STATE.CALIBRATING) this.setState(STATE.READY)
  }

  /**
   * 开始：生成方向序列 → 预备倒计时 → 门控出音符
   * @returns {{ok:boolean, errors?:string[], warnings?:string[]}}
   */
  startCountdown(opts) {
    const o = opts || {}
    this.stopPreview()
    this.syncSong()
    const v = this.cfg.validate()
    if (!v.ok) return { ok: false, errors: v.errors }

    const durationSec = clamp(Number(this.cfg.get('durationSec')) || 90, 20, 300)
    const seq = o.notes
      ? { notes: o.notes.slice(), meta: o.meta || null }
      : buildSequence({
        song: this.song,
        durationSec: durationSec,
        centerRate: this.cfg.get('centerRate'),
        sameSideRate: this.cfg.get('sameSideRate'),
        difficulty: this.cfg.get('difficulty'),
        seed: this.cfg.get('chartSeed'),
        chartSeedVersion: 'v5'
      })

    if (!seq.notes.length) {
      return { ok: false, errors: ['方向序列为空：请检查难度设置'] }
    }

    this.chart = seq
    this.notes = seq.notes.map((n) => Object.assign({}, n, {
      judged: false,
      verdict: '',
      state: 'idle',
      flaps: 0,
      heldMs: 0,
      reactionMs: 0,
      waitMs: 0,
      hintLevel: 0,
      judgedAt: 0
    }))
    this.pending = null
    this.fading = []
    this.cursor = 0
    this.musicMs = 0
    this.elapsedSec = 0
    this.durationMs = Math.round(durationSec * 1000)
    this.score.reset()
    this.feedback = null
    this.recentSides = []
    this.lastJudgeAt = 0
    this.guideAt = 0
    this.hitFlash = 0
    this.unsolvedFlash = 0
    this.hintLevel = 0
    this.waitMs = 0
    this.interrupted = false
    this.interruptedMs = 0
    this.interruptCount = 0
    this.recordId = makeId()
    this.startedAt = new Date().toISOString()
    this.settled = false
    this.summary = null
    this.motion.resetTrajectory()
    this.action = { seq: 0, side: 'center', since: 0 }

    // 第一个音符什么时候「出现」：给患者一点准备时间，不至于一开局就飞一个过来
    const prepMs = clamp(Number(this.cfg.get('prepMs')) || 2000, 600, 8000)
    this.nextSpawnAt = prepMs
    this.countdownMs = clamp(Math.round(prepMs * 0.6), 1200, 2400)
    this.setState(STATE.COUNTDOWN)
    this._emit('countdown', { sec: Math.ceil(this.countdownMs / 1000) })

    return { ok: true, warnings: v.warnings, noteCount: this.notes.length }
  }

  beginPlay() {
    if (this.state !== STATE.COUNTDOWN) return false
    if (this.clock) this.clock.start()
    // 命中推进旋律时没有背景乐，不能显示成「无音乐」
    if (this.cfg.get('melodyOn')) this.mode = 'melody'
    else this.mode = this.clock && this.clock.isSilent ? 'silent' : 'music'
    this.musicMs = 0
    this.elapsedSec = 0
    this.setState(STATE.PLAYING)
    this._emit('music', { mode: this.mode })
    return true
  }

  pause() {
    if (this.state !== STATE.PLAYING) return false
    if (this.clock) this.clock.pause()
    this.setState(STATE.PAUSED)
    return true
  }

  resume() {
    if (this.state === STATE.PAUSED) {
      if (this.clock) this.clock.resume()
      this.setState(STATE.PLAYING)
      this._emit('resume')
      return true
    }
    if (this.state === STATE.SENSOR_ERROR) {
      if (!this.motion.isLive() && !this.simMode) return false
      const lostSec = this.interruptStart ? (Date.now() - this.interruptStart) / 1000 : 0
      this.interruptedMs += lostSec * 1000
      this.interruptStart = 0
      this.sensorResumeAt = 0
      if (this.clock) this.clock.resume()
      this.setState(STATE.PLAYING)
      this._emit('resume', { interruptedSec: round(lostSec, 1) })
      return true
    }
    return false
  }

  togglePause() {
    if (this.state === STATE.PLAYING) return this.pause()
    if (this.state === STATE.PAUSED) return this.resume()
    return false
  }

  /** 断线 / 数据超时：冻结时间与判定，但不算失败 */
  enterSensorError(reason) {
    if (this.state !== STATE.PLAYING && this.state !== STATE.PAUSED) return false
    if (this.clock) this.clock.pause()
    this.interruptStart = Date.now()
    this.interruptCount += 1
    this.interrupted = true
    this.state = STATE.SENSOR_ERROR
    this._emit('state', { state: STATE.SENSOR_ERROR, prev: STATE.PLAYING })
    this._emit('sensor:lost', { reason: reason || 'disconnected' })
    return true
  }

  /** 结算：只能结算一次 */
  finish(reason) {
    if (this.settled) return this.summary
    const musicNow = this.clock ? this.clock.nowMs() : this.musicMs
    this.musicMs = musicNow

    // 场上还没完成的那个音符：记「未完成」，**不记漏接、不扣分、不断连击**。
    // 门控下它只是还没做完 —— 用红字告诉一个平衡功能不佳的人「你漏了」是反治疗的。
    if (this.pending && !this.pending.judged) {
      this.pending.judged = true
      this.pending.verdict = VERDICT.UNSOLVED
      this.pending.judgedAt = musicNow
      this.score.unsolvedNote()
    }

    this.score.addFinish()
    const snap = this.score.snapshot()
    const traj = this.motion.getTrajectory()
    const completed = reason === 'timeout'
    this.endedAt = new Date().toISOString()
    if (this.interruptStart) {
      this.interruptedMs += Date.now() - this.interruptStart
      this.interruptStart = 0
    }

    const elapsedSec = this.musicMs / 1000
    const paceSec = snap.completed > 0 ? round(elapsedSec / snap.completed, 1) : null

    this.summary = {
      recordId: this.recordId,
      gameId: 'rhythm',
      mode: 'gate',
      songId: this.song.songId,
      songName: this.song.name,
      bpm: this.song.bpm,
      difficulty: Number(this.cfg.get('difficulty')) || 3,
      difficultyLabel: this.cfg.difficultyLabel ? this.cfg.difficultyLabel(this.cfg.get('difficulty')) : '',
      chartSeed: Number(this.cfg.get('chartSeed')) || 7,
      backgroundId: this.cfg.get('backgroundId') || 'dawn',
      // 判定口径版本：**v3 与 v1/v2 的命中率不可直接对比**。
      // v1/v2 是时间窗口判定（下一个音符按时间表来，接不住就 MISS）；
      // v3 是门控判定（接到才出下一个，没有 MISS，评分只看稳不稳）。
      judgeVersion: 'v3',
      noteCount: snap.completed,
      unsolved: snap.unsolved,
      score: snap.score,
      breakdown: { base: snap.base, comboBonus: snap.comboBonus, finishBonus: snap.finishBonus },
      perfect: snap.perfect,
      great: snap.great,
      good: snap.good,
      miss: 0,
      hits: snap.completed,
      completed: snap.completed,
      comboMax: snap.maxCombo,
      leftHitCount: snap.leftHits,
      centerHitCount: snap.centerHits,
      rightHitCount: snap.rightHits,
      stabilityRate: snap.stabilityRate,
      balanceRate: snap.balanceRate,
      avgReactionMs: snap.avgReactionMs,
      avgHoldMs: snap.avgHoldMs,
      avgFlaps: snap.avgFlaps,
      paceSec: paceSec,
      durationSec: round(elapsedSec, 1),
      plannedSec: round(this.durationMs / 1000, 1),
      syncOffsetMs: Number(this.cfg.get('syncOffsetMs')) || 0,
      controlConfig: {
        leftLimit: this.cfg.get('leftLimit'),
        rightLimit: this.cfg.get('rightLimit'),
        sideThreshold: this.cfg.get('sideThreshold'),
        stableMs: this.cfg.get('stableMs'),
        holdMs: this.cfg.get('holdMs'),
        gapMs: this.cfg.get('gapMs'),
        approachMs: this.cfg.get('approachMs')
      },
      pathLength: traj.pathLength,
      avgRate: traj.avgRate,
      peak: traj.peak,
      trajectorySummary: traj,
      dataSource: this.simMode ? 'simulation' : 'real',
      completedAll: completed,
      reason: reason || '',
      interrupted: this.interrupted,
      interruptedSec: round(this.interruptedMs / 1000, 1),
      interruptedCount: this.interruptCount,
      sensorInterrupted: this.interrupted,
      audioMode: this.mode,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      grade: this._grade(snap)
    }
    this.settled = true
    if (this.clock) this.clock.stop()
    this.setState(completed ? STATE.RESULT : STATE.ABORTED)
    this._emit('finish', { summary: this.summary })
    return this.summary
  }

  /**
   * 评级：**只看稳定度**，不看完成数量。
   * 门控下完成数量由患者速度决定，拿它评级等于鼓励抢动作。
   */
  _grade(snap) {
    const s = snap.stabilityRate
    if (s === null || !snap.completed) return '-'
    if (s >= 0.95 && snap.completed >= 8) return 'S'
    if (s >= 0.85) return 'A'
    if (s >= 0.7) return 'B'
    if (s >= 0.5) return 'C'
    return 'D'
  }

  // ---------------------------------------------------------------- 主循环
  update(dt) {
    const step = clamp(Number(dt) || 1 / 60, 0.001, 0.1)
    this.motion.update(step)

    if (this.previewing) {
      this.previewMs = this.clock ? this.clock.nowMs() : this.previewMs + step * 1000
      if (this.previewMs >= 8 * this.beatMs) this.stopPreview()
      return
    }

    if (this.state === STATE.CALIBRATING) {
      if (this.motion.cal.active) return
      const result = this.motion.cal.result
      this._emit('calibrate', {
        ok: result === 'ok',
        result: result,
        message: this.motion.cal.message,
        simulated: false
      })
      this.setState(STATE.READY)
      return
    }

    if (this.state === STATE.COUNTDOWN) {
      this.countdownMs -= step * 1000
      if (this.countdownMs <= 0) {
        this.countdownMs = 0
        this.beginPlay()
      }
      return
    }

    if (this.state !== STATE.PLAYING) return

    if (!this.simMode && !this.motion.isLive()) {
      this.enterSensorError('timeout')
      return
    }

    this._tickPlaying(step)
  }

  _tickPlaying(step) {
    const now = this.clock.nowMs()
    this.musicMs = now
    this.elapsedSec = now / 1000
    this.motion.tickTrajectory(step)

    this._updateActions(now)
    this._gateTick(now)
    this._cleanup(now)

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - step * 3.2)
    if (this.unsolvedFlash > 0) this.unsolvedFlash = Math.max(0, this.unsolvedFlash - step * 2.2)

    const bIdx = Math.floor(now / this.beatMs)
    if (bIdx !== this.lastBeat) {
      this.lastBeat = bIdx
      this.beatFlash = 1
      this._emit('beat', { index: bIdx })
    }
    if (this.beatFlash > 0) this.beatFlash = Math.max(0, this.beatFlash - step * 2.6)

    // 引导提示：长时间没有完成任何一个音符
    if (this.cfg.get('guideOn') && now - this.lastJudgeAt > GUIDE_GAP_MS &&
        now - this.guideAt > GUIDE_GAP_MS && now > 6000) {
      this.guideAt = now
      const side = this.motion.dir === 'center' ? 'center' : this.motion.dir
      this._emit('guide', {
        kind: side === 'center' ? 'no-move' : 'side-hint',
        side: side,
        text: side === 'center' ? '身体好像没动：试着向需要的方向偏移一点' : '保持住，慢慢移动就好'
      })
    } else if (this.recentSides.length >= 8) {
      const left = this.recentSides.filter((s) => s === 'left').length
      if ((left >= 7 || left <= 1) && now - this.guideAt > GUIDE_GAP_MS) {
        this.guideAt = now
        this._emit('guide', {
          kind: 'balance',
          side: left >= 7 ? 'left' : 'right',
          text: left >= 7 ? '一直在左侧，试试也向右侧移动' : '一直在右侧，试试也向左侧移动'
        })
      }
    }

    if (now >= this.durationMs + END_TAIL_MS) {
      this.finish('timeout')
    }
  }

  _updateActions(now) {
    const side = this.motion.dir
    const a = this.action
    if (side !== a.side) {
      if (side !== 'center') a.seq += 1
      a.side = side
      a.since = now
    }
  }

  // ---------------------------------------------------------------- 门控
  /** 从方向序列里取下一个音符（取完就循环，防极端情况下空场） */
  _nextFromSequence() {
    if (!this.notes.length) return null
    if (this.cursor >= this.notes.length) {
      this.cursor = 0
      const stamp = Date.now().toString(36)
      this.notes = this.notes.map((n, i) => Object.assign({}, n, {
        noteId: n.noteId + '_' + stamp + i,
        judged: false,
        verdict: '',
        state: 'idle',
        flaps: 0,
        heldMs: 0,
        reactionMs: 0,
        waitMs: 0,
        hintLevel: 0,
        judgedAt: 0
      }))
    }
    const n = this.notes[this.cursor]
    this.cursor += 1
    return n
  }

  /**
   * 门控核心：场上永远只有一个音符。
   *   没有 pending 且到点了 → 生成
   *   有 pending → 推进它，完成才放行下一个
   */
  _gateTick(now) {
    if (!this.pending && now >= this.nextSpawnAt) {
      const note = this._nextFromSequence()
      if (note) {
        note.spawnAtMs = now
        note.targetTimeMs = now + this.approachMs
        note.state = 'approaching'
        note.flaps = 0
        this.pending = note
        this.hintLevel = 0
        this.waitMs = 0
        this._emit('spawn', {
          noteId: note.noteId,
          side: note.targetSide,
          accent: note.noteType === 'accent'
        })
      }
    }

    const n = this.pending
    if (!n) return

    const res = this.judge.step(n, {
      now: now,
      side: this.motion.dir,
      expected: n.targetSide,
      enterAt: this.action.since,
      state: n.state
    })

    n.state = res.state
    n.flaps = res.flaps
    n.heldMs = res.heldMs
    n.reactionMs = res.reactionMs
    n.waitMs = res.waitMs
    n.hintLevel = res.hintLevel
    this.waitMs = res.waitMs

    // 逐级提示：等越久，提示越明确（3s 放大发亮 / 6s 判定台亮该侧 / 10s 语音）
    if (res.hintLevel > this.hintLevel) {
      this.hintLevel = res.hintLevel
      this._emit('hint', { level: res.hintLevel, side: n.targetSide })
    }

    if (res.state === 'done') {
      this._settle(n, res, now)
      this.pending = null
      this.hintLevel = 0
      this.waitMs = 0
      this.nextSpawnAt = now + this.gapMs
    }
  }

  _settle(note, res, now) {
    note.judged = true
    note.verdict = res.verdict
    note.judgedAt = now
    note.waitMs = 0
    note.hintLevel = 0
    this.lastJudgeAt = now

    const gain = this.score.hit(res.verdict, {
      side: note.targetSide,
      value: note.scoreValue || 100,
      reactionMs: res.reactionMs,
      holdMs: res.heldMs,
      flaps: note.flaps
    })

    this.hitFlash = 1
    this.recentSides.push(note.targetSide)
    if (this.recentSides.length > 12) this.recentSides.shift()
    this.fading.push(note)

    this.feedback = {
      verdict: res.verdict,
      side: note.targetSide,
      gain: gain.gain,
      combo: gain.combo,
      reactionMs: res.reactionMs,
      at: now
    }
    this._emit('hit', {
      verdict: res.verdict,
      side: note.targetSide,
      reactionMs: res.reactionMs,
      gain: gain.gain,
      combo: gain.combo,
      completed: this.score.completed
    })
    // 命中推进旋律：音高由「完成到第几个」决定，旋律是患者自己走出来的
    this._emit('tone', { step: this.score.completed, side: note.targetSide })
    if (gain.combo > 0 && gain.combo % 10 === 0) {
      this._emit('combo', { value: gain.combo })
    }
  }

  _cleanup(now) {
    if (!this.fading.length) return
    this.fading = this.fading.filter((n) => now - n.judgedAt <= NOTE_TAIL_MS)
  }

  // ---------------------------------------------------------------- 视图数据
  /** 音符可见列表（渲染层不需要自己算时间） */
  visibleNotes(now) {
    const approach = Math.max(1, this.approachMs)
    const out = []

    const n = this.pending
    if (n) {
      const raw = (now - n.spawnAtMs) / approach
      const progress = clamp(raw, 0, 1)
      const atLine = progress >= 1
      out.push({
        noteId: n.noteId,
        side: n.targetSide,
        type: n.noteType,
        progress: progress,
        // 门控下音符**不会冲过判定线**：到线就停在那里等
        waiting: atLine,
        waitMs: atLine ? Math.max(0, now - n.targetTimeMs) : 0,
        hintLevel: n.hintLevel || 0,
        state: n.state,
        // 保持进度 0~1（环形进度用）
        holdProgress: this.holdMs > 0 ? clamp((n.heldMs || 0) / this.holdMs, 0, 1) : 0,
        judged: false,
        verdict: '',
        fade: 0
      })
    }

    for (let i = 0; i < this.fading.length; i++) {
      const f = this.fading[i]
      out.push({
        noteId: f.noteId,
        side: f.targetSide,
        type: f.noteType,
        progress: 1,
        waiting: false,
        waitMs: 0,
        hintLevel: 0,
        state: 'done',
        holdProgress: 1,
        judged: true,
        verdict: f.verdict,
        fade: clamp((now - f.judgedAt) / NOTE_TAIL_MS, 0, 1)
      })
    }
    return out
  }

  /**
   * 音符相位：0 = 刚出现，1 = 已经到判定线（正在等）。
   * 判定线 / 踏板 / 光柱的呼吸一律用它，不能用 clock.beatPhase ——
   * 现在连背景乐都没有了，跟着音乐呼吸更是无中生有。
   */
  _notePhase(now) {
    const n = this.pending
    if (!n) return 0
    return clamp((now - n.spawnAtMs) / Math.max(1, this.approachMs), 0, 1)
  }

  getViewModel(nowArg) {
    const now = typeof nowArg === 'number' ? nowArg : (this.clock ? this.clock.nowMs() : this.musicMs)
    const snap = this.score.snapshot()
    const recent = this.feedback && now - this.feedback.at < FEEDBACK_KEEP_MS ? this.feedback : null
    const pending = this.pending
    return {
      state: this.state,
      song: {
        songId: this.song.songId,
        name: this.song.name,
        sub: this.song.sub,
        bpm: this.song.bpm,
        tag: this.song.tag
      },
      mode: 'gate',
      bpm: this.song.bpm,
      beatMs: this.beatMs,
      difficulty: Number(this.cfg.get('difficulty')) || 3,
      difficultyLabel: this.cfg.difficultyLabel ? this.cfg.difficultyLabel(this.cfg.get('difficulty')) : '',
      musicMs: now,
      elapsedSec: round(now / 1000, 1),
      durationSec: round(this.durationMs / 1000, 1),
      timeLeftSec: Math.max(0, round((this.durationMs - now) / 1000, 1)),
      progress: this.durationMs > 0 ? clamp(now / this.durationMs, 0, 1) : 0,
      countdownSec: this.countdownMs / 1000,
      score: snap.score,
      perfect: snap.perfect,
      great: snap.great,
      good: snap.good,
      completed: snap.completed,
      unsolved: snap.unsolved,
      // 兼容旧字段名（渲染层/旧记录可能还在读）
      hits: snap.completed,
      miss: 0,
      combo: snap.combo,
      maxCombo: snap.maxCombo,
      leftHits: snap.leftHits,
      centerHits: snap.centerHits,
      rightHits: snap.rightHits,
      stabilityRate: snap.stabilityRate,
      balanceRate: snap.balanceRate,
      avgReactionMs: snap.avgReactionMs,
      // 正在等的那个音符（逐级提示与「该往哪去」都从它读）
      pending: pending ? {
        side: pending.targetSide,
        state: pending.state,
        waitMs: pending.waitMs || 0,
        hintLevel: pending.hintLevel || 0,
        heldMs: pending.heldMs || 0,
        holdMs: this.holdMs,
        holdProgress: this.holdMs > 0 ? clamp((pending.heldMs || 0) / this.holdMs, 0, 1) : 0
      } : null,
      hintLevel: this.hintLevel,
      waitMs: this.waitMs,
      notes: this.visibleNotes(now),
      feedback: recent,
      beatPhase: this.clock && this.clock.beatPhase ? this.clock.beatPhase() : 0,
      notePhase: this._notePhase(now),
      beatFlash: this.beatFlash,
      hitFlash: this.hitFlash,
      nx: this.motion.nx,
      dir: this.motion.dir,
      load: this.motion.load,
      rateHz: this.motion.rateHz,
      quality: this.motion.quality,
      stale: this.motion.stale,
      live: this.motion.isLive(),
      calibrated: !!this.simMode || this.motion.hasZero(),
      zero: this.motion.zeroInfo(),
      calibration: this.motion.cal,
      sim: this.simMode,
      audioMode: this.mode,
      melody: !!this.cfg.get('melodyOn'),
      silent: this.clock ? !!this.clock.isSilent : false,
      previewing: this.previewing,
      previewSec: round(this.previewMs / 1000, 2),
      interrupted: this.interrupted,
      interruptedSec: round(this.interruptedMs / 1000, 1),
      noteCount: this.notes.length,
      backgroundId: this.cfg.get('backgroundId') || 'dawn',
      chartMeta: this.chart.meta,
      summary: this.summary
    }
  }

  // ---------------------------------------------------------------- 调试
  /** 立刻在判定线上放一个音符（预览/自测用） */
  debugPushNote(side, leadMs) {
    if (!this.isPlaying) return false
    const now = this.clock.nowMs()
    const at = now + (leadMs || 0)
    const note = {
      noteId: 'dbg' + Date.now().toString(36),
      targetSide: side === 'right' ? 'right' : (side === 'center' ? 'center' : 'left'),
      noteType: 'normal',
      scoreValue: 100,
      spawnAtMs: at - this.approachMs,
      targetTimeMs: Math.round(at),
      judged: false,
      verdict: '',
      state: 'approaching',
      flaps: 0,
      heldMs: 0,
      reactionMs: 0,
      waitMs: 0,
      hintLevel: 0,
      judgedAt: 0
    }
    this.pending = note
    this.hintLevel = 0
    return true
  }

  setSyncOffset(ms) {
    return this.cfg.set('syncOffsetMs', ms)
  }

  /** 试听 8 拍（音画校准）：只跑节拍时钟，不判定、不生成音符 */
  startPreview() {
    if (this.state !== STATE.READY && this.state !== STATE.IDLE) return false
    if (!this.clock) return false
    this.stopPreview()
    this.previewing = true
    this.previewMs = 0
    this.clock.start()
    this.mode = this.clock.isSilent ? 'silent' : 'music'
    this._emit('preview', { on: true })
    return true
  }

  stopPreview() {
    if (!this.previewing) return false
    this.previewing = false
    this.previewMs = 0
    if (this.clock) this.clock.stop()
    this._emit('preview', { on: false })
    return true
  }
}

module.exports = { RhythmEngine, STATE }
