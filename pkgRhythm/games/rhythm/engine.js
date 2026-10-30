// ============================================================================
// games/rhythm/engine.js —— 「左右节奏训练」核心引擎
// ----------------------------------------------------------------------------
// 职责边界：
//   · 只管状态机、音符生命周期、判定编排、计分、结算摘要；
//   · 不碰 Canvas、不碰 wx API（音频通过注入的 clock 访问），可在 Node 里跑；
//   · 输入只用 utils/motion.js 输出的归一化量（nx / dir），不当成真实位移。
//
// 状态机：
//   IDLE ─prepare→ READY ─calibrate→ CALIBRATING ─→ READY
//   READY ─enter→ COUNTDOWN（预备拍）─→ PLAYING
//   PLAYING ⇄ PAUSED
//   PLAYING → SENSOR_ERROR（断线/超时，冻结时间与判定）─resume→ PLAYING
//   PLAYING / PAUSED → RESULT / ABORTED（只结算一次）
//
// 时间基准：一切以 clock.nowMs()（音乐时间）为准，绝不用帧数累加。
// 判定时间 = nowMs - syncOffsetMs（补偿音画延迟），视觉位置用 nowMs。
// ============================================================================

const { MotionTracker } = require('../../../utils/motion.js')
const { songById, beatMs } = require('../../../utils/rhythm-songs.js')
const { buildChart } = require('./chart.js')
const { HitJudge, VERDICT } = require('./hit-judge.js')
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

