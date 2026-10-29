// ============================================================================
// tools/game_selftest.js —— 纯逻辑自测（不需要微信环境，node 直接跑）
//   node tools/game_selftest.js
// 覆盖：ConfigStore 校验/难度预设、ScoreManager 连击与得分公式、
//       HitDetector 判定范围热更新、BulletSystem 对象池、PoseTracker 左右映射
// ============================================================================

const { ConfigStore, DIFFICULTIES } = require('../pkgShoot/games/shoot/config.js')
const { ScoreManager } = require('../pkgShoot/games/shoot/score.js')
const { HitDetector } = require('../pkgShoot/games/shoot/hit.js')
const { BulletSystem } = require('../pkgShoot/games/shoot/bullet.js')
const { PoseTracker } = require('../pkgShoot/games/shoot/pose.js')

let pass = 0
let fail = 0

function ok(cond, name, extra) {
  if (cond) {
    pass += 1
    console.log('  ✓ ' + name)
  } else {
    fail += 1
    console.log('  ✗ ' + name + (extra ? '  → ' + extra : ''))
  }
}

function section(t) {
  console.log('\n' + t)
}

// --------------------------------------------------------------------------
section('[1] ConfigStore 配置中心')
const cfg = new ConfigStore({ persist: false })

ok(cfg.get('hitRange') === 60, '默认判定半径 60px', cfg.get('hitRange'))
ok(cfg.get('fireRate') === 3, '默认发射频率 3 发/秒')
ok(cfg.get('tickMs') === 100, '判定刻度 100ms（0.1s）')

cfg.set('hitRange', 9999)
ok(cfg.get('hitRange') === 200, '超上限自动收敛到 200', cfg.get('hitRange'))
cfg.set('hitRange', -5)
ok(cfg.get('hitRange') === 8, '低于下限收敛到 8')
cfg.set('hitRange', 61)
ok(cfg.get('hitRange') === 62, '按 step=2 就近对齐到 62', cfg.get('hitRange'))

cfg.patch({ scoreMin: 9, scoreMax: 3 })
ok(cfg.getScoreRange()[0] <= cfg.getScoreRange()[1], '得分区间自动保证 min<=max', JSON.stringify(cfg.getScoreRange()))

let seen = null
const off = cfg.subscribe((p) => { seen = p })
cfg.set('fireRate', 6)
ok(seen && seen.changed.indexOf('fireRate') >= 0, '配置变更广播生效')
off()
seen = null
cfg.set('fireRate', 5)
ok(seen === null, '取消订阅后不再收到通知')

const applied = cfg.applyDifficulty('hard')
ok(cfg.get('difficulty') === 'hard', '难度切换到 hard')
ok(cfg.get('hitRange') === DIFFICULTIES.hard.hitRange, 'hard 预设写入判定半径', applied.length)
ok(cfg.getScoreMul() === 1.5, 'hard 得分系数 1.5')
ok(cfg.get('keepRangeDeg') === 4, 'hard 保持范围 4°')

// --------------------------------------------------------------------------
section('[2] ScoreManager 计分 / 连击')
const scoreCfg = new ConfigStore({ persist: false })
scoreCfg.patch({ tickMs: 100, comboWindowMs: 100, comboStep: 0.15, comboMaxMul: 3, scoreMin: 1, scoreMax: 3, baseScorePerSecond: 1 })

let seq = 0
const fixedRng = () => {
  const vals = [0, 0.5, 0.99, 0.2]
  const v = vals[seq % vals.length]
  seq += 1
  return v
}
const sm = new ScoreManager(scoreCfg, { rng: fixedRng })

// 第 10 个刻度命中 -> combo 1，base=1（rng 0）* 1 * 1 = 1
let ev = sm.onTick(10, [{ x: 1, y: 1 }])
ok(ev[0].type === 'hit' && ev[0].combo === 1, '单次命中 combo=1')
ok(ev[0].gain === 1, '得分 = base1 × 难度1 × 连击1 = 1', ev[0].gain)

// 紧邻的下一个 0.1s 刻度再命中 -> combo 2，base=2（rng 0.5 -> 1+floor(0.5*3)=2），mul=1.15 => round(2.3)=2
ev = sm.onTick(11, [{ x: 1, y: 1 }])
ok(ev[0].combo === 2, '相邻 0.1s 命中触发 combo=2')
ok(ev[0].gain === 2, 'combo2 得分 round(2×1.15)=2', ev[0].gain)

// 跳过窗口（tick 15）再命中 -> combo 归 1
ev = sm.onTick(15, [{ x: 1, y: 1 }])
ok(ev[0].combo === 1, '超出 0.1s 窗口后 combo 重置为 1')

// 无命中且超窗口 -> comboEnd
ev = sm.onTick(20, [])
ok(ev.length === 1 && ev[0].type === 'comboEnd', '窗口过期发出 comboEnd')

// 同一刻度多次命中：连击在同一刻度内叠加
sm.reset()
ev = sm.onTick(1, [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }])
ok(ev.length === 3 && ev[2].combo === 3, '同刻度 3 次命中连击叠加到 3', ev.map(e => e.combo).join(','))

// 1 秒刻度
sm.reset()
sm.onSecond(true)
sm.onSecond(true)
sm.onSecond(false)
const st1 = sm.stats()
ok(st1.score === 2, '每秒基础分 1 × 2 秒（出界那一秒不计）', st1.score)
ok(st1.zoneRate === 67, '在界率 2/3 ≈ 67%', st1.zoneRate)

