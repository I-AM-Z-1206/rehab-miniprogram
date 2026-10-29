// ============================================================================
// tools/server-smoke-test.js —— 后端端到端自检（起真进程，打真接口）
// ----------------------------------------------------------------------------
// 覆盖：健康检查 / 鉴权 / 患者自动建档 / 上报与幂等 / 模拟数据隔离 /
//       批量补传 / 参数校验 / 配置下发 / 待认领与认领 / 患者列表 / 周报 / 软删
//
// 用法：
//   node tools/server-smoke-test.js
//   node --experimental-sqlite tools/server-smoke-test.js    （Node 22.x）
// ============================================================================

/* eslint-disable no-console */

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const http = require('http')

const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rehab-srv2-'))
const SECRET = 'smoke-secret-1234'

// node:sqlite 在 Node 22.5~23.3 需要 --experimental-sqlite，23.4+ 才默认可用。
// 这里先探一次，避免子进程启动失败后只报「启动超时」。
try {
  require('node:sqlite')
} catch (e) {
  console.log('[smoke] 跳过：当前 Node 不支持 node:sqlite。')
  console.log('[smoke] Node 22.x 请用 --experimental-sqlite 重跑；Node 23.4+ 可直接运行。')
  process.exit(0)
}

let PORT = 0
let child = null
let failed = 0
let passed = 0

function check(name, cond, extra) {
  if (cond) {
    passed += 1
    console.log('  ✓ ' + name)
  } else {
    failed += 1
    console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''))
  }
}

