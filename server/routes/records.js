// ============================================================================
// server/routes/records.js —— 训练记录上报与查询
// ----------------------------------------------------------------------------
// POST /api/v1/records    单条，或 { records: [...] }（一次最多 20 条，用于离线补传）
// GET  /api/v1/records    按游戏 / 时间段查，默认排除 simulation
//
// 三条硬规则：
//   1. patientId 不由客户端决定。患者只能写自己的档案，治疗师不能走这个接口。
//   2. recordId 是主键，重复上报返回 duplicated 而不是报错（客户端会重试）。
//   3. data_source='simulation' 的数据能存，但查询默认排除 —— 演示数据绝不能
//      混进康复报告。
// ============================================================================

const { open } = require('../db')
const { forbidden, notFound } = require('../lib/errors')

const GAMES = ['fruit', 'wire', 'rhythm', 'shoot', 'race']

const recordItemSchema = {
  type: 'object',
  required: ['recordId', 'gameId', 'startedAt', 'durationSec', 'dataSource'],
  properties: {
    recordId: { type: 'string', pattern: '^[A-Za-z0-9_-]{4,64}$' },
    gameId: { type: 'string', enum: GAMES },
    startedAt: { type: 'integer', minimum: 1600000000000, maximum: 4102444800000 },
    endedAt: { type: 'integer' },
    durationSec: { type: 'number', minimum: 0, maximum: 7200 },
    score: { type: 'integer', minimum: 0, maximum: 10000000 },
    accuracy: { type: 'number', minimum: 0, maximum: 1 },
    metrics: { type: 'object' },
    configSnapshot: { type: 'object' },
    dataSource: { type: 'string', enum: ['sensor', 'simulation'] },
    interrupted: { type: 'boolean' },
    interruptedSec: { type: 'number', minimum: 0, maximum: 7200 },
    // 记录产生时的归属患者。客户端换了账号却把旧记录传上来时，
    // 服务端靠它识破 —— 这是本地存储隔离失效时的最后一道防线。
    ownerId: { type: 'string', maxLength: 64 },
    clientVer: { type: 'string', maxLength: 32 }
  },
  additionalProperties: false
}

const batchSchema = {
  type: 'object',
  required: ['records'],
  properties: {
    records: { type: 'array', minItems: 1, maxItems: 20, items: recordItemSchema }
  },
  additionalProperties: false
}

const bodySchema = { anyOf: [recordItemSchema, batchSchema] }

/** 当前登录者对应的 patient 档案；治疗师走这个接口会被拒 */
function patientOf(db, uid, role) {
  if (role !== 'patient') {
    throw forbidden('记录上报只能由患者账号发起')
  }
  const p = db.prepare('SELECT * FROM patient WHERE user_id = ?').get(uid)
  if (!p) throw notFound('患者档案不存在')
  return p
}

function toRow(rec, patientId) {
  return [
    rec.recordId,
    patientId,
    rec.gameId,
    Math.round(rec.startedAt),
    rec.endedAt ? Math.round(rec.endedAt) : null,
    rec.durationSec,
    Number.isInteger(rec.score) ? rec.score : null,
    typeof rec.accuracy === 'number' ? rec.accuracy : null,
    JSON.stringify(rec.metrics || {}),
    // 没有快照时显式标记，报表层据此判断"这条记录不可跨周比较"
    JSON.stringify(rec.configSnapshot || { version: 0, missing: true }),
    rec.dataSource,
    rec.interrupted ? 1 : 0,
    typeof rec.interruptedSec === 'number' ? rec.interruptedSec : 0,
    rec.clientVer || null,
    Date.now()
  ]
}

const INSERT_SQL = `INSERT OR IGNORE INTO record
  (id, patient_id, game_id, started_at, ended_at, duration_sec, score, accuracy,
   metrics, config_snapshot, data_source, interrupted, interrupted_sec, client_ver, created_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`

function hydrate(row) {
  if (!row) return null
  return {
    recordId: row.id,
    gameId: row.game_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSec: row.duration_sec,
    score: row.score,
    accuracy: row.accuracy,
    metrics: safeJson(row.metrics, {}),
    configSnapshot: safeJson(row.config_snapshot, {}),
    dataSource: row.data_source,
    interrupted: !!row.interrupted,
    interruptedSec: row.interrupted_sec,
    clientVer: row.client_ver,
    createdAt: row.created_at
  }
}

