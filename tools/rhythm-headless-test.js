// ============================================================================
// tools/rhythm-headless-test.js —— 左右节奏训练「无头」自检（Node 运行，不进小程序包）
// ----------------------------------------------------------------------------
// 伪造一个「音频时钟」（FakeClock）+ Mock Canvas，让完整流程可以在 Node 里跑：
//   1. 配置校验：判定窗口顺序、难度预设、恢复默认
//   2. 谱面：同参数同种子完全一致、跨难度不同、同向连续间隔合法、外部 JSON 校验
//   3. 判定：时间窗口边界、方向正确/错误、方向对但时间偏 → GREAT/GOOD
//   4. 一次动作最多结算一个音符（防止"站着一直刷分"）
//   5. 漏接：窗口关闭记 MISS，连击按配置归零
//   6. 暂停：音乐时间、判定、连击全部冻结；恢复后继续
//   7. 断线：进入 SENSOR_ERROR 后不判定、不加分、记录中断时长、不自动切模拟
//   8. 计分：三个准确率的公式与「暂无数据」，分项之和 = 总分
//   9. 渲染冒烟：六个界面 + 320×568 + 414×896 + 按钮热区
//  10. 记录：防重复、模拟不上报、与走钢丝/接水果分库隔离
//
// 用法：node tools/rhythm-headless-test.js
// ============================================================================

/* eslint-disable no-console */

const storage = {}
global.wx = {
  getStorageSync: (k) => (storage[k] === undefined ? '' : storage[k]),
  setStorageSync: (k, v) => { storage[k] = v },
  createOffscreenCanvas: (o) => makeCanvas(o.width, o.height),
  getWindowInfo: () => ({ pixelRatio: 2, statusBarHeight: 44, windowWidth: 390, windowHeight: 844 }),
  getMenuButtonBoundingClientRect: () => ({ top: 48, bottom: 80, left: 281, width: 87 })
}
global.getApp = () => ({ globalData: {} })

// ---------------------------------------------------------------- Mock Canvas
function makeGradient() {
  return { addColorStop() {} }
}

function makeCtx() {
  const state = {}
  const ctx = {
    measureText: (t) => ({ width: String(t).length * 6.2 }),
    createLinearGradient: () => makeGradient(),
    createRadialGradient: () => makeGradient()
  }
  const methods = [
    'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
    'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'rect', 'fill', 'stroke', 'clip',
    'translate', 'scale', 'rotate', 'setTransform', 'transform', 'clearRect',
    'fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage', 'setLineDash'
  ]
  methods.forEach((m) => { ctx[m] = function () { state[m] = (state[m] || 0) + 1 } })
  ctx.__calls = state
  return ctx
}

function makeCanvas(w, h) {
  const ctx = makeCtx()
  return {
    width: w || 300,
    height: h || 150,
    getContext: () => ctx,
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: () => {}
  }
}

// ---------------------------------------------------------------- FakeClock
/** 模拟 BeatClock 的对外接口：时间完全由测试推进，不依赖真实音频 */
class FakeClock {
  constructor(song) {
    this.song = song || null
    this.t = 0
    this.state = 'idle'
    this.pausedAt = 0
    this.isSilent = false
    this.mode = 'audio'
    this.beatMs = 500
  }

  setSong(song) {
    this.song = song
    if (song && song.bpm) this.beatMs = 60000 / song.bpm
    return this
  }

  start() {
    this.state = 'playing'
    this.t = 0
    return this
  }

  pause() {
    if (this.state === 'playing') {
      this.pausedAt = this.t
      this.state = 'paused'
    }
    return this
  }

  resume() {
    if (this.state === 'paused') this.state = 'playing'
    return this
  }

  stop() {
    this.state = 'idle'
    this.t = 0
    return this
  }

  nowMs() {
    return this.state === 'paused' ? this.pausedAt : this.t
  }

  beatPhase() {
    const m = ((this.t % this.beatMs) + this.beatMs) % this.beatMs
    return m / this.beatMs
  }

  syncVolume() {}

  destroyAudio() {}

  advance(ms) {
    if (this.state !== 'playing') return this.t
    this.t += ms
    return this.t
  }
}

// ---------------------------------------------------------------- 断言
let pass = 0
let fail = 0
const failures = []

function ok(cond, label) {
  if (cond) {
    pass += 1
    console.log('  ✓ ' + label)
  } else {
    fail += 1
    failures.push(label)
    console.log('  ✗ ' + label)
  }
}

function eq(a, b, label) {
  ok(a === b, label + (a === b ? '' : '（实际 ' + JSON.stringify(a) + '，期望 ' + JSON.stringify(b) + '）'))
}

