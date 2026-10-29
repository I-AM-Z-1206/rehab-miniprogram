// ============================================================================
// tools/pack-server.js —— 把后端打成一个可以直接 scp 上服务器的压缩包
// ----------------------------------------------------------------------------
// 产物：dist/rehab-server-<日期>.tar.gz
// 内容：server 下除了 data/ 之外的所有文件 + static 占位，解压后是一个 rehab-server/ 目录
//
// 用法：node tools/pack-server.js   （或 npm run pack:server）
// ============================================================================

/* eslint-disable no-console */

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'server')
const DIST = path.join(ROOT, 'dist')
const STAGE = path.join(DIST, '.stage')
const NAME = 'rehab-server'
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
const OUT = path.join(DIST, NAME + '-' + stamp + '.tar.gz')

const INCLUDE = [
  'index.js',
  'store.js',
  'Dockerfile',
  'docker-compose.yml',
  'README.md',
  '.env.example',
  'deploy.sh',
  'deploy/rehab-server.service',
  'deploy/Caddyfile',
  'deploy/Caddyfile.http',
  'deploy/nginx.conf.example',
  'deploy/UBUNTU-DEBIAN.md',
  'deploy/WINDOWS.md'
]

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true })
}

function copy(rel) {
  const from = path.join(SRC, rel)
  const to = path.join(STAGE, NAME, rel)
  if (!fs.existsSync(from)) {
    console.warn('  ! 跳过（不存在）：' + rel)
    return
  }
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

rmrf(STAGE)
fs.mkdirSync(path.join(STAGE, NAME), { recursive: true })
INCLUDE.forEach(copy)

// 运行时目录占位：解压后就有，不用手动 mkdir
fs.mkdirSync(path.join(STAGE, NAME, 'static'), { recursive: true })
fs.writeFileSync(path.join(STAGE, NAME, 'static', '.gitkeep'), '')
fs.mkdirSync(path.join(STAGE, NAME, 'data'), { recursive: true })
fs.writeFileSync(path.join(STAGE, NAME, 'data', '.gitkeep'), '')

fs.mkdirSync(DIST, { recursive: true })
rmrf(OUT)

// 注意：Windows 自带的 bsdtar 会把 "E:/..." 当成远程主机（Cannot connect to E），
// 所以这里用「相对路径 + cwd」调用，不要传盘符绝对路径。
const tar = spawnSync('tar', ['-czf', '..' + path.sep + path.basename(OUT), NAME], {
  cwd: STAGE,
  stdio: 'inherit'
})
if (tar.error || tar.status !== 0) {
  console.error('打包失败：系统里没有可用的 tar 命令（Windows 10+ 自带，macOS/Linux 默认有）')
  process.exit(1)
}

rmrf(STAGE)

const size = fs.statSync(OUT).size
console.log('\n已生成：' + path.relative(ROOT, OUT).replace(/\\/g, '/') + '（' + (size / 1024).toFixed(1) + ' KB）')
console.log('\n下一步：')
console.log('  scp ' + path.relative(ROOT, OUT).replace(/\\/g, '/') + ' root@你的服务器:/opt/')
console.log('  ssh root@你的服务器')
console.log('  cd /opt && tar -xzf ' + path.basename(OUT) + ' && cd ' + NAME)
console.log('  UPLOAD_TOKEN=$(openssl rand -hex 24) bash deploy.sh')
