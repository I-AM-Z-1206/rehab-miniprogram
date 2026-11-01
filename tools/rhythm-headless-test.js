// ============================================================================
// tools/rhythm-headless-test.js —— 左右节奏训练「无头」自检（Node 运行，不进小程序包）
// ----------------------------------------------------------------------------
// 伪造一个「时钟」（FakeClock）+ Mock Canvas，让完整流程可以在 Node 里跑。
//
// 【2026-11-01 模型变更：时间表 → 门控】
//   旧模型：谱面排好每个音符的绝对时刻，过窗口就 MISS。断言全围绕「时间窗口」。
//   新模型：场上只有一个音符，飞到判定线就**停在那里等**，完成之后才出下一个。
//           于是「漏接」在物理上不可能发生，判定改成看「稳不稳」。
//
// 覆盖范围：
//   1. 配置校验：门控参数范围、难度预设、背景、恢复默认
//   2. 方向序列：确定性、左右均衡、中间比例、同向保持、非法输入
//   3. 门控判定：空中 → 到线等待 → 稳住 → 保持 → 完成；抖动分级；永不 MISS
//   4. 引擎：站桩一个也完不成左右、患者模型能全部完成、音符停在线不越过、
//      场上只有一个音符、命中后才出下一个、逐级提示
//   5. 时间到点：未完成只记「未完成」，不记漏接、不扣分、不断连击
//   6. 暂停：音乐时间、判定、连击全部冻结
//   7. 断线：SENSOR_ERROR 后不判定、不加分、记录中断时长
//   8. 计分：稳定度 / 左右均衡 / 平均节奏，分项之和 = 总分
//   9. 渲染冒烟：七个界面 + 三套背景 + 320×568 + 414×896 + 热区
//  10. 记录：防重复、模拟不上报、与走钢丝/接水果分库隔离、隐私清单口径
//  11. sideThreshold 真的参与方向判定
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
    this.isSilent = true
    this.mode = 'silent'
    this.beatMs = 500
  }

  setSong(song) {
    this.song = song
    if (song && song.bpm) this.beatMs = 60000 / song.bpm
    return this
  }

  start() { this.state = 'playing'; this.t = 0; return this }
  pause() { if (this.state === 'playing') { this.pausedAt = this.t; this.state = 'paused' } return this }
  resume() { if (this.state === 'paused') this.state = 'playing'; return this }
  stop() { this.state = 'idle'; this.t = 0; return this }
  nowMs() { return this.state === 'paused' ? this.pausedAt : this.t }
  beatPhase() { const m = ((this.t % this.beatMs) + this.beatMs) % this.beatMs; return m / this.beatMs }
  syncVolume() {}
  destroyAudio() {}
  advance(ms) { if (this.state !== 'playing') return this.t; this.t += ms; return this.t }
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
const { getStore, validate, PRESETS, BACKGROUNDS, SCHEMA } = require('../utils/rhythm-config.js')
const { buildSequence, buildChart, parseChart } = require('../pkgRhythm/games/rhythm/chart.js')
const { songById } = require('../utils/rhythm-songs.js')
const { GateJudge, VERDICT } = require('../pkgRhythm/games/rhythm/hit-judge.js')
const { ScoreManager } = require('../pkgRhythm/games/rhythm/score.js')
const { RhythmEngine } = require('../pkgRhythm/games/rhythm/engine.js')
const { RhythmRenderer } = require('../pkgRhythm/games/rhythm/renderer.js')
const { THEMES, THEME_IDS } = require('../pkgRhythm/games/rhythm/theme.js')
const { MotionTracker } = require('../utils/motion.js')
const rhythmRecords = require('../pkgRhythm/utils/rhythm-record.js')
const wireRecords = require('../utils/training-record.js')
const fruitRecords = require('../pkgFruit/utils/fruit-record.js')

const DT = 1 / 60
const TARGET = { left: -1, center: 0, right: 1 }

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

/**
 * 患者模型跑完整一局
 * @param {number} difficulty 档位
 * @param {number} leadMs 提前量（0 = 完全不动）
 * @param {number} shaky 抖动次数上限（1 = 每局抖几下，验证分级）
 */
