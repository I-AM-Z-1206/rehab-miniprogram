// ============================================================================
// tools/pack-size-check.js —— 小程序包体积守护
// ----------------------------------------------------------------------------
// 起因：2026-10-28 发现 project.config.json 的 packOptions.ignore 里
//       配了 "node_modules"，但那是**精确路径匹配**，server/node_modules
//       匹配不上，导致整个服务端 9.56 MB（含 fastify / pino 全套依赖）
//       被打进小程序包。全包一度达 11.22 MB。
//
//       微信的限制是：主包 ≤ 2048 KB，单个分包 ≤ 2048 KB，全部 ≤ 20480 KB。
//       体积超限会在上传时就失败，而不是运行时报错，所以必须提前发现。
//
// 本脚本做的事：
//   1. 按 packOptions.ignore 规则精确模拟「哪些文件会真的进包」
//   2. 分别算主包 / 各分包体积，对照 2048 KB 上限
//   3. 检查 node_modules / dist / server 这类不该进包的目录是否被漏排除
//   4. 列出最大的几个文件，方便定位突增
//
// 用法：node tools/pack-size-check.js
//       已并入 npm test（tools/run-all.js）
// ============================================================================

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const LIMIT_MAIN = 2048 * 1024      // 主包 2 MB
const LIMIT_SUB = 2048 * 1024       // 单个分包 2 MB
const WARN_RATIO = 0.75             // 超过上限 75% 就告警

// 这些目录一旦出现在进包清单里，几乎一定是漏配了 ignore。
// 但它们只是「已知的高频坑」——真正兜底的是下面那段体积异常检测，
// 因为黑名单永远猜不全未来的目录名。
const FORBIDDEN_DIR_HINTS = [
  'node_modules', 'dist', 'server', '.git', 'vendor',
  '.tmp-assets', 'tmp', 'cache', 'coverage', 'build'
]

// 已知且合理的进包资源目录（不含分包根），超过 BIG_DIR_BYTES 才需要过问
const KNOWN_RESOURCE_DIRS = ['assets', 'audio', 'utils', 'pages', 'components', 'custom-tab-bar']
// 阈值参考当前实际：audio 是最重的资源目录（509 KB），留一档余量
const BIG_DIR_BYTES = 600 * 1024

let passed = 0
let failed = 0

function check(name, cond, detail) {
  if (cond) {
    passed += 1
    console.log('  ok  ' + name + (detail ? '  (' + detail + ')' : ''))
  } else {
    failed += 1
    console.log('  FAIL ' + name + (detail ? '  (' + detail + ')' : ''))
  }
}

function kb(bytes) { return (bytes / 1024).toFixed(1) + ' KB' }

// ---------------------------------------------------------------------------
// 读配置
// ---------------------------------------------------------------------------
const configPath = path.join(ROOT, 'project.config.json')
if (!fs.existsSync(configPath)) {
  console.error('缺少 project.config.json')
  process.exit(1)
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const ignore = (config.packOptions && config.packOptions.ignore) || []

const appConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
const SUB_ROOTS = (appConfig.subpackages || appConfig.subPackages || []).map((s) => s.root)

function isIgnoredDir(rel) {
  return ignore.some((r) => r.type === 'folder' && r.value === rel)
}
function isIgnoredFile(rel) {
  return ignore.some((r) => r.type === 'file' && r.value === rel)
}

// ---------------------------------------------------------------------------
// 遍历：算出真正进包的文件
// ---------------------------------------------------------------------------
const mainFiles = []
const subFiles = {}
SUB_ROOTS.forEach((r) => { subFiles[r] = [] })

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    const rel = path.relative(ROOT, abs).split(path.sep).join('/')
    // 注意：这里曾经写成 rel.startsWith('.')，本意是跳过根目录自身，
    // 实际却把 .tmp-assets / .workbuddy 这类点开头的目录整个跳过——
    // 恰恰是最该被检查的一类（它们一旦漏配 ignore 就会带着几十 MB 进包）。
    // walk 从 ROOT 的子项开始，rel 永远不会是 '.'，所以这个判断可以完全去掉。

    if (entry.isDirectory()) {
      if (isIgnoredDir(rel)) continue
      walk(abs)
    } else {
      if (isIgnoredFile(rel)) continue
      const size = fs.statSync(abs).size
      const root = rel.indexOf('/') === -1 ? '(根目录)' : rel.split('/')[0]
      const item = { rel, size }
      if (SUB_ROOTS.indexOf(root) !== -1) subFiles[root].push(item)
      else mainFiles.push(item)
    }
  }
}
walk(ROOT)

const sum = (arr) => arr.reduce((a, b) => a + b.size, 0)
const mainSize = sum(mainFiles)
const subSizes = {}
SUB_ROOTS.forEach((r) => { subSizes[r] = sum(subFiles[r]) })
const totalSize = mainSize + SUB_ROOTS.reduce((a, r) => a + subSizes[r], 0)

console.log('=== 小程序包体积检查 ===')
console.log('')