function request(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body)
    const req = http.request({
      host: '127.0.0.1',
      port: PORT,
      method,
      path: p,
      headers: Object.assign(
        data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {},
        token ? { authorization: 'Bearer ' + token } : {}
      )
    }, (res) => {
      let buf = ''
      res.on('data', (c) => { buf += c })
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(buf) } catch (e) { json = null }
        resolve({ status: res.statusCode, body: json, raw: buf })
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function waitForPort() {
  return new Promise((resolve, reject) => {
    let out = ''
    const timer = setTimeout(() => reject(new Error('服务启动超时: ' + out)), 15000)
    child.stdout.on('data', (c) => {
      out += c.toString()
      const m = /listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(out)
      if (m) {
        clearTimeout(timer)
        PORT = Number(m[1])
        resolve()
      }
    })
    child.stderr.on('data', (c) => { out += c.toString() })
  })
}

function stopChild() {
  return new Promise((resolve) => {
    if (!child || child.killed) return resolve()
    child.on('exit', () => resolve())
    child.kill('SIGTERM')
    setTimeout(() => { try { child.kill('SIGKILL') } catch (e) { /* 忽略 */ } resolve() }, 4000)
  })
}

const GAMES = ['fruit', 'wire', 'rhythm', 'shoot', 'race']

function mkRecord(id, extra) {
  return Object.assign({
    recordId: id,
    gameId: 'fruit',
    startedAt: Date.now(),
    durationSec: 90,
    score: 1200,
    accuracy: 0.72,
    metrics: { holdRate: 0.62, hits: 20, misses: 4 },
    configSnapshot: { version: 1, difficulty: 2, holdToleranceDeg: 6 },
    dataSource: 'sensor'
  }, extra || {})
}

async function run() {
  console.log('[smoke] 启动后端…')

  const execArgs = process.execArgv.includes('--experimental-sqlite')
    ? ['--experimental-sqlite']
    : []
  child = spawn(process.execPath, execArgs.concat(['app.js']), {
    cwd: path.join(ROOT, 'server'),
    env: Object.assign({}, process.env, {
      PORT: '0',
      DATA_DIR,
      SESSION_SECRET: SECRET,
      DEV_LOGIN: '1',
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      WX_APPID: '',
      WX_SECRET: ''
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.on('exit', (code) => {
    if (code && code !== 0) console.log('[smoke] 服务异常退出 code=' + code)
  })

  await waitForPort()
  console.log('[smoke] 端口 ' + PORT + '\n')

  // ---------------------------------------------------------------- 健康检查
  console.log('[1] 健康检查')
  let r = await request('GET', '/health')
  check('GET /health 返回 200', r.status === 200, r.status)
  check('db 可用', r.body && r.body.db === true, r.body)
  check('schema_version = 2', r.body && r.body.schemaVersion === '2', r.body)
  check('开发登录已启用', r.body && r.body.devLogin === true, r.body)

  // ---------------------------------------------------------------- 鉴权
  console.log('\n[2] 鉴权')
  r = await request('GET', '/api/v1/me')
  check('未带 token 访问 /me → 401', r.status === 401, r.status)
  r = await request('GET', '/api/v1/me', undefined, 'garbage.token.here')
  check('伪造 token → 401', r.status === 401, r.status)

  // ---------------------------------------------------------------- 患者登录
  console.log('\n[3] 患者登录与自动建档')
  r = await request('POST', '/api/v1/auth/login', { devId: 'patient-A', nickname: '张大爷' })
  check('登录成功 200', r.status === 200, r.status)
  const patientToken = r.body && r.body.token
  const patientId = r.body && r.body.patient && r.body.patient.id
  check('返回 token', !!patientToken)
  check('角色是 patient', r.body && r.body.role === 'patient', r.body && r.body.role)
  check('自动创建了患者档案（无需邀请码）', !!patientId, r.body && r.body.patient)
  check('患者编号形如 P-0001', /^P-\d{4}$/.test((r.body.patient || {}).code || ''), (r.body.patient || {}).code)
  check('尚无治疗师绑定', r.body && r.body.therapist === null, r.body && r.body.therapist)

  const firstPatientId = patientId

  r = await request('POST', '/api/v1/auth/login', { devId: 'patient-A', nickname: '张大爷' })
  check('同一设备重复登录，档案不变（不会重复建）',
    r.body && r.body.patient && r.body.patient.id === firstPatientId,
    r.body && r.body.patient && r.body.patient.id)

  // ---------------------------------------------------------------- 上报
  console.log('\n[4] 记录上报与幂等')
  r = await request('POST', '/api/v1/records', mkRecord('smoke_r1'), patientToken)
  check('单条上报 → 201', r.status === 201, r.status)
  check('accepted = 1', r.body && r.body.accepted === 1, r.body)

  r = await request('POST', '/api/v1/records', mkRecord('smoke_r1'), patientToken)
  check('重复 recordId → 200 且 duplicated = 1',
    r.status === 200 && r.body.duplicated === 1, r.body)

  r = await request('POST', '/api/v1/records', mkRecord('smoke_sim', { dataSource: 'simulation' }), patientToken)
  check('模拟数据也能存（201）', r.status === 201, r.status)

  r = await request('POST', '/api/v1/records', { recordId: 'bad', gameId: 'nope', startedAt: Date.now(), durationSec: 1, dataSource: 'sensor' }, patientToken)
  check('非法 gameId → 400', r.status === 400, r.status)

  r = await request('POST', '/api/v1/records', { gameId: 'fruit', startedAt: Date.now(), durationSec: 1, dataSource: 'sensor' }, patientToken)
  check('缺 recordId → 400', r.status === 400, r.status)

  r = await request('POST', '/api/v1/records', mkRecord('acc_1', { accuracy: 1.5 }), patientToken)
  check('accuracy 越界 → 400', r.status === 400, r.status)

  // ---------------------------------------------------------------- 查询
  console.log('\n[5] 查询与模拟数据隔离')
  r = await request('GET', '/api/v1/records', undefined, patientToken)
  check('默认查询排除 simulation（total = 1）', r.body && r.body.total === 1, r.body && r.body.total)

  r = await request('GET', '/api/v1/records?includeSimulation=true', undefined, patientToken)
  check('显式包含 simulation → total = 2', r.body && r.body.total === 2, r.body && r.body.total)

  r = await request('GET', '/api/v1/records?gameId=rhythm', undefined, patientToken)
  check('按游戏过滤生效（rhythm 无数据 → 0）', r.body && r.body.total === 0, r.body && r.body.total)

  // ---------------------------------------------------------------- 批量补传
  console.log('\n[6] 批量补传')
  const batch = []
  for (let i = 0; i < 20; i++) {
    batch.push(mkRecord('batch_' + i, { startedAt: Date.now() - i * 3600000 }))
  }
  r = await request('POST', '/api/v1/records', { records: batch }, patientToken)
  check('批量 20 条 → 201 且 accepted = 20', r.status === 201 && r.body.accepted === 20, r.body)

  r = await request('POST', '/api/v1/records', { records: batch.concat([mkRecord('over_20')]) }, patientToken)
  check('批量 21 条 → 400（超出上限）', r.status === 400, r.status)

  // ---------------------------------------------------------------- 配置
  console.log('\n[7] 参数下发')
  r = await request('GET', '/api/v1/config/fruit', undefined, patientToken)
  check('患者读配置：尚无 → version 0', r.body && r.body.version === 0, r.body)

  r = await request('PUT', '/api/v1/config/fruit?patientId=' + patientId,
    { config: { difficulty: 3 } }, patientToken)
  check('患者写配置 → 403（需治疗师）', r.status === 403, r.status)

  // ---------------------------------------------------------------- 治疗师
  console.log('\n[8] 治疗师侧')
  r = await request('POST', '/api/v1/auth/login', { devId: 'therapist-1', nickname: '王治疗师' })
  const therapistToken = r.body && r.body.token
  check('治疗师登录，角色正确', r.body && r.body.role === 'therapist', r.body && r.body.role)
  check('治疗师不会被创建患者档案', r.body && r.body.patient === null, r.body && r.body.patient)

  r = await request('GET', '/api/v1/therapist/unclaimed', undefined, therapistToken)
  const unclaimedCount = r.body && r.body.count
  check('待认领池里有刚登录的患者', unclaimedCount === 1, r.body)
  check('池子里就是 patient-A', r.body.patients[0].id === patientId, r.body.patients[0])

  r = await request('GET', '/api/v1/records?patientId=' + patientId, undefined, therapistToken)
  check('治疗师未绑定时查患者记录 → 403', r.status === 403, r.status)

  r = await request('POST', '/api/v1/patients/' + patientId + '/claim', {}, therapistToken)
  check('认领成功', r.status === 200 && r.body.ok === true, r.body)

  r = await request('GET', '/api/v1/therapist/unclaimed', undefined, therapistToken)
  check('认领后离开待认领池', r.body.count === 0, r.body.count)

  r = await request('POST', '/api/v1/auth/login', { devId: 'therapist-2', nickname: '李治疗师' })
  const otherToken = r.body.token
  r = await request('POST', '/api/v1/patients/' + patientId + '/claim', {}, otherToken)
  check('已被认领的患者不能再被别的治疗师认领 → 409', r.status === 409, r.status)

  // ---------------------------------------------------------------- 患者侧看到绑定
  console.log('\n[9] 绑定后的联动')
  r = await request('GET', '/api/v1/me', undefined, patientToken)
  check('患者 /me 能看到绑定的治疗师', r.body.therapist && r.body.therapist.displayName === '王治疗师', r.body.therapist)

  r = await request('PUT', '/api/v1/config/fruit?patientId=' + patientId,
    { config: { difficulty: 3, holdToleranceDeg: 5 } }, therapistToken)
  check('治疗师写配置 → version 1', r.body && r.body.version === 1, r.body)

  r = await request('GET', '/api/v1/config/fruit?since=0', undefined, patientToken)
  check('患者拉配置：changed = true 且 version 1',
    r.body.changed === true && r.body.version === 1, r.body)
  check('配置内容正确', r.body.config && r.body.config.holdToleranceDeg === 5, r.body.config)

  r = await request('GET', '/api/v1/config/fruit?since=1', undefined, patientToken)
  check('版本未变时 changed = false（省流量）', r.body.changed === false, r.body)

  r = await request('PUT', '/api/v1/config/fruit?patientId=' + patientId,
    { config: { difficulty: 4 }, expectedVersion: 0 }, therapistToken)
  check('乐观锁：expectedVersion 不匹配 → 409', r.status === 409, r.status)

  // ---------------------------------------------------------------- 列表与周报
  console.log('\n[10] 患者列表与周报')
  r = await request('GET', '/api/v1/therapist/patients', undefined, therapistToken)
  const p0 = r.body && r.body.patients && r.body.patients[0]
  check('患者列表 1 人', r.body.count === 1, r.body.count)
  check('列表带本周训练次数', p0 && p0.weekSessions >= 1, p0 && p0.weekSessions)
  check('列表带上次训练时间', p0 && !!p0.lastStartedAt, p0 && p0.lastStartedAt)

  r = await request('GET', '/api/v1/patients/' + patientId + '/report', undefined, therapistToken)
  check('周报返回 200', r.status === 200, r.status)
  check('周报有汇总数据', r.body.summary && r.body.summary.sessions >= 20, r.body.summary)
  check('周报按游戏分组', Array.isArray(r.body.byGame) && r.body.byGame.length >= 1, r.body.byGame)
  check('周报最近记录带 configVersion', r.body.recent[0] && r.body.recent[0].configVersion === 1, r.body.recent[0])

  r = await request('GET', '/api/v1/patients/' + patientId + '/report', undefined, otherToken)
  check('未绑定治疗师看周报 → 403', r.status === 403, r.status)

  // ---------------------------------------------------------------- 软删
  console.log('\n[11] 软删除')
  r = await request('DELETE', '/api/v1/records/smoke_r1', undefined, patientToken)
  check('删除自己的记录 → 200', r.status === 200, r.status)
  r = await request('GET', '/api/v1/records?includeSimulation=true', undefined, patientToken)
  // 删除前共 22 条（smoke_r1 + smoke_sim + batch 20），删掉 1 条应剩 21
  check('软删后不再计入查询（22 → 21）', r.body.total === 21, r.body.total)

  // ---------------------------------------------------------------- 治疗师不能上报
  console.log('\n[12] 越权检查')
  r = await request('POST', '/api/v1/records', mkRecord('by_therapist'), therapistToken)
  check('治疗师调用上报接口 → 403', r.status === 403, r.status)

  r = await request('GET', '/api/v1/records', undefined, patientToken)
  check('患者仍只能看到自己的记录', r.body.patientId === patientId, r.body.patientId)

  r = await request('GET', '/nope')
  check('未知路径 → 404 且是 JSON', r.status === 404 && r.body && r.body.error.code === 'NOT_FOUND', r.body)
}

;(async () => {
  try {
    await run()
  } catch (e) {
    failed += 1
    console.log('\n[smoke] 异常: ' + (e && e.message))
  } finally {
    await stopChild()
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }) } catch (e) { /* 忽略 */ }
    console.log('\n' + '─'.repeat(44))
    console.log('结果：' + passed + ' 通过，' + failed + ' 失败')
    process.exit(failed ? 1 : 0)
  }
})()
