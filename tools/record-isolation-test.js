// ============================================================================
// tools/record-isolation-test.js —— 训练记录的账号隔离
// ----------------------------------------------------------------------------
// 复现并锁定这个 bug：本地记录原本用固定 storage 键（wire_records_v1），
// 同一台设备换人登录后，新账号会看到上一个人的记录，甚至把它们用自己
// 的身份上报。
//
// 断言三件事：
//   1. 不同 patientId 的记录存在不同的 storage 键里，互不可见
//   2. 每条记录带 owner 戳，owner 不匹配时拒绝上报（纵深防御）
//   3. 旧版本固定键 / 登录前的 anon 记录会被归到首次登录的账号名下
//
// 用法：node tools/record-isolation-test.js
// ============================================================================

/* eslint-disable no-console */

const storage = {}
let requestCalled = 0

global.wx = {
  getStorageSync: (k) => (storage[k] === undefined ? '' : storage[k]),
  setStorageSync: (k, v) => { storage[k] = v },
  removeStorageSync: (k) => { delete storage[k] },
  // 让 canNetwork() 返回 true，这样才能测到 owner 校验那一步；
  // 真正需要发请求时立刻 fail，避免 Promise 一直挂着
  request: (opts) => {
    requestCalled += 1
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

const records = require('../utils/training-record.js')

let passed = 0
let failed = 0
function check(name, cond, extra) {
  if (cond) { passed += 1; console.log('  ✓ ' + name) }
  else {
    failed += 1
    console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''))
  }
}

/** 模拟"当前登录的是谁"：auth.patientId() 读的就是这个 storage 键 */
function loginAs(pid) {
  if (pid) storage['api_patient_v1'] = { id: pid, code: 'P-TEST' }
  else delete storage['api_patient_v1']
}

function mkRecord(id, extra) {
  return Object.assign({
    recordId: id,
    gameId: 'wire',
    startedAt: Date.now(),
    durationSec: 60,
    score: 100,
    accuracy: 0.8,
    dataSource: 'real'
  }, extra || {})
}

;(async () => {
  console.log('[isolation] 训练记录账号隔离')

  // ---------------------------------------------------------------- 场景 1
  console.log('\n[1] 同一台设备，账号 A 训练两局后换 B 登录')
  loginAs('p_A')
  records.save(mkRecord('rA_1'))
  records.save(mkRecord('rA_2'))

  check('A 的记录写在 wire_records_v1:p_A', Array.isArray(storage['wire_records_v1:p_A']) &&
    storage['wire_records_v1:p_A'].length === 2, Object.keys(storage))
  check('不再写入旧的固定键 wire_records_v1', storage['wire_records_v1'] === undefined)
  check('A 记录带 owner 戳', storage['wire_records_v1:p_A'][0].owner === 'p_A',
    storage['wire_records_v1:p_A'][0].owner)

  loginAs('p_B')
  check('B 登录后看不到 A 的记录', records.list().length === 0, records.list().length)
  check('B 的统计从 0 开始', records.stats().total === 0, records.stats())

  records.save(mkRecord('rB_1'))
  check('B 的记录落在自己的键里', storage['wire_records_v1:p_B'].length === 1)
  check('B 的记录 owner 是 p_B', storage['wire_records_v1:p_B'][0].owner === 'p_B')

  loginAs('p_A')
  check('切回 A，自己的 2 条还在', records.list().length === 2, records.list().length)
  check('A 看不到 B 的记录', records.list().every((r) => r.owner === 'p_A'))

  // ---------------------------------------------------------------- 场景 2
  console.log('\n[2] 归属不匹配时拒绝上报')
  const ownKey = 'wire_records_v1:p_A'
  storage[ownKey] = storage[ownKey].concat([{
    recordId: 'rX_1',
    gameId: 'wire',
    startedAt: Date.now(),
    durationSec: 60,
    dataSource: 'real',
    owner: 'p_OTHER',
    uploadState: 'local',
    retry: 0
  }])
  const before = requestCalled
  const res = await records.upload('rX_1', { consent: true })
  check('别人的记录 → state=foreign', res.state === 'foreign', res)
  check('被拦截时没有发出网络请求', requestCalled === before, requestCalled)

  const res2 = await records.upload('rA_1', { consent: true })
  check('自己的记录不会被误判', res2.state !== 'foreign', res2)

  // ---------------------------------------------------------------- 场景 3
  console.log('\n[3] 旧版本固定键与未登录记录归到当前账号')
  loginAs(null)
  storage['wire_records_v1'] = [{
    recordId: 'legacy_1', gameId: 'wire', startedAt: Date.now(),
    durationSec: 60, dataSource: 'real', uploadState: 'uploaded'
  }]
  storage['wire_records_v1:anon'] = [{
    recordId: 'anon_1', gameId: 'wire', startedAt: Date.now() - 1000,
    durationSec: 60, dataSource: 'real', uploadState: 'local', retry: 0
  }]

  loginAs('p_C')
  const moved = records.migrateStores()
  check('迁移了 2 条', moved === 2, moved)
  check('旧固定键已清空', Array.isArray(storage['wire_records_v1']) &&
    storage['wire_records_v1'].length === 0)
  check('anon 键已清空', Array.isArray(storage['wire_records_v1:anon']) &&
    storage['wire_records_v1:anon'].length === 0)

  const cList = records.list()
  check('p_C 能看到迁移过来的记录', cList.length === 2, cList.length)
  check('迁移的记录补上了 owner', cList.every((r) => r.owner === 'p_C'),
    cList.map((r) => r.owner))
  check('将来不会重复迁移', records.migrateStores() === 0)

  console.log('\n' + '─'.repeat(44))
  console.log('结果：' + passed + ' 通过，' + failed + ' 失败')
  process.exit(failed ? 1 : 0)
})()
