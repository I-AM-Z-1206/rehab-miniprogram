// ============================================================================
// tools/build_race.js —— 把赛车源码基线打包成小程序可用的单文件 CJS
// ----------------------------------------------------------------------------
// 历史：这套赛车原本是独立小游戏工程（D:/Desktop/sc，26 个 ES Module），
// 由本脚本用 esbuild 打包并「打补丁」（去蓝牙入口、改滤波参数、HUD 换侧屈角度…）。
// 那个工程后来被删了，打包链断掉，产物无法再复现。
//
// 现在的做法：把压缩产物反向格式化成可读源码 pkgRace/race/src/engine.src.js
// 作为唯一维护基线，所有界面/参数改造都已内联在里面，不再需要字符串打补丁。
// 本脚本只做「压缩 + 自检」两件事。
//
// 用法：
//   npm run build:race
//   node tools/build_race.js            # 打包 + 自检
//   node tools/build_race.js --check     # 只自检，不重新打包
//
// 输出：pkgRace/race/engine.js
//
// 注意：esbuild 的 Go 二进制在本项目里写文件会被拦（Temp、tools/ 下都报
// Access denied，只有项目根目录能写）。所以一律 write:false 拿回内存 buffer，
// 再由 Node 自己落盘 —— 这样输出路径放哪都行，也不需要中间临时目录。
// ============================================================================

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'pkgRace', 'race', 'src', 'engine.src.js')
const OUT = path.join(ROOT, 'pkgRace', 'race', 'engine.js')

// ---------------------------------------------------------------- 产物自检
// 这些断言钉住的是「康复场景专用改造」，一旦丢失就是功能回退，
// 而且肉眼看不出来（游戏照样能跑，只是患者用不了）。所以必须进构建门禁。
//
// 分两类，别混：
//   MUST_HAVE      —— 字符串字面量 / 导出名，压缩后仍存在，查【产物】
//   SRC_ONLY       —— 源码里的类名/变量名，压缩后会被改名，只能查【源码】
//   MUST_NOT_HAVE  —— 必须消失的旧文案/旧参数，查【产物】
const SRC_ONLY = [
  ['RoadRenderer2', 'v10 定版的赛道渲染器（有路旁灯柱/广告牌/反光柱、路面颗粒与接缝、椭圆地平线雾）']
]

const MUST_HAVE = [
  ['侧屈', 'HUD 左上角显示实时侧屈角度（不是蓝牙状态）'],
  ['体感待机', '传感器未连接时的待机文案'],
  ['模拟模式（触屏驱动）', '模拟模式不再叫 Debug'],
  ['长按右上角圆点', '触屏操作提示（小程序没有键盘）'],
  ['身体姿态驱动', '副标题不强调传感器型号'],
  ['GameEngine', '导出的类名']
]

const MUST_NOT_HAVE = [
  ['连接 WT9011 传感器', '菜单里不能再有独立蓝牙入口（已统一由小程序侧连接）'],
  ['.02,1.6', '卡尔曼滤波参数必须已是 q=0.3 / r=1.0（旧值滞后 210ms）'],
  ['Debug：方向键', '不能在界面上提键盘快捷键']
]

function checkSource() {
  const src = fs.readFileSync(SRC, 'utf8')
  const errs = []
  SRC_ONLY.forEach(([needle, why]) => {
    if (src.indexOf(needle) < 0) errs.push('源码缺少「' + needle + '」—— ' + why)
  })
  if (errs.length) {
    console.error('✗ 源码基线自检未通过（' + path.relative(ROOT, SRC) + '）')
    errs.forEach((s) => console.error('  - ' + s))
    return false
  }
  console.log('✓ 源码基线 自检通过（' + SRC_ONLY.length + ' 项结构标记）')
  return true
}

function checkProduct(file, label) {
  const code = fs.readFileSync(file, 'utf8')
  const errs = []

  MUST_HAVE.forEach(([needle, why]) => {
    if (code.indexOf(needle) < 0) errs.push('缺少「' + needle + '」—— ' + why)
  })
  MUST_NOT_HAVE.forEach(([needle, why]) => {
    if (code.indexOf(needle) >= 0) errs.push('仍含「' + needle + '」—— ' + why)
  })

  // 真正的可用性验证：产物必须是能被 require 的 CJS，且真的导出 GameEngine。
  // 纯字符串检查抓不到「打包出来是 ESM / 导出名写错」这类问题。
  if (!errs.length) {
    try {
      delete require.cache[require.resolve(file)]
      const m = require(file)
      const GE = m && m.GameEngine
      if (typeof GE !== 'function') {
        errs.push('require 成功但没导出 GameEngine（实际：' + Object.keys(m || {}).join(',') + '）')
      } else {
        const proto = Object.getOwnPropertyNames(GE.prototype)
        ;['update', 'render', 'setState', 'onPointerDown', 'toDesign'].forEach((fn) => {
          if (proto.indexOf(fn) < 0) errs.push('GameEngine.prototype 缺方法 ' + fn)
        })
      }
    } catch (e) {
      errs.push('require 失败：' + String((e && e.message) || e))
    }
  }

  const kb = (fs.statSync(file).size / 1024).toFixed(1)
  if (errs.length) {
    console.error('✗ ' + label + ' 自检未通过（' + kb + ' KB）')
    errs.forEach((s) => console.error('  - ' + s))
    return false
  }
  console.log('✓ ' + label + ' 自检通过（' + kb + ' KB，' + MUST_HAVE.length + ' 项必须存在 / ' +
    MUST_NOT_HAVE.length + ' 项必须消失 / 5 个原型方法齐全）')
  return true
}
// ---------------------------------------------------------------- 打包
async function build() {
  if (!fs.existsSync(SRC)) {
    console.error('找不到源码基线：' + SRC)
    process.exit(1)
  }

  let esbuild
  try {
    esbuild = require('esbuild')
  } catch (e) {
    console.error('缺少 esbuild，请先执行：npm i esbuild')
    process.exit(1)
  }

  const t0 = Date.now()
  const r = await esbuild.build({
    entryPoints: [SRC],
    bundle: true,
    format: 'cjs',
    platform: 'neutral',
    target: 'es2017',
    minify: true,
    charset: 'utf8',
    write: false,
    logLevel: 'warning'
  })

  const out = (r.outputFiles && r.outputFiles[0] && r.outputFiles[0].contents) || null
  if (!out || !out.length) throw new Error('esbuild 没有产出内容')
  fs.writeFileSync(OUT, out)
  console.log('已打包 ' + path.relative(ROOT, SRC) + ' → ' + path.relative(ROOT, OUT) +
    '（' + ((Date.now() - t0) / 1000).toFixed(2) + 's）')
}

async function main() {
  const checkOnly = process.argv.indexOf('--check') >= 0
  if (!checkSource()) process.exit(1)
  if (!checkOnly) {
    await build()
  } else if (!fs.existsSync(OUT)) {
    console.error('产物不存在，无法只自检：' + OUT)
    process.exit(1)
  }
  const ok = checkProduct(OUT, checkOnly ? '现有产物' : '新产物')
  if (!ok) process.exit(1)
}

main().catch((e) => {
  console.error('构建失败：' + String((e && e.message) || e))
  process.exit(1)
})
