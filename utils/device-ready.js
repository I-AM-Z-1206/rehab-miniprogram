// ============================================================================
// utils/device-ready.js —— 判断「现在能不能直接开一局」
// ----------------------------------------------------------------------------
// 首页已经把训练前的两件事做完了：连接传感器、零点标定。进游戏时不该再问一遍。
//
// 但「连上了」不等于「可以开始」：
//   - 传感器可能连着，但零点还是上一次佩戴时标的（角度已经不对了）；
//   - 零点可能根本没标。
// 所以判据是**两件事都成立**：已连接 + 本次连接之后标定过。
//
// 为什么以 connectedAt 而不是自然日为准：零点是跟着"佩戴"走的，不是跟着
// "日期"走的。一天里摘下来再戴上三次，就要标三次。
//
// 只读，不改任何状态。各游戏页面用它决定「直接倒计时」还是「先去准备页」。
// ============================================================================

const zero = require('./zero.js')

/**
 * @param {object} ble WitBle 单例（需有 connectedId / connectedAt）
 * @returns {{connected:boolean, zeroOk:boolean, ready:boolean, reason:string}}
 */
function check(ble) {
  const connected = !!(ble && ble.connectedId)
  const linkedAt = (ble && ble.connectedAt) || 0

  let z = { set: false, at: 0 }
  try { z = zero.get() } catch (e) { /* 读不到就当没标 */ }

  // 本次连接之后标的才算数。connectedAt=0 说明订阅还没完成，
  // 此时数据还没开始推，也不算就绪。
  const zeroOk = !!(z.set && z.at && linkedAt && z.at >= linkedAt)

  let reason = ''
  if (!connected) reason = '未连接传感器'
  else if (!z.set) reason = '还没标定零点'
  else if (!linkedAt) reason = '正在连接传感器'
  else if (!zeroOk) reason = '传感器重新佩戴过，需要重新标定'

  return { connected: connected, zeroOk: zeroOk, ready: connected && zeroOk, reason: reason }
}

module.exports = { check: check }
