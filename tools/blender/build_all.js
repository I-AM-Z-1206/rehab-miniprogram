// ============================================================================
// tools/blender/build_all.js —— 【LEGACY 2026-10-31】3D 序列帧管线（已退役）
// ----------------------------------------------------------------------------
//   node tools/blender/build_all.js
//
// 角色已换成 Q 版纯矢量（pkgWire/games/wire/character.js），**不再使用图集**。
// 这条 Blender 链路（建模 → 绑骨 → 渲序列帧 → 拼图集 → 拷分包）保留只作留档：
// out/ 里的 .glb / 序列帧还能看，但拷贝步骤已禁用 —— wire-headless-test [8]
// 现在断言 walk8.png **不存在**，把图集拷回分包会让测试变红。
// ============================================================================
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const BLENDER = process.env.BLENDER_BIN || 'D:/Apps/App_base/Blender 5.2/blender.exe'
const HERE = __dirname
const ROOT = path.resolve(HERE, '..', '..')
const OUT = path.join(HERE, 'out')

function run(cmd, args, label) {
  process.stdout.write('== ' + label + '\n')
  execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT })
}

function blender(script, blend) {
  const args = ['-b']
  if (blend) args.push(blend)
  else args.push('--factory-startup')
  args.push('-P', path.join(HERE, script))
  run(BLENDER, args, script)
}

try {
  blender('build_char.py', null)
  blender('rig_anim.py', path.join(OUT, 'wire_char.blend'))
  blender('render_sprite.py', path.join(OUT, 'wire_char_rigged.blend'))
  // 注意：拼图集是 Python（PIL），不能用 process.execPath
  run(process.env.PYTHON_BIN || 'python', [path.join(HERE, 'pack_sprite.py')], 'pack_sprite.py')

  // 【已禁用 2026-10-31】角色改纯矢量后不再拷图集进分包。
  //  const dst = path.join(ROOT, 'pkgWire', 'assets', 'wire', 'walk8.png')
  //  fs.mkdirSync(path.dirname(dst), { recursive: true })
  //  fs.copyFileSync(path.join(OUT, 'sprite', 'wire_walk_8.png'), dst)
  //  const old = path.join(ROOT, 'pkgWire', 'assets', 'wire', 'walk4.png')
  //  if (fs.existsSync(old)) fs.unlinkSync(old)
  const dst = path.join(OUT, 'sprite', 'wire_walk_8.png')

  // 重渲之后必须重建预览 bundle，否则 tools/wire-preview 里跑的仍是旧的
  // fw/fh/cols —— 切帧全错，但画面看起来"只是有点歪"，极容易误判成模型问题。
  // （这一轮就踩过：截图里角色站到钢丝右边去了。）
  run(process.execPath, [path.join(ROOT, 'tools', 'wire-preview', '_build.js')], 'wire-preview bundle')

  const kb = (n) => (n / 1024).toFixed(1) + ' KB'
  console.log('\n== done')
  console.log('   glb    ', kb(fs.statSync(path.join(OUT, 'wire_acrobat.glb')).size))
  console.log('   sheet  ', kb(fs.statSync(dst).size), '->', dst)
} catch (e) {
  console.error('\nFAILED:', e.message)
  if (e.stdout) console.error(String(e.stdout).slice(-2000))
  process.exit(1)
}