function near(a, b, tol, label) {
  ok(Math.abs(a - b) <= tol, label + (Math.abs(a - b) <= tol ? '' : '（实际 ' + a + '，期望 ' + b + '±' + tol + '）'))
}

// ---------------------------------------------------------------- 依赖
const { getStore, validate, PRESETS } = require('../utils/rhythm-config.js')
const { buildChart, parseChart } = require('../pkgRhythm/games/rhythm/chart.js')
const { songById, beatMs } = require('../utils/rhythm-songs.js')
const { HitJudge } = require('../pkgRhythm/games/rhythm/hit-judge.js')
const { ScoreManager } = require('../pkgRhythm/games/rhythm/score.js')
const { RhythmEngine } = require('../pkgRhythm/games/rhythm/engine.js')
const { RhythmRenderer } = require('../pkgRhythm/games/rhythm/renderer.js')
const { MotionTracker } = require('../utils/motion.js')
const rhythmRecords = require('../pkgRhythm/utils/rhythm-record.js')
const wireRecords = require('../utils/training-record.js')
const fruitRecords = require('../pkgFruit/utils/fruit-record.js')

const DT = 1 / 60

function makeCfg(patch) {
  const cfg = getStore({ fresh: true })
  cfg.reset()
  if (patch) cfg.patch(patch, 'test')
  return cfg
}

function makeEngine(patch, opts) {
  const cfg = makeCfg(patch)
  const clock = new FakeClock(songById(cfg.get('songId')))
  const engine = new RhythmEngine({ cfg: cfg, clock: clock })
  if (!opts || opts.sim !== false) engine.setSimMode(true)
  engine.prepare()
  return { cfg, clock, engine }
}

/** 推进引擎：同时推进音乐时间与帧步长 */
function run(engine, clock, ms, each) {
  const steps = Math.max(1, Math.round(ms / (DT * 1000)))
  for (let i = 0; i < steps; i++) {
    clock.advance(DT * 1000)
    if (each) each(i)
    engine.update(DT)
    engine.drainEvents()
  }
}

/** 只推进倒计时（音乐还没开始） */
function runCountdown(engine, maxMs) {
  let t = 0
  while (engine.state === 'COUNTDOWN' && t < maxMs) {
    engine.update(DT)
    t += DT * 1000
  }
  engine.drainEvents()
  return t
}

/** 让身体稳定到某一侧（推进若干帧，不推进音乐时间之外的事） */
function holdSide(engine, clock, side, ms) {
  engine.setSimTarget(side === 'left' ? -1 : (side === 'right' ? 1 : 0))
  run(engine, clock, ms || 300)
}

// ============================================================================
console.log('\n[1] 配置与校验')
{
  const cfg = makeCfg()
  ok(cfg.get('perfectMs') < cfg.get('greatMs') && cfg.get('greatMs') < cfg.get('goodMs'),
    '默认窗口满足 PERFECT < GREAT < GOOD')

  cfg.patch({ perfectMs: 100, greatMs: 90 }, 'test')
  const v = validate(cfg.all())
  ok(!v.ok && v.errors.join('').indexOf('窗口') >= 0, '窗口顺序错误会被拦截')

  cfg.reset()
  cfg.applyDifficulty(1)
  eq(cfg.get('noteGapMs'), PRESETS[1].noteGapMs, '第 1 档套用「音符间隔」预设')
  cfg.applyDifficulty(5)
  eq(cfg.get('approachMs'), PRESETS[5].approachMs, '第 5 档套用「飞行时间」预设')

  cfg.patch({ sideThreshold: 0.75, musicVolume: 0 }, 'test')
  const w = validate(cfg.all())
  ok(w.warnings.length >= 2, '阈值偏大 / 音量为 0 会给出提醒')

  const before = cfg.get('noteStepBeats')
  cfg.reset()
  ok(cfg.get('noteStepBeats') !== before || before === 1, '恢复默认生效')
}

