const esbuild = require('esbuild')
const fs = require('fs')
const path = require('path')

esbuild.build({
  entryPoints: [path.join(__dirname, 'canvas-main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2018',
  define: { global: 'window' },
  write: false
}).then(r => {
  for (const f of r.outputFiles) {
    fs.writeFileSync(path.join(__dirname, 'canvas-bundle.js'), f.contents)
    console.log('written', f.path, (f.contents.length / 1024).toFixed(1) + 'KB')
  }
}).catch(e => { console.error('FAIL', e.message); process.exit(1) })
