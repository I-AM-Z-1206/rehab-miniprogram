// ============================================================================
// server/lib/errors.js —— 统一错误
// ----------------------------------------------------------------------------
// 所有对外错误都走 HttpError，由 app.js 的 setErrorHandler 统一序列化成：
//   { ok: false, error: { code: 'BAD_REQUEST', message: '...' } }
// 不把堆栈吐给客户端。
// ============================================================================

class HttpError extends Error {
  constructor(status, code, message, detail) {
    super(message || code)
    this.status = status
    this.code = code
    this.detail = detail
  }
}

const badRequest = (msg, detail) => new HttpError(400, 'BAD_REQUEST', msg, detail)
const unauthorized = (msg) => new HttpError(401, 'UNAUTHORIZED', msg || '未登录或登录已过期')
const forbidden = (msg) => new HttpError(403, 'FORBIDDEN', msg || '无权限')
const notFound = (msg) => new HttpError(404, 'NOT_FOUND', msg || '资源不存在')
const conflict = (msg) => new HttpError(409, 'CONFLICT', msg || '资源冲突')
const tooMany = (msg) => new HttpError(413, 'PAYLOAD_TOO_LARGE', msg || '请求体过大')

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict, tooMany }