const SENSOR_RESUME_MS = 600 // 断线后恢复数据多久算"真的回来了"
// 判定结束后音符留多久用于淡出。
// 原来是 700ms，比标准档的音符间隔（666ms）还长 —— 下一个音符都到了，
// 上一个还堆在判定线上，患者看不出该看哪一个。必须明显短于最短间隔。
const NOTE_TAIL_MS = 380
const END_TAIL_MS = 1400 // 音乐时间到点后再等多久收尾（让最后一个音符结算完）
const FEEDBACK_KEEP_MS = 900 // 判定文字保留时长
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
    this.notes = [] // 场上音符（按时间排序的子集）
    this.active = []
    this.cursor = 0
    this.score = new ScoreManager(this.cfg)
    this.judge = new HitJudge(this.cfg)

    this.musicMs = 0
    this.elapsedSec = 0
    this.countdownMs = 0
    this.durationMs = 0
    this.feedback = null
    this.feedbacks = []
    this.hitFlash = 0
    this.missFlash = 0
    this.beatFlash = 0
    this.lastBeat = -1
    this.guideAt = 0
    this.lastJudgeAt = 0
    this.recentSides = []

    this.action = { seq: 0, side: 'center', since: 0, consumedSeq: 0, lastHitAt: { left: -1e9, center: -1e9, right: -1e9 } }

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
    this.lastFrameAt = 0
    this.mode = 'music' // music | silent（无声时界面必须标注）
    this.previewing = false // 「试听 8 拍」音画校准用
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
  toIntro() {
    this.stopPreview()
    if (this.clock) this.clock.stop()
    this.settled = false
    this.summary = null
    this.notes = []
    this.active = []
    this.cursor = 0
    this.score.reset(0)
    this.feedback = null
    this.feedbacks = []
    this.motion.reset()
    this.setState(STATE.IDLE)
  }

  prepare() {
    this.stopPreview()
    this.syncSong()
    this.settled = false
    this.summary = null
    this.notes = []
    this.active = []
    this.cursor = 0
    this.score.reset(0)
    this.feedback = null
    this.feedbacks = []
    this.action = { seq: 0, side: 'center', since: 0, consumedSeq: 0, lastHitAt: { left: -1e9, center: -1e9, right: -1e9 } }
    this.motion.reset()
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
   * 开始：先按配置生成谱面，再进入预备拍倒计时
   * @returns {{ok:boolean, errors?:string[], warnings?:string[]}}
   */
  startCountdown(opts) {
    const o = opts || {}
    this.stopPreview()
    this.syncSong()
    const v = this.cfg.validate()
    if (!v.ok) return { ok: false, errors: v.errors }

    const durationSec = clamp(Number(this.cfg.get('durationSec')) || 90, 20, 300)
    const chart = o.notes
      ? { notes: o.notes.slice(), meta: o.meta || null }
      : buildChart({
        song: this.song,
        durationSec: durationSec,
        noteGapMs: this.cfg.get('noteGapMs'),
        snapToBeat: this.cfg.get('snapToBeat'),
        noteStepBeats: this.cfg.get('noteStepBeats'),
        restRate: this.cfg.get('restRate'),
        sameSideRate: this.cfg.get('sameSideRate'),
        centerRate: this.cfg.get('centerRate'),
        sameSideGapMs: this.cfg.get('sameSideGapMs'),
        prepMs: this.cfg.get('prepMs'),
        prepBeats: this.cfg.get('prepBeats'),
        difficulty: this.cfg.get('difficulty'),
        seed: this.cfg.get('chartSeed'),
        chartSeedVersion: 'v4'
      })

    if (!chart.notes.length) {
      return { ok: false, errors: ['谱面为空：请检查音符间隔 / 训练时长设置'] }
    }

    this.chart = chart
    this.notes = chart.notes.map((n) => Object.assign({}, n, {
      judged: false,
      verdict: '',
      deltaMs: 0,
      judgedAt: 0,
      fade: 0
    }))
    // 音符脉冲周期：判定区/踏板/光柱的呼吸要跟着**音符**走，不是跟着音乐拍点走。
    // 音符已经不吸附拍点了，还用拍相位呼吸就会出现「灯在拍点上闪、音符在别的
    // 时候到」，患者跟着灯动反而全错。
    this.noteGapMs = (chart.meta && chart.meta.gapMs) || Number(this.cfg.get('noteGapMs')) || 1000
    this.active = []
    this.cursor = 0
    this.musicMs = 0
    this.elapsedSec = 0
    this.durationMs = Math.round(durationSec * 1000)
    this.score.reset(this.notes.length)
    this.feedback = null
    this.feedbacks = []
    this.recentSides = []
    this.lastJudgeAt = 0
    this.guideAt = 0
    this.hitFlash = 0
    this.missFlash = 0
    this.interrupted = false
    this.interruptedMs = 0
    this.interruptCount = 0
    this.recordId = makeId()
    this.startedAt = new Date().toISOString()
    this.settled = false
    this.summary = null
    this.motion.resetTrajectory()
    this.action = { seq: 0, side: 'center', since: 0, consumedSeq: 0, lastHitAt: { left: -1e9, center: -1e9, right: -1e9 } }

    // 倒计时也改成毫秒：它跟拍点没关系，只负责让患者「准备好」。
    // 取 prepMs 的四成 —— 剩下的时间交给第一个音符自己飞进来（prepMs）。
    // 系数从 0.6 降到 0.4 是因为飞行时间加长到 3800ms 后，0.6 会让开局
    // 空等 6 秒（倒计时 2.3s + 飞行 3.8s），患者会以为卡住了。
    const prepMs = clamp(Number(this.cfg.get('prepMs')) || 2400, 600, 10000)
    this.countdownMs = clamp(Math.round(prepMs * 0.4), 1200, 2000)
    this.setState(STATE.COUNTDOWN)
    this._emit('countdown', { beats: Math.ceil(this.countdownMs / 1000) })

    return { ok: true, warnings: v.warnings, noteCount: this.notes.length }
  }

  beginPlay() {
    if (this.state !== STATE.COUNTDOWN) return false
    if (this.clock) this.clock.start()
    // 启动之后再读一次：音频创建/播放失败会在这里变成 silent
    this.mode = this.clock && this.clock.isSilent ? 'silent' : 'music'
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
    if (this.state === STATE.PAUSED) {
      // 从暂停进入中断：时间本来就停着，补齐中断计时
      this.interruptedMs += 0 // 暂停不计入中断时长
    }
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

    // 收尾：把还留在场上的音符按"未命中"处理，保证数据自洽
    for (let i = 0; i < this.active.length; i++) {
      const n = this.active[i]
      if (n.judged) continue
      n.judged = true
      n.verdict = VERDICT.MISS
      n.judgedAt = musicNow
      this.score.missNote('aborted')
    }
    for (let i = 0; i < this.notes.length; i++) {
      if (!this.notes[i].judged) {
        this.notes[i].judged = true
        this.notes[i].verdict = VERDICT.MISS
        this.notes[i].judgedAt = musicNow
        this.score.missNote('not-played')
      }
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

    this.summary = {
      recordId: this.recordId,
      gameId: 'rhythm',
      songId: this.song.songId,
      songName: this.song.name,
      bpm: this.song.bpm,
      difficulty: Number(this.cfg.get('difficulty')) || 3,
      difficultyLabel: this.cfg.difficultyLabel ? this.cfg.difficultyLabel(this.cfg.get('difficulty')) : '',
      chartSeed: Number(this.cfg.get('chartSeed')) || 7,
      // 判定口径版本：换了「怎么算命中」的规则就升它。
      // v1 = sideThreshold 未接线（硬编码 0.1）+ 动作判定有无条件时间后门；
      // v2 = 阈值接上配置 + 后门只对谱面标记的同向连续音符开放（站桩不能得分）。
      // **v1 与 v2 的命中率不可直接对比**：v1 下站着不动能拿到中间音符 +
      // 约四成左右音符，v2 只剩中间音符。
      judgeVersion: 'v2',
      noteCount: snap.totalNotes,
      score: snap.score,
      breakdown: { base: snap.base, comboBonus: snap.comboBonus, finishBonus: snap.finishBonus },
      perfect: snap.perfect,
      great: snap.great,
      good: snap.good,
      miss: snap.miss,
      hits: snap.hits,
      wrongDirectionCount: snap.wrongDir,
      comboMax: snap.maxCombo,
      leftHitCount: snap.leftHits,
      centerHitCount: snap.centerHits,
      rightHitCount: snap.rightHits,
      rhythmAccuracy: snap.rhythmAccuracy,
      directionAccuracy: snap.directionAccuracy,
      overallHitRate: snap.overallHitRate,
      durationSec: round(this.musicMs / 1000, 1),
      plannedSec: round(this.durationMs / 1000, 1),
      syncOffsetMs: Number(this.cfg.get('syncOffsetMs')) || 0,
      controlConfig: {
        leftLimit: this.cfg.get('leftLimit'),
        rightLimit: this.cfg.get('rightLimit'),
        sideThreshold: this.cfg.get('sideThreshold'),
        stableMs: this.cfg.get('stableMs'),
        sameSideGapMs: this.cfg.get('sameSideGapMs')
      },
      pathLength: traj.pathLength,
      avgRate: traj.avgRate,
      peak: traj.peak,
      trajectorySummary: traj,
      dataSource: this.simMode ? 'simulation' : 'real',
      completed: completed,
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

  _grade(snap) {
    const acc = snap.rhythmAccuracy
    if (acc === null || !snap.judged) return '-'
    if (acc >= 0.92 && snap.miss === 0) return 'S'
    if (acc >= 0.82) return 'A'
    if (acc >= 0.68) return 'B'
    if (acc >= 0.5) return 'C'
    return 'D'
  }

  // ---------------------------------------------------------------- 主循环
  update(dt) {
    const step = clamp(Number(dt) || 1 / 60, 0.001, 0.1)
    this.motion.update(step)

    // 试听（音画校准）：只跑节拍，不判定、不计分
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

    // 真实模式下数据断了：立即进入中断，不允许继续判定
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

    const judgeNow = now - (Number(this.cfg.get('syncOffsetMs')) || 0)
    this._updateActions(now)
    this._spawn(now)
    this._judge(judgeNow, now)
    this._cleanup(now)

    // 视觉衰减
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - step * 3.2)
    if (this.missFlash > 0) this.missFlash = Math.max(0, this.missFlash - step * 2.2)
    const bIdx = Math.floor(now / this.beatMs)
    if (bIdx !== this.lastBeat) {
      this.lastBeat = bIdx
      this.beatFlash = 1
      this._emit('beat', { index: bIdx })
    }
    if (this.beatFlash > 0) this.beatFlash = Math.max(0, this.beatFlash - step * 2.6)

    // 引导提示：长时间没有判定 / 明显偏向一侧
    if (this.cfg.get('guideOn') && now - this.lastJudgeAt > GUIDE_GAP_MS &&
        now - this.guideAt > GUIDE_GAP_MS && now > 6000) {
      this.guideAt = now
      const side = this.motion.dir === 'center' ? 'center' : this.motion.dir
      this._emit('guide', {
        kind: side === 'center' ? 'no-move' : 'side-hint',
        side: side,
        text: side === 'center' ? '身体好像没动：试着向需要的方向偏移一点' : '保持住，跟着节拍慢慢移动'
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

  _actionOk(note, now) {
    const sameGap = Math.max(60, Number(this.cfg.get('sameSideGapMs')) || 320)
    // 1. 有新动作（真的移动过）→ 放行
    if (this.action.seq > this.action.consumedSeq) return true

    // 2. 同向连续：患者已经在这一侧，不需要「重新进入」，
    //    只要求距上次同侧命中隔开 sameGap，避免一次停留刷掉一串音符。
    //
    //    这里原来是**无条件**的时间后门：
    //      return now - lastHitAt[side] >= sameGap
    //    交替谱面下同侧音符间隔是 2 个音符（约 2.3 秒），远大于 sameGap(320ms)，
    //    于是后门永远开着 —— 站着完全不动也能拿到全部中间音符 + 约四成左右音符
    //    的 GOOD。训练彻底失去意义。现在必须靠谱面的 repeat 标记才放行。
    if (note.repeat) {
      return now - (this.action.lastHitAt[note.targetSide] || -1e9) >= sameGap
    }

    // 3. 中间音符：回中不产生新的 seq（_updateActions 只在进入左/右时自增），
    //    所以只能走这条。它判的是「保持在正中」，站着不动本来就满足，
    //    这不是漏洞 —— 真正的漏洞是左右音符也能靠后门白拿。
    if (note.targetSide === 'center') {
      return now - (this.action.lastHitAt.center || -1e9) >= sameGap
    }

    // 4. 需要换侧，但没有新动作 = 身体没动，不能命中
    return false
  }

  _spawn(now) {
    const approach = clamp(Number(this.cfg.get('approachMs')) || 2400, 900, 4000)
    while (this.cursor < this.notes.length && this.notes[this.cursor].targetTimeMs - approach <= now) {
      this.active.push(this.notes[this.cursor])
      this.cursor += 1
    }
  }

  _judge(judgeNow, now) {
    const good = this.judge.windows.good
    const offset = Number(this.cfg.get('syncOffsetMs')) || 0
    for (let i = 0; i < this.active.length; i++) {
      const note = this.active[i]
      if (note.judged) continue
      // 音符还没到判定线就先不看（提前站好不算准）
      if (judgeNow < note.targetTimeMs) continue
      if (judgeNow < note.targetTimeMs - good) continue

      const res = this.judge.evaluate(note, judgeNow, {
        side: this.motion.dir,
        enterAt: this.action.since - offset,
        stableMs: now - this.action.since,
        actionOk: this._actionOk(note, now)
      })
      if (res.verdict === 'pending') continue
      this._settle(note, res, now)
    }
  }

  _settle(note, res, now) {
    note.judged = true
    note.verdict = res.verdict
    note.judgeStatus = res.verdict
    note.deltaMs = Math.round(res.deltaMs)
    note.judgedAt = now
    this.lastJudgeAt = now

    if (res.verdict === VERDICT.MISS) {
      this.score.missNote(res.reason)
      this.missFlash = 1
      this.feedback = {
        verdict: VERDICT.MISS,
        deltaMs: Math.round(res.deltaMs),
        side: note.targetSide,
        reason: res.reason,
        at: now
      }
      this._emit('miss', { reason: res.reason, side: note.targetSide, wrongSide: !!res.wrongSide })
      if (res.wrongSide) this._emit('wrong-side', { side: note.targetSide })
      return
    }

    const gain = this.score.hit(res.verdict, {
      side: note.targetSide,
      value: note.scoreValue || 100
    })
    this.hitFlash = 1
    this.action.consumedSeq = Math.max(this.action.seq, this.action.consumedSeq)
    this.action.lastHitAt[note.targetSide] = now
    this.recentSides.push(note.targetSide)
    if (this.recentSides.length > 12) this.recentSides.shift()

    this.feedback = {
      verdict: res.verdict,
      deltaMs: Math.round(res.deltaMs),
      side: note.targetSide,
      gain: gain.gain,
      combo: gain.combo,
      at: now
    }
    this._emit('hit', {
      verdict: res.verdict,
      side: note.targetSide,
      deltaMs: Math.round(res.deltaMs),
      gain: gain.gain,
      combo: gain.combo
    })
    if (gain.combo > 0 && gain.combo % 10 === 0) {
      this._emit('combo', { value: gain.combo })
    }
  }

  _cleanup(now) {
    if (!this.active.length) return
    const keep = []
    for (let i = 0; i < this.active.length; i++) {
      const n = this.active[i]
      if (!n.judged) {
        keep.push(n)
        continue
      }
      if (now - n.judgedAt <= NOTE_TAIL_MS) keep.push(n)
    }
    this.active = keep
  }

  // ---------------------------------------------------------------- 视图数据
  /** 音符在渲染层的可见列表（含进度），渲染层不需要自己算时间 */
  visibleNotes(now) {
    const approach = clamp(Number(this.cfg.get('approachMs')) || 2400, 900, 4000)
    const out = []
    for (let i = 0; i < this.active.length; i++) {
      const n = this.active[i]
      const p = (now - (n.targetTimeMs - approach)) / approach
      if (p < -0.05) continue
      if (p > 1.6) continue
      out.push({
        noteId: n.noteId,
        side: n.targetSide,
        type: n.noteType,
        progress: clamp(p, 0, 1.6),
        judged: n.judged,
        verdict: n.verdict,
        deltaMs: n.deltaMs,
        judgedAt: n.judgedAt
      })
    }
    return out
  }

  /**
   * 音符相位：距离下一个未判定音符还有多近（0 = 还很远，1 = 马上到）。
   * 判定线 / 踏板 / 光柱的呼吸一律用它，不能用 clock.beatPhase ——
   * 音符已经不吸附拍点了，跟着音乐拍点呼吸就是「灯在拍点上闪、音符在别的
   * 时候到」，患者照着灯动反而全错。
   */
  _notePhase(now) {
    const gap = Math.max(1, this.noteGapMs || 1000)
    for (let i = 0; i < this.active.length; i++) {
      const n = this.active[i]
      if (n.judged) continue
      const remain = n.targetTimeMs - now
      if (remain < 0) continue
      if (remain > gap) break // active 按时间有序，后面的更远
      return clamp(1 - remain / gap, 0, 1)
    }
    return 0
  }

  getViewModel(nowArg) {
    const now = typeof nowArg === 'number' ? nowArg : (this.clock ? this.clock.nowMs() : this.musicMs)
    const snap = this.score.snapshot()
    const w = this.judge.windows
    const recent = this.feedback && now - this.feedback.at < FEEDBACK_KEEP_MS ? this.feedback : null
    return {
      state: this.state,
      song: {
        songId: this.song.songId,
        name: this.song.name,
        sub: this.song.sub,
        bpm: this.song.bpm,
        tag: this.song.tag
      },
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
      // 倒计时按秒读，不按拍 —— 音符已经不跟拍点走了，读拍会数出不存在的东西
      countdownBeat: Math.ceil(this.countdownMs / 1000),
      score: snap.score,
      perfect: snap.perfect,
      great: snap.great,
      good: snap.good,
      miss: snap.miss,
      hits: snap.hits,
      combo: snap.combo,
      maxCombo: snap.maxCombo,
      wrongDir: snap.wrongDir,
      leftHits: snap.leftHits,
      centerHits: snap.centerHits,
      rightHits: snap.rightHits,
      totalNotes: snap.totalNotes,
      rhythmAccuracy: snap.rhythmAccuracy,
      directionAccuracy: snap.directionAccuracy,
      overallHitRate: snap.overallHitRate,
      judgedCount: snap.judged,
      notes: this.visibleNotes(now),
      windows: w,
      feedback: recent,
      feedbacks: this.feedbacks,
      beatPhase: this.clock && this.clock.beatPhase ? this.clock.beatPhase() : 0,
      // 音符相位：0 = 下一个音符还很远，1 = 马上就到。视觉呼吸一律用它，
      // 不能用 beatPhase —— 那会让提示和音符错开（见 start() 里的说明）。
      notePhase: this._notePhase(now),
      beatFlash: this.beatFlash,
      hitFlash: this.hitFlash,
      missFlash: this.missFlash,
      nx: this.motion.nx,
      dir: this.motion.dir,
      load: this.motion.load,
      rateHz: this.motion.rateHz,
      quality: this.motion.quality,
      stale: this.motion.stale,
      live: this.motion.isLive(),
      // 零点全 App 共用：本局标过、标定页标过、别的游戏标过，都算已标定
      calibrated: !!this.simMode || this.motion.hasZero(),
      zero: this.motion.zeroInfo(),
      calibration: this.motion.cal,
      sim: this.simMode,
      audioMode: this.mode,
      silent: this.clock ? !!this.clock.isSilent : false,
      previewing: this.previewing,
      previewBeatPhase: this.clock && this.clock.beatPhase ? this.clock.beatPhase() : 0,
      previewSec: round(this.previewMs / 1000, 2),
      interrupted: this.interrupted,
      interruptedSec: round(this.interruptedMs / 1000, 1),
      noteCount: this.notes.length,
      chartMeta: this.chart.meta,
      summary: this.summary
    }
  }

  // ---------------------------------------------------------------- 模拟测试入口
  /** 在音乐时间 now + leadMs 处插入一个音符（只改谱面，判定仍走真实流程） */
  debugPushNote(side, leadMs) {
    if (!this.isPlaying) return false
    const now = this.clock.nowMs()
    const at = now + (leadMs || 1200)
    const note = {
      noteId: 'dbg' + Date.now().toString(36),
      targetSide: side === 'right' ? 'right' : 'left',
      beatIndex: at / this.beatMs,
      targetTimeMs: Math.round(at),
      noteType: 'normal',
      scoreValue: 100,
      judgeStatus: 'pending',
      judged: false,
      verdict: '',
      deltaMs: 0,
      judgedAt: 0,
      fade: 0
    }
    // 插到 active，同时保证 cursor 不会重复加入
    this.active.push(note)
    this.active.sort((a, b) => a.targetTimeMs - b.targetTimeMs)
    return true
  }

  /** 调音画补偿（校准面板用） */
  setSyncOffset(ms) {
    return this.cfg.set('syncOffsetMs', ms)
  }

  /**
   * 试听 8 拍（音画校准）：
   * 只启动音乐与节拍时钟，不做判定、不生成音符，用于让患者把"看到"和"听到"对齐。
   */
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
