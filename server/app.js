// ============================================================================
// server/app.js —— Fastify 应用入口
// ----------------------------------------------------------------------------
// 启动：
//   node app.js                     （Node 23.4+）
//   node --experimental-sqlite app.js   （Node 22.5~23.3）
//
// 必需环境变量：
//   SESSION_SECRET   JWT 签名密钥（生产必填，openssl rand -hex 32）
// 可选：
//   PORT             默认 8787
//   DATA_DIR         默认 ./data
//   WX_APPID / WX_SECRET   微信登录；不配则需 DEV_LOGIN=1
//   DEV_LOGIN        1 = 允许开发登录（生产绝对不要开）
//   THERAPIST_OPENIDS  治疗师 openid 白名单，逗号分隔
//   CORS_ORIGIN      设了才开 CORS（小程序不需要）
//   LOG_LEVEL        fatal|error|warn|info|debug|trace|silent
// ============================================================================

const Fastify = require('fastify')
const db = require('./db')

const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || '0.0.0.0'
const IS_PROD = process.env.NODE_ENV === 'production'
const DEV_LOGIN = process.env.DEV_LOGIN === '1'

// ---- 密钥：生产必须显式配置，开发给一个固定值方便重启后 token 仍有效 ----
let SECRET = process.env.SESSION_SECRET
if (!SECRET) {
  if (IS_PROD) {
    console.error('[fatal] 生产环境必须设置 SESSION_SECRET（openssl rand -hex 32）')
    process.exit(1)
  }
  SECRET = 'dev-only-secret-change-me'
  console.warn('[warn] 未设置 SESSION_SECRET，正在使用开发默认值，不要用于生产')
}
if (DEV_LOGIN && IS_PROD) {
  console.warn('[warn] DEV_LOGIN=1 在生产环境下生效，任何人都能伪造登录！请立刻关闭')
}

const app = Fastify({
  logger: process.env.LOG_LEVEL === 'silent'
    ? false
    : { level: process.env.LOG_LEVEL || 'info' },
  bodyLimit: 256 * 1024,
  trustProxy: true        // 在 nginx 后面，日志里要拿到真实客户端 IP
})

// ---------------------------------------------------------------- 插件
app.register(require('@fastify/jwt'), { secret: SECRET })

if (process.env.CORS_ORIGIN) {
  app.register(require('@fastify/cors'), {
    origin: process.env.CORS_ORIGIN.split(','),
    credentials: false
  })
}

// ---------------------------------------------------------------- 鉴权装饰器
app.decorate('authenticate', async function (request, reply) {
  try {
    await request.jwtVerify()
  } catch (e) {
    return reply.code(401).send({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: '未登录或登录已过期' }
    })
  }
})

app.decorate('requireTherapist', async function (request, reply) {
  if (!request.user || request.user.role !== 'therapist') {
    return reply.code(403).send({
      ok: false,
      error: { code: 'FORBIDDEN', message: '需要治疗师权限' }
    })
  }
})

// ---------------------------------------------------------------- 错误处理
app.setErrorHandler((err, request, reply) => {
  // JSON Schema 校验失败
  if (err.validation) {
    return reply.code(400).send({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: err.message,
        detail: (err.validationContext || '') + ': ' + err.message
      }
    })
  }
  // 业务错误（HttpError）
  if (err.status && err.code) {
    return reply.code(err.status).send({
      ok: false,
      error: { code: err.code, message: err.message, detail: err.detail }
    })
  }
  // 请求体过大等 Fastify 自带错误
  if (err.statusCode && err.statusCode < 500) {
    return reply.code(err.statusCode).send({
      ok: false,
      error: { code: err.code || 'BAD_REQUEST', message: err.message }
    })
  }
  request.log.error(err)
  return reply.code(500).send({
    ok: false,
    error: { code: 'INTERNAL', message: '服务器内部错误' }
  })
})

app.setNotFoundHandler((request, reply) => {
  reply.code(404).send({
    ok: false,
    error: { code: 'NOT_FOUND', message: '接口不存在' }
  })
})

// ---------------------------------------------------------------- 健康检查
app.get('/health', async () => {
  let dbOk = false
  let version = null
  try {
    const d = db.open()
    const row = d.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get()
    dbOk = !!row
    version = row ? row.value : null
  } catch (e) {
    dbOk = false
  }
  return {
    ok: dbOk,
    ts: Date.now(),
    db: dbOk,
    schemaVersion: version,
    wxConfigured: !!(process.env.WX_APPID && process.env.WX_SECRET),
    devLogin: DEV_LOGIN
  }
})

// ---------------------------------------------------------------- 路由
app.register(require('./routes/auth'))
app.register(require('./routes/records'))
app.register(require('./routes/config'))
app.register(require('./routes/therapist'))

// ---------------------------------------------------------------- 启动/退出
async function start() {
  db.open()   // 提前建表，让启动就失败而不是第一次请求才失败
  await app.listen({ port: PORT, host: HOST })
  const addr = app.server.address()
  const realPort = addr && typeof addr === 'object' ? addr.port : PORT
  // 这一行格式被 tools/server-smoke-test.js 依赖，改动要同步改测试
  console.log('[server] listening on http://127.0.0.1:' + realPort)
  console.log('[server] db: ' + db.DB_FILE)
  console.log('[server] wx: ' + (process.env.WX_APPID ? '已配置' : (DEV_LOGIN ? '开发登录模式' : '未配置')))
}

let closing = false
function shutdown(signal) {
  if (closing) return
  closing = true
  console.log('[server] ' + signal + ' 收到，正在关闭…')
  app.close().then(() => {
    db.close()
    process.exit(0)
  }).catch(() => process.exit(0))
  setTimeout(() => process.exit(0), 5000).unref()
}
;['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => shutdown(s)))

if (require.main === module) {
  start().catch((e) => {
    console.error('[fatal] 启动失败:', e.message)
    process.exit(1)
  })
}

module.exports = { app, start }