console.log('\n[2] 谱面（确定性 + 结构）')
{
  const song = songById('dawn_walk')
  const base = {
    song: song,
    durationSec: 30,
    noteGapMs: 1000,
    snapToBeat: false,
    restRate: 0.15,
    sameSideRate: 0.2,
    centerRate: 0.3,
    sameSideGapMs: 320,
    prepMs: 2400,
    difficulty: 3,
    seed: 7
  }
  const a = buildChart(base)
  const b = buildChart(base)
  eq(JSON.stringify(a.notes), JSON.stringify(b.notes), '同曲 / 同难度 / 同种子 → 谱面完全一致')

  const c = buildChart(Object.assign({}, base, { seed: 8 }))
  ok(JSON.stringify(a.notes) !== JSON.stringify(c.notes), '换种子 → 谱面不同')

  const d = buildChart(Object.assign({}, base, { difficulty: 5, noteGapMs: 700, sameSideRate: 0.2 }))
  ok(d.notes.length > a.notes.length, '高难度音符更多')

  // 所有音符都在时长内、左右都有、时间递增
  const beat = beatMs(song)
  let inRange = true
  let ordered = true
  let left = 0
  let center = 0
  let right = 0
  a.notes.forEach((n, i) => {
    if (n.targetTimeMs > 30000 + song.offsetMs) inRange = false
    if (i > 0 && n.targetTimeMs <= a.notes[i - 1].targetTimeMs) ordered = false
    if (n.targetSide === 'left') left += 1
    else if (n.targetSide === 'center') center += 1
    else right += 1
  })
  ok(inRange, '音符都在训练时长内')
  ok(ordered, '音符按时间递增排列')
  ok(left > 0 && center > 0 && right > 0, '左 / 中 / 右三个方向都有音符')
  ok(a.meta.centerCount === center, 'meta.centerCount 与实际一致')

  // centerRate = 0 时退化为左右交替
  const twoWay = buildChart(Object.assign({}, base, { centerRate: 0 }))
  ok(twoWay.notes.every((n) => n.targetSide !== 'center'), 'centerRate=0 → 没有中间音符')

  // 呼吸拍必须是「固定位置、单拍留空」：
  // 曾经是随机留空，会连着空两三拍，手感就是"一堆音符之后半天没一个"
  const gaps = []
  for (let i = 1; i < a.notes.length; i++) gaps.push(a.notes[i].targetTimeMs - a.notes[i - 1].targetTimeMs)
  // 呼吸不再是「跳过一个音符」（间隔翻倍 = 节奏断线），而是把间隔拉长 1.5 倍。
  // 所以合法间隔只有两种：常态 gapMs，和呼吸的 gapMs × 1.5。
  const stepMs = a.meta.gapMs
  const odd = gaps.filter((g) => Math.abs(g - stepMs) > 60 && Math.abs(g - stepMs * 1.5) > 60)
  ok(odd.length === 0, '音符间隔只有「常态」或「呼吸拉长的 1.5 倍」', odd.slice(0, 3).join(','))
  let doubleRest = 0
  for (let i = 1; i < gaps.length; i++) if (gaps[i] > stepMs * 1.2 && gaps[i - 1] > stepMs * 1.2) doubleRest += 1
  ok(doubleRest === 0, '呼吸不会连着出现（节奏不断线）', String(doubleRest))
  near(a.notes[0].targetTimeMs, base.prepMs + (song.offsetMs || 0), 2, '第一个音符落在预备时间之后')

  // ── 本次改动的核心：训练强度与 BPM 彻底无关 ──
  // 之前同一难度档在 66/90/110 BPM 下间隔是 909/666/545ms（差 1.67 倍），
  // 换首曲子难度就变了。现在必须三首曲子给出完全一样的时间表。
  const across = ['slow_wave', 'dawn_walk', 'heart_pulse'].map((id) => {
    return buildChart(Object.assign({}, base, { song: id }))
  })
  const sameCount = across.every((c) => c.notes.length === across[0].notes.length)
  ok(sameCount, '换曲子不改变音符数量（难度不再随 BPM 漂移）',
    across.map((c) => c.notes.length).join('/'))
  // 只比时间：方向序列仍按 songId 播种（同曲同种子才可复现），
  // 换曲子本来就该换一套左右顺序，但「什么时候来音符」必须一模一样。
  const timesOf = (c) => JSON.stringify(c.notes.map((n) => n.targetTimeMs))
  ok(timesOf(across[0]) === timesOf(across[1]) && timesOf(across[1]) === timesOf(across[2]),
  '换曲子音符时间表完全一致',
  across.map((c) => c.notes.length + '个').join('/'))
  ok(across[0].meta.bpm !== across[2].meta.bpm, '测试用的三首曲子 BPM 确实不同（上面的断言才有意义）')

  // 物理下限：再怎么调都不能低于一次重心转移所需的时间
  const tooFast = buildChart(Object.assign({}, base, { noteGapMs: 300 }))
  const tfGaps = []
  for (let i = 1; i < tooFast.notes.length; i++) {
    tfGaps.push(tooFast.notes[i].targetTimeMs - tooFast.notes[i - 1].targetTimeMs)
  }
  ok(Math.min.apply(null, tfGaps) >= 620, '间隔有 620ms 物理下限（低于此患者做不完一次转移）',
    String(Math.min.apply(null, tfGaps)))

  // 吸附模式下音符仍落在音乐网格上（半拍网格：步长可能是 1.5 拍这类附点值，
  // 落在八分位同样是合法的音乐位置，只要求不出现"哪儿都不在"的时间点）
  const snapped = buildChart(Object.assign({}, base, { snapToBeat: true, noteStepBeats: 1 }))
  const offBeat = snapped.notes.filter((n) => {
    const half = (n.targetTimeMs / beatMs(song)) * 2
    return Math.abs(half - Math.round(half)) > 0.02
  })
  ok(offBeat.length === 0, '吸附模式下音符仍落在音乐网格上', String(offBeat.length))
  // 且换曲子时吸附模式会给出不同间隔（这正是它存在的代价）
  const snapSlow = buildChart(Object.assign({}, base, { snapToBeat: true, song: 'slow_wave' }))
  ok(snapSlow.meta.gapMs !== snapped.meta.gapMs || snapSlow.notes.length !== snapped.notes.length,
    '吸附模式下换曲子会改变节奏（所以默认关闭它）')

  // 同向连续必须留够间隔（否则引擎的"一次动作一个音符"规则下打不出来）
  let badGap = 0
  for (let i = 1; i < a.notes.length; i++) {
    if (a.notes[i].targetSide === a.notes[i - 1].targetSide) {
      if (a.notes[i].targetTimeMs - a.notes[i - 1].targetTimeMs < 320 - 1) badGap += 1
    }
  }
  eq(badGap, 0, '同向连续音符的间隔不小于 sameSideGapMs')

  // 外部 JSON 谱面
  const parsed = parseChart([
    { noteId: 'x1', targetSide: 'left', beatIndex: 4, targetTimeMs: 1000 },
    { noteId: 'x2', targetSide: 'up', targetTimeMs: 2000 }
  ], song)
  eq(parsed.notes.length, 1, '非法方向会被丢弃')
  ok(parsed.errors.length === 1, '非法数据会给出错误说明')
  const parsed2 = parseChart({ notes: [{ targetSide: 'right', beatIndex: 2 }], bpm: 120 })
  eq(parsed2.notes[0].targetTimeMs, 1000, '缺少 targetTimeMs 时按 beatIndex × BPM 推算')
}

