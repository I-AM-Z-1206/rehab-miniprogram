// ============================================================================
// server/db.js —— SQLite 连接（node:sqlite，零额外进程）
// ----------------------------------------------------------------------------
// 环境变量：
//   DATA_DIR  数据目录，默认 ./data（生产建议 /opt/rehab/data）
//
// 设计要点：
//   1. 单例连接。node:sqlite 是同步 API，单进程单连接最省事也最快。
//   2. WAL 模式：读写不互相阻塞，崩溃不会留下半个写。
//   3. foreign_keys 是「连接级」开关，每次开会话都要设，不是持久化配置。
//   4. busy_timeout 让并发写在锁上等待而不是立刻抛 SQLITE_BUSY。
//   5. 首次启动自动建表（检测 schema_meta 表是否存在）。
// ============================================================================

const fs = require('fs')
const path = require('path')

let DatabaseSync
try {
  ({ DatabaseSync } = require('node:sqlite'))
} catch (e) {
  throw new Error(
    '当前 Node 不支持 node:sqlite。请用 Node 23.4+，或在 Node 22.5~23.3 上加 --experimental-sqlite 启动。'
  )
}

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'))
const DB_FILE = path.join(DATA_DIR, 'rehab.db')

let _db = null

function open() {
  if (_db) return _db
  fs.mkdirSync(DATA_DIR, { recursive: true })

  const db = new DatabaseSync(DB_FILE)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')   // WAL 下足够安全，比 FULL 快很多
  db.exec('PRAGMA foreign_keys = ON')      // 连接级，每次连接都要设
  db.exec('PRAGMA busy_timeout = 5000')    // 写锁等待 5 秒再报错

  const ready = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'"
  ).get()
  if (!ready) {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    db.exec(sql)
    console.log('[db] 首次启动，已按 schema.sql 建表：' + DB_FILE)
  }

  _db = db
  return db
}

/**
 * 事务包装。用 BEGIN IMMEDIATE 立即拿写锁，
 * 避免「先读后写」时锁升级失败导致的 SQLITE_BUSY。
 */
function tx(fn) {
  const db = open()
  db.exec('BEGIN IMMEDIATE')
  try {
    const r = fn(db)
    db.exec('COMMIT')
    return r
  } catch (e) {
    try { db.exec('ROLLBACK') } catch (e2) { /* 忽略 */ }
    throw e
  }
}

function close() {
  if (_db) {
    try { _db.close() } catch (e) { /* 忽略 */ }
    _db = null
  }
}

module.exports = { open, tx, close, DB_FILE, DATA_DIR }
