// ============================================================================
// pkgShoot/games/shoot/sprites.js —— 游戏贴图加载（Kenney CC0 素材，见 assets/games/shoot/CREDITS.md）
// ----------------------------------------------------------------------------
// 小程序 Canvas 2D 加载包内图片有两种方式，这里按顺序自动兜底：
//   1. canvas.createImage() + img.src = 'assets/xxx.png'（相对小程序根目录）
//   2. 失败则用 wx.getFileSystemManager().readFileSync 读成 base64 data URI 再赋值
//   3. 都失败 → get() 返回 null，引擎自动回退到矢量绘制（不会白屏）
//
// 贴图是异步的：加载完成前引擎画矢量版，加载完成后下一帧自动换成贴图。
// ============================================================================

// 必须用绝对路径：相对路径会被解析成 <当前页面>/assets/...，导致 500
const DEFAULT_BASE = '/assets/games/shoot/'
let BASE = DEFAULT_BASE

/**
 * 覆盖贴图根路径（只给 tools/shoot-preview 的浏览器预览用）。
 * 小程序里以 / 开头的路径是"代码包根目录"，浏览器里会解析成 file:///assets/... → 404，
 * 于是预览永远停在矢量兜底，截图和真机画面不是一回事。预览启动时改成相对路径即可。
 */
function setBase(p) {
  BASE = p || DEFAULT_BASE
}

// 靶子（城市光核）永远是矢量绘制 —— 它的亮度要跟 light 连续变化，位图做不到。
// 战机从 2026-10-29 起改用离线渲染的 3D 贴图（fighter.png），但**矢量版完整保留**
// 作为兜底：贴图没加载出来时 _drawPlayer 走 else 分支，画面不会开天窗。
const ASSETS = {
  laser: 'laser.png',        // 子弹（9×37）
  star: 'star.png',          // 粒子（25×24）
  // 战机：项目内用 Blender 脚本建的低模（313 顶点 / 251 面），离线渲染成
  // 306×216 PNG，比例正好是 engine._shipBox 的 68:48，drawImage 可以直接铺满。
  // **运行时没有任何 3D** —— 就是一张位图。加载失败时引擎自动退回矢量版。
  fighter: 'fighter.png'
}

/** 读成 base64 作为兜底路径 */
function readAsDataUri(src) {
  try {
    const fs = wx.getFileSystemManager()
    // readFileSync 的路径相对于代码包根目录，去掉前导斜杠
    const b64 = fs.readFileSync(src.replace(/^\//, ''), 'base64')
    return 'data:image/png;base64,' + b64
  } catch (e) {
    return ''
  }
}

/**
 * 创建一个图片对象。
 * 小程序里必须用 canvas.createImage()；浏览器预览（tools/shoot-preview）没有这个方法，
 * 退到原生 Image —— 这样纯 canvas 预览也能看到真实贴图，而不是永远停在矢量兜底。
 */
function makeImage(canvas) {
  if (canvas && typeof canvas.createImage === 'function') {
    try {
      return canvas.createImage()
    } catch (e) { /* 落到下面的原生 Image */ }
  }
  if (typeof Image !== 'undefined') {
    try {
      return new Image()
    } catch (e) { /* 忽略 */ }
  }
  return null
}

function loadOne(canvas, src) {
  return new Promise((resolve) => {
    let img = null
    try {
      img = makeImage(canvas)
    } catch (e) {
      resolve(null)
      return
    }
    if (!img) {
      resolve(null)
      return
    }
    let settled = false
    const finish = (val) => {
      if (settled) return
      settled = true
      resolve(val)
    }

    img.onload = () => finish(img)
    img.onerror = () => {
      // 兜底：直接读文件转 base64
      const uri = readAsDataUri(src)
      if (!uri) {
        finish(null)
        return
      }
      let img2 = null
      try {
        img2 = makeImage(canvas)
      } catch (e) {
        finish(null)
        return
      }
      if (!img2) {
        finish(null)
        return
      }
      img2.onload = () => finish(img2)
      img2.onerror = () => finish(null)
      img2.src = uri
    }
    img.src = src

    // 超时兜底：某些基础库 onload 不回调，已解码成功的仍可用
    setTimeout(() => {
      if (settled) return
      if (img && img.width > 0) finish(img)
      else finish(null)
    }, 5000)
  })
}

class SpriteBank {
  constructor(canvas) {
    this.canvas = canvas
    this.map = {}
    this.count = 0
    this.total = Object.keys(ASSETS).length
    this.loading = false
  }

  /** 异步加载全部贴图，返回成功数量（失败也不抛错） */
  load() {
    if (this.loading) return Promise.resolve(this.count)
    this.loading = true
    const that = this
    const tasks = Object.keys(ASSETS).map((key) => loadOne(this.canvas, BASE + ASSETS[key]).then((img) => {
      if (img) {
        that.map[key] = img
        that.count += 1
      }
    }))
    return Promise.all(tasks).then(() => {
      that.loading = false
      return that.count
    })
  }

  get(key) {
    return this.map[key] || null
  }

  has(key) {
    return !!this.map[key]
  }

  /** 是否全部就绪（用于决定用贴图还是矢量） */
  isReady() {
    return this.count >= this.total
  }
}

module.exports = { SpriteBank, ASSETS, BASE: DEFAULT_BASE, DEFAULT_BASE, setBase }