console.log('\n[3] 判定窗口与方向')
{
  const cfg = makeCfg({ perfectMs: 50, greatMs: 100, goodMs: 150, stableMs: 0, sideThreshold: 0.35 })
  const judge = new HitJudge(cfg)
  const note = { targetSide: 'left', targetTimeMs: 1000 }

  eq(judge.classify(0), 'perfect', '0ms → PERFECT')
  eq(judge.classify(-50), 'perfect', '±50ms 边界仍是 PERFECT')
  eq(judge.classify(51), 'great', '51ms → GREAT')
  eq(judge.classify(120), 'good', '120ms → GOOD')
  eq(judge.classify(151), null, '151ms 超出窗口')

  // 判定在"音符到达判定线之后"进行：早了不算
  const early = judge.evaluate(note, 900, { side: 'left', enterAt: 900, stableMs: 600, actionOk: true })
  eq(early.verdict, 'pending', '音符还没到判定线 → 不判（提前站好不算准）')

  const r1 = judge.evaluate(note, 1000, { side: 'left', enterAt: 1000, stableMs: 600, actionOk: true })
  eq(r1.verdict, 'perfect', '方向对 + 正好在拍上进入 → PERFECT')
  const r2 = judge.evaluate(note, 1000, { side: 'left', enterAt: 1090, stableMs: 600, actionOk: true })
  eq(r2.verdict, 'great', '方向对 + 晚 90ms 进入 → GREAT')
  const r2b = judge.evaluate(note, 1000, { side: 'left', enterAt: 700, stableMs: 600, actionOk: true })
  eq(r2b.verdict, 'good', '提前站好（早 300ms）只算 GOOD，不算 PERFECT')
  const r3 = judge.evaluate(note, 1000, { side: 'right', enterAt: 900, stableMs: 600, actionOk: true })
  eq(r3.verdict, 'miss', '方向反了 → 直接 MISS')
  ok(r3.wrongSide === true, '方向反了会标记 wrongSide')
  const r4 = judge.evaluate(note, 1000, { side: 'left', enterAt: 990, stableMs: 600, actionOk: false })
  eq(r4.verdict, 'pending', '动作未就绪时先不判（不白送分）')
  const r4b = judge.evaluate(note, 1480, { side: 'left', enterAt: 990, stableMs: 600, actionOk: false })
  eq(r4b.verdict, 'miss', '动作一直不可用，窗口关闭后记 MISS')
  const r5 = judge.evaluate(note, 1000, { side: 'center', enterAt: 1000, stableMs: 600, actionOk: true })
  eq(r5.verdict, 'pending', '站在中间不算命中')
  const r5b = judge.evaluate(note, 1300, { side: 'center', enterAt: 1300, stableMs: 600, actionOk: true })
  eq(r5b.verdict, 'miss', '一直在中间，窗口关闭记 MISS')
  const r6 = judge.evaluate(note, 1400, { side: 'left', enterAt: 1400, stableMs: 600, actionOk: true })
  eq(r6.verdict, 'miss', '窗口关闭后才进入 → MISS')

  // 三车道：中间音符（要求回到中立位）
  const cNote = { targetSide: 'center', targetTimeMs: 1000 }
  const c1 = judge.evaluate(cNote, 1000, { side: 'center', enterAt: 1000, stableMs: 600, actionOk: true })
  eq(c1.verdict, 'perfect', '中间音符 + 身体居中 → PERFECT')
  const c2 = judge.evaluate(cNote, 1000, { side: 'left', enterAt: 900, stableMs: 600, actionOk: true })
  eq(c2.verdict, 'pending', '中间音符、到线时还在回中的路上 → 先不判（不误伤）')
  const c2b = judge.evaluate(cNote, 1060, { side: 'center', enterAt: 1060, stableMs: 600, actionOk: true })
  eq(c2b.verdict, 'great', '窗口内回到中间 → 按迟到正常判 GREAT')
  const c2c = judge.evaluate(cNote, 1200, { side: 'left', enterAt: 900, stableMs: 600, actionOk: true })
  eq(c2c.verdict, 'miss', '窗口关闭仍偏在一侧 → 方向错误 MISS')
  ok(c2c.wrongSide === true, '中间音符的 wrongSide 也会标记')
  const c3 = judge.evaluate({ targetSide: 'left', targetTimeMs: 1000 }, 1000,
    { side: 'center', enterAt: 1000, stableMs: 600, actionOk: true })
  eq(c3.verdict, 'pending', '左右音符、站在中间 → 先不判（中性位置不罚）')
}

