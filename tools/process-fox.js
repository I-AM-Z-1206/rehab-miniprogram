// tools/process-fox.js —— 用pngjs处理狐狸sprite
const { PNG } = require('pngjs')
const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'pkgWire', 'assets', 'wire', 'fox-sprite-raw.png')
const OUT = path.join(__dirname, '..', 'pkgWire', 'assets', 'wire', 'fox-walk.png')

const buf = fs.readFileSync(SRC)
const png = PNG.sync.read(buf)
const W = png.width, H = png.height
console.log('source:', W, 'x', H)

// 去白背景
for (let i = 0; i < png.data.length; i += 4) {
  const r = png.data[i], g = png.data[i+1], b = png.data[i+2]
  if (r > 235 && g > 235 && b > 235) {
    png.data[i+3] = 0
  }
}

// 裁5帧，找bbox
const fw = Math.floor(W / 5)
const frames = []
for (let f = 0; f < 5; f++) {
  const sx = f * fw
  let minX = fw, minY = H, maxX = 0, maxY = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < fw; x++) {
      const idx = ((y + 0) * W + (sx + x)) * 4 + 3
      if (png.data[idx] > 10) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  frames.push({ sx: sx + minX, y: minY, w: maxX - minX, h: maxY - minY })
  console.log(`frame ${f}: x=${frames[f].sx} y=${minY} w=${frames[f].w} h=${frames[f].h}`)
}

const maxH = Math.max(...frames.map(f => f.h))
const maxW = Math.max(...frames.map(f => f.w))
console.log('frame size:', maxW, 'x', maxH)

// 创建输出sprite sheet
const out = new PNG({ width: maxW * 5, height: maxH })
// 初始化为透明
for (let i = 0; i < out.data.length; i += 4) out.data[i+3] = 0

for (let i = 0; i < 5; i++) {
  const fr = frames[i]
  const fx = i * maxW + Math.floor((maxW - fr.w) / 2)
  const fy = maxH - fr.h
  for (let y = 0; y < fr.h; y++) {
    for (let x = 0; x < fr.w; x++) {
      const si = ((fr.y + y) * W + (fr.sx + x)) * 4
      const di = ((fy + y) * out.width + (fx + x)) * 4
      out.data[di] = png.data[si]
      out.data[di+1] = png.data[si+1]
      out.data[di+2] = png.data[si+2]
      out.data[di+3] = png.data[si+3]
    }
  }
}

fs.writeFileSync(OUT, PNG.sync.write(out))
console.log('saved:', OUT, out.width, 'x', out.height)