function playGame(difficulty, leadMs, shaky) {
  const cfg = makeCfg({ durationSec: 90, musicVolume: 0, melodyOn: false })
  cfg.applyDifficulty(difficulty)
  const clock = new FakeClock(songById(cfg.get('songId')))
  const engine = new RhythmEngine({ cfg: cfg, clock: clock })
  engine.setSimMode(true)
  engine.prepare()
  engine.startCountdown()
  runCountdown(engine, 6000)
  engine.beginPlay()

  const shaken = {}
  let maxNotesOnStage = 0
  const crossed = []
  let hitAt = null
  let gapAfterHit = null
  for (let f = 0; f < 95 * 60; f++) {
    const now = clock.nowMs()
    const p = engine.pending
    if (p) {
      const vmNotes = engine.visibleNotes(now)
      maxNotesOnStage = Math.max(maxNotesOnStage, vmNotes.filter((n) => !n.judged).length)
      for (let i = 0; i < vmNotes.length; i++) {
        if (!vmNotes[i].judged && vmNotes[i].progress > 1.0001) crossed.push(vmNotes[i].progress)
      }
      if (leadMs > 0 && now >= p.targetTimeMs - leadMs) {
        let dir = TARGET[p.targetSide]
        // 抖动模型：每个音符只抖一次 —— 稳住之后突然往反方向走一下再回来。
        // 每一次都会在判定里记一个 flap，于是该音符从「稳住了」掉到「很稳」。
        if (shaky) {
          if (shaken[p.noteId] === undefined && p.state === 'holding' && (p.heldMs || 0) > 60) {
            shaken[p.noteId] = now + 380
          }
          const until = shaken[p.noteId]
          if (until && now < until) dir = p.targetSide === 'left' ? 1 : -1
        }
        engine.motion.setSimTarget(dir, 0)
      }
    }
    clock.advance(DT * 1000)
    const before = engine.score.completed
    engine.update(DT)
    engine.drainEvents()
    if (hitAt === null && engine.score.completed > before) {
      hitAt = clock.nowMs()
      gapAfterHit = engine.nextSpawnAt - hitAt
    }
    if (engine.state !== 'PLAYING') break
  }
  const s = engine.score.snapshot()
  const sum = engine.summary
  return {
    done: s.completed, perfect: s.perfect, great: s.great, good: s.good,
    unsolved: s.unsolved, left: s.leftHits, center: s.centerHits, right: s.rightHits,
    stability: s.stabilityRate, balance: s.balanceRate,
    maxNotesOnStage: maxNotesOnStage, crossed: crossed,
    pace: sum ? sum.paceSec : null,
    grade: sum ? sum.grade : '-',
    gapAfterHit: gapAfterHit
  }
}

// ============================================================================
console.log('\n[1] 配置与校验（门控口径）')
{
  const cfg = makeCfg()
  eq(cfg.get('backgroundId'), 'dawn', '默认背景是清晨逆光')
  eq(cfg.get('melodyOn'), true, '默认开启命中推进旋律')
  ok(SCHEMA.gapMs && SCHEMA.holdMs, '新增 gapMs / holdMs')
  ok(!SCHEMA.noteGapMs && !SCHEMA.goodMs && !SCHEMA.restRate && !SCHEMA.snapToBeat,
    '时间表时代的参数已删除（noteGapMs / goodMs / restRate / snapToBeat）')
  eq(BACKGROUNDS.length, 3, '三个背景')

  const bad = validate(Object.assign(cfg.all(), { backgroundId: 'zzz' }))
  ok(!bad.ok && bad.errors.some((e) => e.indexOf('背景') >= 0), '非法背景被拦下')
  const bad2 = validate(Object.assign(cfg.all(), { songId: 'nope' }))
  ok(!bad2.ok, '非法音色被拦下')

  const lock = validate(Object.assign(cfg.all(), { holdMs: 900 }))
  ok(lock.warnings.some((w) => w.indexOf('保持要求') >= 0), '保持要求过高会提示')

  for (let lv = 1; lv <= 5; lv++) {
    const p = PRESETS[lv]
    ok(p.gapMs !== undefined && p.holdMs !== undefined && p.approachMs !== undefined,
      '第 ' + lv + ' 档预设齐全（喘息/保持/飞行）')
  }
  ok(PRESETS[1].gapMs > PRESETS[3].gapMs && PRESETS[3].gapMs > PRESETS[5].gapMs,
    '档位越高喘息越短', [1, 3, 5].map((d) => PRESETS[d].gapMs).join(' > '))
  ok(PRESETS[1].holdMs < PRESETS[3].holdMs && PRESETS[3].holdMs < PRESETS[5].holdMs,
    '档位越高保持要求越久', [1, 3, 5].map((d) => PRESETS[d].holdMs).join(' < '))

  cfg.applyDifficulty(5)
  eq(cfg.get('holdMs'), PRESETS[5].holdMs, 'applyDifficulty 带上门控参数')
  cfg.reset()
  eq(cfg.get('holdMs'), SCHEMA.holdMs.def, '恢复默认')
}

