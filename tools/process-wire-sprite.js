// tools/process-wire-sprite.js —— 把 AI 生成的走钢丝角色 sprite sheet 处理成游戏用的图集
// ----------------------------------------------------------------------------
// 输入：一张「五个背影姿势排成一行」的图（白底，无阴影）
// 输出：assets/wire/char-<name>.png，五帧横向排列，脚底对齐，统一缩放
//
// 【为什么不按 W/5 硬切】
//   AI 生成的行距并不精确等距。硬切成五等份，五帧的边界会随机切进某一只的
//   耳朵或尾巴 —— 狐狸那版恰好没中招，但兔子/小熊猫的长耳朵与大尾巴很容易中。
//   这里改成**按列找空隙**：先扫出每一列有没有内容，连续有内容的一段就是
//   一个姿势，空隙即边界。空档再窄也不会切进角色。
//
// 【为什么五帧共用同一个缩放比】
//   逐帧缩放到等高会让「抬腿的那一帧」被拉高 —— 走路循环里角色会像在呼吸一样
//   忽大忽小。用同一个比例、按最高的那一帧定标，腿抬起时自然矮一点，才对。
//
// 用法：node tools/process-wire-sprite.js <源图> <名字>
// ============================================================================

const { PNG } = require('pngjs')
const fs = require('fs')
const path = require('path')

// 白底阈值：三通道都 > 243 才算背景。
// 不能只看亮度 —— 奶油色毛（比如 r245 g240 b228）亮度也很高，
// 按亮度判会把它一起抠掉，角色身上出现窟窿。
const WHITE = 243
// 列空隙：连续这么多列没有内容才算两帧的分界
const GAP_COLS = 6
// 目标高度（与狐狸一致：190 逻辑像素）
const TARGET_H = 190

function loadImage(file) {
  return PNG.sync.read(fs.readFileSync(file))
}

// 【2026-11-01 第三次才对】白底不能逐像素抠，必须**从四边泛洪**。
//
// 两次失败的路子：
//   ① 「三通道都 >235 就透明」→ 水彩纸的颗粒本身就在 235~250，
//      角色身上被挖出成片小洞（深色背景上一看就是青粉色麻点）；
//   ② 「min(r,g,b) 走 232~250 软斜坡」→ 洞还在，只是洞边多了半透明的毛。
//
// 根因：水彩插画的**轮廓内部**也有大量接近白色的像素（高光、纸纹）。
// 任何逐像素的色键都会把它们一起吃掉。
//
// 正确做法是区分「外面」和「里面的白」：从画面四边向内泛洪，只有能被走到的
// 白像素才算背景。轮廓里的白高光走不到，自然保留。
// 实测：两张源图的背景都是纯 255，占 70%；阈值取 250 时只多带进 0.4~0.9%
// （兔子的奶油色毛 min 在 228 附近，不会被误吃）。
const WHITE_MIN = 250

/** 从四边泛洪，返回「属于外部背景」的位图 */
function outsideMask(img) {
  const { width: w, height: h, data } = img
  const n = w * h
  const isWhite = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const p = i * 4
    isWhite[i] = Math.min(data[p], data[p + 1], data[p + 2]) >= WHITE_MIN ? 1 : 0
  }
  const out = new Uint8Array(n)
  const stack = new Int32Array(n)
  let sp = 0
  const push = (i) => {
    if (!out[i] && isWhite[i]) { out[i] = 1; stack[sp++] = i }
  }
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x) }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1) }
  while (sp > 0) {
    const i = stack[--sp]
    const x = i % w
    const y = (i - x) / w
    if (x > 0) push(i - 1)
    if (x < w - 1) push(i + 1)
    if (y > 0) push(i - w)
    if (y < h - 1) push(i + w)
  }
  return out
}

/** 角色像素 = 不在外部背景里 */
function alphaMask(img) {
  const outside = outsideMask(img)
  const mask = new Uint8Array(outside.length)
  for (let i = 0; i < outside.length; i++) mask[i] = outside[i] ? 0 : 1
  return mask
}

/** 按列空隙切出每一段（返回 [{x0,x1}]） */
function splitColumns(mask, w, h) {
  const colHas = new Uint8Array(w)
  for (let x = 0; x < w; x++) {
    let any = 0
    for (let y = 0; y < h; y++) {
      if (mask[y * w + x]) { any = 1; break }
    }
    colHas[x] = any
  }
  const runs = []
  let start = -1
  let gap = 0
  for (let x = 0; x < w; x++) {
    if (colHas[x]) {
      if (start < 0) start = x
      gap = 0
    } else if (start >= 0) {
      gap += 1
      if (gap >= GAP_COLS) {
        runs.push({ x0: start, x1: x - gap })
        start = -1
        gap = 0
      }
    }
  }
  if (start >= 0) runs.push({ x0: start, x1: w - 1 })
  return runs
}

