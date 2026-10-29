// ============================================================================
// server/routes/therapist.js —— 治疗师侧：患者管理、待认领、认领、周报
// ----------------------------------------------------------------------------
// GET  /api/v1/therapist/patients        患者列表（含本周次数、上次训练、异常标记）
// GET  /api/v1/therapist/unclaimed       待认领池（已登录但还没绑治疗师）
// POST /api/v1/patients                  治疗师门诊建档（可先于患者登录）
// POST /api/v1/patients/:id/claim        认领，可合并门诊已建档案
// GET  /api/v1/patients/:id/report       按周聚合的康复报告
//
// 「认领」是不要邀请码的核心：患者登录即自动建档并进池子，
// 治疗师看板点一下把人挂到自己名下，全程不需要任何码。
// ============================================================================

const { open, tx } = require('../db')
const { uid, nextPatientCode } = require('../lib/ids')
const { badRequest, forbidden, notFound, conflict } = require('../lib/errors')

const DAY = 86400000

function assertLinked(db, therapistId, patientId) {
  const link = db
    .prepare("SELECT 1 FROM care_link WHERE patient_id = ? AND therapist_id = ? AND status = 'active'")
    .get(patientId, therapistId)
  if (!link) throw forbidden('未与该患者建立绑定关系')
}

/** 本周一 00:00（本地时区）的毫秒时间戳 */
function weekStart(ts) {
  const d = new Date(ts || Date.now())
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay() === 0 ? 7 : d.getDay() // 周日记为 7
  d.setDate(d.getDate() - (dow - 1))
  return d.getTime()
}