console.log('\n[2] 方向序列（不再有时间表）')
{
  const A = buildSequence({ song: 'slow_wave', durationSec: 90, difficulty: 3, seed: 7, centerRate: 0.25, sameSideRate: 0.12 })
  const B = buildSequence({ song: 'slow_wave', durationSec: 90, difficulty: 3, seed: 7, centerRate: 0.25, sameSideRate: 0.12 })
  const C = buildSequence({ song: 'slow_wave', durationSec: 90, difficulty: 3, seed: 99, centerRate: 0.25, sameSideRate: 0.12 })
  eq(JSON.stringify(A.notes.map((n) => n.targetSide)), JSON.stringify(B.notes.map((n) => n.targetSide)),
    '同曲 / 同难度 / 同种子 → 序列完全一致')
  ok(JSON.stringify(A.notes.map((n) => n.targetSide)) !== JSON.stringify(C.notes.map((n) => n.targetSide)),
    '换种子 → 序列不同')
  ok(A.notes.every((n) => n.targetTimeMs === 0), '序列里没有预定时间（时间由运行时给）')
  eq(A.meta.mode, 'gate', 'meta.mode = gate')

  const sides = A.notes.map((n) => n.targetSide)
  ok(sides.indexOf('left') >= 0 && sides.indexOf('right') >= 0 && sides.indexOf('center') >= 0,
    '三个方向都会出现')

  // 左右均衡：中间音符之后不能恒取 left（旧 bug：左侧多 14~32%）
  const noCenter = buildSequence({ song: 'slow_wave', durationSec: 60, centerRate: 0, sameSideRate: 0, seed: 3, difficulty: 3 })
  const l = noCenter.notes.filter((n) => n.targetSide === 'left').length
  const r = noCenter.notes.filter((n) => n.targetSide === 'right').length
  ok(Math.abs(l - r) <= 1, '关掉中间/同向后左右严格交替', l + ' / ' + r)

  const onlyCenter = buildSequence({ song: 'slow_wave', durationSec: 60, centerRate: 0, seed: 3, difficulty: 3 })
  ok(onlyCenter.notes.filter((n) => n.targetSide === 'center').length === 0, 'centerRate=0 → 没有中间音符')

  const noSame = buildSequence({ song: 'slow_wave', durationSec: 60, centerRate: 0, sameSideRate: 0, seed: 3, difficulty: 3 })
  let sameCount = 0
  for (let i = 1; i < noSame.notes.length; i++) {
    if (noSame.notes[i].targetSide === noSame.notes[i - 1].targetSide) sameCount += 1
  }
  eq(sameCount, 0, 'sameSideRate=0 → 相邻不同向')

  const many = buildSequence({ song: 'slow_wave', durationSec: 60, centerRate: 0, sameSideRate: 0.5, seed: 5, difficulty: 3 })
  let sameCount2 = 0
  for (let i = 1; i < many.notes.length; i++) {
    if (many.notes[i].targetSide === many.notes[i - 1].targetSide) sameCount2 += 1
  }
  ok(sameCount2 > 0, 'sameSideRate>0 → 出现同向保持（练「不用动也稳住」）', String(sameCount2))

  // 时长越长序列越长（够用即可，不追求精确）
  const long = buildSequence({ song: 'slow_wave', durationSec: 300 })
  const short = buildSequence({ song: 'slow_wave', durationSec: 30 })
  ok(long.notes.length > short.notes.length, '训练时长越长，生成的序列越长')
  ok(buildChart === buildSequence || typeof buildChart === 'function', 'buildChart 兼容别名仍在')

  // 外部 JSON
  const p1 = parseChart([{ targetSide: 'left' }, { targetSide: 'center' }, { targetSide: 'right' }])
  eq(p1.errors.length, 0, '外部序列（只有方向）可以读')
  eq(p1.notes.length, 3, '读出 3 条')
  const p2 = parseChart([{ targetSide: 'up' }])
  ok(p2.errors.length === 1, '非法方向被丢弃并说明')
  const p3 = parseChart('nope')
  ok(p3.errors.length === 1, '非法格式被拦住')
  const p4 = parseChart([{ noteId: 'a', targetSide: 'left' }, { noteId: 'a', targetSide: 'right' }])
  ok(p4.errors.some((e) => e.indexOf('重复') >= 0), 'noteId 重复会被拦下')
}