// 小数基础分：0.5 分/秒不能每秒四舍五入成 1 分，应按累计取整
scoreCfg.patch({ baseScorePerSecond: 0.5 })
sm.reset()
let halfGain = 0
for (let i = 0; i < 4; i++) halfGain += sm.onSecond(true).gain
ok(halfGain === 2, '每秒 0.5 分累计 4 秒 = 2 分（不放大）', halfGain)
scoreCfg.patch({ baseScorePerSecond: 1 })

// 难度系数
scoreCfg.applyDifficulty('hard')
scoreCfg.patch({ scoreMin: 10, scoreMax: 10, comboStep: 0 })
sm.reset()
ev = sm.onTick(1, [{ x: 0, y: 0 }])
ok(ev[0].gain === 15, 'hard 难度 10 分 × 1.5 = 15', ev[0].gain)

// --------------------------------------------------------------------------
section('[3] HitDetector 判定范围热更新')
const hitCfg = new ConfigStore({ persist: false })
const hd = new HitDetector(hitCfg)
const target = { x: 100, y: 100, radius: 26 }

ok(hd.getRange() === 60, '初始判定半径 60')
ok(hd.test(150, 100, target) === true, '距离 50 < 60 命中')
ok(hd.test(180, 100, target) === false, '距离 80 > 60 未命中')

hd.setRange(90) // 治疗师实时调大
ok(hd.getRange() === 90, 'setHitArea(90) 立即生效')
ok(hd.test(180, 100, target) === true, '同一目标现在距离 80 也算命中（无需重启）')

hd.setRange(20)
ok(hd.test(130, 100, target) === false, '调小到 20 后距离 30 不再命中')

// 扫掠：子弹一帧从 y=300 飞到 y=0，穿过 y=100 的目标
hd.setRange(30)
const sweepHit = hd.sweep(100, 300, 100, 0, target)
ok(!!sweepHit, '线段扫掠能检测到高速子弹命中（防穿透）', sweepHit && sweepHit.distance)

// 批量结算：一颗子弹只消耗一个目标
const bullets = [{ x: 100, y: 100, px: 100, py: 120, alive: true }, { x: 100, y: 100, px: 100, py: 120, alive: true }]
const targets = [{ x: 100, y: 100, radius: 26, dead: false, hitThisFrame: false }]
let hitCount = 0
hd.resolve(bullets, targets, () => { hitCount += 1 })
ok(hitCount === 1, '同一目标同一帧只结算一次', hitCount)

// --------------------------------------------------------------------------
section('[4] BulletSystem 子弹池')
const bcfg = new ConfigStore({ persist: false })
const bs = new BulletSystem(bcfg, { width: 375, height: 667 })
const b1 = bs.fire(100, 500)
ok(bs.count === 1 && b1.vy < 0, '子弹向上发射', b1.vy.toFixed(1))
bs.update(0.1)
ok(b1.y < 500, '子弹按速度前进', b1.y.toFixed(1))
bs.update(1.5) // 飞出屏幕
ok(bs.count === 0, '飞出屏幕自动回收')
for (let i = 0; i < 5; i++) bs.fire(10 + i, 500)
ok(bs.pool.length >= 0 && bs.count === 5, '可连续发射多颗')

// --------------------------------------------------------------------------
section('[5] PoseTracker 左右检测 / 保持范围')
const pcfg = new ConfigStore({ persist: false })
pcfg.patch({ keepRangeDeg: 6, maxLeanDeg: 20, smooth: 1, deadzoneDeg: 0 })
const pose = new PoseTracker(pcfg)
const now = Date.now()

ok(pose.stale === true, '未收到数据时为模拟模式')

pose.feed({ pitch: 0 })
pose.update(now)
ok(pose.dir === 'center' && pose.inZone, 'pitch=0 → 居中且在范围内', pose.x01.toFixed(2))

// 按实机方向左右移动读 Pitch；角色位置做固定镜像，但提示方向用身体真实方向
pose.feed({ pitch: 5 })
for (let i = 0; i < 30; i++) pose.update(now + i)
ok(pose.dir === 'right', 'pitch=+5 → 身体偏右')
ok(pose.inZone === true, '|5| <= 6 仍在保持范围内')
ok(pose.x01 < 0.4, 'x 位置偏左（角色镜像）', pose.x01.toFixed(2))
ok(pose.getAngle() === 5, '显示角度仍是身体真实倾角 +5°', pose.getAngle())

pose.feed({ pitch: 8 })
for (let i = 0; i < 30; i++) pose.update(now + 100 + i)
ok(pose.inZone === false, '|8| > 6 判定出界')
ok(Math.abs(pose.x01 - 0.5) < 0.45, '出界时位置仍在屏幕内', pose.x01.toFixed(2))

pose.feed({ pitch: -5 })
for (let i = 0; i < 30; i++) pose.update(now + 200 + i)
ok(pose.dir === 'left', 'pitch=-5 → 身体偏左')

// 不再提供轴切换：Roll 不参与左右移动
pose.feed({ pitch: 0, roll: -8 })
for (let i = 0; i < 30; i++) pose.update(now + 300 + i)
ok(pose.dir === 'center', 'Roll 不参与左右移动（固定读取 Pitch）')

// 传感器掉线 1.2s
const staleNow = now + 5000
pose.update(staleNow)
ok(pose.stale === true, '超过 1.2s 无数据判定掉线')

// --------------------------------------------------------------------------
console.log('\n' + '='.repeat(47))
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项')
process.exit(fail === 0 ? 0 : 1)
