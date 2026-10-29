// ============================================================================
// tools/run-all.js —— 一键跑全部无头自检
// ----------------------------------------------------------------------------
// 用法：node tools/run-all.js        或        npm test
// 退出码：全部通过 0；任一失败 1（方便 CI 直接判红）
// ============================================================================

/* eslint-disable no-console */

const { spawnSync } = require('child_process')
const path = require('path')

const NODE = process.execPath
const ROOT = path.resolve(__dirname, '..')

const SUITES = [
  { file: 'tools/rhythm-headless-test.js', name: '节奏训练' },
  { file: 'tools/fruit-headless-test.js', name: '接水果' },
  { file: 'tools/wire-headless-test.js', name: '走钢丝' },
  { file: 'tools/game_selftest.js', name: '射击训练' },
  { file: 'tools/shoot-ui-test.js', name: '射击界面' },
  { file: 'tools/scene2d-test.js', name: '射击场景' },
  { file: 'tools/race-headless-test.js', name: '赛车' },
  { file: 'tools/race_page_test.js', name: '赛车页面' },
  { file: 'tools/race-settings-test.js', name: '赛车设置' },
  { file: 'tools/race-records-test.js', name: '赛车记录' },
  { file: 'tools/depth-test.js', name: '纵深底座' },
  { file: 'tools/audio-headless-test.js', name: '音频/公共' },
  { file: 'tools/lightchart-test.js', name: '图表' },
  { file: 'tools/record-isolation-test.js', name: '记录隔离' },
  { file: 'tools/server-smoke-test.js', name: '后端接口' },
  { file: 'tools/pack-size-check.js', name: '包体积' }
]

// 各套自检的收尾格式不完全一样，这里统一判断
const FAIL_PAT = /未通过|失败\s*[1-9]|✗/

let failed = 0
const rows = []

SUITES.forEach((s) => {
  const r = spawnSync(NODE, [path.join(ROOT, s.file)], {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 120000
  })
  const out = (r.stdout || '') + (r.stderr || '')
  const lines = out.trim().split('\n')
  const summary = lines.filter((l) => /全部通过|未通过|失败/.test(l)).pop() || '(无结果输出)'
  const bad = r.status !== 0 || FAIL_PAT.test(summary)
  if (bad) failed += 1
  rows.push({ name: s.name, ok: !bad, summary: summary.trim() })
  console.log((bad ? '✗ ' : '✓ ') + s.name.padEnd(12, ' ') + summary.trim())
})

console.log('\n' + '-'.repeat(48))
if (failed) {
  console.log('有 ' + failed + ' 套自检未通过')
  process.exitCode = 1
} else {
  console.log('全部 ' + SUITES.length + ' 套自检通过')
}
