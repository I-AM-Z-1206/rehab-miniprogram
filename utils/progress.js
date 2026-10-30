// ============================================================================
// utils/progress.js —— 患者端「我的进步」聚合层
// ----------------------------------------------------------------------------
// 解决一件事：**患者看不见自己在变好。**
//
// 原来四个（现在五个）游戏各自有记录页，但都是「单局列表」——练完一局
// 看到分数，然后就没了。患者无法回答「我这周比上周强了吗」。
//
// 这里做的是把五个游戏的记录归一成一个可比的指标：**控制稳定率**。
//
// 为什么不用分数：
//   分数受难度影响。这周难度从第 3 档升到第 4 档，分数必然掉，
//   但能力其实提升了。患者看到「我变差了」会挫败，然后不练了 ——
//   这是依从性最容易崩的地方。
//
// 为什么五个游戏能归一：
//   玩法完全不同，但测的是同一件事：**身体能不能稳定待在目标范围内**。
//     接水果 holdRate / 走钢丝 1-offSec占比 / 节奏 directionAccuracy
//     赛车 stableTime占比 / 射击 zoneRate
//   难度升了还能保持，才是真的变强。
//
// 约束：主包不能 require 分包（小程序规则），所以这里不 import 各游戏的
// record 模块，而是直接按约定好的 storage 键读原始数组。
// **键名必须和各 record 模块的 storageKey 一致** —— tools/progress-test.js
// 会真的写一条记录进去、验证两边对得上。
// ============================================================================

const auth = require('./auth.js')

// 五个游戏的记录库。key 与各 record 模块的 storageKey 一一对应。
const STORES = [
  { gameId: 'fruit', key: 'fruit_records_v1', name: '接水果' },
  { gameId: 'wire', key: 'wire_records_v1', name: '走钢丝' },
  { gameId: 'rhythm', key: 'rhythm_records_v1', name: '节奏训练' },
  { gameId: 'race', key: 'race_records_v1', name: '赛车' },
  { gameId: 'shoot', key: 'shoot_records_v1', name: '射击' }
]

const DAY = 86400000
// 少于这个次数不显示趋势：一周三四次训练，一两次的波动会被当成趋势
const MIN_SAMPLES = 3
// 变化小于 3 个百分点算「基本持平」，不画箭头
const FLAT_BAND = 0.03

function clamp01(v) {
  const n = Number(v)
  if (!isFinite(n)) return null
  return n < 0 ? 0 : (n > 1 ? 1 : n)
}

/** 记录的开始时间（毫秒）。兼容 ISO 字符串与时间戳两种存法 */
function timeOf(r) {
  const v = r && (r.startedAt || r.endedAt)
  if (typeof v === 'number') return v
  const t = Date.parse(v)
  return isFinite(t) ? t : 0
}

/** 一局时长（秒），用于加权：60 秒的局和 120 秒的局不该等权 */
function secondsOf(r) {
  const d = Number(r && (r.durationSec || r.duration))
  return isFinite(d) && d > 0 ? d : 60
}

/**
 * 单局的控制稳定率（0~1）。算不出来的返回 null，调用方跳过。
 * 五个游戏各自的口径见文件头。
 */
function stabilityOf(r) {
  if (!r) return null
  switch (r.gameId) {
    case 'fruit':
      return clamp01(r.holdRate)
    case 'wire': {
      const d = secondsOf(r)
      return clamp01(1 - (Number(r.offSec) || 0) / d)
    }
    case 'rhythm':
      return clamp01(r.directionAccuracy)
    case 'race': {
      const d = secondsOf(r)
      return clamp01((Number(r.stableTime) || 0) / d)
    }
    case 'shoot':
      return clamp01(r.zoneRate)
    default:
      return null
  }
}

/** 按时长加权的平均稳定率；一项都算不出来时返回 null */
function weightedStability(items) {
  let weight = 0
  let sum = 0
  for (let i = 0; i < items.length; i++) {
    const s = items[i].stability
    if (s == null) continue
    const w = secondsOf(items[i].raw)
    weight += w
    sum += s * w
  }
  return weight > 0 ? sum / weight : null
}

/** 本周一 00:00 */
function weekStart(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - (dow - 1))
  return d.getTime()
}

/** 读取某个账号的全部记录（按时间升序） */
function readAll(pid) {
  const id = pid || auth.patientId() || 'anon'
  const out = []
  for (let i = 0; i < STORES.length; i++) {
    const s = STORES[i]
    let list = null
    try {
      list = wx.getStorageSync(s.key + ':' + id)
    } catch (e) { /* 忽略读取失败，当作没有记录 */ }
    if (!Array.isArray(list)) continue
    for (let j = 0; j < list.length; j++) {
      const r = list[j]
      if (!r) continue
      // 模拟数据（没有真实传感器帧）不进统计：那不是患者做出来的
      if (r.dataSource === 'simulation') continue
      out.push({ raw: r, gameId: s.gameId, gameName: s.name, at: timeOf(r), stability: stabilityOf(r) })
    }
  }
  out.sort((a, b) => a.at - b.at)
  return out
}

