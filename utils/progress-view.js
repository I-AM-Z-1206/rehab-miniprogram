// ============================================================================
// utils/progress-view.js —— 进度数据的「展示层格式化」
// ----------------------------------------------------------------------------
// progress.js 负责算，这里负责把数字转成页面直接能渲染的字段。
// 抽出来是因为五张记录页顶部那一行 + 详情页的每一项，用的都是同一套规则：
//   · 稳定率算不出来 → 显示 '--'，不要显示 0%（0% 会被当成「表现极差」）
//   · 变化四舍五入到 0 个百分点 → 不显示，避免「+0」这种噪音
//   · 变化绝对值小于 FLAT_BAND → 当作持平
// 五处各写一遍必然有一天不一致，所以统一在这里。
// ============================================================================

const progress = require('./progress.js')

/**
 * 单个游戏的展示数据。
 * @param {string} gameId
 * @param {object} [opts] { pid }
 * @returns {{count:number, value:string, delta:string, tone:string, has:boolean}}
 */
function gameHeadline(gameId, opts) {
  const g = progress.gameOf(gameId, opts)
  const dlt = g.delta
  const rounded = dlt == null ? 0 : Math.round(Math.abs(dlt) * 100)
  let tone = 'none'
  if (dlt != null) {
    tone = Math.abs(dlt) < progress.FLAT_BAND ? 'flat' : (dlt > 0 ? 'up' : 'down')
  }
  return {
    has: g.count > 0,
    count: g.count,
    // 算不出来显示 '--'，绝不能是 0%
    value: g.stability == null ? '--' : Math.round(g.stability * 100) + '%',
    delta: (dlt == null || rounded === 0) ? '' : (dlt > 0 ? '+' : '-') + rounded,
    tone: tone
  }
}

module.exports = { gameHeadline }
