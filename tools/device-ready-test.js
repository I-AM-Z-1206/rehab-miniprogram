// ============================================================================
// tools/device-ready-test.js —— 「现在能不能直接开一局」的判据
// ----------------------------------------------------------------------------
// 这个判据错了不会报错，只会**默默退回准备页**（患者又要多点一次），
// 或者更糟：零点已经失效却放行，整局判定全偏。所以四种组合都要钉住。
//
// 用法：node tools/device-ready-test.js
// ============================================================================

/* eslint-disable no-console */

const storage = {}

global.wx = {
  getStorageSync: (k) => (storage[k] === undefined ? '' : storage[k]),
  setStorageSync: (k, v) => { storage[k] = v },
  removeStorageSync: (k) => { delete storage[k] }
}

const zero = require('../utils/zero.js')
const deviceReady = require('../utils/device-ready.js')

let passed = 0
let failed = 0

function ok(cond, name, extra) {
  if (cond) { passed += 1; console.log('  ok  ' + name) }
  else { failed += 1; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')) }
}

const T0 = 1700000000000

/** 直接写 storage 伪造零点（绕过 zero.set 的 Date.now()） */
function fakeZero(at, set) {
  storage['wt_zero_v1'] = { roll: 0, pitch: 0, set: set !== false, at: at || 0 }
  // zero.js 的 load() 有内存缓存，不重新读的话上面这行根本不生效
  zero.reload()
}

function link(connectedId, connectedAt) {
  return { connectedId: connectedId || '', connectedAt: connectedAt || 0 }
}

// ---------------------------------------------------------------- 1
console.log('\n[1] 未连接')
fakeZero(0, false)
let r = deviceReady.check(link('', 0))
ok(r.ready === false, '没连接 → 不能直接开始')
ok(r.reason === '未连接传感器', '原因写「未连接传感器」', r.reason)
ok(r.connected === false, 'connected=false')

// ---------------------------------------------------------------- 2
console.log('\n[2] 连上了但从来没标定')
fakeZero(0, false)
r = deviceReady.check(link('AA:BB', T0))
ok(r.ready === false, '没有零点 → 不能直接开始')
ok(r.reason === '还没标定零点', '原因写「还没标定零点」', r.reason)

// ---------------------------------------------------------------- 3
console.log('\n[3] 零点比本次连接早（摘下来又戴上）')
// 这是最要紧的一条：传感器重新戴过，佩戴角度变了，旧零点必须作废。
// 只判断 set=true 就会放行，患者整局判定全偏还不知道为什么。
fakeZero(T0 - 3600 * 1000, true)
r = deviceReady.check(link('AA:BB', T0))
ok(r.ready === false, '旧零点不生效')
ok(r.reason.indexOf('重新佩戴') >= 0, '原因说明「传感器重新佩戴过」', r.reason)
ok(r.zeroOk === false, 'zeroOk=false')

// ---------------------------------------------------------------- 4
console.log('\n[4] 本次连接之后标定过')
fakeZero(T0 + 5000, true)
r = deviceReady.check(link('AA:BB', T0))
ok(r.ready === true, '可以直接开始')
ok(r.connected === true && r.zeroOk === true, 'connected / zeroOk 都为真')
ok(r.reason === '', '就绪时不给原因文案', r.reason)

// ---------------------------------------------------------------- 5
console.log('\n[5] 连接了但订阅还没完成（connectedAt=0）')
// 此时数据还没开始推，放行会让 startCountdown 报「没有可用的传感器数据」。
fakeZero(T0, true)
r = deviceReady.check(link('AA:BB', 0))
ok(r.ready === false, '订阅未完成 → 不直接开始')
ok(r.reason === '正在连接传感器', '原因写「正在连接传感器」', r.reason)

// ---------------------------------------------------------------- 6
console.log('\n[6] 边界：零点与连接同一毫秒')
fakeZero(T0, true)
r = deviceReady.check(link('AA:BB', T0))
ok(r.ready === true, '同一时刻标定算数（>= 不是 >）')

// ---------------------------------------------------------------- 7
console.log('\n[7] 传空对象不崩')
r = deviceReady.check(null)
ok(r.ready === false && typeof r.reason === 'string', 'ble 为 null 时安全返回')

// ---------------------------------------------------------------- 8
console.log('\n[8] 三个游戏页的「开始」不再绕准备页')
// 这条是防止回退：prepare() 一旦被接回去，患者又要「点开始 → 停在准备页
// → 再点进入游戏」，白做一次。源码断言比跑一遍页面便宜得多。
const fs = require('fs')
const path = require('path')
;[
  ['pkgFruit/pages/fruit/fruit.js', '接水果'],
  ['pkgWire/pages/wire/wire.js', '走钢丝'],
  ['pkgRhythm/pages/rhythm/rhythm.js', '节奏']
].forEach(([rel, name]) => {
  const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
  ok(/case 'start':[\s\S]{0,160}this\.beginGame\(\)/.test(src),
    name + '：点开始走 beginGame（先判就绪）')
  ok(!/case 'start':\s*\n\s*engine\.prepare\(\)/.test(src),
    name + '：点开始不再直接进准备页')
  ok(/deviceReady\.check\(/.test(src),
    name + '：用了统一的就绪判据')
  ok(/cancelText: '用模拟数据'/.test(src),
    name + '：未就绪时保留模拟数据出口')
})

console.log('\n----------------------------------------')
if (failed === 0) {
  console.log('结果：全部通过（' + passed + ' 项）')
} else {
  console.log('结果：' + failed + ' 项失败 / 共 ' + (passed + failed) + ' 项')
  process.exitCode = 1
}
