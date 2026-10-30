// ============================================================================
// tools/shoot-record-test.js —— 射击训练记录
// ----------------------------------------------------------------------------
// 射击是五个游戏里唯一漏掉记录的：其它四个都能进库/上报/看列表，只有射击
// 玩完就没了，治疗师那边永远是空白。这个测试锁住补上之后的四件事：
//
//   1. 记录真的落进 shoot_records_v1:<patientId>，并且按账号隔离
//   2. 不会串进另外四个游戏的库（曾被固定 storage 键坑过一次）
//   3. 模拟数据（全程触屏、没有真实传感器帧）标记为不上报
//   4. describeShoot 的字段和 score.js 的 stats 口径对得上
//
// 用法：node tools/shoot-record-test.js
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

const shootRecords = require('../pkgShoot/utils/shoot-record.js')
const rhythmRecords = require('../pkgRhythm/utils/rhythm-record.js')
const fruitRecords = require('../pkgFruit/utils/fruit-record.js')

let passed = 0
let failed = 0
function check(name, cond, extra) {
  if (cond) { passed += 1; console.log('  ✓ ' + name) }
  else {
    failed += 1
    console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''))
  }
}

function loginAs(pid) {
  if (pid) storage['api_patient_v1'] = { id: pid, code: 'P-TEST' }
  else delete storage['api_patient_v1']
}

function mkRecord(id, extra) {
  return Object.assign({
    recordId: id,
    gameId: 'shoot',
    difficulty: 3,
    score: 1200,
    hits: 60,
    shots: 90,
    accuracy: 0.667,
    maxCombo: 15,
    zoneRate: 0.78,
    inZoneSec: 46.8,
    durationSec: 60,
    plannedSec: 60,
    completed: true,
    reason: '',
    dataSource: 'real',
    sensorInterrupted: false,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    configSnapshot: { fireRate: 3, hitRange: 40, keepRangeDeg: 8, comboWindowMs: 100 }
  }, extra || {})
}

console.log('[shoot-record] 射击训练记录')

// ---------------------------------------------------------------- 1
console.log('\n[1] 保存与读取')
loginAs('p_S')
const saved = shootRecords.save(mkRecord('rs_1'))
check('save 返回落库后的记录', !!saved && saved.recordId === 'rs_1')
check('落在 shoot_records_v1:p_S 键里',
  Array.isArray(storage['shoot_records_v1:p_S']) && storage['shoot_records_v1:p_S'].length === 1,
  Object.keys(storage).filter((k) => k.indexOf('records') >= 0))
check('带 owner 戳（防换账号后误传）', saved && saved.owner === 'p_S', saved && saved.owner)
check('list() 读得到', shootRecords.list().length === 1)
check('get() 按 id 读得到', !!shootRecords.get('rs_1'))

// 同一 recordId 不能覆盖（防重复结算）
shootRecords.save(mkRecord('rs_1', { score: 9999 }))
check('同 recordId 不会被覆盖', shootRecords.get('rs_1').score === 1200,
  shootRecords.get('rs_1').score)

// ---------------------------------------------------------------- 2
console.log('\n[2] 不串库')
shootRecords.save(mkRecord('rs_2'))
check('没有写进节奏库', rhythmRecords.list().length === 0)
check('没有写进接水果库', fruitRecords.list().length === 0)
check('射击库有 2 条', shootRecords.list().length === 2)

// ---------------------------------------------------------------- 3
console.log('\n[3] 账号隔离与模拟数据')
loginAs('p_T')
check('换账号后看不到别人的记录', shootRecords.list().length === 0)
shootRecords.save(mkRecord('rt_1', { dataSource: 'simulation' }))
check('模拟数据标记为 skipped（默认不上报）',
  shootRecords.get('rt_1').uploadState === 'skipped',
  shootRecords.get('rt_1').uploadState)
const st = shootRecords.stats()
check('stats 能区分待上报 / 已跳过', st.total === 1 && st.pending === 0, st)