module.exports = async function therapistRoutes(fastify) {
  // ---------------------------------------------------------------- 患者列表
  fastify.get('/api/v1/therapist/patients', {
    onRequest: [fastify.authenticate, fastify.requireTherapist]
  }, async (request) => {
    const db = open()
    const now = Date.now()
    const ws = weekStart(now)

    const rows = db.prepare(`
      SELECT p.id, p.code, p.display_name, p.birth_year, p.sex, p.note, p.created_at,
        (SELECT MAX(started_at) FROM record r
          WHERE r.patient_id = p.id AND r.data_source = 'sensor' AND r.deleted_at IS NULL) AS last_started_at,
        (SELECT COUNT(*) FROM record r
          WHERE r.patient_id = p.id AND r.data_source = 'sensor' AND r.deleted_at IS NULL
            AND r.started_at >= ?) AS week_sessions
      FROM patient p
      JOIN care_link l ON l.patient_id = p.id AND l.therapist_id = ? AND l.status = 'active'
      WHERE p.archived_at IS NULL
      ORDER BY last_started_at IS NULL DESC, last_started_at DESC
    `).all(ws, request.user.uid)

    const patients = rows.map((r) => {
      const days = r.last_started_at ? Math.floor((now - r.last_started_at) / DAY) : null
      let alert = null
      if (r.last_started_at === null) alert = 'never'
      else if (days >= 3) alert = 'inactive'
      return {
        id: r.id,
        code: r.code,
        displayName: r.display_name,
        birthYear: r.birth_year,
        sex: r.sex,
        note: r.note,
        lastStartedAt: r.last_started_at,
        daysSinceLast: days,
        weekSessions: r.week_sessions,
        alert
      }
    })

    return { ok: true, count: patients.length, patients }
  })

  // ---------------------------------------------------------------- 待认领池
  fastify.get('/api/v1/therapist/unclaimed', {
    onRequest: [fastify.authenticate, fastify.requireTherapist]
  }, async () => {
    const db = open()
    const rows = db.prepare('SELECT * FROM v_unclaimed_patient ORDER BY created_at DESC').all()
    return {
      ok: true,
      count: rows.length,
      patients: rows.map((r) => ({
        id: r.id,
        code: r.code,
        displayName: r.display_name,
        createdAt: r.created_at,
        lastLoginAt: r.last_login_at,
        avatarUrl: r.avatar_url
      }))
    }
  })

  // ---------------------------------------------------------------- 门诊建档
  fastify.post('/api/v1/patients', {
    onRequest: [fastify.authenticate, fastify.requireTherapist],
    schema: {
      body: {
        type: 'object',
        required: ['displayName'],
        properties: {
          displayName: { type: 'string', minLength: 1, maxLength: 64 },
          birthYear: { type: 'integer', minimum: 1900, maximum: 2100 },
          sex: { type: 'string', enum: ['M', 'F'] },
          note: { type: 'string', maxLength: 500 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const b = request.body
    const now = Date.now()

    const created = tx((db) => {
      const id = uid('p_')
      const code = nextPatientCode(db)
      db.prepare(
        `INSERT INTO patient (id, code, display_name, birth_year, sex, note, user_id, created_by, created_at)
         VALUES (?,?,?,?,?,?,NULL,?,?)`
      ).run(id, code, b.displayName, b.birthYear || null, b.sex || null, b.note || null, request.user.uid, now)
      // 门诊建档时治疗师本人就是接诊人，直接建立绑定
      db.prepare('INSERT INTO care_link (id, patient_id, therapist_id, linked_at) VALUES (?,?,?,?)')
        .run(uid('l_'), id, request.user.uid, now)
      return db.prepare('SELECT * FROM patient WHERE id = ?').get(id)
    })

    return reply.code(201).send({
      ok: true,
      patient: {
        id: created.id,
        code: created.code,
        displayName: created.display_name,
        birthYear: created.birth_year,
        sex: created.sex,
        note: created.note,
        bound: false   // 还没有微信账号
      }
    })
  })

  // ---------------------------------------------------------------- 认领
  fastify.post('/api/v1/patients/:id/claim', {
    onRequest: [fastify.authenticate, fastify.requireTherapist],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', maxLength: 64 } }
      },
      body: {
        type: 'object',
        properties: { mergeIntoId: { type: 'string', maxLength: 64 } },
        additionalProperties: false
      }
    }
  }, async (request) => {
    const db = open()
    const targetId = request.params.id
    const mergeIntoId = (request.body || {}).mergeIntoId || null
    const now = Date.now()

    const src = db.prepare('SELECT * FROM patient WHERE id = ? AND archived_at IS NULL').get(targetId)
    if (!src) throw notFound('患者档案不存在')
    if (!src.user_id) throw badRequest('该档案还没有绑定微信账号，无需认领')

    const existing = db
      .prepare("SELECT therapist_id FROM care_link WHERE patient_id = ? AND status = 'active'")
      .get(targetId)
    if (existing) {
      if (existing.therapist_id === request.user.uid) {
        return { ok: true, already: true, patientId: targetId }
      }
      throw conflict('该患者已被其他治疗师认领')
    }

    if (!mergeIntoId) {
      const r = tx((d) => {
        d.prepare('INSERT INTO care_link (id, patient_id, therapist_id, linked_at) VALUES (?,?,?,?)')
          .run(uid('l_'), targetId, request.user.uid, now)
        d.prepare(
          `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, diff, ip, at)
           VALUES (?,?,?,?,?,?,?,?)`
        ).run(uid('a_'), request.user.uid, 'patient.claim', 'patient', targetId, null, request.ip, now)
        return targetId
      })
      return { ok: true, patientId: r, merged: false }
    }

    // 合并：把患者登录产生的临时档案（src）并入治疗师门诊建的档案（dst）
    const dst = db
      .prepare('SELECT * FROM patient WHERE id = ? AND archived_at IS NULL')
      .get(mergeIntoId)
    if (!dst) throw notFound('要合并到的档案不存在')
    if (dst.user_id) throw conflict('目标档案已经绑定了其他微信账号')
    if (dst.created_by !== request.user.uid) throw forbidden('只能合并到自己创建的档案')

    tx((d) => {
      // 1. 记录迁移
      d.prepare('UPDATE record SET patient_id = ? WHERE patient_id = ?').run(dst.id, src.id)
      // 2. 参数迁移：目标没有才搬，避免主键冲突
      const dstCfg = d.prepare('SELECT 1 FROM game_config WHERE patient_id = ?').get(dst.id)
      if (!dstCfg) {
        d.prepare('UPDATE game_config SET patient_id = ? WHERE patient_id = ?').run(dst.id, src.id)
      } else {
        d.prepare('DELETE FROM game_config WHERE patient_id = ?').run(src.id)
      }
      // 3. 账号挂到目标档案
      d.prepare('UPDATE patient SET user_id = ? WHERE id = ?').run(src.user_id, dst.id)
      // 4. 归档临时档案
      d.prepare('UPDATE patient SET archived_at = ?, user_id = NULL WHERE id = ?').run(now, src.id)
      // 5. 绑定关系
      d.prepare('INSERT INTO care_link (id, patient_id, therapist_id, linked_at) VALUES (?,?,?,?)')
        .run(uid('l_'), dst.id, request.user.uid, now)
      d.prepare(
        `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, diff, ip, at)
         VALUES (?,?,?,?,?,?,?,?)`
      ).run(
        uid('a_'), request.user.uid, 'patient.claim.merge', 'patient', dst.id,
        JSON.stringify({ mergedFrom: src.id }), request.ip, now
      )
    })

    return { ok: true, patientId: dst.id, merged: true, archivedFrom: src.id }
  })

  // ---------------------------------------------------------------- 周报
  fastify.get('/api/v1/patients/:id/report', {
    onRequest: [fastify.authenticate, fastify.requireTherapist],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', maxLength: 64 } }
      },
      querystring: {
        type: 'object',
        properties: {
          from: { type: 'integer' },
          to: { type: 'integer' }
        },
        additionalProperties: false
      }
    }
  }, async (request) => {
    const db = open()
    const patientId = request.params.id
    assertLinked(db, request.user.uid, patientId)

    const patient = db.prepare('SELECT * FROM patient WHERE id = ?').get(patientId)
    if (!patient) throw notFound('患者不存在')

    const to = request.query.to || Date.now()
    const from = request.query.from || (to - 28 * DAY)

    // 视图 v_patient_week 没有时间范围参数，这里直接按 record 聚合，
    // 周归属用固定 +8 小时而不是 localtime，避免服务器时区变化导致跨周错位。
    const weeks = db.prepare(`
      SELECT
        strftime('%Y-%W', started_at / 1000, 'unixepoch', '+8 hours') AS week,
        COUNT(*) AS sessions,
        ROUND(SUM(duration_sec), 1) AS total_sec,
        ROUND(AVG(score), 1) AS avg_score,
        ROUND(AVG(accuracy), 4) AS avg_accuracy,
        SUM(interrupted) AS interrupted_sessions
      FROM record
      WHERE patient_id = ? AND data_source = 'sensor' AND deleted_at IS NULL
        AND started_at BETWEEN ? AND ?
      GROUP BY week
      ORDER BY week DESC
      LIMIT 12
    `).all(patientId, from, to)

    const byGame = db.prepare(`
      SELECT game_id,
        COUNT(*) AS sessions,
        ROUND(SUM(duration_sec), 1) AS total_sec,
        ROUND(AVG(score), 1) AS avg_score,
        ROUND(AVG(accuracy), 4) AS avg_accuracy,
        SUM(interrupted) AS interrupted_sessions
      FROM record
      WHERE patient_id = ? AND data_source = 'sensor' AND deleted_at IS NULL
        AND started_at BETWEEN ? AND ?
      GROUP BY game_id
      ORDER BY sessions DESC
    `).all(patientId, from, to)

    const recent = db.prepare(`
      SELECT id, game_id, started_at, duration_sec, score, accuracy, interrupted, config_snapshot
      FROM record
      WHERE patient_id = ? AND data_source = 'sensor' AND deleted_at IS NULL
      ORDER BY started_at DESC LIMIT 20
    `).all(patientId)

    const plan = db.prepare(`
      SELECT * FROM care_plan
      WHERE patient_id = ? AND status = 'active'
      ORDER BY created_at DESC LIMIT 1
    `).get(patientId)

    const totalSessions = byGame.reduce((s, g) => s + g.sessions, 0)

    return {
      ok: true,
      patient: {
        id: patient.id,
        code: patient.code,
        displayName: patient.display_name,
        birthYear: patient.birth_year,
        sex: patient.sex,
        note: patient.note
      },
      range: { from, to },
      summary: {
        sessions: totalSessions,
        totalSec: Math.round(byGame.reduce((s, g) => s + g.total_sec, 0))
      },
      weeks,
      byGame,
      recent: recent.map((r) => ({
        recordId: r.id,
        gameId: r.game_id,
        startedAt: r.started_at,
        durationSec: r.duration_sec,
        score: r.score,
        accuracy: r.accuracy,
        interrupted: !!r.interrupted,
        configVersion: (JSON.parse(r.config_snapshot || '{}').version) || 0
      })),
      plan: plan && {
        id: plan.id,
        title: plan.title,
        games: JSON.parse(plan.games || '[]'),
        startDate: plan.start_date,
        endDate: plan.end_date
      }
    }
  })
}
