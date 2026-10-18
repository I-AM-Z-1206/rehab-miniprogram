const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

// 用法：npm i sharp 后 node tools/gen_icons.js
// 图标源：npm 包 lucide-static（解压后 icons/*.svg）
const SRC = process.env.LUCIDE_ICONS || 'node_modules/lucide-static/icons'
const OUT = __dirname + '/../assets/icons'
const SRC_OUT = path.join(OUT, 'src')
fs.mkdirSync(SRC_OUT, { recursive: true })

const COLORS = {
  teal: '#0F9C8C',
  gray: '#8B8F9A',
  blue: '#2F7BD6',
  orange: '#E8802A',
  light: '#C8C9CC',
  white: '#FFFFFF'
}

const items = [
  ['house', 'gray'], ['house', 'teal'],
  ['gamepad-2', 'gray'], ['gamepad-2', 'teal'],
  ['user-round', 'gray'], ['user-round', 'teal'],
  ['bluetooth', 'teal'], ['bluetooth', 'white'],
  ['focus', 'blue'],
  ['target', 'blue'], ['waves', 'blue'], ['apple', 'blue'],
  ['car', 'orange'], ['music', 'orange'],
  ['volume-2', 'teal'], ['play', 'teal'], ['pencil', 'teal'],
  ['book-open', 'teal'], ['info', 'teal'],
  ['chevron-right', 'light'],
  ['sliders-horizontal', 'teal'],
  ['battery', 'gray'], ['thermometer', 'gray'],
  ['rotate-ccw', 'teal']
]

;(async () => {
  let total = 0
  for (const [name, color] of items) {
    const svgPath = path.join(SRC, name + '.svg')
    if (!fs.existsSync(svgPath)) { console.log('MISS', name); continue }
    let svg = fs.readFileSync(svgPath, 'utf8')
    svg = svg.replace(/currentColor/g, COLORS[color])
    const outName = name + '-' + color
    fs.writeFileSync(path.join(SRC_OUT, outName + '.svg'), svg)
    const png = await sharp(Buffer.from(svg), { density: 384 })
      .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer()
    fs.writeFileSync(path.join(OUT, outName + '.png'), png)
    total += png.length
    console.log(outName.padEnd(26), png.length + 'B')
  }
  console.log('TOTAL', (total / 1024).toFixed(1) + 'KB')
})()
