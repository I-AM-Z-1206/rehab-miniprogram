// 验证 pages/jump/jump.js 购买流程的 mock 脚本
// 模拟 wx API + Page，跑完整购买链路，输出断言结果
'use strict'

const JUMP_JS = 'E:/demo/pages/jump/jump.js'

// ---------- mock wx ----------
const storage = {}
const toasts = []
global.wx = {
  getStorageSync: (k) => storage[k],
  setStorageSync: (k, v) => { storage[k] = JSON.parse(JSON.stringify(v)) },
  onAccelerometerChange: () => {},
  offAccelerometerChange: () => {},
  startAccelerometer: (o) => { if (o && o.success) o.success() },
  stopAccelerometer: (o) => { if (o && o.complete) o.complete() },
  showToast: (o) => toasts.push(o.title || ''),
  showModal: () => {}
}

// ---------- 捕获 Page 配置 ----------
let cfg = null
global.Page = (c) => { cfg = c }
require(JUMP_JS)
if (!cfg) { console.error('FAIL: Page 未被调用'); process.exit(1) }

// ---------- 构造页面实例 ----------
function makeInst() {
  const inst = {}
  for (const k of Object.keys(cfg)) inst[k] = cfg[k]
  inst.data = JSON.parse(JSON.stringify(cfg.data))
  inst.setData = function (patch) { Object.assign(this.data, JSON.parse(JSON.stringify(patch))) }
  inst.starting = false
  inst.lastJumpAt = 0
  inst.animIndex = 0
  inst.listenerBound = false
  inst.resetTimer = null
  inst.coinPopTimer = null
  inst.comboTimer = null
  return inst
}

let pass = 0, fail = 0
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS:', name) }
  else { fail++; console.log('  FAIL:', name, '=>', detail) }
}
// 每个场景独立存档，避免状态污染
function freshStorage() { Object.keys(storage).forEach(k => delete storage[k]) }

// ---------- 场景 1：金币不足不能买 ----------
{
  console.log('\n[场景1] 金币不足')
  freshStorage()
  const inst = makeInst()
  inst.loadGame()                       // coins = 0
  inst.onSelectOutfit({ currentTarget: { dataset: { id: 'red' } } })  // red 20 金币
  assert('弹出金币不足提示', toasts.some(t => t.indexOf('金币不足') !== -1), toasts.slice(-1))
  assert('未扣费未解锁', inst.data.coins === 0 && inst.data.unlocked.indexOf('red') === -1 && inst.data.equippedId === 'default', JSON.stringify(inst.data))
}

// ---------- 场景 2：金币正好等于价格能买 ----------
{
  console.log('\n[场景2] 金币正好够')
  freshStorage()
  const inst = makeInst()
  inst.loadGame()
  inst.setData({ coins: 20 })
  toasts.length = 0
  inst.onSelectOutfit({ currentTarget: { dataset: { id: 'red' } } })
  assert('购买成功（无金币不足提示）', !toasts.some(t => t.indexOf('金币不足') !== -1), toasts.slice(-1))
  assert('扣费 20 → 0', inst.data.coins === 0, 'coins=' + inst.data.coins)
  assert('解锁 red', inst.data.unlocked.indexOf('red') !== -1, JSON.stringify(inst.data.unlocked))
  assert('自动穿上 red', inst.data.equippedId === 'red', 'equipped=' + inst.data.equippedId)
  assert('颜色更新为烈焰红', inst.data.colors.body === '#e64340', JSON.stringify(inst.data.colors))
  const item = inst.data.wardrobe.find(w => w.id === 'red')
  assert('衣橱列表标记已拥有且穿着', item && item.owned && item.equipped, JSON.stringify(item))
}

// ---------- 场景 3：存档后重新加载能恢复 ----------
{
  console.log('\n[场景3] 存档/读档')
  freshStorage()
  const inst = makeInst()
  inst.loadGame()
  inst.setData({ coins: 100 })
  inst.onSelectOutfit({ currentTarget: { dataset: { id: 'gold' } } })  // 200 买不起 → 提示
  assert('金币 100 买不起黄金甲', toasts.some(t => t.indexOf('金币不足') !== -1) && inst.data.equippedId === 'default', toasts.slice(-1))
  toasts.length = 0
  inst.setData({ coins: 200 })
  inst.onSelectOutfit({ currentTarget: { dataset: { id: 'gold' } } })
  assert('200 购买黄金甲成功', inst.data.equippedId === 'gold' && inst.data.unlocked.indexOf('gold') !== -1, JSON.stringify(inst.data))
  inst.saveGame()
  const inst2 = makeInst()
  inst2.loadGame()
  assert('重载后金币恢复 0', inst2.data.coins === 0, 'coins=' + inst2.data.coins)
  assert('重载后黄金甲仍解锁', inst2.data.unlocked.indexOf('gold') !== -1, JSON.stringify(inst2.data.unlocked))
  assert('重载后仍穿着黄金甲', inst2.data.equippedId === 'gold', 'equipped=' + inst2.data.equippedId)
}

// ---------- 场景 4：已拥有再点=换装不扣费 ----------
{
  console.log('\n[场景4] 已拥有换装')
  freshStorage()
  const inst = makeInst()
  inst.loadGame()
  inst.setData({ coins: 60, unlocked: ['default', 'blue'] })
  toasts.length = 0
  inst.onSelectOutfit({ currentTarget: { dataset: { id: 'blue' } } })
  assert('换装不扣费', inst.data.coins === 60, 'coins=' + inst.data.coins)
  assert('穿上 blue', inst.data.equippedId === 'blue', 'equipped=' + inst.data.equippedId)
  assert('颜色更新为海洋蓝', inst.data.colors.body === '#10aeff', JSON.stringify(inst.data.colors))
}

// ---------- 场景 5：连击金币结算（jump 内 combo 逻辑） ----------
{
  console.log('\n[场景5] 金币结算 sanity')
  freshStorage()
  const inst = makeInst()
  inst.loadGame()
  inst.onManualJump()                    // 第一次
  inst.onManualJump()                    // 立刻第二次 → combo+1
  const coinsAfter2 = inst.data.coins
  assert('两次连跳金币 = 1 + 2 = 3', coinsAfter2 === 3, 'coins=' + coinsAfter2)
}

// ---------- 场景 6：tryJump 冷却拦截 + 连击基于真实间隔 ----------
{
  console.log('\n[场景6] tryJump 冷却与连击')
  freshStorage()
  const inst = makeInst()
  inst.loadGame()
  inst.tryJump()                          // lastJumpAt 初始 0（很久以前）→ 冷却通过
  assert('第一次跳跃 +1 金币', inst.data.coins === 1, 'coins=' + inst.data.coins)
  inst.tryJump()                          // 立即再触发 → 冷却期内拦截
  assert('冷却期内不重复触发', inst.data.coins === 1, 'coins=' + inst.data.coins)
  inst.lastJumpAt = Date.now() - 900      // 模拟 900ms 后的下一次晃动
  inst.tryJump()
  assert('间隔 900ms 连击 → +2 金币', inst.data.coins === 3, 'coins=' + inst.data.coins)
  inst.lastJumpAt = Date.now() - 2100     // 模拟间隔超过连击窗口
  inst.tryJump()
  assert('间隔 >2s 连击重置 → +1 金币', inst.data.coins === 4, 'coins=' + inst.data.coins)
}

console.log('\n================ 结果: pass=' + pass + ' fail=' + fail + ' ================')
process.exit(fail ? 1 : 0)