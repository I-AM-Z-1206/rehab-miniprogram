// ============================================================================
// pkgShoot/utils/shoot-record.js —— 「射击」训练记录
// ----------------------------------------------------------------------------
// 为什么单独一份：射击是五个游戏里唯一没有记录模块的。其它四个
// （接水果 / 走钢丝 / 节奏 / 赛车）都能进库、能上报、有记录页，
// 只有射击玩完就没了 —— 患者练 20 分钟，治疗师那边是空白。
//
// 与其它游戏分库（shoot_records_v1），互不覆盖。字段口径保持一致：
// 得分 / 命中 / 开火 / 命中率 / 最高连击 / 保持区占比 / 时长 / 数据来源 / 完成状态。
//
// 射击没有「漏接」概念（子弹是自动连发的），所以用 zoneRate（身体在保持区内的
// 时间占比）作为核心质量指标 —— 它才是这个游戏真正训练的东西。
// ============================================================================

const base = require('../../utils/training-record.js')

// 不到 5 秒的局不记：多半是误点「开始」又立刻退出
const MIN_ROUND_SEC = 5

function describeShoot(record) {
  const shots = record.shots || 0
  const hits = record.hits || 0
  const acc = shots > 0 ? Math.round((hits / shots) * 100) : 0
  const rows = [
    ['昵称', record.nickname || '体验用户'],
    ['游戏', '射击 · 点亮城市'],
    ['难度', '第 ' + record.difficulty + ' 档'],
    ['得分', String(record.score || 0)],
    ['命中 / 开火', hits + ' / ' + shots],
    ['命中率', acc + '%'],
    ['保持区占比', Math.round((record.zoneRate || 0) * 100) + '%'],
    ['最高连击', 'x' + (record.maxCombo || 0)],
    ['训练时长', base.formatDuration(record.durationSec)],
    ['完成状态', record.completed ? '完成' : ('提前结束（' + (record.reason || '未完成') + '）')],
    ['数据来源', record.dataSource === 'simulation' ? '模拟数据' : '真实传感器']
  ]
  if (record.dataSource === 'simulation') rows.push(['提示', '模拟数据默认不上报'])
  return rows
}

/**
 * 由引擎状态生成一条训练记录。
 *
 * 纯函数，不碰 wx / engine 实例 —— 页面只负责把 state 递进来。
 * 这么拆是因为「字段算错」比「存不下来」更难发现：记录能存、列表能看，
 * 但 zoneRate 少乘 100 或者 completed 判反了，几个月后才有人发现。
 * 抽出来之后 tools/shoot-record-test.js 可以直接喂状态验口径。
 *
 * @param {object} st        engine.getState()
 * @param {object} stats     engine.score.stats()（0~100 的整数口径）
 * @param {object} snapshot  治疗师参数快照
 * @param {object} [opts]    { reason, hasSignal, stale, now, recordId }
 * @returns {object|null}    不到 5 秒的局返回 null（多半是误点开始）
 */
function buildFromState(st, stats, snapshot, opts) {
  const o = opts || {}
  const s = stats || {}
  const elapsed = Number(st && st.elapsed) || 0
  if (elapsed < MIN_ROUND_SEC) return null
  const planned = Number(st && st.duration) || 0
  const completed = !!(st && st.ended) && (planned <= 0 || elapsed >= planned - 1)
  const now = Number(o.now) || Date.now()
  return {
    recordId: o.recordId || base.makeId(),
    gameId: 'shoot',
    difficulty: Number(st && st.difficulty) || 3,
    score: s.score || 0,
    hits: s.hits || 0,
    shots: s.shots || 0,
    // 统一成 0~1 小数，和另外四个游戏一致（score.js 内部是 0~100 整数）
    accuracy: (s.accuracy || 0) / 100,
    maxCombo: s.maxCombo || 0,
    // 射击没有「漏接」，质量指标是「身体在保持区里的时间占比」
    zoneRate: (s.zoneRate || 0) / 100,
    inZoneSec: Math.round((s.inZoneSec || 0) * 10) / 10,
    durationSec: Math.round(elapsed * 10) / 10,
    plannedSec: planned,
    completed: completed,
    reason: completed ? '' : (o.reason || 'aborted'),
    // 全程没收到真实传感器帧 = 触屏模拟，这类数据默认不上报
    dataSource: o.hasSignal ? 'real' : 'simulation',
    sensorInterrupted: !!o.stale,
    startedAt: new Date(now - elapsed * 1000).toISOString(),
    endedAt: new Date(now).toISOString(),
    configSnapshot: snapshot || {}
  }
}

const store = base.createRecordStore({
  storageKey: 'shoot_records_v1',
  uploadKey: 'shoot_upload_cfg_v1',
  describe: describeShoot
})

module.exports = Object.assign({
  describeShoot: describeShoot,
  buildFromState: buildFromState,
  MIN_ROUND_SEC: MIN_ROUND_SEC,
  formatTime: base.formatTime,
  formatDuration: base.formatDuration,
  makeId: base.makeId
}, store)