function safeJson(s, fallback) {
  try { return JSON.parse(s) } catch (e) { return fallback }
}

module.exports = async function recordRoutes(fastify) {
  // ---------------------------------------------------------------- 上报
  fastify.post('/api/v1/records', {
    onRequest: [fastify.authenticate],
    schema: { body: bodySchema }
  }, async (request, reply) => {
    const db = open()
    const patient = patientOf(db, request.user.uid, request.user.role)
    const body = request.body
    const items = Array.isArray(body.records) ? body.records : [body]

    const stmt = db.prepare(INSERT_SQL)
    let accepted = 0
    let duplicated = 0
    const rejected = []

    // 批量补传可能一次 20 条，包一个事务减少 fsync
    db.exec('BEGIN IMMEDIATE')
    try {
      items.forEach((rec, i) => {
        try {
          // 归属校验：带 ownerId 且与当前登录患者不符，说明是把别人的记录传上来了
          if (rec.ownerId && rec.ownerId !== patient.id) {
            rejected.push({ index: i, reason: 'owner-mismatch' })
            return
          }
          const info = stmt.run(...toRow(rec, patient.id))
          if (info.changes === 0) duplicated += 1
          else accepted += 1
        } catch (e) {
          rejected.push({ index: i, reason: e.message })
        }
      })
      db.exec('COMMIT')
    } catch (e) {
      try { db.exec('ROLLBACK') } catch (e2) { /* 忽略 */ }
      throw e
    }

    const status = accepted > 0 ? 201 : (duplicated > 0 ? 200 : 400)
    return reply.code(status).send({
      ok: accepted > 0 || duplicated > 0,
      accepted,
      duplicated,
      rejected,
      patientId: patient.id
    })
  })

  // ---------------------------------------------------------------- 查询
  fastify.get('/api/v1/records', {
    onRequest: [fastify.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          gameId: { type: 'string', enum: GAMES },
          patientId: { type: 'string', maxLength: 64 },
          from: { type: 'integer' },
          to: { type: 'integer' },
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
          includeSimulation: { type: 'boolean', default: false }
        },
        additionalProperties: false
      }
    }
  }, async (request) => {
    const db = open()
    const q = request.query

    let patientId
    if (request.user.role === 'patient') {
      const p = db.prepare('SELECT * FROM patient WHERE user_id = ?').get(request.user.uid)
      if (!p) throw notFound('患者档案不存在')
      patientId = p.id
    } else {
      // 治疗师：必须指定 patientId，且必须存在有效绑定
      if (!q.patientId) throw forbidden('治疗师查询记录必须指定 patientId')
      const link = db
        .prepare("SELECT 1 FROM care_link WHERE patient_id = ? AND therapist_id = ? AND status = 'active'")
        .get(q.patientId, request.user.uid)
      if (!link) throw forbidden('未与该患者建立绑定关系')
      patientId = q.patientId
    }

    const where = ['patient_id = ?', 'deleted_at IS NULL']
    const args = [patientId]
    if (q.gameId) { where.push('game_id = ?'); args.push(q.gameId) }
    if (q.from) { where.push('started_at >= ?'); args.push(q.from) }
    if (q.to) { where.push('started_at <= ?'); args.push(q.to) }
    if (!q.includeSimulation) where.push("data_source = 'sensor'")

    const sql =
      'SELECT * FROM record WHERE ' + where.join(' AND ') +
      ' ORDER BY started_at DESC LIMIT ?'
    args.push(q.limit)

    const rows = db.prepare(sql).all(...args)
    const total = db
      .prepare('SELECT COUNT(*) AS n FROM record WHERE ' + where.join(' AND '))
      .get(...args.slice(0, -1))

    return {
      ok: true,
      patientId,
      total: total.n,
      count: rows.length,
      items: rows.map(hydrate)
    }
  })

  // ---------------------------------------------------------------- 软删除
  fastify.delete('/api/v1/records/:id', { onRequest: [fastify.authenticate] }, async (request) => {
    const db = open()
    const p = db.prepare('SELECT * FROM patient WHERE user_id = ?').get(request.user.uid)
    if (!p) throw notFound('患者档案不存在')
    const info = db
      .prepare('UPDATE record SET deleted_at = ? WHERE id = ? AND patient_id = ? AND deleted_at IS NULL')
      .run(Date.now(), request.params.id, p.id)
    if (info.changes === 0) throw notFound('记录不存在')
    return { ok: true, deleted: 1 }
  })
}