console.log('\n[4] 引擎：完整开始流程与节奏命中')
{
  const { cfg, clock, engine } = makeEngine({
    durationSec: 20, noteStepBeats: 1, restRate: 0, sameSideRate: 0, centerRate: 0.3,
    prepBeats: 4, perfectMs: 90, greatMs: 140, goodMs: 220, stableMs: 80,
    approachMs: 1800, chartSeed: 3, syncOffsetMs: 0
  })
  const res = engine.startCountdown()
  ok(res.ok, 'startCountdown 成功')
  eq(engine.state, 'COUNTDOWN', '进入 COUNTDOWN')
  eq(engine.notes.length, res.noteCount, '谱面已生成')

  runCountdown(engine, 6000)
  eq(engine.state, 'PLAYING', '预备拍结束 → PLAYING')
  eq(clock.state, 'playing', '音乐时钟已启动')

  // 跟着谱面走：在目标前 200ms 把身体移到正确一侧（移到位的时刻≈目标时刻）
  let idx = 0
  let perfect = 0
  let good = 0
  let hits = 0
  for (let i = 0; i < 4000 && engine.state === 'PLAYING'; i++) {
    const n = engine.notes[idx]
    if (n && clock.t >= n.targetTimeMs - 160) {
      engine.setSimTarget(n.targetSide === 'left' ? -1 : (n.targetSide === 'right' ? 1 : 0))
    }
    clock.advance(DT * 1000)
    engine.update(DT)
    engine.drainEvents()
    if (n && n.judged) {
      hits += 1
      if (n.verdict === 'perfect') perfect += 1
      if (n.verdict === 'perfect' || n.verdict === 'great') good += 1
      idx += 1
    }
  }
  ok(hits >= 8, '自动跟拍命中了至少 8 个音符（实际 ' + hits + '）')
  ok(engine.score.centerHits > 0, '自动跟拍也能命中中间音符（实际 ' + engine.score.centerHits + '）')
  ok(perfect >= hits * 0.4, '不少判定落在 PERFECT（' + perfect + '/' + hits + '）')
  ok(good >= hits * 0.7, '大部分判定是 PERFECT / GREAT（' + good + '/' + hits + '）')
  ok(engine.score.miss === 0, '跟拍时没有漏接')
  ok(engine.score.wrongDir === 0, '跟拍时没有方向错误')
}