/** 某一段内容的竖直范围 */
function rowRange(mask, w, x0, x1, h) {
  let top = -1
  let bottom = -1
  for (let y = 0; y < h; y++) {
    let any = 0
    for (let x = x0; x <= x1; x++) {
      if (mask[y * w + x]) { any = 1; break }
    }
    if (any) {
      if (top < 0) top = y
      bottom = y
    }
  }
  return { top, bottom }
}

/** 内容质心（alpha 加权），用来算水平补偿 */
function centroidX(mask, w, x0, x1, top, bottom) {
  let sum = 0
  let cnt = 0
  for (let y = top; y <= bottom; y++) {
    for (let x = x0; x <= x1; x++) {
      if (mask[y * w + x]) { sum += x; cnt += 1 }
    }
  }
  return cnt ? sum / cnt : (x0 + x1) / 2
}

// ----------------------------------------------------------------------------
// 量化：5bit RGB + 4 档 alpha
//   水彩插画的每个像素都是渐变，PNG 压不动（540KB 三张图直接顶到主包 72%）。
//   量化到 32 级/通道之后重复值变多，压缩率立刻上来：实测三张 528KB → 315KB，
//   而角色在屏幕上只有 105×140 逻辑像素，肉眼分辨不出色阶。
//   **只动颜色精度，不动几何**：帧宽、质心、脚底位置全都不变。
const Q_RGB = 8    // 32 级

// 【必须 clamp】round(252/8)*8 = 256，直接写进 Buffer 会**溢出成 0**。
// 于是所有接近纯白的像素 R 变 0、G/B 还是 248 —— 白毛边变成一圈青色麻点。
// 这个 bug 害我以为是色键抠不干净，查了三轮。
const qc = (v) => Math.min(255, Math.round(v / Q_RGB) * Q_RGB)
const Q_ALPHA = 64 // 4 档

function quantizeBuffer(img) {
  const out = new PNG({ width: img.width, height: img.height })
  const d = img.data
  const o = out.data
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]
    if (a === 0) continue // 全透明像素保持全 0，压缩器最喜欢连续的 0
    o[i] = qc(d[i])
    o[i + 1] = qc(d[i + 1])
    o[i + 2] = qc(d[i + 2])
    o[i + 3] = Math.min(255, Math.round(a / Q_ALPHA) * Q_ALPHA)
  }
  return out
}

/** 只量化一张已经处理好的图集（狐狸那张不是本脚本产的，只能单独量化一次） */
function quantizeFile(file) {
  const img = PNG.sync.read(fs.readFileSync(file))
  const before = fs.statSync(file).size
  fs.writeFileSync(file, PNG.sync.write(quantizeBuffer(img), { colorType: 6 }))
  const after = fs.statSync(file).size
  console.log('量化 ' + path.basename(file) + '：' + (before / 1024).toFixed(1) + 'KB → ' +
    (after / 1024).toFixed(1) + 'KB')
}

