// ============================================================================
// tools/rhythm-playability-test.js —— 节奏训练「可玩性 / 耐受性」验证
// ----------------------------------------------------------------------------
// 谱面与判定层面的断言在 rhythm-headless-test.js 里钉。这里钉的是更靠前的一件事：
// **一个真实康复患者能不能玩得下来，慢的人会不会被判失败。**
//
// 【2026-11-01 门控模型的关节在这里】
//   旧模型下「慢」等于「错」：音符按时间表来，患者来不及就是漏接，
//   而且一漏就连着漏（下一个音符不会等他）。这条测试当年抓到的正是
//   110 BPM 下 545ms 间隔导致的大面积漏接。
//
//   新模型下「慢」只等于「做得少」：音符飞到判定线就停住等，患者什么时候
//   做到什么时候算完。所以这里要验证的是**未完成恒 ≤ 1**，而不是命中率。
//
// 患者模型（保守，不玩花活）：
//   · 移动是 0.35s 缓动，不是瞬移（motion.setSimTarget 自带）；
//   · 提前量 leadMs 越小，患者动作越慢/越晚；
//   · 不做任何预判修正，看到音符才动。
// ============================================================================

const { getStore } = require('../utils/rhythm-config.js')
const { songById, SONGS } = require('../utils/rhythm-songs.js')
const { RhythmEngine } = require('../pkgRhythm/games/rhythm/engine.js')

const DT = 1 / 60
const TARGET = { left: -1, center: 0, right: 1 }

class FakeClock {
  constructor(song) {
    this.song = song
    this.t = 0
    this.state = 'idle'
    this.isSilent = true
  }
  setSong(s) { this.song = s; return this }
  start() { this.state = 'playing'; this.t = 0; return this }
  pause() { this.state = 'paused'; return this }
  resume() { this.state = 'playing'; return this }
  stop() { this.state = 'idle'; return this }
  nowMs() { return this.t }
  beatPhase() { return 0 }
  advance(ms) { if (this.state === 'playing') this.t += ms; return this.t }
}

/**
 * 跑完一整局
 *
 * @param {number} difficulty 档位
 * @param {number} reactMs 反应延迟：音符**到达判定线之后**过多久才开始动。
 *   这是门控模型下唯一有意义的「慢」—— 提前量再小也不会掉，因为音符会等他；
 *   真正决定一局能做多少个的是「看到之后多久动起来」。
 *   传 -1 表示完全不动（站桩）。
 * @param {string} songId 音色
 * @param {number} durationSec 时长
 */
function play(difficulty, reactMs, songId, durationSec) {
  const dur = durationSec || 90
  const cfg = getStore({ fresh: true })
  cfg.reset()
  cfg.applyDifficulty(difficulty)
  cfg.patch({ songId: songId || 'slow_wave', durationSec: dur, musicVolume: 0, melodyOn: false }, 'test')
  const song = songById(cfg.get('songId'))
  const clock = new FakeClock(song)
  const engine = new RhythmEngine({ cfg: cfg, clock: clock })
  engine.setSimMode(true)
  engine.prepare()
  engine.startCountdown()
  let guard = 0
  while (engine.state === 'COUNTDOWN' && guard < 900) { engine.update(DT); guard += 1 }
  engine.beginPlay()

  for (let f = 0; f < (dur + 6) * 60; f++) {
    const now = clock.nowMs()
    const p = engine.pending
    if (p && reactMs >= 0 && now >= p.targetTimeMs + reactMs) {
      engine.motion.setSimTarget(TARGET[p.targetSide], 0)
    }
    clock.advance(DT * 1000)
    engine.update(DT)
    engine.drainEvents()
    if (engine.state !== 'PLAYING') break
  }

  const s = engine.score.snapshot()
  const sum = engine.summary || {}
  return {
    done: s.completed,
    perfect: s.perfect,
    great: s.great,
    good: s.good,
    unsolved: s.unsolved,
    left: s.leftHits,
    center: s.centerHits,
    right: s.rightHits,
    stability: s.stabilityRate,
    balance: s.balanceRate,
    pace: sum.paceSec === undefined || sum.paceSec === null ? null : sum.paceSec,
    grade: sum.grade || '-'
  }
}