console.log('\n[3] 门控判定：空中 → 等待 → 稳住 → 保持 → 完成（永不 MISS）')
{
  const cfg = makeCfg({ stableMs: 120, holdMs: 400 })
  const j = new GateJudge(cfg)
  const note = { targetTimeMs: 1000, flaps: 0 }
  const at = (now, side, enterAt, state) => j.step(note, {
    now: now, side: side, expected: 'left', enterAt: enterAt || 0, state: state || 'waiting'
  })

  eq(at(900, 'left', 800, 'approaching').state, 'approaching', '还没到判定线 → approaching（不判定）')
  eq(at(1000, 'right', 990).state, 'waiting', '到线但方向不对 → waiting')
  eq(at(1050, 'left', 1020, 'waiting').state, 'waiting', '方向对但只稳了 30ms → 还不行')
  const hold1 = at(1300, 'left', 1000, 'waiting')
  eq(hold1.state, 'holding', '稳够 120ms → 开始计保持')
  eq(hold1.reactionMs, 120, '到位用时 = 稳住时刻 − 到线时刻')
  const done = at(1600, 'left', 1000, 'holding')
  eq(done.state, 'done', '保持满 400ms → 完成')
  eq(done.verdict, VERDICT.PERFECT, '全程没离开 → PERFECT（稳住了）')

  // 提前站好不该被惩罚
  const early = at(1400, 'left', 700, 'waiting')
  eq(early.state, 'done', '提前站好：稳定时刻落在到线之前，按到线起算，照常完成')
  eq(early.reactionMs, 0, '提前站好的到位用时记 0，不记负数')

  // 抖动分级
  const flapped = j.step({ targetTimeMs: 1000, flaps: 0 },
    { now: 1500, side: 'right', expected: 'left', enterAt: 1450, state: 'holding' })
  eq(flapped.state, 'waiting', '保持中途离开 → 回到 waiting')
  eq(flapped.flaps, 1, '记一次抖动')
  eq(j.quality(0), VERDICT.PERFECT, '0 次抖动 = 稳住了')
  eq(j.quality(2), VERDICT.GREAT, '1~2 次抖动 = 很稳')
  eq(j.quality(3), VERDICT.GOOD, '3 次以上 = 完成了')

  // 逐级提示：3s / 6s / 10s
  eq(j.step(note, { now: 1000 + 2000, side: 'right', expected: 'left', enterAt: 900 }).hintLevel, 0, '干等 2 秒还不提示')
  eq(j.step(note, { now: 1000 + 3200, side: 'right', expected: 'left', enterAt: 900 }).hintLevel, 1, '3 秒 → 第 1 级（放大发亮）')
  eq(j.step(note, { now: 1000 + 6500, side: 'right', expected: 'left', enterAt: 900 }).hintLevel, 2, '6 秒 → 第 2 级（点亮该侧）')
  eq(j.step(note, { now: 1000 + 12000, side: 'right', expected: 'left', enterAt: 900 }).hintLevel, 3, '10 秒 → 第 3 级（语音）')

  // 无论等多久都不会给出 MISS
  let everMiss = false
  for (let t = 1000; t < 60000; t += 250) {
    const r = j.step(note, { now: t, side: 'right', expected: 'left', enterAt: 900 })
    if (r.verdict === VERDICT.MISS) everMiss = true
  }
  ok(!everMiss, '干等 60 秒也不会判 MISS（门控的核心承诺）')
}

