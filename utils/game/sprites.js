// ============================================================================
// utils/game/sprites.js —— 游戏贴图加载（Kenney CC0 素材，见 assets/games/shoot/CREDITS.md）
// ----------------------------------------------------------------------------
// 小程序 Canvas 2D 加载包内图片有两种方式，这里按顺序自动兜底：
//   1. canvas.createImage() + img.src = 'assets/xxx.png'（相对小程序根目录）
//   2. 失败则用 wx.getFileSystemManager().readFileSync 读成 base64 data URI 再赋值
//   3. 都失败 → get() 返回 null，引擎自动回退到矢量绘制（不会白屏）
//
// 贴图是异步的：加载完成前引擎画矢量版，加载完成后下一帧自动换成贴图。
// ============================================================================

// 必须用绝对路径：相对路径会被解析成 <当前页面>/assets/...，导致 500
const BASE = '/assets/games/shoot/'

const ASSETS = {
  bg: 'bg.png',              // 星空背景（256×256，平铺）
  ship: 'ship.png',          // 玩家飞船（99×75）
  laser: 'laser.png',        // 子弹（9×37）
  star: 'star.png',          // 粒子（25×24）
  monsterBody: 'monster_body.png',   // 怪兽身体（141×194）
  monsterEye: 'monster_eye.png',     // 眼睛（64×69）
  mouthIdle: 'mouth_idle.png',       // 平静（张嘴笑）
  mouthSad: 'mouth_sad.png',         // 悲伤（撇嘴）
  browSmug: 'brow_smug.png'          // 得意时的眉毛
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

function loadOne(canvas, src) {
  return new Promise((resolve) => {
    if (!canvas || typeof canvas.createImage !== 'function') {
      resolve(null)
      return
    }
    let img = null
    try {
      img = canvas.createImage()
    } catch (e) {
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
        img2 = canvas.createImage()
      } catch (e) {
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

module.exports = { SpriteBank, ASSETS, BASE }
