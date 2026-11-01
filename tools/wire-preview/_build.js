// tools/wire-preview/_build.js —— 把预览页打成单文件 bundle
// 用法：node tools/wire-preview/_build.js
// 说明：不用 esbuild CLI 的 --outfile（在本项目里会被拦），统一 write:false 取 buffer 自己落盘。
//
// 两个入口：
//   main.js     → bundle.js            整屏预览（index.html）
//   char-lab.js → char-lab.bundle.js   角色步态对照台（char-lab.html）
const esbuild = require('esbuild')
const fs = require('fs')
const path = require('path')

async function pack(entry, outName) {
  const r = await esbuild.build({
    entryPoints: [path.join(__dirname, entry)],
    bundle: true,
    format: 'iife',
    target: 'es2018',
    define: { global: 'window' },
    write: false,
    logLevel: 'warning'
  })
  const out = path.join(__dirname, outName)
  fs.writeFileSync(out, r.outputFiles[0].contents)
  console.log('bundle ok ->', out, r.outputFiles[0].contents.length, 'bytes')
}

pack('main.js', 'bundle.js')
  .then(() => pack('char-lab.js', 'char-lab.bundle.js'))
  .catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
