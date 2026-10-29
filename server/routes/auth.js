// ============================================================================
// server/routes/auth.js —— 登录 / 当前用户
// ----------------------------------------------------------------------------
// 流程：
//   wx.login 拿 code → 服务端换 openid → 建/更新 app_user
//   → 如果是患者且还没有档案，自动建一条 patient（这就是「不要邀请码」的关键）
//   → 签自有 JWT（2 小时）
//
// 患者档案自动创建的意义：患者第一次打开小程序就能训练、能上传，
// 不需要任何码、不需要等治疗师批准。治疗师之后在「待认领池」里认领即可。
// ============================================================================

const { open, tx } = require('../db')
const { uid, nextPatientCode } = require('../lib/ids')
const { badRequest, unauthorized, forbidden } = require('../lib/errors')
const wx = require('../lib/wx')

const TOKEN_TTL = '2h'

/** 治疗师 openid 白名单（环境变量，逗号分隔） */
function therapistOpenids() {
  return String(process.env.THERAPIST_OPENIDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 角色判定。
 * 生产：只看 THERAPIST_OPENIDS 白名单。
 * 开发：devId 以 therapist 开头即视为治疗师 —— 这是有意留的后门，
 *       方便在没有真实治疗师微信的情况下联调看板。DEV_LOGIN=0 时不生效。
 */
function roleFor(openid, devId) {
  if (therapistOpenids().includes(openid)) return 'therapist'
  if (wx.DEV_LOGIN && /^therapist/i.test(String(devId || ''))) return 'therapist'
  return 'patient'
}

function upsertUser(db, openid, profile) {
  const now = Date.now()
  let user = db.prepare('SELECT * FROM app_user WHERE openid = ?').get(openid)

  if (!user) {
    const id = uid('u_')
    db.prepare(
      `INSERT INTO app_user (id, openid, role, display_name, avatar_url, created_at, last_login_at)
       VALUES (?,?,?,?,?,?,?)`
    ).run(
      id,
      openid,
      roleFor(openid, profile.devId),
      profile.nickname || (roleFor(openid, profile.devId) === 'therapist' ? '治疗师' : '体验用户'),
      profile.avatarUrl || null,
      now,
      now
    )
    user = db.prepare('SELECT * FROM app_user WHERE id = ?').get(id)
  } else {
    // 昵称/头像只在客户端显式给了才更新，避免把治疗师改过的显示名冲掉
    db.prepare('UPDATE app_user SET last_login_at = ? WHERE id = ?').run(now, user.id)
    if (profile.nickname || profile.avatarUrl) {
      db.prepare(
        'UPDATE app_user SET display_name = COALESCE(?, display_name), avatar_url = COALESCE(?, avatar_url) WHERE id = ?'
      ).run(profile.nickname || null, profile.avatarUrl || null, user.id)
    }
    user = db.prepare('SELECT * FROM app_user WHERE id = ?').get(user.id)
  }
  if (user.disabled_at) throw forbidden('账号已停用')
  return user
}

/** 患者账号必须有且只有一条 patient 档案 */
function ensurePatient(db, user) {
  if (user.role !== 'patient') return null
  const existing = db.prepare('SELECT * FROM patient WHERE user_id = ?').get(user.id)
  if (existing) return existing
  return tx((d) => {
    const id = uid('p_')
    const code = nextPatientCode(d)
    d.prepare(
      `INSERT INTO patient (id, code, display_name, user_id, created_by, created_at)
       VALUES (?,?,?,?,?,?)`
    ).run(id, code, user.display_name || '体验用户', user.id, user.id, Date.now())
    return d.prepare('SELECT * FROM patient WHERE id = ?').get(id)
  })
}

function activeLink(db, patientId) {
  if (!patientId) return null
  return db
    .prepare(
      `SELECT l.id, l.linked_at, u.id AS therapist_id, u.display_name
       FROM care_link l JOIN app_user u ON u.id = l.therapist_id
       WHERE l.patient_id = ? AND l.status = 'active'
       ORDER BY l.linked_at DESC LIMIT 1`
    )
    .get(patientId) || null
}

function activePlan(db, patientId) {
  if (!patientId) return null
  const today = new Date().toISOString().slice(0, 10)
  return db
    .prepare(
      `SELECT * FROM care_plan
       WHERE patient_id = ? AND status = 'active' AND start_date <= ? AND end_date >= ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(patientId, today, today) || null
}

function configVersions(db, patientId) {
  if (!patientId) return {}
  const rows = db
    .prepare('SELECT game_id, version FROM game_config WHERE patient_id = ?')
    .all(patientId)
  const out = {}
  rows.forEach((r) => { out[r.game_id] = r.version })
  return out
}

module.exports = async function authRoutes(fastify) {
  // ---------------------------------------------------------------- 登录
  fastify.post('/api/v1/auth/login', {
    schema: {
      body: {
        type: 'object',
        properties: {
          code: { type: 'string', maxLength: 256 },
          devId: { type: 'string', maxLength: 64 },
          nickname: { type: 'string', maxLength: 64 },
          avatarUrl: { type: 'string', maxLength: 512 }
        },
        additionalProperties: false
      }
    }
  }, async (request) => {
    const { code, devId, nickname, avatarUrl } = request.body || {}
    const sess = await wx.code2session(code, devId)

    const db = open()
    const user = upsertUser(db, sess.openid, { nickname, avatarUrl, devId })
    const patient = ensurePatient(db, user)
    const link = activeLink(db, patient && patient.id)
    const plan = activePlan(db, patient && patient.id)

    const token = fastify.jwt.sign(
      { uid: user.id, role: user.role, orgId: user.org_id },
      { expiresIn: TOKEN_TTL }
    )

    return {
      ok: true,
      token,
      expiresIn: 7200,
      role: user.role,
      dev: sess.dev,
      user: {
        id: user.id,
        role: user.role,
        displayName: user.display_name,
        avatarUrl: user.avatar_url
      },
      patient: patient && {
        id: patient.id,
        code: patient.code,
        displayName: patient.display_name,
        birthYear: patient.birth_year,
        sex: patient.sex,
        note: patient.note
      },
      therapist: link && {
        id: link.therapist_id,
        displayName: link.display_name,
        linkedAt: link.linked_at
      },
      plan: plan && {
        id: plan.id,
        title: plan.title,
        games: JSON.parse(plan.games || '[]'),
        startDate: plan.start_date,
        endDate: plan.end_date,
        note: plan.note
      },
      configVersions: configVersions(db, patient && patient.id)
    }
  })

  // ---------------------------------------------------------------- 当前用户
  fastify.get('/api/v1/me', { onRequest: [fastify.authenticate] }, async (request) => {
    const db = open()
    const user = db.prepare('SELECT * FROM app_user WHERE id = ?').get(request.user.uid)
    if (!user) throw unauthorized('账号不存在')
    const patient = db.prepare('SELECT * FROM patient WHERE user_id = ?').get(user.id)
    const link = activeLink(db, patient && patient.id)
    return {
      ok: true,
      user: {
        id: user.id,
        role: user.role,
        displayName: user.display_name,
        avatarUrl: user.avatar_url
      },
      patient: patient && {
        id: patient.id,
        code: patient.code,
        displayName: patient.display_name,
        birthYear: patient.birth_year,
        sex: patient.sex,
        note: patient.note
      },
      therapist: link && {
        id: link.therapist_id,
        displayName: link.display_name,
        linkedAt: link.linked_at
      },
      configVersions: configVersions(db, patient && patient.id)
    }
  })

  // ---------------------------------------------------------------- 开发用：提升为治疗师
  // 仅在 DEV_LOGIN=1 且 NODE_ENV !== 'production' 时可用，方便在没有真实
  // 治疗师 openid 的情况下测治疗师端。生产环境这条路由直接 403。
  fastify.post('/api/v1/auth/dev-promote', { onRequest: [fastify.authenticate] }, async (request) => {
    if (!wx.DEV_LOGIN || process.env.NODE_ENV === 'production') {
      throw forbidden('该接口仅在开发环境可用')
    }
    const db = open()
    db.prepare("UPDATE app_user SET role = 'therapist' WHERE id = ?").run(request.user.uid)
    // 角色变了要重签 token，否则旧 token 里还是 patient
    const user = db.prepare('SELECT * FROM app_user WHERE id = ?').get(request.user.uid)
    const token = fastify.jwt.sign(
      { uid: user.id, role: user.role, orgId: user.org_id },
      { expiresIn: TOKEN_TTL }
    )
    return { ok: true, role: user.role, token }
  })
}
