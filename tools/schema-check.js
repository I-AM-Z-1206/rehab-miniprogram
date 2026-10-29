// ============================================================================
// tools/schema-check.js —— server/schema.sql 的可执行性与行为校验
// ----------------------------------------------------------------------------
// 用内存库跑一遍建表语句，再验证几条"设计上必须成立"的规则：
//   · simulation 数据不进统计视图（防演示数据混进康复报告）
//   · 软删的记录不进统计
//   · recordId 主键天然幂等（重传不重复计分）
//   · 患者登录后自动进入"待认领池"，认领后离开池子（这是不要邀请码的实现基础）
//   · 一个登录账号只能认领一个患者档案；一个患者可以有多个治疗师（转诊）
//   · role / data_source / sex 等非法值被 CHECK 拦下
//
// 为什么不并入 npm test：node:sqlite 在 Node 22.x 还需要 --experimental-sqlite，
// 而其余自检要能在 Node 18 上跑。所以这是一个独立的、可选的门禁。
//
// 运行：
//   Node 23.4+  node tools/schema-check.js
//   Node 22.x   node --experimental-sqlite tools/schema-check.js
// ============================================================================

const fs = require('fs')
const path = require('path')

let DatabaseSync
try {
  ({ DatabaseSync } = require('node:sqlite'))
} catch (e) {
  console.log('[schema-check] 跳过：当前 Node 不支持 node:sqlite。')
  console.log('[schema-check] Node 22.x 请加 --experimental-sqlite 重跑；Node 23.4+ 可直接运行。')
  process.exit(0)
}

const schemaPath = path.join(__dirname, '..', 'server', 'schema.sql')
const db = new DatabaseSync(':memory:')
db.exec(fs.readFileSync(schemaPath, 'utf8'))

let pass = 0
let fail = 0
function check(name, fn) {
  try {
    if (fn()) { pass += 1; console.log('  ok   ' + name) }
    else { fail += 1; console.log('  FAIL ' + name) }
  } catch (e) {
    fail += 1
    console.log('  FAIL ' + name + ' -> ' + e.message)
  }
}

const now = Date.UTC(2026, 9, 28, 2, 0, 0) // 2026-10-28 10:00 北京时间
const DAY = 86400000

const addUser = db.prepare('INSERT INTO app_user(id,openid,role,display_name,created_at) VALUES(?,?,?,?,?)')
addUser.run('u_t1', 'o_therapist', 'therapist', '王治疗师', now)
addUser.run('u_p1', 'o_patient', 'patient', '微信昵称', now)

const addPatient = db.prepare(`INSERT INTO patient
  (id,code,display_name,birth_year,note,user_id,created_by,created_at)
  VALUES(?,?,?,?,?,?,?,?)`)
addPatient.run('p_0231', 'P-0231', '张*爷', 1948, '右侧偏瘫', 'u_p1', 'u_t1', now)

const addLink = db.prepare('INSERT INTO care_link(id,patient_id,therapist_id,linked_at) VALUES(?,?,?,?)')

