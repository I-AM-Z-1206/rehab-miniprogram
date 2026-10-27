// ============================================================================
// utils/fruit-record.js —— 「接水果」训练记录（与走钢丝分库，互不覆盖）
// ----------------------------------------------------------------------------
// 记录字段（需求第 13 节）：昵称 / gameId=fruit / 场景 / 难度 / 活动范围配置 /
// 得分 / 接住数 / 漏接数 / 最高连击 / 时长 / 轨迹摘要 / 时间 / 数据来源 /
// 是否完成 / 传感器中断情况。
//
// 上传默认关闭，地址由管理员在「接水果 · 训练设置」写入，代码里没有硬编码地址。
// ============================================================================

const base = require('./training-record.js')

function describeFruit(record) {
  const holdRate = record.holdRate
  const rows = [
    ['昵称', record.nickname || '体验用户'],
    ['游戏', '接水果 · ' + (record.scene || '果园场景')],
    ['难度', '第 ' + record.difficulty + ' 档'],
    ['得分', String(record.score)],
    ['接住 / 漏接', (record.hits || 0) + ' / ' + (record.misses || 0)],
    ['接取成功率', Math.round((record.accuracy || 0) * 100) + '%'],
    ['姿态稳定率', holdRate === undefined || holdRate === null ? '暂无数据' : Math.round(holdRate * 100) + '%'],
    ['最长连续稳定', (record.holdBestSec || 0) + ' 秒'],
    ['平均偏离 / 稳定容差', (record.deviationAvgDeg || 0) + '° / ±' + (record.holdToleranceDeg || 0) + '°'],
    ['偏离超限次数', String(record.holdOutCount || 0)],
    ['最高连击', 'x' + (record.comboMax || 0)],
    ['训练时长', base.formatDuration(record.durationSec)],
    ['轨迹长度（姿态代理）', String(record.pathLength || 0)],
    ['数据来源', record.dataSource === 'simulation' ? '模拟数据' : '真实传感器']
  ]
  if (record.dataSource === 'simulation') rows.push(['提示', '模拟数据默认不上报'])
  return rows
}

const store = base.createRecordStore({
  storageKey: 'fruit_records_v1',
  uploadKey: 'fruit_upload_cfg_v1',
  describe: describeFruit
})

// 记录页要用到时间格式化，这些工具函数在工厂返回值里没有，必须显式补上
module.exports = Object.assign({
  describeFruit: describeFruit,
  formatTime: base.formatTime,
  formatDuration: base.formatDuration,
  makeId: base.makeId
}, store)
