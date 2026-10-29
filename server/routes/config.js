// ============================================================================
// server/routes/config.js —— 游戏参数下发与更新
// ----------------------------------------------------------------------------
// GET /api/v1/config/:gameId?since=N
//   患者：读自己的参数。带 since 且与服务端一致时只回 changed:false（省流量）。
//   治疗师：读指定患者的参数（需 patientId 且已绑定）。
// PUT /api/v1/config/:gameId?patientId=
//   仅治疗师。version 自增；可选 expectedVersion 做乐观锁。
//
// 服务端不校验参数的业务合法性（范围、步长）。原因见 docs：
// 客户端 ConfigStore.patch() 会做 coerce（类型→范围→步长），
// 服务端只负责「存下来、发下去」，避免维护第二套规则。但会限制体积和结构。
// ============================================================================

const { open } = require('../db')
const { badRequest, forbidden, notFound, conflict } = require('../lib/errors')

const GAMES = ['fruit', 'wire', 'rhythm', 'shoot', 'race']
const MAX_PAYLOAD_BYTES = 64 * 1024

function safeJson(s, fallback) {
  try { return JSON.parse(s) } catch (e) { return fallback }
}

function assertLinked(db, therapistId, patientId) {
  const link = db
    .prepare("SELECT 1 FROM care_link WHERE patient_id = ? AND therapist_id = ? AND status = 'active'")
    .get(patientId, therapistId)
  if (!link) throw forbidden('未与该患者建立绑定关系')
}

module.exports = async function configRoutes(fastify) {
  fastify.get('/api/v1/config/:gameId', {
    onRequest: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['gameId'],
        properties: { gameId: { type: 'string', enum: GAMES } }
      },
      querystring: {
        type: 'object',
        properties: {
          since: { type: 'integer', minimum: 0 },
          patientId: { type: 'string', maxLength: 64 }
        },
        additionalProperties: false
      }
    }
  }, async (request) => {
    const db = open()
    const { gameId } = request.params
    const { since, patientId: qPatientId } = request.query

    let patientId
    if (request.user.role === 'patient') {
      const p = db.prepare('SELECT * FROM patient WHERE user_id = ?').get(request.user.uid)
      if (!p) throw notFound('患者档案不存在')
      patientId = p.id
    } else {
      if (!qPatientId) throw badRequest('治疗师查询必须指定 patientId')
      assertLinked(db, request.user.uid, qPatientId)
      patientId = qPatientId
    }

    const row = db
      .prepare('SELECT version, payload, updated_at FROM game_config WHERE patient_id = ? AND game_id = ?')
      .get(patientId, gameId)

    if (!row) {
      return { ok: true, gameId, version: 0, changed: false, config: null }
    }
    if (typeof since === 'number' && since === row.version) {
      return { ok: true, gameId, version: row.version, changed: false }
    }
    return {
      ok: true,
      gameId,
      version: row.version,
      changed: true,
      config: safeJson(row.payload, {}),
      updatedAt: row.updated_at
    }
  })

  fastify.put('/api/v1/config/:gameId', {
    onRequest: [fastify.authenticate, fastify.requireTherapist],
    schema: {
      params: {
        type: 'object',
        required: ['gameId'],
        properties: { gameId: { type: 'string', enum: GAMES } }
      },
      querystring: {
        type: 'object',
        required: ['patientId'],
        properties: { patientId: { type: 'string', maxLength: 64 } },
        additionalProperties: false
      },
      body: {
        type: 'object',
        required: ['config'],
        properties: {
          config: { type: 'object' },
          expectedVersion: { type: 'integer', minimum: 0 }
        },
        additionalProperties: false
      }
    }
  }, async (request) => {
    const db = open()
    const { gameId } = request.params
    const { patientId } = request.query
    const { config, expectedVersion } = request.body

    const p = db.prepare('SELECT id FROM patient WHERE id = ? AND archived_at IS NULL').get(patientId)
    if (!p) throw notFound('患者不存在')
    assertLinked(db, request.user.uid, patientId)

    const payload = JSON.stringify(config)
    if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) {
      throw badRequest('参数体积超过限制（64KB）')
    }

    const cur = db
      .prepare('SELECT version FROM game_config WHERE patient_id = ? AND game_id = ?')
      .get(patientId, gameId)
    const currentVersion = cur ? cur.version : 0

    if (typeof expectedVersion === 'number' && expectedVersion !== currentVersion) {
      throw conflict('参数已被其他人修改（当前 version ' + currentVersion + '），请刷新后重试')
    }

    const nextVersion = currentVersion + 1
    const now = Date.now()
    db.prepare(
      `INSERT INTO game_config (patient_id, game_id, version, payload, updated_by, updated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(patient_id, game_id) DO UPDATE SET
         version = excluded.version, payload = excluded.payload,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`
    ).run(patientId, gameId, nextVersion, payload, request.user.uid, now)

    // 审计：谁在什么时候改了谁的参数
    db.prepare(
      `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, diff, ip, at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(
      'a_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 8),
      request.user.uid,
      'config.update',
      'game_config',
      patientId + ':' + gameId,
      JSON.stringify({ from: currentVersion, to: nextVersion, config }),
      request.ip,
      now
    )

    return { ok: true, gameId, patientId, version: nextVersion }
  })
}