// ---------------------------------------------------------------- 断言
let pass = 0
const fails = []
function ok(cond, name, detail) {
  if (cond) { pass += 1; console.log('  ✓ ' + name) } else {
    fails.push(name + (detail ? '（' + detail + '）' : ''))
    console.log('  ✗ ' + name + (detail ? '  → ' + detail : ''))
  }
}

console.log('\n[1] 慢患者不会被判失败（门控的核心承诺）')
console.log('    反应延迟  完成  未完成  左右       稳定度  平均节奏  评级')
{
  const rows = {}
  for (const react of [0, 400, 900, 1800]) {
    const r = play(3, react, 'slow_wave', 90)
    rows[react] = r
    const tag = '    ' + String(react + 'ms').padStart(8) +
      String(r.done).padStart(6) + String(r.unsolved).padStart(8) +
      ('  L' + r.left + '/R' + r.right).padEnd(10) +
      (r.stability === null ? '  —' : (r.stability * 100).toFixed(0) + '%').padStart(7) +
      ('  ' + r.pace + 's').padStart(10) + '  ' + r.grade
    console.log(tag)
    // 关键承诺：不管多慢，都不会攒下一堆「没接到」的音符
    ok(r.unsolved <= 1, '反应延迟 ' + react + 'ms：到点只剩 1 个未完成，不会攒漏接', String(r.unsolved))
    ok(r.done >= 8, '反应延迟 ' + react + 'ms：仍然完成了 ≥8 个', String(r.done))
  }
  ok(rows[0].done >= rows[400].done && rows[400].done >= rows[900].done,
    '反应越慢做得越少 —— 慢只影响「做了多少」，不影响「做没做成」',
    [0, 400, 900].map((k) => rows[k].done).join(' ≥ '))
  ok(rows[0].done >= 25, '反应快的患者 90 秒能完成 ≥25 个', String(rows[0].done))
  // 慢到 1.8 秒仍然每个都做完，只是做得少
  ok(rows[1800].done >= 15, '反应 1.8 秒的患者也能完成 ≥15 个', String(rows[1800].done))
}

console.log('\n[2] 换音色不改变训练强度（BPM 已经完全不参与）')
{
  const counts = SONGS.map((s) => play(3, 400, s.songId, 90).done)
  console.log('    ' + SONGS.map((s, i) => s.name + ' ' + counts[i]).join(' / '))
  // 不要求完全相等：序列是按 songId 播种的，不同音色会给出不同的方向走向
  // （这本身是好事 —— 换音色不只是换音高）。要守的是「不再被 BPM 绑架」：
  // 66/90/110 BPM 三首，完成数必须落在同一个水平上。
  const max = Math.max.apply(null, counts)
  const min = Math.min.apply(null, counts)
  ok(max - min <= Math.max(2, Math.round(max * 0.1)),
    '三首音色完成数在同一水平（±10%，节奏不再被 BPM 绑架）', counts.join('/'))
}

console.log('\n[3] 难度确实在变（变的是密度与保持要求，不是「要求你更快」）')
{
  const out = []
  for (const d of [1, 3, 5]) {
    const r = play(d, 400, 'slow_wave', 90)
    out.push(r)
    console.log('    难度' + d + ' 完成 ' + r.done + ' 个 · 平均 ' + r.pace + ' 秒/个 · 稳定度 ' +
      (r.stability === null ? '—' : (r.stability * 100).toFixed(0) + '%'))
  }
  ok(out[0].done < out[2].done, '难度越高同样时间做得越多', out.map((r) => r.done).join(' < '))
  ok(out[0].pace > out[2].pace, '难度越高平均每个音符用时越短', out.map((r) => r.pace).join(' > '))
  ok(out[1].balance !== null && out[1].balance > 0.5, '标准档左右大体均衡', String(out[1].balance))
}

