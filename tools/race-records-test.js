// ============================================================================
// tools/race-records-test.js —— 赛车「训练记录」页的展示映射
// ----------------------------------------------------------------------------
// 这一页的价值全在"把引擎算出来的一局翻译成人能看懂的一张卡"，
// 最容易错在三处，而且都不会报错、只会显示成看着合理的错数字：
//   1. 「最好成绩」把模拟数据也算进去 —— 触屏调试跑出的高分登顶，
//      治疗师会以为患者进步了
//   2. configSnapshot 缺失时整页崩掉（早期记录没有这个字段）
//   3. 时长/会话秒数格式化错位（150 秒显示成 150 而不是 02:30）
//
// 用记录模块自己的 save() 造数据，不直接拼 storage 键，
// 这样账号隔离那套键规则（BASE_KEY:patientId）由模块自己负责。
//
// 用法：node tools/race-records-test.js
// ============================================================================

/* eslint-disable no-console */

const path = require('path')

let pass = 0
let fail = 0
function ok(cond, msg, extra) {
  if (cond) {
    pass += 1
    console.log('  ✓ ' + msg)
  } else {
    fail += 1
    console.log('  ✗ ' + msg + (extra === undefined ? '' : '  → ' + extra))
  }
}

// ============================================================== wx 桩
const store = {}
global.wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v },
  removeStorageSync: (k) => { delete store[k] },
  getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 2, platform: 'devtools' }),
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 2 }),
  getAccountInfoSync: () => ({ miniProgram: { appId: 'wxtestrecords', envVersion: 'develop' } }),
  showToast: () => {},
  showModal: (o) => { if (o && o.success) o.success({ confirm: true }) },
  showLoading: () => {},
  hideLoading: () => {},
  stopPullDownRefresh: () => {},
  request: (o) => { if (o && o.fail) setTimeout(() => o.fail({ errMsg: 'mock: no network' }), 0) },
  login: (o) => { if (o && o.success) setTimeout(() => o.success({ code: 'mock-code' }), 0) }
}

const ROOT = path.resolve(__dirname, '..')
const records = require(path.join(ROOT, 'pkgRace', 'utils', 'race-record.js'))

let pageDef = null
global.Page = (def) => { pageDef = def }
require(path.join(ROOT, 'pkgRace', 'pages', 'race-records', 'race-records.js'))

function makePage() {
  const page = {}
  Object.keys(pageDef).forEach((k) => { if (k !== 'data') page[k] = pageDef[k] })
  page.data = JSON.parse(JSON.stringify(pageDef.data))
  page.setData = function (patch) { Object.assign(this.data, patch) }
  return page
}

function mkRecord(id, extra) {
  return Object.assign({
    recordId: id,
    gameId: 'race',
    nickname: '体验用户',
    level: 2,
    levelName: 'L2 坐姿巡航',
    difficulty: 2,
    score: 100,
    combo: 3,
    perfect: 2,
    hits: 1,
    rings: 4,
    accuracy: 88.4,
    calories: 12,
    distance: 1,
    stableTime: 30,
    durationSec: 150,
    dataSource: 'sensor',
    endedAt: Date.now(),
    uploadState: 'local'
  }, extra || {})
}

// ============================================================== 1. 空态
console.log('== 1. 空态 ==')
{
  records.clear()
  const page = makePage()
  page.onLoad()
  ok(page.data.list.length === 0, '没有记录时列表为空', page.data.list.length)
  ok(page.data.best === null, '没有记录时「最好成绩」为 null（模板用 wx:if 隐藏）', page.data.best)
  ok(page.data.stats.total === 0, '总记录数 0', page.data.stats.total)
  ok(page.data.pendingCount === 0, '待上报 0', page.data.pendingCount)
}

// ============================================================== 2. 最好成绩
console.log('== 2. 最好成绩只取真实传感器数据 ==')
{
  records.clear()
  records.save(mkRecord('r-real-low', { score: 800 }))
  records.save(mkRecord('r-real-high', { score: 1500 }))
  // 模拟数据分数最高，但绝不能登顶
  records.save(mkRecord('r-sim', { score: 9999, dataSource: 'simulation', uploadState: 'skipped' }))

  const page = makePage()
  page.onLoad()
  ok(page.data.list.length === 3, '三条记录都在列表里', page.data.list.length)
  ok(page.data.best && page.data.best.score === 1500,
    '最好成绩是 1500（真实数据），不是模拟的 9999', page.data.best && page.data.best.score)
  ok(page.data.best && page.data.best.recordId === 'r-real-high', '最好成绩指向正确那条', page.data.best && page.data.best.recordId)

  const sim = page.data.list.filter((v) => v.recordId === 'r-sim')[0]
  ok(sim && sim.isSim === true, '模拟记录被标成 isSim', sim && sim.isSim)
  ok(sim && sim.source === '模拟数据', '数据来源文案是「模拟数据」', sim && sim.source)
  ok(sim && sim.canUpload === false, '模拟记录不允许上报', sim && sim.canUpload)
}

