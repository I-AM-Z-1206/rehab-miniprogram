// ============================================================================
// tools/progress-test.js —— 患者端「我的进步」聚合
// ----------------------------------------------------------------------------
// 这层最怕的不是算错，而是**算出来是空的**：
// progress.js 在主包，不能 require 分包的各 record 模块（小程序规则），
// 所以它靠「约定的 storage 键」直接读原始数组。键名一旦和 record 模块
// 对不上，首页那张卡就永远是「还没有训练数据」—— 而且不会报错。
//
// 所以这里先用**真的 record 模块**各存一条记录，再看 progress 能不能读到。
//
// 用法：node tools/progress-test.js
// ============================================================================

/* eslint-disable no-console */

const storage = {}

global.wx = {
  getStorageSync: (k) => (storage[k] === undefined ? '' : storage[k]),
  setStorageSync: (k, v) => { storage[k] = v },
  removeStorageSync: (k) => { delete storage[k] },
  request: (opts) => {
    if (opts && typeof opts.fail === 'function') {
      setTimeout(() => opts.fail({ errMsg: 'mock: no network' }), 0)
    }
  },
  login: (opts) => {
    if (opts && typeof opts.success === 'function') {
      setTimeout(() => opts.success({ code: 'mock-code' }), 0)
    }
  }
}

const fruit = require('../pkgFruit/utils/fruit-record.js')
const wire = require('../utils/training-record.js')
const rhythm = require('../pkgRhythm/utils/rhythm-record.js')
const race = require('../pkgRace/utils/race-record.js')
const shoot = require('../pkgShoot/utils/shoot-record.js')
const progress = require('../utils/progress.js')

let pass = 0
const fails = []
function ok(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name) } else {
    fails.push(name + (extra === undefined ? '' : '（' + extra + '）'))
    console.log('  ✗ ' + name + (extra === undefined ? '' : '  → ' + extra))
  }
}
function near(a, b, tol, name) {
  ok(a != null && Math.abs(a - b) <= tol, name, a + ' vs ' + b)
}

function loginAs(pid) {
  if (pid) storage['api_patient_v1'] = { id: pid, code: 'P-TEST' }
  else delete storage['api_patient_v1']
}

const HOUR = 3600000
const DAY = 86400000

function rec(gameId, extra) {
  return Object.assign({
    recordId: gameId + '_' + Math.random().toString(36).slice(2, 8),
    gameId: gameId,
    difficulty: 3,
    score: 100,
    durationSec: 60,
    completed: true,
    dataSource: 'real',
    startedAt: new Date(Date.now() - HOUR).toISOString()
  }, extra || {})
}

console.log('[progress] 患者端「我的进步」')

// ---------------------------------------------------------------- 1
console.log('\n[1] 五个游戏的存储键必须和 progress.js 对得上')
loginAs('p_A')
fruit.save(rec('fruit', { holdRate: 0.7 }))
wire.save(rec('wire', { offSec: 12 }))
rhythm.save(rec('rhythm', { directionAccuracy: 0.8 }))
race.save(rec('race', { stableTime: 45 }))
shoot.save(rec('shoot', { zoneRate: 0.6 }))

const all = progress.readAll('p_A')
ok(all.length === 5, '五个游戏各存一条，progress 全都读得到', '读到 ' + all.length + ' 条')
const byId = {}
all.forEach((it) => { byId[it.gameId] = it })
ok(!!byId.fruit && !!byId.wire && !!byId.rhythm && !!byId.race && !!byId.shoot,
  '五个 gameId 都在', Object.keys(byId).join(','))

// ---------------------------------------------------------------- 2
console.log('\n[2] 各游戏的稳定率口径')
near(byId.fruit.stability, 0.70, 0.001, '接水果 → holdRate')
near(byId.wire.stability, 0.80, 0.001, '走钢丝 → 1 - offSec/时长（60-12=48/60）')
near(byId.rhythm.stability, 0.80, 0.001, '节奏 → directionAccuracy')
near(byId.race.stability, 0.75, 0.001, '赛车 → stableTime/时长（45/60）')
near(byId.shoot.stability, 0.60, 0.001, '射击 → zoneRate')

ok(progress.stabilityOf({ gameId: 'wire', durationSec: 60 }) !== null, '缺字段时走钢丝按 0 出界算')
ok(progress.stabilityOf({ gameId: 'unknown' }) === null, '未知游戏返回 null（不污染平均）')
ok(progress.stabilityOf({ gameId: 'fruit' }) === null, '缺 holdRate 返回 null 而不是 0')

// ---------------------------------------------------------------- 3
console.log('\n[3] 模拟数据不进统计')
const beforeCount = progress.readAll('p_A').length
fruit.save(rec('fruit', { holdRate: 0.5, dataSource: 'simulation' }))
ok(progress.readAll('p_A').length === beforeCount, 'dataSource=simulation 被排除')

