// ============================================================================
// games/fruit/sprites.js —— Blender 预渲染精灵的加载与绘制
// ----------------------------------------------------------------------------
// 素材来源：tools/blender/fruits.py（低模 + WORKBENCH 统一光照，正交相机，
// 透明底 PNG，160×160 / 篮子 384×256）。运行时只做 drawImage。
//
// 为什么还是「位图优先、矢量兜底」：
//   小游戏/预览/单测三种环境下图片能力不同 ——
//     小程序   canvas.createImage() 可用（**必须用这个，见下**）
//     预览     wx-stub 提供 createImage（包一层 window.Image）
//     单测     无 wx → 直接回退矢量（headless 断言不依赖网络加载）
//   图片加载是异步的：onload 之前该水果走矢量，加载完成自动切换。
//   加载失败也一样 —— 有位图是升级，没位图不比旧版差。
//
// 【2026-10-31 修正：必须用 canvas.createImage()】
// 这里原来是 wx.createImage()，注释还写着"小程序 wx.createImage 可用"。
// 那在 Canvas 2D（type="2d"）下是不成立的：拿到的 Image 交给 canvas.drawImage
// 时 onload 可能永远不触发，于是 ready 恒 false，每一帧都画矢量水果 ——
// 而水果的矢量版和位图长得几乎一样，所以这个 bug 一直没人发现。
// 射击（pkgShoot/games/shoot/sprites.js）早就写过正确做法，走钢丝也踩了同一个坑。
//
// 内存核算（用户红线）：160×160×4B ≈ 100KB/张解码，6 张 + 篮子 ≈ 0.9MB，
// 相对小程序图片缓存可忽略；PNG 文件合计约 216KB。
// ============================================================================

const DIR = '/pkgFruit/assets/sprites/'

const FILES = {
  apple: 'fruit-apple.png',
  orange: 'fruit-orange.png',
  banana: 'fruit-banana.png',
  strawberry: 'fruit-strawberry.png',
  watermelon: 'fruit-watermelon.png',
  golden: 'fruit-golden.png'
}

// 位图 160px 里水果直径约占 110px（正交视野 2.9，直径 2）→ 屏幕 2r 对应缩放 2.9r
const SCALE = 2.9

const cache = {}
let inited = false
let initCanvas = null
const STATUS = { state: 'idle', failed: [] }

/** 创建图片对象：Canvas 2D 只认 canvas.createImage() */
function makeImage(canvas) {
  if (canvas && typeof canvas.createImage === 'function') {
    try {
      return canvas.createImage()
    } catch (e) { /* 落到下面 */ }
  }
  if (typeof wx !== 'undefined' && typeof wx.createImage === 'function') {
    try {
      return wx.createImage()
    } catch (e) { /* 落到下面 */ }
  }
  if (typeof Image !== 'undefined') {
    try {
      return new Image()
    } catch (e) { /* 忽略 */ }
  }
  return null
}

/** 包内文件读成 data URI，只在前两条路都失败时用 */
function readAsDataUri(src) {
  try {
    if (typeof wx === 'undefined' || typeof wx.getFileSystemManager !== 'function') return ''
    const b64 = wx.getFileSystemManager().readFileSync(String(src).replace(/^\//, ''), 'base64')
    return b64 ? 'data:image/png;base64,' + b64 : ''
  } catch (e) {
    return ''
  }
}

function loadOne(canvas, src, cell) {
  const img = makeImage(canvas)
  if (!img) {
    STATUS.failed.push(src + ':no-api')
    return
  }
  img.onload = function () { cell.img = img; cell.ready = true }
  img.onerror = function () {
    const uri = readAsDataUri(src)
    if (!uri) {
      STATUS.failed.push(src)
      return
    }
    const img2 = makeImage(canvas)
    if (!img2) {
      STATUS.failed.push(src + ':no-api')
      return
    }
    img2.onload = function () { cell.img = img2; cell.ready = true }
    img2.onerror = function () { STATUS.failed.push(src + ':base64') }
    img2.src = uri
  }
  img.src = src
}

function init(canvas) {
  // 第一次可能拿不到 canvas（老调用方只传 ctx）；等真正拿到 canvas 再补一次，
  // 否则会永远停在"用 wx.createImage 试过一次、失败、再也不重试"的状态。
  if (inited && (initCanvas || !canvas)) return
  inited = true
  initCanvas = canvas || initCanvas
  if (typeof wx === 'undefined') return

  Object.keys(FILES).forEach((key) => {
    const cell = { img: null, ready: false }
    cache[key] = cell
    loadOne(initCanvas, DIR + FILES[key], cell)
  })
}

/** 贴图加载情况，给页面/排查用 */
function status() {
  return { initCanvas: !!initCanvas, failed: STATUS.failed.slice() }
}

/**
 * 画一枚精灵。位图未就绪返回 false，调用方回退矢量。
 * @param {number} [squash] 入篮挤压 0~1（与矢量分支同一套变形）
 * @returns {boolean}
 */
function draw(ctx, type, golden, x, y, r, rot, alpha, squash) {
  // 必须把 canvas 传下去：Canvas 2D 只认 canvas.createImage()
  init(ctx && ctx.canvas)
  const key = golden && type === 'apple' ? 'golden' : type
  const cell = cache[key]
  if (!cell || !cell.ready) return false

  const d = r * SCALE
  ctx.save()
  if (alpha !== undefined) ctx.globalAlpha *= alpha
  if (squash) {
    const s = Math.max(0, Math.min(1, squash))
    ctx.translate(x, y + r * 0.3 * s)
    ctx.scale(1 + s * 0.16, 1 - s * 0.2)
    ctx.translate(-x, -(y + r * 0.3 * s))
  }
  ctx.translate(x, y)
  if (rot) ctx.rotate(rot)
  ctx.drawImage(cell.img, -d / 2, -d / 2, d, d)
  ctx.restore()
  return true
}

module.exports = { draw, status }
