// ============================================================================
// games/wire/character-sprite.js —— 走钢丝角色（AI 生成绘本风 sprite sheet，三只）
// ----------------------------------------------------------------------------
// 三只角色共用一套 5 帧背影走路循环，只是换图集：
//   fox     小狐狸   660×190（132/帧）  assets/wire/fox-walk-190.png
//   rabbit  小兔子   440×190（ 88/帧）  assets/wire/char-rabbit.png
//   panda   小熊猫   550×190（110/帧）  assets/wire/char-panda.png
// 三张图都在**主包** assets/wire/ —— 分包里的图在小程序里拿不到（踩过）。
//
// 接口与旧的 character.js / character-fox.js 一致：
//   drawWalker / beltWorld / headWorld / gait，另加 setCharacter(id)
//
// ★ Image 对象只能来自 canvas.createImage()（真机四轮定位的最终结论）
//
// 前三轮一直失败，每次都在改「路径」和「base64 体积」，全错。真因是：
//   微信小程序的 CanvasRenderingContext2D **没有 ctx.canvas 属性**（那是标准 W3C
//   的属性，浏览器才有）。旧代码靠 ctx.canvas 拿画布 → 真机永远 undefined →
//   一路退回 wx.createImage()。而 wx.createImage() 造出来的 Image 对象既不会
//   触发 onload，也不能交给 canvas 2d 的 drawImage 使用。
//   浏览器预览里 ctx.canvas 是标准属性、必定存在，所以本地预览永远正常。
//
// 现在由 renderer 显式传入 canvas（drawWalker 的 o.canvas）。canvas 不在时
// 直接兜底并在诊断小字里报 nocv，**绝不**再退到 wx.createImage —— 那条路是死路。
//
// 加载顺序（真机）：
//   档 0  wx.getImageInfo('assets/…') → wxfile:// 临时路径 → img.src = 临时路径
//   档 1  直接 img.src = '/assets/…'（官方文档支持包内路径）
// 浏览器预览没有 wx.getImageInfo，直接走档 1（wx-stub 会把 / 改写成 ../../）。
// ============================================================================

const CHARACTERS = {
  fox: {
    id: 'fox', name: '小狐狸', sub: '围着格纹围巾',
    file: '/assets/wire/fox-walk-190.png',
    rel: 'assets/wire/fox-walk-190.png',
    frames: 5, frameW: 132, h: 190,
    // 内容质心相对帧中心的偏移（逻辑像素）。
    // 狐狸那版是「先切图再量」，质心偏右 11px，靠这个值补回来；
    // 兔子和小熊猫是用 tools/process-wire-sprite.js 直接**按质心对齐**拼的，
    // 所以是 0。改动图集时必须重新量，判定中心=绘制中心是红线。
    cxFix: 11,
    fallback: '#C48B6E'
  },
  rabbit: {
    id: 'rabbit', name: '小兔子', sub: '长长的耳朵',
    file: '/assets/wire/char-rabbit.png',
    rel: 'assets/wire/char-rabbit.png',
    frames: 5, frameW: 88, h: 190,
    cxFix: 0,
    fallback: '#D9D3C6'
  },
  panda: {
    id: 'panda', name: '小熊猫', sub: '粗粗的环纹尾巴',
    file: '/assets/wire/char-panda.png',
    rel: 'assets/wire/char-panda.png',
    frames: 5, frameW: 110, h: 190,
    cxFix: 0,
    fallback: '#B5654A'
  }
}

const CHARACTER_IDS = ['fox', 'rabbit', 'panda']

const DISPLAY_H = 140

// 小程序里没有 window / document；浏览器预览有。用它区分「真机」与「预览」。
const IS_WEB = typeof window !== 'undefined' && typeof document !== 'undefined'
// headless 测试跑在 Node 里，但也注入了 global.wx —— 不能被它骗成真机。
const IS_NODE = typeof process !== 'undefined' && !!(process.versions && process.versions.node)
const IS_WX = typeof wx !== 'undefined' && !!wx
// 诊断小字只在真机上画：预览本来就没毛病，headless 里画字会破坏两帧一致性。
const SHOW_DIAG = !IS_WEB && !IS_NODE && IS_WX

