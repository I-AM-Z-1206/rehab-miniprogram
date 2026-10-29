// ============================================================================
// server/lib/wx.js —— 微信登录（code2session）
// ----------------------------------------------------------------------------
// 两种模式：
//   1. 生产：配置 WX_APPID + WX_SECRET，调微信官方接口换 openid。
//   2. 开发：没配 Secret 且 DEV_LOGIN=1 时，用客户端传来的稳定 devId 派生一个
//      假 openid。这样同一个设备多次登录仍是同一个人，便于在没有
//      AppSecret 的情况下跑通全链路。**生产环境不要开 DEV_LOGIN。**
//
// 注意：session_key 不下发、不入库。我们只用 openid 做身份，不需要解密用户信息。
// ============================================================================

const crypto = require('crypto')
const { HttpError } = require('./errors')

const APPID = process.env.WX_APPID || ''
const SECRET = process.env.WX_SECRET || ''
const DEV_LOGIN = process.env.DEV_LOGIN === '1'
const TIMEOUT_MS = 5000

function devOpenid(seed) {
  return 'dev_' + crypto.createHash('sha256').update(String(seed)).digest('hex').slice(0, 24)
}

function configured() {
  return !!(APPID && SECRET)
}

/**
 * @param {string} code    wx.login 拿到的 code
 * @param {string} devId   开发模式下的稳定设备标识（生产忽略）
 * @returns {Promise<{openid:string, unionid?:string, dev:boolean}>}
 */
async function code2session(code, devId) {
  if (!configured()) {
    if (!DEV_LOGIN) {
      throw new HttpError(
        503,
        'WX_NOT_CONFIGURED',
        '服务端未配置 WX_APPID / WX_SECRET，且未开启 DEV_LOGIN'
      )
    }
    const seed = devId || code
    if (!seed) throw new HttpError(400, 'NO_DEV_ID', '开发登录需要提供 devId 或 code')
    return { openid: devOpenid(seed), dev: true }
  }

  if (!code) throw new HttpError(400, 'NO_CODE', '缺少 code')

  const url =
    'https://api.weixin.qq.com/sns/jscode2session' +
    '?appid=' + encodeURIComponent(APPID) +
    '&secret=' + encodeURIComponent(SECRET) +
    '&js_code=' + encodeURIComponent(code) +
    '&grant_type=authorization_code'

  let res
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    throw new HttpError(502, 'WX_UNREACHABLE', '连接微信服务失败，请稍后重试')
  }
  if (!res.ok) throw new HttpError(502, 'WX_HTTP_' + res.status, '微信服务返回异常')

  let data
  try {
    data = await res.json()
  } catch (e) {
    throw new HttpError(502, 'WX_BAD_JSON', '微信服务返回无法解析')
  }

  if (data.errcode) {
    // 40029 = code 无效/已使用；40163 = code 已被使用
    const msg = data.errcode === 40029 || data.errcode === 40163
      ? '登录凭证已失效，请重试'
      : '微信登录失败（' + data.errcode + '）'
    throw new HttpError(400, 'WX_LOGIN_FAILED', msg, { errcode: data.errcode })
  }
  if (!data.openid) throw new HttpError(502, 'WX_NO_OPENID', '微信未返回 openid')

  return { openid: data.openid, unionid: data.unionid || null, dev: false }
}

module.exports = { code2session, configured, devOpenid, DEV_LOGIN }
