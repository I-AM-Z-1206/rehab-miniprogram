// ============================================================================
// tools/game_sprite_sim.js —— 贴图渲染路径冒烟测试
//   node tools/game_sprite_sim.js
// 用一个「假的 canvas.createImage」让 10 张贴图全部"加载成功"，
// 跑 180 帧确认 drawImage 分支（飞船 / 怪兽身体+眼睛+嘴+眉毛 / 激光 / 星星）
// 不会抛异常；贴图加载失败时引擎必须自动回退矢量绘制。
// ============================================================================

const { ConfigStore } = require('../utils/game/config.js')
const { GameEngine, STATE } = require('../utils/game/engine.js')
const { ASSETS } = require('../utils/game/sprites.js')

function makeCtx() {
  const grad = { addColorStop() {} }
  const target = {
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: () => ({ width: 12 }),
    drawImage: () => { drawn += 1 }
  }
  let drawn = 0
  const proxy = new Proxy(target, {
    get(t, k) {
      if (k === '__drawn') return drawn
      if (k in t) return t[k]
      return function () {}
    },
    set() { return true }
  })
  return proxy
}

function fakeImage(ok) {
  const img = { width: 128, height: 128, onload: null, onerror: null }
  let src = ''
  Object.defineProperty(img, 'src', {
    get() { return src },
    set(v) {
      src = v
      setTimeout(() => {
        if (ok) { if (img.onload) img.onload() } else if (img.onerror) img.onerror()
      }, 0)
    }
  })
  return img
}

function makeCanvas(ok) {
  return {
    requestAnimationFrame(fn) { return setTimeout(() => fn(Date.now()), 16) },
    cancelAnimationFrame(id) { clearTimeout(id) },
    createImage() { return fakeImage(ok) }
  }
}

async function run(ok) {
  const ctx = makeCtx()
  const cfg = new ConfigStore({ persist: false })
  cfg.patch({ gameDuration: 0, fireRate: 5 })
  const engine = new GameEngine({
    cfg,
    canvas: makeCanvas(ok),
    ctx,
    width: 375,
    height: 640,
    dpr: 2,
    audio: null,
    handlers: { onState() {}, onEvent() {} }
  })
  engine.state = STATE.RUNNING
  await new Promise((r) => setTimeout(r, 30)) // 等贴图 promise 落地

  let now = 0
  for (let i = 0; i < 180; i++) {
    now += (1000 / 60)
    engine.feedSensor({ pitch: Math.sin(i / 20) * 5 })
    engine.update(1 / 60, now)
    engine.render()
  }
  const info = {
    loaded: engine.sprites.count,
    total: engine.sprites.total,
    hasShip: !!engine.sprites.get('ship'),
    hasBody: !!engine.sprites.get('monsterBody'),
    hasMouth: !!engine.sprites.get('mouthIdle'),
    drawCalls: ctx.__drawn,
    hits: engine.score.hits,
    score: engine.score.score,
    monster: engine.getState().monsterState
  }
  engine.destroy()
  return info
}

;(async () => {
  let bad = 0
  const pass = (name, ok) => {
    if (!ok) bad += 1
    console.log((ok ? '  ✓ ' : '  ✗ ') + name)
  }

  console.log('[A] 贴图加载成功路径')
  const a = await run(true)
  console.log('    贴图', a.loaded + '/' + a.total, '· drawImage', a.drawCalls, '次 · 命中', a.hits, '次')
  pass('10 张贴图全部加载', a.loaded === Object.keys(ASSETS).length)
  pass('贴图渲染 180 帧无异常', a.drawCalls > 100)
  pass('命中正常结算', a.hits > 0 && a.score > 0)

  console.log('[B] 贴图加载失败 → 矢量兜底')
  const b = await run(false)
  console.log('    已加载', b.loaded, '张 · 命中', b.hits, '次')
  pass('回退时不使用贴图', b.loaded === 0)
  pass('矢量兜底仍能命中', b.hits > 0)
  pass('怪兽表情正常', b.monster === 'idle' || b.monster === 'sad')

  // [C] 还没开局（READY）时，贴图加载完成后必须自动重绘一次，
  //     否则「开始前」会一直停在矢量兜底（老素材）
  console.log('[C] 开始前（READY）状态的重绘')
  const ctxC = makeCtx()
  const cfgC = new ConfigStore({ persist: false })
  const engineC = new GameEngine({
    cfg: cfgC,
    canvas: makeCanvas(true),
    ctx: ctxC,
    width: 375,
    height: 640,
    dpr: 2,
    audio: null,
    handlers: { onState() {}, onEvent() {} }
  })
  await new Promise((r) => setTimeout(r, 40))
  console.log('    READY 状态 drawImage', ctxC.__drawn, '次（未手动 render）')
  pass('READY 状态已用贴图重绘', ctxC.__drawn > 0)
  engineC.destroy()

  console.log('\n' + (bad ? '存在 ' + bad + ' 项失败' : '全部通过'))
  process.exit(bad ? 1 : 0)
})()