// ---------------------------------------------------------------- 4
console.log('\n[4] 按周聚合')
loginAs('p_B')
const now = Date.now()
const ws = progress.weekStart(now)
// 本周 4 局、上周 4 局，本周稳一些
for (let i = 0; i < 4; i++) {
  shoot.save(rec('shoot', { zoneRate: 0.72, startedAt: new Date(ws + i * HOUR).toISOString() }))
}
for (let i = 0; i < 4; i++) {
  shoot.save(rec('shoot', { zoneRate: 0.60, startedAt: new Date(ws - 3 * DAY + i * HOUR).toISOString() }))
}
const s = progress.summary({ pid: 'p_B', now: now })
ok(s.thisWeek.count === 4, '本周 4 次', String(s.thisWeek.count))
ok(s.lastWeek.count === 4, '上周 4 次', String(s.lastWeek.count))
near(s.thisWeek.stability, 0.72, 0.001, '本周稳定率 72%')
near(s.lastWeek.stability, 0.60, 0.001, '上周稳定率 60%')
near(s.delta, 0.12, 0.001, '变化 +12 个百分点')
ok(s.hasTrend === true, '样本够 → 有趋势')

// ---------------------------------------------------------------- 5
console.log('\n[5] 文案：如实说 + 给解释锚点')
const dUp = progress.describe(s)
ok(dUp.tone === 'up' && dUp.detail.indexOf('稳了 12') >= 0, '上升 → 「比上周稳了 12 个百分点」', dUp.detail)

const down = Object.assign({}, s, { delta: -0.08 })
const dDown = progress.describe(down)
ok(dDown.tone === 'down', '下降 → tone=down')
ok(dDown.detail.indexOf('低 8') >= 0, '下降如实报数', dDown.detail)
ok(dDown.detail.indexOf('难度') >= 0, '下降时给出解释锚点（难度）', dDown.detail)

const flat = Object.assign({}, s, { delta: 0.01 })
ok(progress.describe(flat).tone === 'flat', '变化 <3% → 持平')

const noTrend = Object.assign({}, s, { hasTrend: false })
ok(progress.describe(noTrend).detail.indexOf('没有可比数据') >= 0, '上周没数据 → 不做对比')

// ---------------------------------------------------------------- 6
console.log('\n[6] 样本不足与空态')
loginAs('p_C')
const empty = progress.summary({ pid: 'p_C', now: now })
const dEmpty = progress.describe(empty)
ok(dEmpty.tone === 'none' && dEmpty.headline.indexOf('没有训练数据') >= 0, '完全没有记录 → 引导语', dEmpty.headline)

shoot.save(rec('shoot', { zoneRate: 0.7, startedAt: new Date(ws + HOUR).toISOString() }))
const one = progress.summary({ pid: 'p_C', now: now })
const dOne = progress.describe(one)
ok(one.hasTrend === false, '只有 1 次 → 不出趋势')
ok(dOne.detail.indexOf('再练') >= 0, '提示还差几次才看得到变化', dOne.detail)

// ---------------------------------------------------------------- 7
console.log('\n[7] 账号隔离')
const other = progress.summary({ pid: 'p_A_other', now: now })
ok(other.totalCount === 0, '别的账号读不到 p_A 的记录')

// ---------------------------------------------------------------- 8
console.log('\n[8] 详情页数据（打卡 / 走势 / 累计）')
loginAs('p_D')
// 固定到 2026-10-28（周三）中午，避开「今天是周几」的边界
const WED = new Date(2026, 9, 28, 12, 0, 0).getTime()
shoot.save(rec('shoot', { zoneRate: 0.60, startedAt: new Date(2026, 9, 26, 10, 0, 0).toISOString() }))
shoot.save(rec('shoot', { zoneRate: 0.70, startedAt: new Date(2026, 9, 28, 10, 0, 0).toISOString() }))
const d = progress.detail({ pid: 'p_D', now: WED })
ok(d.week.length === 7, '本周 7 天', String(d.week.length))
ok(d.week[0].trained === true, '周一练过')
ok(d.week[1].trained === false, '周二没练')
ok(d.week[2].trained === true, '周三练过')
ok(d.week[2].today === true, '周三是今天（外环标记）')
ok(d.week[4].future === true, '周五还没到（置灰）')
ok(d.trend.values.length === 2, '走势取到 2 个点', String(d.trend.values.length))
ok(d.trend.values[0] === 60 && d.trend.values[1] === 70, '走势按时间升序且是百分数',
  d.trend.values.join(','))
ok(d.trend.labels.length === 2 && d.trend.labels[0].indexOf('/') > 0, '走势横轴是月/日',
  d.trend.labels.join(','))
ok(d.totalMinutes >= 1, '累计分钟数为正', String(d.totalMinutes))

// ---------------------------------------------------------------- 9
console.log('\n[9] 展示层格式化（记录页顶部那一行）')
const gh = require('../utils/progress-view.js').gameHeadline
const emptyGame = gh('rhythm', { pid: 'p_D' })
ok(emptyGame.value === '--', '算不出来显示 -- 而不是 0%（0% 会被当成表现极差）', emptyGame.value)
ok(emptyGame.has === false, 'has=false 让页面走「练几次后开始统计」')
const shotGame = gh('shoot', { pid: 'p_D' })
ok(shotGame.value === '65%', '两局 60/70 → 稳定率 65%', shotGame.value)
ok(shotGame.count === 2, '次数正确')

console.log('\n----------------------------------------')
if (fails.length) {
  console.log('结果：' + fails.length + ' 项失败 / 共 ' + (pass + fails.length) + ' 项')
  fails.forEach((f) => console.log('  · ' + f))
  process.exitCode = 1
} else {
  console.log('结果：全部通过（' + pass + ' 项）')
}
