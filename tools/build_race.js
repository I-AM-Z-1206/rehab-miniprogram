// ============================================================================
// tools/build_race.js —— 把「NEON REHAB RACER」小游戏源码打包成小程序可用的 CJS
// ----------------------------------------------------------------------------
// 小游戏（game.js）与小程序运行时不同，不能直接 require；这里用 esbuild 把
// src/**（26 个 ES Module）打成单文件 CommonJS，交给 pages/race 使用。
//
// 用法：
//   npm i esbuild
//   node tools/build_race.js                  # 默认读 D:/Desktop/sc
//   SC_DIR=/path/to/sc node tools/build_race.js
//
// 产物：race/engine.js（约 82KB，压缩后）
//
// 打包时还会做一次「界面改造」（源码工程保持原样，只在产物里生效）：
//   1. 菜单去掉「连接 WT9011 传感器」按钮 —— 小程序侧已统一连接，游戏不再自己连
//   2. 菜单底部去掉蓝牙状态文案
//   3. HUD 左上角的「传感器已连接 xxHz」换成实时侧屈角度
// 改造用字符串精确匹配，源码结构变了会直接报错，避免悄悄失效。
// ============================================================================

const fs = require('fs')
const path = require('path')

const SC_DIR = process.env.SC_DIR || 'D:/Desktop/sc'
const ENTRY = path.join(__dirname, '.race_entry.js')
const OUT = path.join(__dirname, '..', 'race', 'engine.js')

// ---------------------------------------------------------------- 界面改造
function replaceOnce(src, from, to, label) {
  const i = src.indexOf(from)
  if (i < 0) throw new Error('改造失败：找不到「' + label + '」\n  期望片段：' + from.slice(0, 80))
  if (src.indexOf(from, i + 1) >= 0) throw new Error('改造失败：「' + label + '」出现了多次')
  return src.slice(0, i) + to + src.slice(i + from.length)
}

/** src/ui/Screens.js：菜单不出现任何蓝牙入口 / 状态 */
function patchScreens(src) {
  // 1) 菜单按钮：删掉「连接 WT9011 传感器」（连同行偏移，后面按钮自动上移）
  src = replaceOnce(
    src,
    "      mk('ble', '连接 WT9011 传感器', cx, y, bw, bh, COLORS.neonBlue); y += bh + 16\n",
    '',
    '菜单蓝牙按钮'
  )
  // 2) 菜单底部状态文案
  src = replaceOnce(
    src,
    "    neonText(ctx, data.bleStatus || '', w * 0.5, h - 62, { size: 18, color: COLORS.textDim, align: 'center', blur: 4 })\n",
    '',
    '菜单蓝牙状态文案'
  )
  // 3) 副标题不再强调具体型号
  src = replaceOnce(
    src,
    "体感赛车康复训练 · WT9011 姿态驱动",
    "体感赛车康复训练 · 身体姿态驱动",
    '菜单副标题'
  )
  // 4) 底部是键盘快捷键说明，小程序里没有键盘，改成触屏/长按提示
  src = replaceOnce(
    src,
    "    neonText(ctx, 'Debug：方向键/WASD 模拟躯干位移 · T 打开治疗师面板 · P 暂停',\n",
    "    neonText(ctx, '长按右上角圆点 1.2 秒打开治疗师面板 · 返回键在左上角',\n",
    '菜单底部操作提示'
  )
  // 5) 模拟模式不再叫 Debug
  src = replaceOnce(
    src,
    "'模拟模式（Debug）'",
    "'模拟模式（触屏驱动）'",
    '模拟模式按钮'
  )
  return src
}

/** src/ui/HUD.js：左上角状态改为体感角度，不显示蓝牙连接信息 */
function patchHud(src) {
  src = replaceOnce(
    src,
    '    neonText(ctx, s.ble.statusText, 60, 54, { size: 18, color: COLORS.text, blur: 6 })\n',
    [
      '    const _m = s.motion || {}',
      '    const _n = _m.neutral || { roll: 0 }',
      '    const _sm = _m.smoothed || { roll: 0 }',
      '    const _deg = Math.round((_sm.roll || 0) - (_n.roll || 0))',
      "    neonText(ctx, _m.connected ? ('侧屈 ' + (_deg > 0 ? '+' : '') + _deg + '°') : '体感待机', 60, 54, { size: 18, color: COLORS.text, blur: 6 })",
      ''
    ].join('\n'),
    'HUD 蓝牙状态文案'
  )
  return src
}

function patchEngine(src) {
  return replaceOnce(
    src,
    "'Debug 模式：方向键 / 触摸 模拟躯干位移'",
    "'模拟模式：手指拖动模拟躯干位移'",
    '模拟模式提示'
  )
}

function externalBlePlugin() {
  const screensRe = /[\\/]ui[\\/]Screens\.js$/
  const hudRe = /[\\/]ui[\\/]HUD\.js$/
  return {
    name: 'external-ble',
    setup(build) {
      build.onLoad({ filter: screensRe }, (args) => ({
        contents: patchScreens(fs.readFileSync(args.path, 'utf8')),
        loader: 'js'
      }))
      build.onLoad({ filter: hudRe }, (args) => ({
        contents: patchHud(fs.readFileSync(args.path, 'utf8')),
        loader: 'js'
      }))
      build.onLoad({ filter: /[\\/]core[\\/]GameEngine\.js$/ }, (args) => ({
        contents: patchEngine(fs.readFileSync(args.path, 'utf8')),
        loader: 'js'
      }))
    }
  }
}

async function main() {
  const engineSrc = path.join(SC_DIR, 'src', 'core', 'GameEngine.js')
  if (!fs.existsSync(engineSrc)) {
    console.error('找不到源码：' + engineSrc + '（可用 SC_DIR 指定）')
    process.exit(1)
  }

  let esbuild
  try {
    esbuild = require('esbuild')
  } catch (e) {
    console.error('缺少 esbuild，请先执行：npm i esbuild')
    process.exit(1)
  }

  fs.writeFileSync(
    ENTRY,
    'import { GameEngine } from ' + JSON.stringify(engineSrc.replace(/\\/g, '/')) + '\nexport { GameEngine }\n',
    'utf8'
  )

  try {
    await esbuild.build({
      entryPoints: [ENTRY],
      bundle: true,
      format: 'cjs',
      platform: 'neutral',
      target: 'es2017',
      minify: true,
      charset: 'utf8',
      outfile: OUT,
      plugins: [externalBlePlugin()]
    })
  } finally {
    if (fs.existsSync(ENTRY)) fs.unlinkSync(ENTRY)
  }

  // 产物自检：改造必须真的生效
  // 注：BLEManager 里的 statusText getter 仍会留一句「传感器已连接 xxHz」，
  // 但 HUD / 菜单的引用都已改掉，不会再渲染出来。
  const code = fs.readFileSync(OUT, 'utf8')
  if (code.indexOf('连接 WT9011 传感器') >= 0) {
    console.error('产物里仍有菜单蓝牙入口')
    process.exit(1)
  }
  if (code.indexOf('侧屈 ') < 0) {
    console.error('HUD 改造未生效（找不到「侧屈」）')
    process.exit(1)
  }

  const kb = (fs.statSync(OUT).size / 1024).toFixed(1)
  console.log('已生成 race/engine.js（' + kb + ' KB），蓝牙 UI 已移除')
}

main().catch((e) => {
  console.error(String((e && e.message) || e))
  process.exit(1)
})