console.log('\n[4] 引擎：门控驱动')
{
  // ---- 4.1 患者模型能把整局做完 ----
  const rows = []
  for (const d of [1, 3, 5]) {
    const r = playGame(d, 320, 0)
    rows.push(r)
    console.log('    难度' + d + ' 完成 ' + r.done + ' 个（左' + r.left + '/中' + r.center + '/右' + r.right +
      '）稳定度 ' + (r.stability === null ? '—' : (r.stability * 100).toFixed(0) + '%') +
      ' 平均 ' + r.pace + ' 秒/个 评级 ' + r.grade)
    ok(r.done >= 18, '难度' + d + ' 患者模型能完成 ≥18 个', String(r.done))
    ok(r.left > 0 && r.right > 0, '难度' + d + ' 左右都练到了', 'L' + r.left + '/R' + r.right)
    ok(r.unsolved <= 1, '难度' + d + ' 到点只剩 1 个未完成（不会攒一堆漏接）', String(r.unsolved))
    ok(r.maxNotesOnStage <= 1, '难度' + d + ' 场上同时最多 1 个音符', String(r.maxNotesOnStage))
    eq(r.crossed.length, 0, '难度' + d + ' 音符不会冲过判定线')
  }
  ok(rows[2].done > rows[0].done, '档位越高同样的时间做得越多',
    rows.map((r) => r.done).join(' < '))

  // ---- 4.2 站桩一个也做不成（训练有效性）----
  for (const d of [1, 3, 5]) {
    const idle = playGame(d, 0, 0)
    console.log('    难度' + d + ' 站桩：完成 ' + idle.done + '（左' + idle.left + '/中' + idle.center + '/右' + idle.right + '）')
    eq(idle.left, 0, '难度' + d + ' 站桩时左侧一个都完不成')
    eq(idle.right, 0, '难度' + d + ' 站桩时右侧一个都完不成')
    ok(idle.done <= 2, '难度' + d + ' 站桩几乎停滞（只有中间音符能过）', String(idle.done))
  }

  // ---- 4.3 抖动会掉档 ----
  const shaky = playGame(3, 320, 1)
  console.log('    抖动模型：稳住了 ' + shaky.perfect + ' / 很稳 ' + shaky.great + ' / 完成了 ' + shaky.good)
  ok(shaky.great + shaky.good > 0, '中途抖动会掉到「很稳 / 完成了」而不是无限满分')
  ok(shaky.perfect < shaky.done, '抖动过的音符不再全是「稳住了」')

  // ---- 4.4 命中后才出下一个 ----
  const { engine, clock, cfg } = makeEngine({
    durationSec: 60, gapMs: 500, approachMs: 1000, holdMs: 200, stableMs: 60, melodyOn: false
  })
  engine.startCountdown()
  runCountdown(engine, 6000)
  engine.beginPlay()
  run(engine, clock, 400)
  ok(engine.pending === null, '开局先空一会儿，不急着出音符')
  run(engine, clock, 2200)
  ok(engine.pending !== null, '预备时间过了才出第一个音符')

  const first = engine.pending
  const targetAt = first.targetTimeMs
  run(engine, clock, 1200)
  eq(engine.pending && engine.pending.noteId, first.noteId, '没接住之前一直是同一个音符（不会换）')
  const vm1 = engine.getViewModel()
  const live = vm1.notes.filter((n) => !n.judged)
  eq(live.length, 1, '场上只有一个未判定音符')
  eq(live[0].progress, 1, '它停在判定线上（progress 封顶 1）')
  ok(live[0].waiting === true, '状态是 waiting')
  ok(clock.nowMs() > targetAt + 100, '确实已经过了到线时刻')

  // 接住它：逐帧跑到完成的那一帧，检查「完成瞬间」的状态
  engine.setSimTarget(TARGET[first.targetSide], 0)
  let doneAt = null
  let spawnAfter = null
  for (let f = 0; f < 60 * 40 && doneAt === null; f++) {
    clock.advance(DT * 1000)
    const before = engine.score.completed
    engine.update(DT)
    engine.drainEvents()
    if (engine.score.completed > before) {
      doneAt = clock.nowMs()
      spawnAfter = engine.nextSpawnAt - doneAt
    }
  }
  eq(engine.score.completed, 1, '稳住并保持之后就完成')
  const gapMs = Number(cfg.get('gapMs'))
  near(spawnAfter, gapMs, 40, '完成后按配置的喘息时间才安排下一个')

  // ---- 4.5 逐级提示会升级 ----
  const e2 = makeEngine({ durationSec: 60, melodyOn: false, approachMs: 900, holdMs: 300 })
  e2.engine.startCountdown()
  runCountdown(e2.engine, 6000)
  e2.engine.beginPlay()
  run(e2.engine, e2.clock, 6200)
  const vm2 = e2.engine.getViewModel()
  ok(vm2.pending !== null, '有音符在场')
  ok(vm2.hintLevel >= 1, '一直不动 → 提示升到第 1 级', String(vm2.hintLevel))
  run(e2.engine, e2.clock, 7000)
  ok(e2.engine.getViewModel().hintLevel >= 2, '继续不动 → 提示升到第 2 级')
  run(e2.engine, e2.clock, 5000)
  ok(e2.engine.getViewModel().hintLevel >= 3, '再等 → 提示升到第 3 级（语音）')
}

