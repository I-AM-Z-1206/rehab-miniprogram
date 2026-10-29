// ============================================================================
// server/lib/ids.js —— id 生成
// ----------------------------------------------------------------------------
// 统一用「前缀 + 时间戳36进制 + 随机」，可读、有序、碰撞概率可忽略。
// 患者编号 P-0001 需要自己递增，用 schema_meta 里的计数器，调用方必须在事务内。
// ============================================================================

const crypto = require('crypto')

function uid(prefix) {
  const ts = Date.now().toString(36)
  const rnd = crypto.randomBytes(4).toString('hex')
  return (prefix || '') + ts + '_' + rnd
}

/**
 * 取下一个患者编号（P-0001）。必须在事务里调用，否则并发会拿到同一个号。
 */
function nextPatientCode(db) {
  const row = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'last_patient_seq'")
    .get()
  const seq = (row ? Number(row.value) : 0) + 1
  db.prepare(
    `INSERT INTO schema_meta (key, value, updated_at) VALUES ('last_patient_seq', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(String(seq), Date.now())
  return 'P-' + String(seq).padStart(4, '0')
}

module.exports = { uid, nextPatientCode }