// 当前角色的运行时状态。换角色时整组重置。
const ST = {
  id: 'fox',
  img: null,
  ready: false,
  canvas: null,
  tried: false,
  triedAt: 0,
  stage: 0,
  note: 'idle',
  // 正在加载的那个 Image 必须被**模块级变量持有**。
  // 只是 `const img = makeImage()` 放在函数里的话，加载没完成、函数已经返回，
  // 这个 Image 就是可回收的 —— onload/onerror 永远不会触发（浏览器里实测过）。
  // 表现就是「角色时有时无」：某几次加载被回收了，就只剩兜底圆点。
  pending: null
}

function conf() {
  return CHARACTERS[ST.id] || CHARACTERS.fox
}

function reset() {
  ST.img = null
  ST.pending = null
  ST.ready = false
  ST.tried = false
  ST.triedAt = 0
  ST.stage = 0
  ST.note = 'idle'
}

/** 换角色：图集不同，全部重来 */
function setCharacter(id) {
  const next = CHARACTERS[id] ? id : 'fox'
  // **只在 id 真的变了才重置。**
  // 写成「同一个 id 但还没 ready 也重置」的话，由于 renderer 每帧都调这里，
  // 加载中的 Image 会在下一帧被清掉、重新开始 —— 图片永远加载不出来，
  // 表现为「三只角色里随机哪只只剩一个兜底圆点」。
  if (next === ST.id) return ST.id
  ST.id = next
  reset()
  return ST.id
}

function currentId() {
  return ST.id
}

// canvas 对象整个生命周期不变，解析一次就缓存。
function pickCanvas(o, ctx) {
  if (ST.canvas) return ST.canvas
  const a = (o && o.canvas) || (ctx && ctx.canvas) || null
  if (a) ST.canvas = a
  return ST.canvas
}

function makeImage(cv) {
  // 真机唯一正确的一条：Canvas 实例自己的 createImage
  if (cv && typeof cv.createImage === 'function') {
    try { return cv.createImage() } catch (e) { /* 继续看预览分支 */ }
  }
  if (IS_WEB && IS_WX && typeof wx.createImage === 'function') {
    // 预览 stub：把包内绝对路径改写成浏览器相对路径
    try { return wx.createImage() } catch (e) { /* 继续 */ }
  }
  if (IS_WEB && typeof Image !== 'undefined') {
    try { return new Image() } catch (e) { /* 放弃 */ }
  }
  // 真机 + 拿不到 canvas：直接失败。绝不退到 wx.createImage。
  return null
}

function ensure(o, ctx) {
  if (ST.ready) return
  const c = conf()
  const cv = pickCanvas(o, ctx)
  const img = makeImage(cv)
  if (!img) { ST.note = cv ? 'noCIM' : 'nocv'; return }

  const now = Date.now()
  // drawWalker 每帧都会调进来：失败后冷却再重试并升档。
  if (ST.tried) {
    if (now - ST.triedAt < 2600) return
    if (ST.stage < 1) ST.stage = 1
  }
  ST.tried = true
  ST.triedAt = now

  // 持有引用，直到加载结束（见 ST.pending 的说明）
  ST.pending = img

  img.onload = function () {
    ST.img = img
    ST.ready = true
    ST.note = 'ok' + ST.stage
    ST.pending = null
  }
  // 失败要**主动升档并保持冷却**：只把 tried 置 false 的话，下一帧会在
  // 同档位无限重试，永远走不到下一档（旧代码就卡在这儿）。
  img.onerror = function () {
    ST.note = 'err' + ST.stage
    ST.tried = true
    ST.triedAt = Date.now()
    if (ST.stage < 1) ST.stage = 1
    ST.pending = null
  }

  if (ST.stage === 0 && IS_WX && typeof wx.getImageInfo === 'function') {
    ST.note = 'info'
    wx.getImageInfo({
      src: c.rel,
      success: function (r) {
        if (ST.ready) return
        if (r && r.path) { ST.note = 'tmp'; img.src = r.path } else { ST.stage = 1; ST.tried = false; ST.note = 'noPath' }
      },
      fail: function () { ST.stage = 1; ST.tried = false; ST.note = 'infoFail' }
    })
    return
  }

  ST.note = 'file'
  img.src = c.file
}