console.log('\n[5] 一次动作只能结算一个音符 + 错误方向 + 漏接')
{
  // prepBeats 固定 4：这一段只测"手动塞的音符"，不能让谱面自带的音符混进来
  const { engine, clock } = makeEngine({
    durationSec: 30, noteStepBeats: 1, restRate: 0, sameSideRate: 0, prepBeats: 4,
    stableMs: 0, sameSideGapMs: 320, perfectMs: 80, greatMs: 120, goodMs: 180,
    approachMs: 1200, chartSeed: 5
  })
  engine.startCountdown()
  runCountdown(engine, 6000)

  // 站在左侧不动，手动塞两个左音符（间隔 100ms < sameSideGapMs）
  engine.setSimTarget(-1)
  run(engine, clock, 400)
  engine.debugPushNote('left', 1000)
  engine.debugPushNote('left', 1100)
  run(engine, clock, 1600)

  ok(engine.score.hits >= 1, '第一个音符能命中')
  ok(engine.score.hits <= 1, '同一次保持不会把两个同向音符都判成命中（实际 ' + engine.score.hits + '）')
  ok(engine.score.miss >= 1, '间隔不足的第二个音符记为漏接')

  // 错误方向：站在右侧等左音符
  const e2 = makeEngine({
    durationSec: 30, noteStepBeats: 1, restRate: 0, sameSideRate: 0, prepBeats: 4,
    stableMs: 0, approachMs: 1200, chartSeed: 9
  })
  e2.engine.startCountdown()
  runCountdown(e2.engine, 6000)
  e2.engine.setSimTarget(1)
  run(e2.engine, e2.clock, 400)
  e2.engine.debugPushNote('left', 1000)
  run(e2.engine, e2.clock, 1600)
  eq(e2.engine.score.wrongDir, 1, '站在错误一侧 → 记一次方向错误')
  eq(e2.engine.score.miss, 1, '方向错误同时记一次漏接')
  eq(e2.engine.score.hits, 0, '方向错误不加命中')
}

console.log('\n[6] 暂停与恢复')
{
  const { engine, clock } = makeEngine({
    durationSec: 40, noteStepBeats: 1, restRate: 0, sameSideRate: 0,
    approachMs: 1500, chartSeed: 11
  })
  engine.startCountdown()
  runCountdown(engine, 6000)
  engine.setSimTarget(-1)
  run(engine, clock, 900)

  const beforeTime = clock.nowMs()
  const beforeJudged = engine.score.judged
  const beforeHits = engine.score.hits

  engine.pause()
  eq(engine.state, 'PAUSED', '进入 PAUSED')
  run(engine, clock, 800)
  eq(clock.nowMs(), beforeTime, '暂停期间音乐时间冻结')
  eq(engine.score.judged, beforeJudged, '暂停期间不产生新的判定')
  eq(engine.score.hits, beforeHits, '暂停期间不加分')

  engine.resume()
  eq(engine.state, 'PLAYING', '恢复后回到 PLAYING')
  run(engine, clock, 200)
  ok(clock.nowMs() > beforeTime, '恢复后音乐时间继续推进')
  ok(engine.score.judged >= beforeJudged, '恢复后判定继续')
}

console.log('\n[7] 传感器中断')
{
  const { engine, clock } = makeEngine({
    durationSec: 40, noteStepBeats: 1, restRate: 0, sameSideRate: 0,
    approachMs: 1500, chartSeed: 13
  })
  engine.startCountdown()
  runCountdown(engine, 6000)
  engine.setSimTarget(-1)
  run(engine, clock, 700)

  const hitsBefore = engine.score.hits
  const timeBefore = clock.nowMs()
  engine.enterSensorError('disconnected')
  eq(engine.state, 'SENSOR_ERROR', '进入 SENSOR_ERROR')
  ok(engine.interruptCount === 1, '记录一次中断')
  ok(engine.interrupted === true, '标记本局被中断过')

  run(engine, clock, 1200)
  eq(engine.score.hits, hitsBefore, '中断期间不产生命中')
  eq(clock.nowMs(), timeBefore, '中断期间音乐时间冻结')
  eq(engine.state, 'SENSOR_ERROR', '不会自动切回模拟或继续判定')

  run(engine, clock, 2500) // 模拟"数据恢复"前等待
  engine.resume()
  eq(engine.state, 'PLAYING', '恢复后继续训练')

  const summary = engine.finish('aborted')
  ok(summary.interrupted === true, '结算里保留中断标记')
  ok(summary.interruptedSec >= 0, '结算里带中断时长')
  ok(summary.completed === false, '中止时 completed = false')
}

