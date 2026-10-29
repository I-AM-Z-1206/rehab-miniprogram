// ============================================================================
// ⚠️ LEGACY —— 这是 v1 的零依赖实现，已被 app.js（Fastify + SQLite）取代。
//    保留仅作历史参考，不要再用它启动服务：
//      ✗ node server/index.js
//      ✓ node server/app.js
//    它用的是「全局 UPLOAD_TOKEN + JSON 文件」，与当前 schema 和接口都不兼容。
// ============================================================================
// server/index.js —— 康复训练小程序的最小后端（零依赖，Node 18+）
// ----------------------------------------------------------------------------
// 接口（严格对齐小程序端 utils/training-record.js 的上报实现）：
//   POST /api/v1/records   单条或 { records: [...] }，头 Authorization: Bearer <TOKEN>
//                          成功 201（重复 200），参数错误 400，鉴权失败 401，超限 413
//   GET  /api/v1/records   ?gameId=&limit=&since=   管理端列表（同样需要 token）
//   GET  /api/v1/stats     汇总数字 + 存储文件路径
//   GET  /health           健康检查（不需要 token，给负载均衡用）
//   GET  /static/**        静态文件（图片素材兜底；正式环境建议直接用 CDN/对象存储）
//
// 环境变量：
//   PORT         监听端口，默认 8787；设为 0 时由系统分配（测试用）
//   UPLOAD_TOKEN 必填，上报令牌；不配置则写入接口直接 503（拒绝无鉴权的裸奔）
//   DATA_DIR     数据目录，默认 ./server/data
//   STATIC_DIR   静态目录，默认 ./server/static
//   MAX_BODY     单次请求体上限（字节），默认 256 * 1024
//
// 启动：node server/index.js
// ============================================================================

const http = require('http')
const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const crypto = require('crypto')
const { createStore } = require('./store.js')

const PORT = Number(process.env.PORT || 8787)
const TOKEN = String(process.env.UPLOAD_TOKEN || '')
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'))
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || path.join(__dirname, 'static'))
const MAX_BODY = Number(process.env.MAX_BODY || 256 * 1024)
const MAX_RECORD_BYTES = 8 * 1024

const GAMES = new Set(['fruit', 'wire', 'rhythm', 'shoot', 'race'])
const store = createStore(DATA_DIR)

// ---------------------------------------------------------------- 工具
function tokenOk(header) {
  if (!TOKEN) return false
  const m = /^Bearer\s+(.+)$/i.exec(String(header || '').trim())
  if (!m) return false
  // 等长哈希后再比，避免按字节提前返回泄露长度信息
  const a = crypto.createHash('sha256').update(m[1]).digest()
  const b = crypto.createHash('sha256').update(TOKEN).digest()
  return crypto.timingSafeEqual(a, b)
}

function send(res, code, body, extraHeaders) {
  const data = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(code, Object.assign({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  }, extraHeaders || {}))
  res.end(data)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    let overflow = false
    const chunks = []
    req.on('data', (c) => {
      if (overflow) return
      size += c.length
      if (size > MAX_BODY) {
        // 不要 req.destroy()：那会让客户端只看到 connection reset，
        // 拿不到 413。这里停止缓冲、把剩余字节读完，最后回 413。
        overflow = true
        chunks.length = 0
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (overflow) reject(Object.assign(new Error('body too large'), { code: 413 }))
      else resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })
}

/** 只保留原始类型 + 一层对象，字符串截断，防止脏数据把文件撑爆 */
function sanitize(value, depth) {
  const d = depth || 0
  if (value === null) return null
  const t = typeof value
  if (t === 'number') return isFinite(value) ? value : null
  if (t === 'boolean') return value
  if (t === 'string') return value.length > 200 ? value.slice(0, 200) : value
  if (t === 'object' && d < 2) {
    if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, d + 1))
    const out = {}
    Object.keys(value).slice(0, 60).forEach((k) => {
      if (k.charAt(0) === '_') return
      out[k] = sanitize(value[k], d + 1)
    })
    return out
  }
  return undefined
}

function validateRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'not-object' }
  const id = String(raw.recordId || '')
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) return { ok: false, reason: 'bad-recordId' }
  const gameId = String(raw.gameId || '')
  if (!GAMES.has(gameId)) return { ok: false, reason: 'bad-gameId' }
  const clean = sanitize(raw)
  const size = Buffer.byteLength(JSON.stringify(clean), 'utf8')
  if (size > MAX_RECORD_BYTES) return { ok: false, reason: 'record-too-large' }
  clean.recordId = id
  clean.gameId = gameId
  clean.createdAt = Number(clean.createdAt) || Date.now()
  clean.receivedAt = Date.now()
  return { ok: true, record: clean }
}

