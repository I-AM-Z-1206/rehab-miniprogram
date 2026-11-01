// tools/process-fox-sprite.js —— 把AI生成的狐狸sprite sheet去白背景、裁帧、对齐
const { Jimp } = require('jimp')
const path = require('path')

const SRC = path.join(__dirname, '..', 'pkgWire', 'assets', 'wire', 'fox-sprite-raw.png')
const OUT = path.join(__dirname, '..', 'pkgWire', 'assets', 'wire', 'fox-walk.png')

async function main() {
  const img = await Jimp.read(SRC)
  console.log('source:', img.bitmap.width, 'x', img.bitmap.height)

  // 去白背景：接近白色的像素变透明
  const W = img.bitmap.width
  const H = img.bitmap.height
  img.scan(0, 0, W, H, function (x, y, idx) {
    const r = this.bitmap.data[idx]
    const g = this.bitmap.data[idx + 1]
    const b = this.bitmap.data[idx + 2]
    if (r > 235 && g > 235 && b > 235) {
      this.bitmap.data[idx + 3] = 0 // alpha = 0
    }
  })

  // 裁成5帧
  const fw = Math.floor(W / 5)
  const frames = []
  for (let i = 0; i < 5; i++) {
    const frame = img.clone().crop(i * fw, 0, fw, H)
    // autotrim 去透明边
    frame.autocrop()
    frames.push(frame)
    console.log(`frame ${i}: ${frame.bitmap.width}x${frame.bitmap.height}`)
  }

  // 对齐脚底：找最高的帧，所有帧脚底对齐
  const maxH = Math.max(...frames.map(f => f.bitmap.height))
  const maxW = Math.max(...frames.map(f => f.bitmap.width))
  console.log('frame size:', maxW, 'x', maxH)

  // 创建sprite sheet
  const sheet = new Jimp(maxW * 5, maxH, 0x00000000)
  for (let i = 0; i < 5; i++) {
    const f = frames[i]
    const fx = i * maxW + Math.floor((maxW - f.bitmap.width) / 2)
    const fy = maxH - f.bitmap.height // 脚底对齐
    sheet.composite(f, fx, fy)
  }

  await sheet.writeAsync(OUT)
  console.log('saved:', OUT, sheet.bitmap.width, 'x', sheet.bitmap.height)
}

main().catch(e => { console.error(e); process.exit(1) })