function main() {
  if (process.argv[2] === '--quant') {
    const files = process.argv.slice(3)
    files.forEach(quantizeFile)
    return
  }
  const src = process.argv[2]
  const name = process.argv[3]
  if (!src || !name) {
    console.error('用法：node tools/process-wire-sprite.js <源图> <名字>')
    process.exit(1)
  }
  const img = loadImage(src)
  const w = img.width
  const h = img.height
  const mask = alphaMask(img)
  let runs = splitColumns(mask, w, h)
  console.log('源图 ' + w + 'x' + h + '，切出 ' + runs.length + ' 段')

  // 过滤掉过窄的段（噪点 / 分隔线）
  const minW = Math.round(w / 5 / 6)
  runs = runs.filter((r) => (r.x1 - r.x0) >= minW)
  if (runs.length !== 5) {
    console.error('期望 5 段，实际 ' + runs.length + ' 段：' + runs.map((r) => (r.x1 - r.x0 + 1)).join('/'))
    process.exit(2)
  }

  // 每段的内容框
  const boxes = runs.map((r) => {
    const rr = rowRange(mask, w, r.x0, r.x1, h)
    return {
      x0: r.x0, x1: r.x1, top: rr.top, bottom: rr.bottom,
      w: r.x1 - r.x0 + 1,
      hgt: rr.bottom - rr.top + 1,
      cx: centroidX(mask, w, r.x0, r.x1, rr.top, rr.bottom)
    }
  })
  const maxH = Math.max.apply(null, boxes.map((b) => b.hgt))
  const maxW = Math.max.apply(null, boxes.map((b) => b.w))
  const scale = TARGET_H / maxH
  const frameW = Math.ceil(maxW * scale) + 2
  console.log('最高 ' + maxH + 'px，最宽 ' + maxW + 'px，缩放 ' + scale.toFixed(3) +
    '，帧 ' + frameW + 'x' + TARGET_H)

  // 输出：五帧横排，脚底对齐、水平按质心对齐
  const out = new PNG({ width: frameW * 5, height: TARGET_H })
  out.data.fill(0)

  // 源图的逐像素 alpha（0/255），后面靠箱式平均把它软化成 0~255
  const srcA = new Uint8Array(w * h)
  const outside = outsideMask(img)
  for (let i = 0; i < w * h; i++) srcA[i] = outside[i] ? 0 : 255

  boxes.forEach((b, idx) => {
    const dstW = Math.round(b.w * scale)
    const dstH = Math.round(b.hgt * scale)
    const frameX = idx * frameW
    // 质心对齐到帧中心（判定中心 = 绘制中心是红线）
    const cxScaled = (b.cx - b.x0) * scale
    const dstX = Math.round(frameX + frameW / 2 - cxScaled)
    const dstY = TARGET_H - dstH // 脚底贴帧底

    // **箱式平均降采样**（不是最近邻）。
    // 最近邻取样会把柔边抽成台阶，还会随机把某个纯白背景像素抽进来 ——
    // 耳朵周围那一圈白毛边就是这么来的。这里对每个目标像素覆盖的源矩形
    // 求面积平均，并按 alpha 预乘，边缘自然就软下去、白边也不会冒出来。
    const stepX = b.w / dstW
    const stepY = b.hgt / dstH
    for (let y = 0; y < dstH; y++) {
      for (let x = 0; x < dstW; x++) {
        const sx0 = b.x0 + Math.floor(x * stepX)
        const sx1 = Math.min(b.x0 + b.w, b.x0 + Math.ceil((x + 1) * stepX))
        const sy0 = b.top + Math.floor(y * stepY)
        const sy1 = Math.min(b.top + b.hgt, b.top + Math.ceil((y + 1) * stepY))
        let ar = 0, ag = 0, ab = 0, aa = 0, n = 0
        for (let sy = sy0; sy < sy1; sy++) {
          for (let sx = sx0; sx < sx1; sx++) {
            const si = (sy * w + sx) * 4
            const a = srcA[sy * w + sx]
            ar += img.data[si] * a
            ag += img.data[si + 1] * a
            ab += img.data[si + 2] * a
            aa += a
            n += 1
          }
        }
        if (!n || aa === 0) continue
        const dx = dstX + x
        const dy = dstY + y
        if (dx < frameX || dx >= frameX + frameW || dy < 0 || dy >= TARGET_H) continue
        const di = (dy * out.width + dx) * 4
        out.data[di] = Math.round(ar / aa)
        out.data[di + 1] = Math.round(ag / aa)
        out.data[di + 2] = Math.round(ab / aa)
        out.data[di + 3] = Math.round(aa / n)
      }
    }
    // 实测质心与帧中心的差，写进 meta，供 character 模块做补偿
    console.log('  帧' + idx + ' 内容 ' + b.w + 'x' + b.hgt +
      ' 质心x=' + b.cx.toFixed(1) + ' 框中心x=' + ((b.x0 + b.x1) / 2).toFixed(1))
  })

  const dir = path.join(__dirname, '..', 'assets', 'wire')
  fs.mkdirSync(dir, { recursive: true })
  const outFile = path.join(dir, 'char-' + name + '.png')
  fs.writeFileSync(outFile, PNG.sync.write(quantizeBuffer(out), { colorType: 6 }))
  console.log('写出 ' + outFile + '（' + out.width + 'x' + out.height + '，' +
    (fs.statSync(outFile).size / 1024).toFixed(1) + 'KB）')
  console.log('META { frameW: ' + frameW + ', frames: 5, h: ' + TARGET_H + ' }')
}

main()
