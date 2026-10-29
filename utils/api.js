// ============================================================================
// utils/api.js —— 统一的网络层（登录态、token、重试）
// ----------------------------------------------------------------------------
// 职责：
//   1. 统一 BASE_URL（备案后只改 DEFAULT_BASE 一处，或调 setBase 运行时切换）
//   2. token 缓存与自动续期：过期前静默重登，业务代码不用管
//   3. 401 自动重登并重试一次（code 是一次性的，必须重新 wx.login）
//   4. 统一错误对象：err.status / err.code / err.network
//
// 注意：patientId 不由客户端传。服务端从 JWT 里推导"你是谁"，
// 客户端伪造不了别人的记录 —— 这是安全设计，不是遗漏。
// ============================================================================

const DEFAULT_BASE = 'http://47.112.18.198/api'

const K = {
  base: 'api_base_v1',
  token: 'api_token_v1',
  exp: 'api_token_exp_v1',
  user: 'api_user_v1',
  patient: 'api_patient_v1',
  therapist: 'api_therapist_v1',
  devId: 'api_dev_id_v1',
  consent: 'api_consent_v1'
}

const TIMEOUT = 10000
const EXPIRE_MARGIN = 60 * 1000   // 提前 60 秒视为过期，避免边界失败

function getBase() {
  let v = ''
  try { v = wx.getStorageSync(K.base) || '' } catch (e) { /* 忽略 */ }
  return (v || DEFAULT_BASE).replace(/\/+$/, '')
}

function setBase(url) {
  try { wx.setStorageSync(K.base, String(url || '').replace(/\/+$/, '')) } catch (e) { /* 忽略 */ }
  return getBase()
}

function getToken() {
  try { return wx.getStorageSync(K.token) || '' } catch (e) { return '' }
}

function getExp() {
  try { return Number(wx.getStorageSync(K.exp)) || 0 } catch (e) { return 0 }
}

function tokenValid() {
  return !!getToken() && getExp() > Date.now() + EXPIRE_MARGIN
}

function clearAuth() {
  try {
    wx.removeStorageSync(K.token)
    wx.removeStorageSync(K.exp)
    wx.removeStorageSync(K.user)
    wx.removeStorageSync(K.patient)
    wx.removeStorageSync(K.therapist)
  } catch (e) { /* 忽略 */ }
}

function getDevId() {
  let id = ''
  try { id = wx.getStorageSync(K.devId) || '' } catch (e) { /* 忽略 */ }
  if (!id) {
    id = 'dev-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    try { wx.setStorageSync(K.devId, id) } catch (e) { /* 忽略 */ }
  }
  return id
}

/** 开发期切换身份用：把当前设备伪造成治疗师（服务端需 DEV_LOGIN=1） */
function setDevId(id) {
  try { wx.setStorageSync(K.devId, id) } catch (e) { /* 忽略 */ }
  clearAuth()
  return id
}

function cachedUser() {
  try { return wx.getStorageSync(K.user) || null } catch (e) { return null }
}

function cachedPatient() {
  try { return wx.getStorageSync(K.patient) || null } catch (e) { return null }
}

function cachedTherapist() {
  try { return wx.getStorageSync(K.therapist) || null } catch (e) { return null }
}

function saveAuth(data) {
  try {
    wx.setStorageSync(K.token, data.token)
    wx.setStorageSync(K.exp, Date.now() + (Number(data.expiresIn) || 7200) * 1000)
    wx.setStorageSync(K.user, data.user || null)
    wx.setStorageSync(K.patient, data.patient || null)
    wx.setStorageSync(K.therapist, data.therapist || null)
  } catch (e) { /* 忽略 */ }
}

// ---------------------------------------------------------------- 请求
function raw({ path, method, data, token, auth }) {
  return new Promise((resolve, reject) => {
    const header = { 'content-type': 'application/json' }
    if (auth !== false && token) header.Authorization = 'Bearer ' + token
    wx.request({
      url: getBase() + path,
      method: method || 'GET',
      data,
      header,
      timeout: TIMEOUT,
      success: (res) => {
        const code = res.statusCode
        const body = res.data
        if (code >= 200 && code < 300) {
          resolve(body)
          return
        }
        const e = new Error(
          (body && body.error && body.error.message) || ('服务返回 ' + code)
        )
        e.status = code
        e.code = body && body.error && body.error.code
        e.body = body
        reject(e)
      },
      fail: (err) => {
        const e = new Error((err && err.errMsg) || '网络异常')
        e.network = true
        reject(e)
      }
    })
  })
}

let loginPromise = null

/** 静默登录：已有有效 token 直接返回缓存，否则 wx.login 换一次 */
function ensureLogin(force) {
  if (!force && tokenValid()) {
    return Promise.resolve({
      token: getToken(),
      role: (cachedUser() || {}).role || 'patient',
      user: cachedUser(),
      patient: cachedPatient(),
      therapist: cachedTherapist(),
      cached: true
    })
  }
  if (loginPromise) return loginPromise

  loginPromise = new Promise((resolve, reject) => {
    wx.login({
      success: (r) => {
        if (!r || !r.code) {
          reject(new Error('wx.login 未返回 code'))
          return
        }
        raw({
          path: '/v1/auth/login',
          method: 'POST',
          data: { code: r.code, devId: getDevId() },
          auth: false
        }).then((data) => {
          saveAuth(data)
          resolve(data)
        }).catch(reject)
      },
      fail: (err) => {
        reject(new Error((err && err.errMsg) || 'wx.login 失败'))
      }
    })
  })

  // 无论成败都要释放，否则一次失败会把后续登录全卡住
  loginPromise.then(() => { loginPromise = null }, () => { loginPromise = null })
  return loginPromise
}

/**
 * 业务请求。自动带 token；遇到 401 静默重登并重试一次。
 * @param {object} opts { path, method, data, auth, retry }
 */
async function request(opts) {
  const needAuth = opts.auth !== false
  if (needAuth) await ensureLogin()

  try {
    return await raw({
      path: opts.path,
      method: opts.method,
      data: opts.data,
      token: getToken(),
      auth: opts.auth
    })
  } catch (e) {
    if (e.status === 401 && needAuth && opts.retry !== false) {
      clearAuth()
      await ensureLogin(true)
      return raw({
        path: opts.path,
        method: opts.method,
        data: opts.data,
        token: getToken(),
        auth: opts.auth
      })
    }
    throw e
  }
}

const get = (path, data) => request({ path, method: 'GET', data })
const post = (path, data, opts) => request(Object.assign({ path, method: 'POST', data }, opts || {}))
const put = (path, data) => request({ path, method: 'PUT', data })
const del = (path) => request({ path, method: 'DELETE' })

// ---------------------------------------------------------------- 隐私授权
function hasConsent() {
  try { return wx.getStorageSync(K.consent) === true } catch (e) { return false }
}

function setConsent(v) {
  try { wx.setStorageSync(K.consent, !!v) } catch (e) { /* 忽略 */ }
  return !!v
}

module.exports = {
  DEFAULT_BASE,
  getBase,
  setBase,
  getToken,
  tokenValid,
  clearAuth,
  ensureLogin,
  request,
  get,
  post,
  put,
  del,
  getDevId,
  setDevId,
  cachedUser,
  cachedPatient,
  cachedTherapist,
  hasConsent,
  setConsent,
  K
}
