// ============================================================================
// utils/therapist.js —— 治疗师看板接口封装
// ----------------------------------------------------------------------------
// 只做薄封装，不放业务逻辑。页面直接 await 这些方法。
// 所有接口在服务端都会校验「当前账号是不是治疗师」以及「有没有与该患者绑定」，
// 客户端不用再做权限判断（做了也不可信）。
// ============================================================================

const api = require('./api.js')

/** 我的患者列表（含本周次数、上次训练、异常标记） */
function patients() {
  return api.get('/v1/therapist/patients')
}

/** 待认领池：已登录但还没有治疗师的患者 */
function unclaimed() {
  return api.get('/v1/therapist/unclaimed')
}

/** 门诊建档（患者还没登录也能先建） */
function createPatient(data) {
  return api.post('/v1/patients', data)
}

/**
 * 认领患者。
 * @param {string} patientId 待认领的患者档案 id
 * @param {string} [mergeIntoId] 合并到自己之前建的档案（门诊已建档时用）
 */
function claim(patientId, mergeIntoId) {
  const body = mergeIntoId ? { mergeIntoId } : {}
  return api.post('/v1/patients/' + encodeURIComponent(patientId) + '/claim', body)
}

/** 周报 */
function report(patientId, from, to) {
  let q = ''
  const parts = []
  if (from) parts.push('from=' + from)
  if (to) parts.push('to=' + to)
  if (parts.length) q = '?' + parts.join('&')
  return api.get('/v1/patients/' + encodeURIComponent(patientId) + '/report' + q)
}

/** 查某个患者的记录（默认排除模拟数据） */
function records(patientId, opts) {
  const o = opts || {}
  const parts = ['patientId=' + encodeURIComponent(patientId)]
  if (o.gameId) parts.push('gameId=' + o.gameId)
  if (o.from) parts.push('from=' + o.from)
  if (o.to) parts.push('to=' + o.to)
  if (o.limit) parts.push('limit=' + o.limit)
  if (o.includeSimulation) parts.push('includeSimulation=true')
  return api.get('/v1/records?' + parts.join('&'))
}

/** 读某患者某游戏的参数 */
function getConfig(patientId, gameId) {
  return api.get('/v1/config/' + gameId + '?patientId=' + encodeURIComponent(patientId))
}

/**
 * 写某患者某游戏的参数。
 * expectedVersion 用于乐观锁：不传就是「无条件覆盖」，传了就要求版本一致。
 */
function setConfig(patientId, gameId, config, expectedVersion) {
  const body = { config }
  if (typeof expectedVersion === 'number') body.expectedVersion = expectedVersion
  return api.put('/v1/config/' + gameId + '?patientId=' + encodeURIComponent(patientId), body)
}

module.exports = {
  patients,
  unclaimed,
  createPatient,
  claim,
  report,
  records,
  getConfig,
  setConfig
}
