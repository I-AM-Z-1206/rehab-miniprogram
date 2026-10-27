// ============================================================================
// utils/rhythm-record.js —— 「节奏训练」训练记录库（独立分库）
// ----------------------------------------------------------------------------
// 复用 utils/training-record.js 的工厂，存储键与走钢丝 / 接水果互不影响：
//   rhythm_records_v1     记录列表
//   rhythm_upload_cfg_v1  上报地址与令牌（不硬编码后端）
// 隐私：只记录训练相关字段，不含姓名/证件/联系方式；上报前必须显式同意。
// ============================================================================

const base = require('./training-record.js')

function fmtPct(v) {
  return v === null || v === undefined ? '暂无数据' : Math.round(v * 100) + '%'
}

/** 逐项列出"将要发送什么、用来干什么"（隐私确认弹窗用） */
function describeRhythm(record) {
  const rows = [
    ['昵称', record.nickname || '体验用户'],
    ['游戏', '节奏训练 · ' + (record.songName || record.songId || '未命名曲目')],
    ['BPM', String(record.bpm || '-')],
    ['难度', '第 ' + (record.difficulty || '-') + ' 档'],
    ['得分', String(record.score || 0)],
    ['判定次数', 'PERFECT ' + (record.perfect || 0) + ' / GREAT ' + (record.great || 0) +
      ' / GOOD ' + (record.good || 0) + ' / MISS ' + (record.miss || 0)],
    ['最高连击', '×' + (record.comboMax || 0)],
    ['左 / 中 / 右命中', (record.leftHitCount || 0) + ' / ' + (record.centerHitCount || 0) +
      ' / ' + (record.rightHitCount || 0)],
    ['节奏准确率', fmtPct(record.rhythmAccuracy)],
    ['方向准确率', fmtPct(record.directionAccuracy)],
    ['综合命中率', fmtPct(record.overallHitRate)],
    ['训练时长', (record.durationSec || 0) + ' 秒'],
    ['音画补偿', (record.syncOffsetMs || 0) + ' ms'],
    ['数据来源', record.dataSource === 'simulation' ? '模拟数据' : '真实传感器']
  ]
  if (record.interrupted) {
    rows.push(['数据中断', (record.interruptedSec || 0) + ' 秒 / ' + (record.interruptedCount || 0) + ' 次'])
  }
  if (record.dataSource === 'simulation') rows.push(['提示', '模拟数据默认不上报'])
  return rows
}

const store = base.createRecordStore({
  storageKey: 'rhythm_records_v1',
  uploadKey: 'rhythm_upload_cfg_v1',
  describe: describeRhythm
})

module.exports = Object.assign({
  describeRhythm,
  formatTime: base.formatTime,
  formatDuration: base.formatDuration,
  makeId: base.makeId
}, store)
