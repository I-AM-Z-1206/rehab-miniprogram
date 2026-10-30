// tools/rhythm-preview/build.js —— 构建浏览器预览包
//
// 为什么不用 `esbuild --outfile=...`：在这个项目里 esbuild 直接写 tools/ 下的
// 文件会被拦（Access is denied），必须 write:false 取回 buffer 由 Node 落盘。
// 同一个坑在 tools/shoot-preview/build.js 里已经踩过一次。
const esbuild = require('esbuild')
const fs = require('fs')
const path = require('path')

esbuild.build({
  entryPoints: [path.join(__dirname, 'main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2018',
  define: { global: 'window' },
  write: false
}).then(r => {
  for (const f of r.outputFiles) {
    fs.writeFileSync(path.join(__dirname, 'bundle.js'), f.contents)
    console.log('written', f.path, (f.contents.length / 1024).toFixed(1) + 'KB')
  }
}).catch(e => { console.error('FAIL', e.message); process.exit(1) })