const ins = db.prepare(`INSERT INTO record
  (id,patient_id,game_id,started_at,duration_sec,score,accuracy,metrics,config_snapshot,data_source,interrupted,created_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
const snap = JSON.stringify({ version: 1, difficulty: 2, holdToleranceDeg: 6 })

ins.run('r1', 'p_0231', 'fruit', now, 90, 1200, 0.72, '{"holdRate":0.62}', snap, 'sensor', 0, now)
ins.run('r2', 'p_0231', 'fruit', now + DAY, 90, 1350, 0.78, '{"holdRate":0.70}', snap, 'sensor', 0, now)
ins.run('r3', 'p_0231', 'rhythm', now + 2 * DAY, 60, 2400, 0.85, '{"rhythmAccuracy":0.62}', snap, 'sensor', 1, now)
ins.run('r4', 'p_0231', 'fruit', now + 3 * DAY, 90, 9999, 1.0, '{}', snap, 'simulation', 0, now)

console.log('[schema-check] ' + schemaPath)

check('未认领的患者出现在待认领池', () => {
  const rows = db.prepare('SELECT id FROM v_unclaimed_patient').all()
  return rows.length === 1 && rows[0].id === 'p_0231'
})

check('认领后离开待认领池', () => {
  addLink.run('l1', 'p_0231', 'u_t1', now)
  const rows = db.prepare('SELECT id FROM v_unclaimed_patient').all()
  return rows.length === 0
})

check('模拟数据不计入周统计（3 条 sensor，不是 4 条）', () => {
  const row = db.prepare('SELECT sessions, interrupted_sessions FROM v_patient_week WHERE patient_id=?').get('p_0231')
  return row && row.sessions === 3 && row.interrupted_sessions === 1
})

check('周视图 avg_score 只算 sensor（1200/1350/2400 → 1650）', () => {
  const row = db.prepare('SELECT avg_score FROM v_patient_week WHERE patient_id=?').get('p_0231')
  return row && Math.round(row.avg_score) === 1650
})

check('v_patient_last 的总局数与最近训练时间正确', () => {
  const row = db.prepare('SELECT total_sessions, last_started_at FROM v_patient_last WHERE patient_id=?').get('p_0231')
  return row && row.total_sessions === 3 && row.last_started_at === now + 2 * DAY
})

check('recordId 主键去重（重传不重复计分）', () => {
  try {
    ins.run('r1', 'p_0231', 'fruit', now, 90, 1, 0.1, '{}', snap, 'sensor', 0, now)
    return false
  } catch (e) {
    return /UNIQUE|PRIMARY/i.test(e.message)
  }
})

check('一个登录账号不能认领第二个患者档案', () => {
  try {
    addPatient.run('p_x', 'P-9999', '另一个人', 1950, '', 'u_p1', 'u_t1', now)
    return false
  } catch (e) {
    return /UNIQUE/i.test(e.message)
  }
})

check('一个 patient 可以有多个治疗师（转诊不丢历史）', () => {
  addUser.run('u_t2', 'o_therapist2', 'therapist', '李治疗师', now)
  addLink.run('l2', 'p_0231', 'u_t2', now)
  const n = db.prepare("SELECT COUNT(*) AS n FROM care_link WHERE patient_id='p_0231' AND status='active'").get()
  return n.n === 2
})

check('非法 role 被 CHECK 拦下', () => {
  try {
    addUser.run('u_bad', 'o_bad', 'hacker', 'x', now)
    return false
  } catch (e) {
    return /CHECK/i.test(e.message)
  }
})

check('非法 data_source 被 CHECK 拦下', () => {
  try {
    ins.run('r9', 'p_0231', 'fruit', now, 90, 1, 0.1, '{}', snap, 'fake', 0, now)
    return false
  } catch (e) {
    return /CHECK/i.test(e.message)
  }
})

check('非法 sex 被 CHECK 拦下', () => {
  try {
    addPatient.run('p_y', 'P-8888', 'x', 1960, '', null, 'u_t1', now)
    db.prepare("UPDATE patient SET sex='X' WHERE id='p_y'").run()
    return false
  } catch (e) {
    return /CHECK/i.test(e.message)
  }
})

check('软删后不计入视图', () => {
  db.prepare('UPDATE record SET deleted_at=? WHERE id=?').run(now, 'r2')
  const row = db.prepare('SELECT sessions FROM v_patient_week WHERE patient_id=?').get('p_0231')
  return row && row.sessions === 2
})

check('game_config 主键是 (patient_id, game_id)', () => {
  const g = db.prepare('INSERT INTO game_config(patient_id,game_id,payload,updated_at) VALUES(?,?,?,?)')
  g.run('p_0231', 'fruit', '{"difficulty":2}', now)
  try {
    g.run('p_0231', 'fruit', '{"difficulty":3}', now)
    return false
  } catch (e) {
    return /UNIQUE|PRIMARY/i.test(e.message)
  }
})

console.log('\n[schema-check] ' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