// ---------------------------------------------------------------- 路由
async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const p = url.pathname

  // CORS：方便浏览器预览 / 管理页调试
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-headers', 'content-type, authorization')
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return send(res, 204, '')

  if (p === '/health') {
    return send(res, 200, { ok: true, ts: Date.now(), tokenConfigured: !!TOKEN })
  }

  // ---- 记录写入 ----
  if (p === '/api/v1/records' && req.method === 'POST') {
    if (!TOKEN) return send(res, 503, { ok: false, error: 'server 未配置 UPLOAD_TOKEN，拒绝写入' })
    if (!tokenOk(req.headers.authorization)) return send(res, 401, { ok: false, error: 'unauthorized' })

    let body
    try {
      body = JSON.parse(await readBody(req))
    } catch (e) {
      if (e && e.code === 413) return send(res, 413, { ok: false, error: 'body too large' })
      return send(res, 400, { ok: false, error: 'invalid json' })
    }

    const items = Array.isArray(body && body.records) ? body.records : [body]
    if (!items.length) return send(res, 400, { ok: false, error: 'empty' })
    if (items.length > 20) return send(res, 400, { ok: false, error: 'too many records in one request' })

    const accepted = []
    const rejected = []
    let duplicated = 0
    for (let i = 0; i < items.length; i++) {
      const v = validateRecord(items[i])
      if (!v.ok) {
        rejected.push({ index: i, reason: v.reason })
        continue
      }
      const r = await store.add(v.record)
      if (r.duplicated) duplicated += 1
      else accepted.push(v.record.recordId)
    }
    if (!accepted.length && !duplicated) {
      return send(res, 400, { ok: false, error: 'all rejected', rejected })
    }
    return send(res, accepted.length ? 201 : 200, {
      ok: true,
      accepted: accepted.length,
      duplicated,
      rejected,
      total: (await store.stats()).total
    })
  }

  // ---- 记录读取 ----
  if (p === '/api/v1/records' && req.method === 'GET') {
    if (!TOKEN) return send(res, 503, { ok: false, error: 'server 未配置 UPLOAD_TOKEN' })
    if (!tokenOk(req.headers.authorization)) return send(res, 401, { ok: false, error: 'unauthorized' })
    const r = await store.list({
      gameId: url.searchParams.get('gameId') || '',
      limit: url.searchParams.get('limit') || 50,
      since: Number(url.searchParams.get('since') || 0)
    })
    return send(res, 200, Object.assign({ ok: true }, r))
  }

  if (p === '/api/v1/stats' && req.method === 'GET') {
    if (!TOKEN) return send(res, 503, { ok: false, error: 'server 未配置 UPLOAD_TOKEN' })
    if (!tokenOk(req.headers.authorization)) return send(res, 401, { ok: false, error: 'unauthorized' })
    return send(res, 200, Object.assign({ ok: true }, await store.stats()))
  }

  // ---- 静态文件（图片兜底方案） ----
  if (p.startsWith('/static/')) {
    const rel = decodeURIComponent(p.slice('/static/'.length))
    const abs = path.resolve(STATIC_DIR, rel)
    if (!abs.startsWith(STATIC_DIR + path.sep)) return send(res, 403, { ok: false, error: 'forbidden' })
    try {
      const stat = await fsp.stat(abs)
      if (!stat.isFile()) throw new Error('not file')
      const ext = path.extname(abs).toLowerCase()
      const type = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json'
      }[ext] || 'application/octet-stream'
      res.writeHead(200, {
        'content-type': type,
        'content-length': stat.size,
        // 带 hash 的文件名可以设 immutable；这里保守用 1 天
        'cache-control': 'public, max-age=86400',
        'access-control-allow-origin': '*'
      })
      fs.createReadStream(abs).pipe(res)
      return
    } catch (e) {
      return send(res, 404, { ok: false, error: 'not found' })
    }
  }

  return send(res, 404, { ok: false, error: 'not found' })
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    // 兜底：任何未预料的异常都回 500，但不把堆栈吐给客户端
    console.error('[server]', e && e.message)
    try { send(res, 500, { ok: false, error: 'internal' }) } catch (e2) { /* 忽略 */ }
  })
})

server.listen(PORT, '0.0.0.0', () => {
  const addr = server.address()
  console.log('[server] listening on http://127.0.0.1:' + addr.port)
  console.log('[server] data dir: ' + DATA_DIR)
  console.log('[server] token: ' + (TOKEN ? '已配置' : '未配置（写入接口将返回 503）'))
})

// 优雅退出：让容器重启时不丢正在写的文件
;['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000)
  })
})

module.exports = { server }
