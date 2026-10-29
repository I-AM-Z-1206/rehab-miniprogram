// ============================================================================
// tools/rhythm-playability-test.js —— 节奏训练「可玩性」端到端验证
// ----------------------------------------------------------------------------
// 谱面层面的断言在 rhythm-headless-test.js 里钉。这里钉的是更靠前的一件事：
// **一个真实康复患者能不能玩得下来。**
//
// 患者模型（保守，不玩花活）：
//   · 只会「提前启动」—— 躯干移动要几百毫秒，提前是唯一正确策略；
//   · 移动是 0.35s 缓动，不是瞬移（motion.setSimTarget 自带）；
//   · 不做任何预判修正，到点就往下一个音符的方向挪。
//
// 只要这个模型在某个难度下大面积漏接，就说明间隔设得比患者的运动能力还快，
// 参数设置得再「高级」也没有意义 —— 这正是 110 BPM 下 545ms 间隔出过的问题。
// ============================================================================

const { getStore } = require('../utils/rhythm-config.js')
const { songById } = require('../utils/rhythm-songs.js')
const { RhythmEngine } = require('../pkgRhythm/games/rhythm/engine.js')

const DT = 1 / 60
const SONGS = ['slow_wave', 'dawn_walk', 'heart_pulse'] // 66 / 90 / 110 BPM

class FakeClock {
  constructor(song) {
    this.song = song
    this.t = 0
    this.state = 'idle'
    this.isSilent = false
    this.beatMs = song ? 60000 / song.bpm : 500
  }
  setSong(s) { this.song = s; this.beatMs = 60000 / s.bpm; return this }
  start() { this.state = 'playing'; this.t = 0; return this }
  pause() { this.state = 'paused'; return this }
  resume() { this.state = 'playing'; return this }
  stop() { this.state = 'idle'; return this }
  nowMs() { return this.t }
  advance(ms) { this.t += ms }
  beatPhase() { return (this.t % this.beatMs) / this.beatMs }
}

const TARGET = { left: -1, center: 0, right: 1 }

/** 跑完整一局：患者在每个音符前 leadMs 启动 */
function play(difficulty, leadMs, songId) {
  const cfg = getStore({ fresh: true })
  cfg.reset()
  cfg.applyDifficulty(difficulty)
  cfg.patch({ songId: songId, durationSec: 90, musicVolume: 0 }, 'test')
  const song = songById(cfg.get('songId'))
  const clock = new FakeClock(song)
  const engine = new RhythmEngine({ cfg: cfg, clock: clock })
  engine.setSimMode(true)
  engine.prepare()
  engine.startCountdown()

  let guard = 0
  while (engine.state === 'COUNTDOWN' && guard < 900) { engine.update(DT); guard += 1 }
  engine.beginPlay()

  const total = engine.notes.length
  let idx = 0
  for (let f = 0; f < 95 * 60; f++) {
    const now = clock.nowMs()
    while (idx < engine.notes.length && engine.notes[idx].targetTimeMs < now - 200) idx += 1
    const n = engine.notes[idx]
    if (n && now >= n.targetTimeMs - leadMs) engine.motion.setSimTarget(TARGET[n.targetSide], 0)
    clock.advance(DT * 1000)
    engine.update(DT)
    engine.drainEvents()
    if (engine.state !== 'PLAYING') break
  }
  const s = engine.score.snapshot()
  return {
    total: total, hits: s.hits, miss: s.miss,
    perfect: s.perfect, great: s.great, good: s.good,
    rate: s.overallHitRate
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

console.log('\n[1] 患者模型跑完整一局：每个难度都能玩下来')
console.log('    难度 提前量  曲目          音符  命中  PERFECT GREAT GOOD MISS  命中率')
const byDifficulty = {}
for (const d of [1, 3, 5]) {
  byDifficulty[d] = {}
  for (const lead of [250, 400]) {
    for (const song of SONGS) {
      const r = play(d, lead, song)
      byDifficulty[d][song] = r.total
      const tag = '     ' + d + '   ' + (lead + 'ms').padStart(6) + '  ' + song.padEnd(12)
      console.log(tag +
        String(r.total).padStart(4) + String(r.hits).padStart(6) +
        String(r.perfect).padStart(8) + String(r.great).padStart(6) +
        String(r.good).padStart(5) + String(r.miss).padStart(5) +
        '  ' + (r.rate * 100).toFixed(1) + '%')
      ok(r.rate >= 0.9,
        '难度' + d + ' / ' + song + ' / 提前' + lead + 'ms 命中率 ≥90%',
        (r.rate * 100).toFixed(1) + '%（漏 ' + r.miss + '）')
    }
  }
}

console.log('\n[2] 换曲子不改变训练强度（BPM 不再绑架难度）')
for (const d of [1, 3, 5]) {
  const counts = SONGS.map((s) => byDifficulty[d][s])
  const same = counts.every((c) => c === counts[0])
  ok(same, '难度' + d + ' 三首曲子音符数一致', counts.join('/'))
}
ok(byDifficulty[1].slow_wave < byDifficulty[3].slow_wave &&
  byDifficulty[3].slow_wave < byDifficulty[5].slow_wave,
'难度越高音符越多（档位确实在变）',
[1, 3, 5].map((d) => byDifficulty[d].slow_wave).join(' < '))

console.log('\n[3] 判定仍有区分度（不是躺赢）')
for (const d of [1, 3, 5]) {
  const r = play(d, 250, 'dawn_walk')
  ok(r.perfect > 0, '难度' + d + ' 提前250ms 仍能拿到 PERFECT', String(r.perfect))
  ok(r.perfect + r.great > 0, '难度' + d + ' 命中质量有分层',
    'P' + r.perfect + '/G' + r.great + '/g' + r.good)
}
const loose = play(5, 400, 'dawn_walk')
ok(loose.perfect === 0 || loose.perfect < loose.good,
  '提前过多会掉档（判定不是无条件满分）',
  'P' + loose.perfect + '/G' + loose.great + '/g' + loose.good)

// ---------------------------------------------------------------- 结果
console.log('\n----------------------------------------')
if (fails.length) {
  console.log('结果：' + fails.length + ' 项失败 / 共 ' + (pass + fails.length) + ' 项')
  fails.forEach((f) => console.log('  · ' + f))
  process.exit(1)
}
console.log('结果：全部通过（' + pass + ' 项）')