console.log('\n[8] 计分与三个准确率')
{
  const cfg = makeCfg({ scorePerfect: 100, scoreGreat: 70, scoreGood: 40, comboStep: 0.1, comboMaxMul: 1.5, finishBonus: 100 })
  const score = new ScoreManager(cfg)
  score.reset(10)

  eq(score.rhythmAccuracy, null, '没有判定样本 → 节奏准确率 null（页面显示暂无数据）')
  eq(score.directionAccuracy, null, '没有判定样本 → 方向准确率 null')
  eq(score.overallHitRate, 0, '综合命中率分母是音符总数，未命中时为 0')

  eq(score.comboMul, 1, '第 1 个音符倍率 1.0')
  score.hit('perfect', { side: 'left', value: 100 })
  eq(score.combo, 1, '连击 1')
  score.hit('perfect', { side: 'right', value: 100 })
  near(score.comboMul, 1.1, 1e-9, '第 2 个音符倍率 1.1')
  score.hit('great', { side: 'left', value: 100 })
  score.hit('good', { side: 'right', value: 100 })
  score.missNote('late')

  const snap = score.snapshot()
  eq(snap.hits, 4, '命中 4 个')
  eq(snap.miss, 1, '漏接 1 个')
  eq(snap.leftHits, 2, '左侧命中 2 个')
  eq(snap.rightHits, 2, '右侧命中 2 个')
  eq(snap.rhythmAccuracy, (1 + 1 + 0.7 + 0.4) / 5, '节奏准确率 = 加权 / 已判定数')
  eq(snap.directionAccuracy, 1, '没有方向错误时方向准确率 100%')
  eq(snap.combo, 0, '漏接后连击归零（默认配置）')

  score.addFinish()
  const s2 = score.snapshot()
  eq(s2.score, s2.base + s2.comboBonus + s2.finishBonus, '总分 = 基础分 + 连击加成 + 完成奖励')
  eq(s2.finishBonus, 100, '完成奖励取配置值')

  // 连击倍率上限
  const cfg2 = makeCfg({ comboStep: 0.2, comboMaxMul: 1.3 })
  const s3 = new ScoreManager(cfg2)
  s3.reset(50)
  for (let i = 0; i < 10; i++) s3.hit('perfect', { side: 'left', value: 100 })
  near(s3.comboMul, 1.3, 1e-9, '连击倍率不超过上限')
}

console.log('\n[9] 渲染冒烟（Mock Canvas）')
{
  function renderScreen(w, h, state) {
    const cfg = makeCfg({ durationSec: 30, noteStepBeats: 1 })
    const clock = new FakeClock(songById(cfg.get('songId')))
    const engine = new RhythmEngine({ cfg: cfg, clock: clock })
    engine.setSimMode(true)
    const canvas = makeCanvas(Math.round(w * 2), Math.round(h * 2))
    const renderer = new RhythmRenderer({
      canvas: canvas, ctx: canvas.getContext('2d'), engine: engine, cfg: cfg
    })
    renderer.resize(w, h, 2)

    if (state === 'prepare' || state === 'calibrating') {
      engine.prepare()
      if (state === 'calibrating') engine.calibrate()
    } else if (state === 'play' || state === 'pause' || state === 'sensor') {
      engine.prepare()
      engine.startCountdown()
      runCountdown(engine, 6000)
      engine.setSimTarget(-1)
      run(engine, clock, 900)
      if (state === 'pause') engine.pause()
      if (state === 'sensor') engine.enterSensorError('test')
    } else if (state === 'result') {
      engine.prepare()
      engine.startCountdown()
      runCountdown(engine, 6000)
      run(engine, clock, 1500)
      engine.finish('timeout')
    }
    renderer.render(DT, Date.now())
    return { renderer, engine, vm: engine.getViewModel() }
  }

  ;['intro', 'prepare', 'calibrating', 'play', 'pause', 'sensor', 'result'].forEach((s) => {
    try {
      const r = renderScreen(390, 844, s)
      ok(true, s + ' 帧渲染完成')
      if (s === 'intro') {
        ok(r.renderer.buttons.some((b) => b.id === 'start'), 'intro 有开始按钮热区')
        const btn = r.renderer.buttons.find((b) => b.id === 'start')
        eq(r.renderer.hitTest(btn.x + btn.w / 2, btn.y + btn.h / 2), 'start', '热区命中正常')
        ok(r.renderer.buttons.some((b) => b.id.indexOf('song:') === 0), 'intro 有曲目选择热区')
        ok(r.renderer.buttons.some((b) => b.id.indexOf('lv:') === 0), 'intro 有难度选择热区')
      }
      if (s === 'play') {
        ok(r.vm.notes.length > 0 || r.vm.totalNotes > 0, 'play 下有音符数据')
        ok(r.renderer.buttons.some((b) => b.id === 'pause'), 'play 有暂停按钮')
        ok(r.renderer.buttons.some((b) => b.id === 'vol'), 'play 有音量按钮')
        ok(r.renderer.buttons.some((b) => b.id === 'beat'), 'play 有节拍开关')
      }
      if (s === 'result') {
        ok(r.vm.summary && r.vm.summary.noteCount > 0, 'result 有结算数据')
      }
    } catch (e) {
      ok(false, s + ' 帧渲染异常：' + e.message)
    }
  })

  try {
    renderScreen(320, 568, 'play')
    ok(true, '小屏 320×568 渲染完成')
  } catch (e) {
    ok(false, '小屏渲染异常：' + e.message)
  }
  try {
    renderScreen(414, 896, 'result')
    ok(true, '大屏 414×896 渲染完成')
  } catch (e) {
    ok(false, '大屏渲染异常：' + e.message)
  }
}