// ---------------------------------------------------------------- 4
console.log('\n[4] describeShoot 字段口径')
const rows = shootRecords.describePayload(mkRecord('rx'))
const keys = rows.map((r) => r[0])
check('包含保持区占比', keys.indexOf('保持区占比') >= 0, keys)
check('包含命中 / 开火', keys.indexOf('命中 / 开火') >= 0)
check('包含最高连击', keys.indexOf('最高连击') >= 0)
check('包含数据来源', keys.indexOf('数据来源') >= 0)
const accRow = rows.find((r) => r[0] === '命中率')
check('命中率按 hits/shots 现算（60/90 = 67%）', accRow && accRow[1] === '67%', accRow && accRow[1])
const zoneRow = rows.find((r) => r[0] === '保持区占比')
check('保持区占比按 0~1 小数换算成百分比（0.78 → 78%）',
  zoneRow && zoneRow[1] === '78%', zoneRow && zoneRow[1])

// ---------------------------------------------------------------- 5
console.log('\n[5] 中途退出也要留数据')
loginAs('p_S')
const aborted = shootRecords.save(mkRecord('rs_3', { completed: false, reason: 'aborted', durationSec: 22 }))
check('aborted 记录能存', !!aborted && aborted.completed === false)
const abortRows = shootRecords.describePayload(aborted)
const statusRow = abortRows.find((r) => r[0] === '完成状态')
check('完成状态写明提前结束', statusRow && statusRow[1].indexOf('提前结束') >= 0,
  statusRow && statusRow[1])

// ---------------------------------------------------------------- 6
console.log('\n[6] buildFromState 的口径（纯函数，字段算错比存不下来更难发现）')
const mkState = (over) => Object.assign({
  elapsed: 60, duration: 60, ended: true, difficulty: 3
}, over || {})
const mkStats = (over) => Object.assign({
  score: 1200, hits: 60, shots: 90, accuracy: 67, maxCombo: 15, zoneRate: 78, inZoneSec: 46.8
}, over || {})

const full = shootRecords.buildFromState(mkState(), mkStats(), { fireRate: 3 }, { hasSignal: true, now: 1e12 })
check('满时长 → completed=true 且 reason 为空', full.completed === true && full.reason === '', full.reason)
check('zoneRate 78(整数) → 0.78(小数)', full.zoneRate === 0.78, full.zoneRate)
check('accuracy 67 → 0.67', full.accuracy === 0.67, full.accuracy)
check('真实传感器 → dataSource=real', full.dataSource === 'real', full.dataSource)
check('configSnapshot 原样带进记录', full.configSnapshot && full.configSnapshot.fireRate === 3)

const cut = shootRecords.buildFromState(mkState({ elapsed: 22, ended: false }), mkStats({ score: 300 }),
  {}, { reason: 'aborted', hasSignal: false, now: 1e12 })
check('中途退出 → completed=false 且 reason=aborted', cut.completed === false && cut.reason === 'aborted',
  cut.reason)
check('没有传感器帧 → dataSource=simulation（不上报）', cut.dataSource === 'simulation', cut.dataSource)
check('记录里带 plannedSec，能看出「计划 60 秒只做了 22 秒」',
  cut.plannedSec === 60 && cut.durationSec === 22, [cut.plannedSec, cut.durationSec])

const tooShort = shootRecords.buildFromState(mkState({ elapsed: 3 }), mkStats(), {}, { hasSignal: true })
check('不到 5 秒 → 不记账（误点开始）', tooShort === null, tooShort)

const unlimited = shootRecords.buildFromState(mkState({ duration: 0 }), mkStats(), {}, { hasSignal: true })
check('不限时模式（duration=0）也算完成', unlimited.completed === true)

console.log('\n----------------------------------------')
if (failed === 0) {
  console.log('结果：全部通过（' + passed + ' 项）')
} else {
  console.log('结果：' + failed + ' 项失败 / 共 ' + (passed + failed) + ' 项')
  process.exitCode = 1
}
