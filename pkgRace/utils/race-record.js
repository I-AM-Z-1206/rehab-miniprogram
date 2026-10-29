// ============================================================================
// pkgRace/utils/race-record.js —— 「赛车」训练记录
// ----------------------------------------------------------------------------
// 赛车之前**完全没有记录上报**：跑完一局，分数只留在引擎内存和本地排行榜里，
// 治疗师那边一条数据都收不到。家用场景下这等于这局训练白做。
//
// 这里复用 utils/training-record.js 的工厂，存储键与其它四个游戏互不覆盖，
// 上传策略也一致：默认静默上报（首次已授权过），失败进队列由 flushAll 补传。
// ============================================================================

const base = require('../../utils/training-record.js')

function describeRace(record) {
  const rows = [
    ['昵称', record.nickname || '体验用户'],
    ['游戏', '赛车 · ' + (record.levelName || ('第 ' + record.difficulty + ' 档'))],
    ['得分', String(record.score || 0)],
    ['排名', record.rank === undefined || record.rank === null ? '—' : '#' + record.rank],
    ['最高连击', 'x' + (record.combo || 0)],
    ['完美闪避', String(record.perfect || 0)],
    ['碰撞次数', String(record.hits || 0)],
    ['能量环', String(record.rings || 0)],
    ['稳定率', Math.round((record.accuracy || 0)) + '%'],
    ['行驶距离', (record.distance || 0) + ' km'],
    ['姿态稳定时长', (record.stableTime || 0) + ' 秒'],
    ['消耗', (record.calories || 0) + ' kcal'],
    ['训练时长', base.formatDuration(record.durationSec)],
    ['数据来源', record.dataSource === 'simulation' ? '模拟数据' : '真实传感器']
  ]
  if (record.dataSource === 'simulation') rows.push(['提示', '模拟数据默认不上报'])
  return rows
}

const store = base.createRecordStore({
  storageKey: 'race_records_v1',
  uploadKey: 'race_upload_cfg_v1',
  describe: describeRace
})

module.exports = Object.assign({
  describeRace: describeRace,
  formatTime: base.formatTime,
  formatDuration: base.formatDuration,
  makeId: base.makeId
}, store)