console.log('\n[5] 时间到点：未完成不是漏接')
{
  const { engine, clock } = makeEngine({
    durationSec: 20, melodyOn: false, approachMs: 1200, holdMs: 400, gapMs: 100, stableMs: 60
  })
  engine.startCountdown()
  runCountdown(engine, 6000)
  engine.beginPlay()

  // 做一半就不管了
  run(engine, clock, 4200)
  if (engine.pending) engine.setSimTarget(TARGET[engine.pending.targetSide], 0)
  run(engine, clock, 1600)
  const doneBefore = engine.score.completed
  ok(doneBefore >= 1, '先完成至少一个', String(doneBefore))

  // 走到时间结束
  for (let f = 0; f < 40 * 60 && engine.state === 'PLAYING'; f++) {
    clock.advance(DT * 1000)
    engine.update(DT)
    engine.drainEvents()
  }
  const s = engine.summary
  ok(!!s, '结算产生')
  eq(s.miss, 0, '结算里 miss = 0（永远没有漏接）')
  eq(s.hits, s.perfect + s.great + s.good, '完成数 = 三档之和')
  eq(s.noteCount, s.completed, 'noteCount 就是完成个数')
  ok(s.unsolved <= 1, '未完成最多 1 个（就是到点时场上那个）', String(s.unsolved))
  eq(s.judgeVersion, 'v3', '判定口径版本升到 v3（与旧的命中率不可比）')
  ok(s.paceSec === null || s.paceSec > 0, '平均节奏要么有值要么为 null')

  // 一个都没完成时不能假装 100%
  const idleCfg = makeCfg({ durationSec: 20, melodyOn: false })
  const idleClock = new FakeClock(songById(idleCfg.get('songId')))
  const idle = new RhythmEngine({ cfg: idleCfg, clock: idleClock })
  idle.setSimMode(true)
  idle.prepare()
  idle.startCountdown()
  runCountdown(idle, 6000)
  idle.beginPlay()
  for (let f = 0; f < 40 * 60 && idle.state === 'PLAYING'; f++) {
    idleClock.advance(DT * 1000)
    idle.update(DT)
    idle.drainEvents()
  }
  const si = idle.summary
  eq(si.stabilityRate, null, '一个都没完成 → 稳定度 null（不冒充 100%）')
  eq(si.balanceRate, null, '没有左右样本 → 左右均衡 null')
  eq(si.grade, '-', '没有样本 → 评级 -')
  ok(si.completed <= 2, '站桩的完成数很低', String(si.completed))
}

console.log('\n[6] 暂停与恢复')
{
  const { engine, clock } = makeEngine({ durationSec: 40, melodyOn: false, approachMs: 1200, gapMs: 100 })
  engine.startCountdown()
  runCountdown(engine, 6000)
  engine.setSimTarget(-1)
  run(engine, clock, 900)

  const beforeTime = clock.nowMs()
  const beforeDone = engine.score.completed

  engine.pause()
  eq(engine.state, 'PAUSED', '进入 PAUSED')
  run(engine, clock, 800)
  eq(clock.nowMs(), beforeTime, '暂停期间计时冻结')
  eq(engine.score.completed, beforeDone, '暂停期间不产生新的完成')
  if (engine.pending) {
    const w = engine.pending.waitMs
    run(engine, clock, 600)
    eq(engine.pending.waitMs, w, '暂停期间「已等待时长」也冻结（提示不会在暂停时升级）')
  }

  engine.resume()
  eq(engine.state, 'PLAYING', '恢复后回到 PLAYING')
  run(engine, clock, 200)
  ok(clock.nowMs() > beforeTime, '恢复后计时继续')
}

