// ============================================================================
// tools/check-refs.js —— 静态引用检查（不依赖微信开发者工具）
// ----------------------------------------------------------------------------
// 检查三件事，防止「改目录/拆分包之后某个路径悄悄坏掉」：
//   1. app.json 里每个页面的 .js / .json / .wxml 是否都存在；
//   2. 所有 .js 里的 require('相对路径') 是否都能解析到真实文件；
//   3. 所有 wx.navigateTo / redirectTo / switchTab / reLaunch 的 url
//      是否指向已注册的页面（tabBar 页 + 主包页 + 分包页）。
//
// 用法：node tools/check-refs.js      有问题时退出码 1
// ============================================================================

/* eslint-disable no-console */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const problems = []

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/')
}

function exists(p) {
  try { return fs.statSync(p).isFile() } catch (e) { return false }
}

function walk(dir, out) {
  const list = fs.readdirSync(dir, { withFileTypes: true })
  list.forEach((d) => {
    if (d.name === 'node_modules' || d.name === '.git' || d.name === 'tools' || d.name === 'docs') return
    const p = path.join(dir, d.name)
    if (d.isDirectory()) walk(p, out)
    else out.push(p)
  })
  return out
}

// ---------------------------------------------------------------- 1. 页面文件
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf-8'))
const pages = []
;(appJson.pages || []).forEach((p) => pages.push(p))
;(appJson.subPackages || appJson.subpackages || []).forEach((sp) => {
  (sp.pages || []).forEach((p) => pages.push(sp.root + '/' + p))
})

pages.forEach((p) => {
  ;['.js', '.json', '.wxml'].forEach((ext) => {
    const f = path.join(ROOT, p + ext)
    if (!exists(f)) problems.push('页面缺文件：' + p + ext)
  })
})

// ---------------------------------------------------------------- 2. require
const files = walk(ROOT, [])
const jsFiles = files.filter((f) => f.endsWith('.js'))
const REQ = /require\(\s*['"]([^'"]+)['"]\s*\)/g

jsFiles.forEach((f) => {
  if (rel(f).startsWith('tools/')) return
  const src = fs.readFileSync(f, 'utf-8')
  let m
  while ((m = REQ.exec(src))) {
    const spec = m[1]
    if (!spec.startsWith('.')) continue
    const target = path.resolve(path.dirname(f), spec)
    // 兼容 Node 风格的无扩展名 require：依次尝试 .js / .json / /index.js
    const resolved = exists(target) ||
      exists(target + '.js') ||
      exists(target + '.json') ||
      exists(path.join(target, 'index.js'))
    if (!resolved) {
      problems.push('require 解析失败：' + rel(f) + ' → ' + spec)
    }
  }
})

// ---------------------------------------------------------------- 3. 跳转 URL
const PAGE_SET = new Set(pages)
const NAV = /url:\s*['"](\/[^'"?]+)/g

jsFiles.forEach((f) => {
  const src = fs.readFileSync(f, 'utf-8')
  let m
  while ((m = NAV.exec(src))) {
    const url = m[1].replace(/^\//, '')
    if (!PAGE_SET.has(url)) problems.push('跳转到未注册页面：' + rel(f) + ' → /' + url)
  }
})

// ---------------------------------------------------------------- 结果
if (problems.length) {
  console.log('发现 ' + problems.length + ' 个引用问题：')
  problems.slice(0, 40).forEach((p) => console.log('  · ' + p))
  if (problems.length > 40) console.log('  …（其余省略）')
  process.exitCode = 1
} else {
  console.log('引用检查通过：' + pages.length + ' 个页面、' + jsFiles.length + ' 个 js 文件')
}