console.log('\n[10] 训练记录：防重复 / 模拟不上报 / 分库隔离')
{
  const rec = {
    recordId: 'rt-test-1',
    nickname: '测试',
    gameId: 'rhythm',
    songId: 'dawn_walk',
    songName: '晨光漫步',
    bpm: 90,
    difficulty: 3,
    score: 1234,
    perfectCount: 10,
    greatCount: 2,
    goodCount: 1,
    missCount: 1,
    comboMax: 8,
    leftHitCount: 7,
    rightHitCount: 6,
    rhythmAccuracy: 0.88,
    directionAccuracy: 0.93,
    overallHitRate: 0.87,
    durationSec: 60,
    syncOffsetMs: 0,
    dataSource: 'real',
    completed: true,
    startedAt: new Date().toISOString()
  }
  rhythmRecords.save(rec)
  rhythmRecords.save(Object.assign({}, rec, { score: 9999 }))
  const saved = rhythmRecords.get('rt-test-1')
  eq(saved.score, 1234, '同一 recordId 只保存一次，不被覆盖')

  rhythmRecords.save(Object.assign({}, rec, { recordId: 'rt-sim-1', dataSource: 'simulation' }))
  eq(rhythmRecords.get('rt-sim-1').uploadState, 'skipped', '模拟数据标记为不上报')
  const rows = rhythmRecords.describePayload(rec)
  ok(rows.some((r) => r[0] === '节奏准确率') && rows.some((r) => r[0] === '方向准确率'),
    '隐私清单包含节奏/方向准确率')

  const wireBefore = wireRecords.list().length
  const fruitBefore = fruitRecords.list().length
  rhythmRecords.save(Object.assign({}, rec, { recordId: 'rt-sep-1' }))
  eq(wireRecords.list().length, wireBefore, '节奏记录不会写进走钢丝库')
  eq(fruitRecords.list().length, fruitBefore, '节奏记录不会写进接水果库')
  eq(rhythmRecords.list().length >= 3, true, '节奏记录写进了自己的库')

  const cfg1 = rhythmRecords.getUploadConfig()
  const cfg2 = wireRecords.getUploadConfig()
  eq(typeof cfg1.url, 'string', '节奏库有独立上报配置')
  eq(typeof cfg2.url, 'string', '走钢丝上报配置不受影响')
}

console.log('\n[11] sideThreshold 真的参与方向判定（不是只写进记录）')
{
  // 曾经的问题：`utils/motion.js` 里方向判定硬编码 ±0.1，而配置里
  // sideThreshold 的默认值是 0.35 —— 治疗师拖滑块**毫无效果**，
  // 而且失效的 0.35 还会被写进记录的 controlConfig，事后分析会以为
  // 阈值是 0.35，实际判定用的是 0.1（实际阈值比设定小 3.5 倍）。
  const dirAt = (th, target) => {
    const cfg = getStore({ fresh: true })
    cfg.reset()
    cfg.patch({ sideThreshold: th }, 'test')
    const m = new MotionTracker(cfg)
    m.setSimMode(true)
    m.setSimTarget(target, 0)
    for (let i = 0; i < 200; i++) m.update(1 / 60)
    return m.dir
  }
  eq(dirAt(0.2, 0.5), 'right', '阈值 0.2：控制量 0.5 算进入右侧')
  eq(dirAt(0.6, 0.5), 'center', '阈值 0.6：同样的 0.5 不算进入（滑块生效了）')
  eq(dirAt(0.6, 0.95), 'right', '阈值 0.6：控制量 0.95 才算进入')
  eq(dirAt(0.2, -0.5), 'left', '负方向同样按阈值判定')
  eq(dirAt(0.2, 0.05), 'center', '微弱偏移仍算中立')
}

console.log('\n----------------------------------------')
if (fail === 0) {
  console.log('结果：全部通过（' + pass + ' 项）')
} else {
  console.log('结果：' + fail + ' 项失败 / 共 ' + (pass + fail) + ' 项')
  failures.forEach((f) => console.log('  · ' + f))
  process.exitCode = 1
}