// ---------------------------------------------------------------------------
// 1. 禁止目录：必须被 ignore 覆盖
// ---------------------------------------------------------------------------
console.log('-- 目录排除 --')
const allFiles = mainFiles.concat(...SUB_ROOTS.map((r) => subFiles[r]))
const leaked = new Set()
allFiles.forEach((f) => {
  FORBIDDEN_DIR_HINTS.forEach((hint) => {
    // 出现形如 xxx/node_modules/yyy 或 dist/xxx 的路径，说明漏配
    const parts = f.rel.split('/')
    if (parts.indexOf(hint) !== -1) leaked.add(hint + ' → ' + f.rel)
  })
})
const leakedArr = Array.from(leaked)
check(
  '包内无 node_modules / dist / server 等构建产物',
  leakedArr.length === 0,
  leakedArr.length ? leakedArr[0] + (leakedArr.length > 1 ? ' 等 ' + leakedArr.length + ' 项' : '') : '干净'
)

// node_modules 子目录专门查一次（最容易漏的那种）
const nestedNm = allFiles.filter((f) => f.rel.split('/').indexOf('node_modules') !== -1)
check('无嵌套 node_modules（如 server/node_modules）', nestedNm.length === 0,
  nestedNm.length ? nestedNm[0].rel : '干净')

// 兜底：按顶层目录聚合体积。任何名字没见过的大目录都逃不掉这条。
// 起因就是 .tmp-assets —— 它不在黑名单里，第一次差点带着 27MB 进包。
const dirSizes = {}
allFiles.forEach((f) => {
  const parts = f.rel.split('/')
  const dir = parts.length > 1 ? parts[0] : '(根目录文件)'
  dirSizes[dir] = (dirSizes[dir] || 0) + f.size
})
const suspicious = Object.entries(dirSizes).filter(([dir]) =>
  dir !== '(根目录文件)' && // app.js / app.json 等，必然存在且很小
  SUB_ROOTS.indexOf(dir) === -1 && KNOWN_RESOURCE_DIRS.indexOf(dir) === -1
)
check('无体积异常的未知顶层目录',
  suspicious.length === 0,
  suspicious.length
    ? suspicious.map(([d, s]) => d + ' ' + kb(s)).join('、')
    : '未发现')

const bigKnown = Object.entries(dirSizes).filter(([dir, s]) =>
  SUB_ROOTS.indexOf(dir) === -1 && KNOWN_RESOURCE_DIRS.indexOf(dir) !== -1 && s > BIG_DIR_BYTES
)
check('已知资源目录体积均在阈值内', bigKnown.length === 0,
  bigKnown.length ? bigKnown.map(([d, s]) => d + ' ' + kb(s)).join('、') : '未发现')

// ---------------------------------------------------------------------------
// 2. 体积上限
// ---------------------------------------------------------------------------
console.log('')
console.log('-- 体积 --')
check('主包 ≤ 2048 KB', mainSize <= LIMIT_MAIN, kb(mainSize) + ' / 2048 KB，占用 ' + (mainSize / LIMIT_MAIN * 100).toFixed(1) + '%')
SUB_ROOTS.forEach((r) => {
  const s = subSizes[r]
  check('分包 ' + r + ' ≤ 2048 KB', s <= LIMIT_SUB, kb(s) + '，占用 ' + (s / LIMIT_SUB * 100).toFixed(1) + '%')
})
check('全包 ≤ 20480 KB', totalSize <= 20480 * 1024, kb(totalSize))

// ---------------------------------------------------------------------------
// 3. 余量告警（不失败，但提醒）
// ---------------------------------------------------------------------------
console.log('')
console.log('-- 余量 --')
const warnings = []
if (mainSize > LIMIT_MAIN * WARN_RATIO) warnings.push('主包已用到 ' + (mainSize / LIMIT_MAIN * 100).toFixed(1) + '%，接近上限')
SUB_ROOTS.forEach((r) => {
  if (subSizes[r] > LIMIT_SUB * WARN_RATIO) warnings.push('分包 ' + r + ' 已用到 ' + (subSizes[r] / LIMIT_SUB * 100).toFixed(1) + '%')
})
if (warnings.length) warnings.forEach((w) => console.log('  warn ' + w))
else console.log('  ok  主包与全部分包余量均 > 25%')

// ---------------------------------------------------------------------------
// 4. 最大文件 TOP
// ---------------------------------------------------------------------------
console.log('')
console.log('-- 进包最大文件 TOP 8 --')
allFiles.sort((a, b) => b.size - a.size).slice(0, 8).forEach((f) => {
  console.log('  ' + kb(f.size).padStart(10) + '  ' + f.rel)
})

// ---------------------------------------------------------------------------
console.log('')
console.log('主包 ' + kb(mainSize) + ' | 分包合计 ' + kb(totalSize - mainSize) + ' | 全包 ' + kb(totalSize))
console.log('-'.repeat(50))
if (failed === 0) {
  console.log('结果：' + passed + ' 通过，0 失败')
  process.exit(0)
} else {
  console.log('结果：' + passed + ' 通过，' + failed + ' 失败')
  process.exit(1)
}