console.log('\n[7] 传感器中断')
{
  const { engine, clock } = makeEngine({ durationSec: 40, melodyOn: false, approachMs: 1200 })
  engine.startCountdown()
  runCountdown(engine, 6000)
  engine.setSimTarget(-1)
  run(engine, clock, 700)

  const doneBefore = engine.score.completed
  const timeBefore = clock.nowMs()
  engine.enterSensorError('disconnected')
  eq(engine.state, 'SENSOR_ERROR', '进入 SENSOR_ERROR')
  ok(engine.interruptCount === 1, '记录一次中断')
  ok(engine.interrupted === true, '标记本局被中断过')

  run(engine, clock, 1200)
  eq(engine.score.completed, doneBefore, '中断期间不产生完成')
  eq(clock.nowMs(), timeBefore, '中断期间计时冻结')
  eq(engine.state, 'SENSOR_ERROR', '不会自动切回模拟或继续判定')

  engine.resume()
  eq(engine.state, 'PLAYING', '恢复后继续训练')

  const summary = engine.finish('aborted')
  ok(summary.interrupted === true, '结算里保留中断标记')
  ok(summary.interruptedSec >= 0, '结算里带中断时长')
  ok(summary.completedAll === false, '中止时 completedAll = false')
}

console.log('\n[8] 计分：稳定度 / 左右均衡 / 平均节奏')
{
  const cfg = makeCfg({ scorePerfect: 100, scoreGreat: 70, scoreGood: 40, comboStep: 0.1, comboMaxMul: 1.5, finishBonus: 100 })
  const score = new ScoreManager(cfg)
  score.reset()

  eq(score.stabilityRate, null, '没有样本 → 稳定度 null（页面显示暂无数据）')
  eq(score.balanceRate, null, '没有左右样本 → 均衡度 null')
  eq(score.avgReactionMs, null, '没有样本 → 平均到位用时 null')

  eq(score.comboMul, 1, '第 1 个音符倍率 1.0')
  score.hit('perfect', { side: 'left', value: 100, reactionMs: 200, holdMs: 400, flaps: 0 })
  eq(score.combo, 1, '连击 1')
  score.hit('perfect', { side: 'right', value: 100, reactionMs: 300, holdMs: 410, flaps: 0 })
  near(score.comboMul, 1.1, 1e-9, '第 2 个音符倍率 1.1')
  score.hit('great', { side: 'left', value: 100, reactionMs: 400, holdMs: 420, flaps: 2 })
  eq(score.combo, 3, '很稳仍然续连击')
  score.hit('good', { side: 'right', value: 100, reactionMs: 500, holdMs: 430, flaps: 5 })
  eq(score.combo, 0, '掉到「完成了」会断连击（断倍率，不扣分）')

  const snap = score.snapshot()
  eq(snap.completed, 4, '完成 4 个')
  eq(snap.miss, 0, '没有漏接这一项')
  eq(snap.leftHits, 2, '左侧 2 个')
  eq(snap.rightHits, 2, '右侧 2 个')
  eq(snap.balanceRate, 1, '左右各半 → 均衡 1')
  near(snap.stabilityRate, (1 + 1 + 0.75 + 0.4) / 4, 1e-9, '稳定度 = 加权 / 完成数')
  eq(snap.avgReactionMs, 350, '平均到位用时 = (200+300+400+500)/4')
  eq(snap.avgHoldMs, 415, '平均保持时长')

  score.unsolvedNote()
  const s2 = score.snapshot()
  eq(s2.unsolved, 1, '未完成单独计数')
  eq(s2.miss, 0, '未完成不记漏接')
  eq(s2.completed, 4, '未完成不改变完成数')

  score.addFinish()
  const s3 = score.snapshot()
  eq(s3.score, s3.base + s3.comboBonus + s3.finishBonus, '总分 = 基础分 + 连击加成 + 完成奖励')
  eq(s3.finishBonus, 100, '完成奖励取配置值')

  // 单侧偏差 → 均衡度下降
  const cfg2 = makeCfg()
  const s4 = new ScoreManager(cfg2)
  s4.reset()
  for (let i = 0; i < 6; i++) s4.hit('perfect', { side: 'left', value: 100 })
  for (let i = 0; i < 2; i++) s4.hit('perfect', { side: 'right', value: 100 })
  near(s4.balanceRate, 1 - 4 / 8, 1e-9, '左 6 右 2 → 均衡度 0.5')

  // 只有中间音符 → 均衡无意义
  const s5 = new ScoreManager(cfg2)
  s5.reset()
  s5.hit('perfect', { side: 'center', value: 100 })
  eq(s5.balanceRate, null, '只做了中间音符 → 均衡度 null')
}

