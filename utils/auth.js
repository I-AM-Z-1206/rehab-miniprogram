// ============================================================================
// utils/auth.js —— 登录态与隐私授权
// ----------------------------------------------------------------------------
// 与 utils/api.js 分工：
//   api.js  只管「怎么发请求、token 怎么续」
//   auth.js 管「我现在是谁、能不能上报、要不要弹授权」
//
// 隐私授权只做一次：首次进入时弹一次，之后静默上报。
// 原来每局都要传 consent:true（等于没人会上报），已废弃。
// ============================================================================

const api = require('./api.js')

const PRIVACY_VERSION = 1

let bootPromise = null

/**
 * 应用启动时调用一次。失败不应该阻塞本地训练，调用方要 catch。
 * @returns {Promise<{role:string, user:object, patient:object, therapist:object}>}
 */
function bootstrap(force) {
  if (!force && bootPromise) return bootPromise
  bootPromise = api.ensureLogin(force).then((d) => ({
    role: d.role || 'patient',
    user: d.user || api.cachedUser(),
    patient: d.patient || api.cachedPatient(),
    therapist: d.therapist || api.cachedTherapist()
  })).catch((e) => {
    bootPromise = null
    throw e
  })
  return bootPromise
}

function current() {
  return {
    role: (api.cachedUser() || {}).role || 'patient',
    user: api.cachedUser(),
    patient: api.cachedPatient(),
    therapist: api.cachedTherapist()
  }
}

function patientId() {
  const p = api.cachedPatient()
  return p && p.id ? p.id : ''
}

function patientCode() {
  const p = api.cachedPatient()
  return p && p.code ? p.code : ''
}

function isTherapist() {
  return (api.cachedUser() || {}).role === 'therapist'
}

function isBound() {
  return !!api.cachedTherapist()
}

function therapistName() {
  const t = api.cachedTherapist()
  return t ? t.displayName : ''
}

// ---------------------------------------------------------------- 隐私授权
/** 是否已经就收集范围达成过一次同意（不是每局都问） */
function hasPrivacyConsent() {
  let rec = null
  try { rec = wx.getStorageSync('privacy_consent_v1') } catch (e) { /* 忽略 */ }
  return !!(rec && rec.version === PRIVACY_VERSION && rec.agreed === true)
}

function setPrivacyConsent() {
  try {
    wx.setStorageSync('privacy_consent_v1', {
      version: PRIVACY_VERSION,
      agreed: true,
      at: Date.now()
    })
  } catch (e) { /* 忽略 */ }
  api.setConsent(true)
  return true
}

function revokePrivacyConsent() {
  try { wx.removeStorageSync('privacy_consent_v1') } catch (e) { /* 忽略 */ }
  api.setConsent(false)
  return true
}

// ---------------------------------------------------------------- 开发辅助
/** 切换当前设备身份（开发期用来模拟治疗师） */
function switchDevIdentity(devId) {
  api.setDevId(devId)
  bootPromise = null
  return bootstrap(true)
}

module.exports = {
  bootstrap,
  current,
  patientId,
  patientCode,
  isTherapist,
  isBound,
  therapistName,
  hasPrivacyConsent,
  setPrivacyConsent,
  revokePrivacyConsent,
  switchDevIdentity,
  PRIVACY_VERSION
}