// ============================================================== 3. 字段映射
console.log('== 3. KPI 与详情字段映射 ==')
{
  records.clear()
  records.save(mkRecord('r-1', {
    score: 1234,
    rank: 7,
    combo: 12,
    perfect: 5,
    hits: 3,
    rings: 9,
    accuracy: 91.6,
    distance: 26,
    stableTime: 64,
    calories: 18,
    durationSec: 152,
    startedAt: Date.now() - 152000,
    configSnapshot: { level: 2, maxAngle: 10, deadZone: 1.5, smoothing: 0.18, sessionSeconds: 150 }
  }))

  const page = makePage()
  page.onLoad()
  const v = page.data.list[0]
  ok(v.score === 1234, '得分', v.score)
  ok(v.rank === 7, '排名', v.rank)
  ok(v.combo === 12 && v.perfect === 5 && v.hits === 3 && v.rings === 9, '四个 KPI', [v.combo, v.perfect, v.hits, v.rings].join('/'))
  ok(v.accuracy === 92, '稳定率四舍五入到整数（91.6 → 92）', v.accuracy)
  ok(v.distance === 26, '行驶距离', v.distance)
  ok(v.maxAngle === 10, '快照：打满方向 10°', v.maxAngle)
  ok(v.deadZone === 1.5, '快照：死区 1.5°', v.deadZone)
  ok(v.smoothing === 0.18, '快照：滤波 0.18（康复值不能被格式化成 0.2）', v.smoothing)
  ok(v.session === '02:30', '快照：会话 150 秒 → 02:30', v.session)
  ok(v.duration.length > 0, '训练时长有文案', v.duration)
  ok(v.source === '真实传感器', '数据来源：真实传感器', v.source)
  ok(v.stateText === '待上报', '上传状态文案', v.stateText)
}

// ============================================================== 4. 缺快照
console.log('== 4. 早期记录没有 configSnapshot ==')
{
  records.clear()
  records.save(mkRecord('r-legacy', { configSnapshot: undefined, accuracy: undefined, rank: undefined }))
  const page = makePage()
  page.onLoad()
  const v = page.data.list[0]
  ok(page.data.list.length === 1, '缺字段的记录照样能显示（不整页崩）', page.data.list.length)
  ok(v.maxAngle === '—' && v.deadZone === '—' && v.smoothing === '—',
    '缺失的参数显示破折号', [v.maxAngle, v.deadZone, v.smoothing].join('/'))
  ok(v.session === '—', '缺失的会话时长显示破折号', v.session)
  ok(v.accuracy === 0, '缺失的稳定率按 0 处理（不是 NaN）', v.accuracy)
  ok(v.rank === 0, '缺失的排名按 0 处理', v.rank)
}

// ============================================================== 5. 时长格式化
console.log('== 5. 秒 → mm:ss ==')
{
  records.clear()
  const cases = [[150, '02:30'], [60, '01:00'], [3599, '59:59'], [95, '01:35']]
  cases.forEach((c) => {
    records.save(mkRecord('r-' + c[0], { configSnapshot: { sessionSeconds: c[0] } }))
  })
  // 0 秒不是有效会话，按「未记录」显示破折号（不要显示成 00:00 假装有数据）
  records.save(mkRecord('r-zero', { configSnapshot: { sessionSeconds: 0 } }))
  const page = makePage()
  page.onLoad()
  const byId = {}
  page.data.list.forEach((v) => { byId[v.recordId] = v.session })
  const bad = cases.filter((c) => byId['r-' + c[0]] !== c[1])
  ok(bad.length === 0, '所有会话时长格式化正确',
    bad.map((c) => c[0] + '→' + byId['r-' + c[0]] + '（期望 ' + c[1] + '）').join(', '))
  ok(byId['r-zero'] === '—', '0 秒视为未设置，显示破折号而不是 00:00', byId['r-zero'])
}

// ============================================================== 6. 展开/删除
console.log('== 6. 展开与删除 ==')
{
  records.clear()
  records.save(mkRecord('r-a', { score: 100 }))
  records.save(mkRecord('r-b', { score: 200 }))
  const page = makePage()
  page.onLoad()

  page.onToggle({ currentTarget: { dataset: { id: 'r-a' } } })
  ok(page.data.expanded === 'r-a', '点一下展开', page.data.expanded)
  page.onToggle({ currentTarget: { dataset: { id: 'r-a' } } })
  ok(page.data.expanded === '', '再点一下收起', page.data.expanded)

  page.onDelete({ currentTarget: { dataset: { id: 'r-a' } } })
  ok(page.data.list.length === 1, '删除后列表少一条', page.data.list.length)
  ok(page.data.list[0].recordId === 'r-b', '删的是指定那条', page.data.list[0].recordId)

  page.onClearAll({})
  ok(page.data.list.length === 0, '清空后为空', page.data.list.length)
  ok(page.data.best === null, '清空后最好成绩清掉', page.data.best)
}

// ============================================================== 收尾
console.log('\n' + '-'.repeat(48))
if (fail) {
  console.log('未通过：' + fail + ' 项失败，' + pass + ' 项通过')
  process.exitCode = 1
} else {
  console.log('全部通过：' + pass + ' 项')
}