console.log('\n[9] 渲染冒烟（Mock Canvas + 三套背景）')
{
  function renderScreen(w, h, state, bg) {
    const cfg = makeCfg({ durationSec: 30, melodyOn: false, backgroundId: bg || 'dawn' })
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
      engine.beginPlay()
      run(engine, clock, 2400)
      if (state === 'pause') engine.pause()
      if (state === 'sensor') engine.enterSensorError('test')
    } else if (state === 'result') {
      engine.prepare()
      engine.startCountdown()
      runCountdown(engine, 6000)
      engine.beginPlay()
      run(engine, clock, 3000)
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
        ok(r.renderer.buttons.some((b) => b.id.indexOf('song:') === 0), 'intro 有音色选择热区')
        ok(r.renderer.buttons.some((b) => b.id.indexOf('lv:') === 0), 'intro 有难度选择热区')
        THEME_IDS.forEach((tid) => {
          ok(r.renderer.buttons.some((b) => b.id === 'bg:' + tid), 'intro 有背景热区 ' + tid)
        })
      }
      if (s === 'play') {
        ok(r.vm.notes.length > 0, 'play 下有音符数据')
        ok(r.renderer.buttons.some((b) => b.id === 'pause'), 'play 有暂停按钮')
        ok(!r.renderer.buttons.some((b) => b.id === 'vol'), 'play 不再有音量按钮（移进暂停面板）')
        ok(!r.renderer.buttons.some((b) => b.id === 'beat'), 'play 不再有节拍开关（移进暂停面板）')
        ok(r.renderer.buttons.some((b) => b.id === 'quit'), 'play 有退出按钮')
        const live = r.vm.notes.filter((n) => !n.judged)
        if (live.length) {
          ok(live[0].progress <= 1.0001, '渲染层拿到的音符进度不会超过 1（停在线）')
        }
      }
      if (s === 'pause') {
        ok(r.renderer.buttons.some((b) => b.id === 'vol'), 'pause 面板有音量按钮')
        ok(r.renderer.buttons.some((b) => b.id === 'beat'), 'pause 面板有呼吸提示开关')
      }
      if (s === 'result') {
        ok(r.vm.summary && r.vm.summary.completed >= 0, 'result 有结算数据')
      }
    } catch (e) {
      ok(false, s + ' 帧渲染异常：' + e.message)
    }
  })

  THEME_IDS.forEach((tid) => {
    try {
      renderScreen(390, 844, 'play', tid)
      ok(true, '背景 ' + tid + ' 渲染完成')
    } catch (e) {
      ok(false, '背景 ' + tid + ' 渲染异常：' + e.message)
    }
  })

  // 三套主题必须是同一套几何，只有颜色不同
  ok(THEME_IDS.length === 3, '三个主题')
  THEME_IDS.forEach((tid) => {
    const th = THEMES[tid]
    ok(th.sky.length >= 5 && th.ridge.length === 3 && th.road.length >= 4,
      '主题 ' + tid + ' 结构完整（天空/三层山/路面）')
    const last = th.sky[th.sky.length - 1]
    ok(last.at === 1, '主题 ' + tid + ' 天空最底部贴住地平线')
    ok(th.ground[0] !== undefined, '主题 ' + tid + ' 有地面渐层（第一档必须贴天空底色）')
  })
  // 车道色温三套必须一致（功能语义，不能随背景变）
  const laneSet = THEME_IDS.map((t) => THEMES[t].lanes.join('|'))
  ok(new Set(laneSet).size === 1, '三套背景的车道色温完全一致（左右语言不变）')

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
    unsolved: 0,
    comboMax: 8,
    leftHitCount: 7,
    rightHitCount: 6,
    stabilityRate: 0.88,
    balanceRate: 0.93,
    paceSec: 2.4,
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
  ok(rows.some((r) => r[0] === '稳定度') && rows.some((r) => r[0] === '左右均衡'),
    '隐私清单包含稳定度 / 左右均衡')
  ok(!rows.some((r) => r[0] === '节奏准确率'), '隐私清单不再声称有节奏准确率')
  ok(rows.some((r) => r[0] === '完成判定'), '隐私清单写清「稳住了/很稳/完成了/未完成」')

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