/** 把一批记录压成一个小结 */
function bucket(items) {
  const days = {}
  let minutes = 0
  for (let i = 0; i < items.length; i++) {
    const d = new Date(items[i].at)
    days[d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate()] = true
    minutes += secondsOf(items[i].raw)
  }
  return {
    count: items.length,
    days: Object.keys(days).length,
    minutes: Math.round(minutes / 60),
    stability: weightedStability(items)
  }
}

/** 两个百分比之间的差（百分点），任一侧缺失返回 null */
function deltaOf(cur, prev) {
  if (cur == null || prev == null) return null
  return cur - prev
}

/**
 * 一个账号的完整进步摘要。
 * @param {object} [opts] { now, pid }
 */
function summary(opts) {
  const o = opts || {}
  const now = Number(o.now) || Date.now()
  const items = readAll(o.pid)
  const ws = weekStart(now)
  const thisWeekItems = items.filter((it) => it.at >= ws && it.at <= now)
  const lastWeekItems = items.filter((it) => it.at >= ws - 7 * DAY && it.at < ws)

  const thisWeek = bucket(thisWeekItems)
  const lastWeek = bucket(lastWeekItems)

  // 逐游戏：取最近 5 次算一个「近期水平」，和更早的 5 次比
  const byGame = STORES.map((s) => {
    const mine = items.filter((it) => it.gameId === s.gameId)
    const recent = mine.slice(-5)
    const earlier = mine.slice(-10, -5)
    const cur = weightedStability(recent)
    const prev = weightedStability(earlier)
    return {
      gameId: s.gameId,
      name: s.name,
      count: mine.length,
      stability: cur,
      delta: deltaOf(cur, prev)
    }
  }).filter((g) => g.count > 0)

  return {
    thisWeek: thisWeek,
    lastWeek: lastWeek,
    delta: deltaOf(thisWeek.stability, lastWeek.stability),
    totalCount: items.length,
    // 只有本周攒够样本、且上周也有数据，才谈得上「变化」
    hasTrend: thisWeek.count >= MIN_SAMPLES && lastWeek.count > 0 && thisWeek.stability != null && lastWeek.stability != null,
    byGame: byGame,
    lastAt: items.length ? items[items.length - 1].at : 0
  }
}

function pct(v) {
  return v == null ? '--' : Math.round(v * 100) + '%'
}

/**
 * 摘要 → 给患者看的一两句话。
 *
 * 变差时的原则：**如实说，但给解释锚点**。
 * 康复训练里患者放弃，往往不是因为数据差，而是因为没人告诉他这个数字该怎么看。
 * 难度提升会压低稳定率，那是「被要求做更难的事」，不是退步。
 */
function describe(s) {
  const sum = s || summary()
  const week = sum.thisWeek

  if (!sum.totalCount) {
    return {
      tone: 'none',
      headline: '还没有训练数据',
      detail: '完成任意一局训练，这里就会开始记录你的变化'
    }
  }
  if (week.count === 0) {
    return {
      tone: 'none',
      headline: '这周还没开始',
      detail: '上次训练是 ' + Math.max(1, Math.round((Date.now() - sum.lastAt) / DAY)) + ' 天前，今天练一局？'
    }
  }
  if (week.count < MIN_SAMPLES) {
    const need = MIN_SAMPLES - week.count
    return {
      tone: 'none',
      headline: '本周已练 ' + week.count + ' 次',
      detail: '再练 ' + need + ' 次就能看到这周的变化（样本太少时波动会被误当成趋势）'
    }
  }
  if (!sum.hasTrend) {
    return {
      tone: 'none',
      headline: pct(week.stability),
      detail: '本周控制稳定率 · 上周没有可比数据'
    }
  }

  const d = sum.delta
  if (Math.abs(d) < FLAT_BAND) {
    return {
      tone: 'flat',
      headline: pct(week.stability),
      detail: '和上周基本持平，保持住了'
    }
  }
  if (d > 0) {
    return {
      tone: 'up',
      headline: pct(week.stability),
      detail: '比上周稳了 ' + Math.round(d * 100) + ' 个百分点'
    }
  }
  return {
    tone: 'down',
    headline: pct(week.stability),
    detail: '比上周低 ' + Math.round(-d * 100) + ' 个百分点' +
      '。如果最近调高了难度，这是正常的 —— 你在做更难的事'
  }
}

/** 清空进度缓存用不到，但测试与「切换账号」需要重新读，所以不缓存任何东西 */

module.exports = {
  STORES,
  MIN_SAMPLES,
  FLAT_BAND,
  stabilityOf,
  weightedStability,
  weekStart,
  readAll,
  summary,
  describe,
  pct
}