function gait(phase, speed, balance) {
  const flail = Math.pow(Math.max(0, 1 - (typeof balance === 'number' ? balance : 1)), 2)
  const swayX = -Math.sin(phase) * (1.2 + (speed || 0) * 2.2)
  const bob = -Math.abs(Math.cos(phase)) * (1.2 + (speed || 0) * 2.0)
  const roll = Math.sin(phase) * 0.011 * (0.35 + (speed || 0))
  return { flail, swayX, bob, roll }
}

function beltWorld(o) {
  const s = o.scale || 1
  const ly = -DISPLAY_H * 0.65
  const lean = o.lean || 0
  return {
    x: o.x - (ly * Math.sin(lean)) * s,
    y: o.y + (ly * Math.cos(lean)) * s
  }
}

function headWorld(o) {
  const s = o.scale || 1
  const ly = -DISPLAY_H + 8
  const lean = o.lean || 0
  return {
    x: o.x - (ly * Math.sin(lean)) * s,
    y: o.y + (ly * Math.cos(lean)) * s
  }
}

function drawWalker(ctx, o) {
  const s = o.scale || 1
  const c = conf()

  if (!ST.ready) {
    try { ensure(o, ctx) } catch (e) { ST.note = 'throw' }
    // 兜底：图集没加载出来时画一个淡色圆点，位置与 renderer 传进来的脚下点一致。
    // 真机上再补一行诊断字（预览不画，headless 不画）。
    ctx.save()
    ctx.globalAlpha = 0.28
    ctx.fillStyle = c.fallback
    ctx.beginPath()
    ctx.arc(o.x, o.y - DISPLAY_H * s / 2, 14 * s, 0, Math.PI * 2)
    ctx.fill()
    if (SHOW_DIAG) {
      ctx.globalAlpha = 0.55
      ctx.fillStyle = '#6B4A38'
      ctx.font = '9px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(ST.id + ':' + ST.note, o.x, o.y + 13 * s)
    }
    ctx.restore()
    return
  }

  const lean = o.lean || 0
  const phase = o.walkPhase || 0
  const g = gait(phase, o.speedRatio, o.balance)
  // walkPhase 是 0..2π 的连续弧度，不是帧序号。
  // 旧写法 Math.floor(phase) % 5 会把 2π 拆成 6 份（0,1,2,3,4,0,1），
  // 走完一圈最后两步帧序倒着跳。按弧度比例映射到帧数。
  const TAU = Math.PI * 2
  const cyc = ((phase % TAU) + TAU) % TAU
  const fi = Math.floor(cyc / TAU * c.frames) % c.frames

  ctx.save()
  ctx.translate(o.x, o.y + g.bob * s)
  ctx.rotate(lean + g.roll)

  const scaleH = DISPLAY_H / c.h
  const fw = c.frameW * scaleH * s
  const fh = DISPLAY_H * s

  ctx.drawImage(
    ST.img,
    fi * c.frameW, 0, c.frameW, c.h,
    -fw / 2 - c.cxFix * scaleH * s, -fh, fw, fh
  )
  ctx.restore()
}

module.exports = {
  drawWalker,
  beltWorld,
  headWorld,
  gait,
  setCharacter,
  currentId,
  CHARACTERS,
  CHARACTER_IDS,
  DISPLAY_H,
  // 测试与调试用：只读探针
  _debug: function () {
    return {
      id: ST.id, ready: ST.ready, stage: ST.stage,
      note: ST.note, hasCanvas: !!ST.canvas
    }
  }
}