console.log('\n[4] 站桩不能得分（训练有效性）')
{
  for (const d of [1, 3, 5]) {
    const idle = play(d, -1, 'dawn_walk', 90)
    console.log('    难度' + d + ' 站桩：完成 ' + idle.done + '（左' + idle.left + '/中' + idle.center + '/右' + idle.right + '）')
    ok(idle.left === 0 && idle.right === 0, '难度' + d + ' 站桩时左右音符一个都完不成',
      'L' + idle.left + '/R' + idle.right)
    ok(idle.done <= 2, '难度' + d + ' 站桩几乎停滞', String(idle.done))
  }
}

console.log('\n[5] 只做一侧会被记录下来（而不只是「分低」）')
{
  // 患者只会往左偏：左侧音符能过，右侧全卡住。这是单侧代偿的典型表现，
  // 康复里比「分低」重要得多 —— 门控模型下它会直接体现为 balanceRate = 0。
  const cfg = getStore({ fresh: true })
  cfg.reset()
  cfg.applyDifficulty(3)
  // sameSideRate 拉到 0.45：让「连着两个左侧」这种情况足够多。
  // 再挑一个「第一个音符就是左边」的种子 —— 否则他连第一个都过不去，
  // 一局 0 个完成，什么也测不出来。
  const { buildSequence } = require('../pkgRhythm/games/rhythm/chart.js')
  let seed = 1
  for (let s = 1; s <= 40; s++) {
    const seq = buildSequence({ song: 'slow_wave', durationSec: 60, centerRate: 0, sameSideRate: 0.45, seed: s, difficulty: 3 })
    if (seq.notes[0] && seq.notes[0].targetSide === 'left') { seed = s; break }
  }
  cfg.patch({ durationSec: 60, musicVolume: 0, melodyOn: false, centerRate: 0, sameSideRate: 0.45, chartSeed: seed }, 'test')
  const clock = new FakeClock(songById(cfg.get('songId')))
  const engine = new RhythmEngine({ cfg: cfg, clock: clock })
  engine.setSimMode(true)
  engine.prepare()
  engine.startCountdown()
  let g = 0
  while (engine.state === 'COUNTDOWN' && g < 900) { engine.update(DT); g += 1 }
  engine.beginPlay()
  for (let f = 0; f < 66 * 60; f++) {
    const now = clock.nowMs()
    const p = engine.pending
    if (p && now >= p.targetTimeMs - 300) {
      engine.motion.setSimTarget(-1, 0)
    }
    clock.advance(DT * 1000)
    engine.update(DT)
    engine.drainEvents()
    if (engine.state !== 'PLAYING') break
  }
  const s = engine.summary
  console.log('    单侧代偿：完成 ' + s.completed + '（左' + s.leftHitCount + '/右' + s.rightHitCount +
    '）均衡 ' + (s.balanceRate === null ? '—' : s.balanceRate))
  ok(s.rightHitCount === 0, '只往左的患者右侧一次也完不成', String(s.rightHitCount))
  ok(s.leftHitCount >= 1, '左侧音符照常完成', String(s.leftHitCount))
  ok(s.completed <= 6, '一碰到右侧音符就彻底卡住 —— 这是门控的代价，必须让治疗师看见', String(s.completed))
  ok(s.balanceRate === 0, '均衡度 = 0（治疗师能一眼看出单侧代偿）', String(s.balanceRate))
  ok(s.stabilityRate !== null && s.stabilityRate > 0.8,
    '他每一下都做得很稳 —— 问题在范围不在质量', String(s.stabilityRate))
}

// ---------------------------------------------------------------- 结果
console.log('\n----------------------------------------')
if (fails.length) {
  console.log('结果：' + fails.length + ' 项失败 / 共 ' + (pass + fails.length) + ' 项')
  fails.forEach((f) => console.log('  · ' + f))
  process.exit(1)
}
console.log('结果：全部通过（' + pass + ' 项）')
