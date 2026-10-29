// ============================================================================
// server/store.js —— 训练记录存储（零依赖，JSON 文件 + 原子写 + 串行锁）
// ----------------------------------------------------------------------------
// 为什么先用文件而不是数据库：
//   · 现在每天的量级是「几十条」，一个 JSON 文件绰绰有余；
//   · 零依赖 = 一台裸机 / 一个容器就能跑，不装 MySQL 也能先上线；
//   · 接口层是 store.add / store.list，将来换 Postgres 只改这一个文件。
//
// 写入用「临时文件 + rename」保证原子性：进程中途被杀也不会留下半个 JSON。
// 同一进程内的写操作串行执行，避免读-改-写互相覆盖。
// ============================================================================

const fs = require('fs')
const fsp = fs.promises
const path = require('path')

const MAX_RECORDS = 20000 // 超过就丢弃最旧的，防止文件无限增长

function createStore(dir) {
  const file = path.join(dir, 'records.json')
  let cache = null
  let chain = Promise.resolve()

  async function load() {
    if (cache) return cache
    try {
      const raw = await fsp.readFile(file, 'utf8')
      const arr = JSON.parse(raw)
      cache = Array.isArray(arr) ? arr : []
    } catch (e) {
      cache = []
    }
    return cache
  }

  async function flush(list) {
    await fsp.mkdir(dir, { recursive: true })
    const tmp = file + '.' + process.pid + '.tmp'
    await fsp.writeFile(tmp, JSON.stringify(list), 'utf8')
    await fsp.rename(tmp, file)
  }

  /** 串行执行：每个写操作等前一个结束 */
  function withLock(fn) {
    const run = chain.then(fn, fn)
    chain = run.then(() => undefined, () => undefined)
    return run
  }

  async function add(record) {
    return withLock(async () => {
      const list = await load()
      const idx = list.findIndex((r) => r && r.recordId === record.recordId)
      if (idx >= 0) return { duplicated: true, total: list.length }
      list.unshift(record)
      while (list.length > MAX_RECORDS) list.pop()
      await flush(list)
      return { duplicated: false, total: list.length }
    })
  }

  async function list(opts) {
    const o = opts || {}
    const all = await load()
    let out = all
    if (o.gameId) out = out.filter((r) => r && r.gameId === o.gameId)
    if (o.since) out = out.filter((r) => r && (r.createdAt || 0) >= o.since)
    const limit = Math.max(0, Math.min(500, Number(o.limit) || 50))
    return { total: out.length, items: out.slice(0, limit) }
  }

  async function stats() {
    const all = await load()
    const byGame = {}
    all.forEach((r) => {
      const g = (r && r.gameId) || 'unknown'
      byGame[g] = (byGame[g] || 0) + 1
    })
    return { total: all.length, byGame, file: file }
  }

  return { add, list, stats, file }
}

module.exports = { createStore, MAX_RECORDS }
