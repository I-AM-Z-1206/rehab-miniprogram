// ============================================================================
// tools/shoot-ui-test.js —— 射击界面绘制回归（node 直接跑）
//   node tools/shoot-ui-test.js
//
// 锁住两件曾经出问题的事：
//   1. 开始/暂停/结算遮罩必须画在 dpr 变换之内。之前 _drawOverlay() 放在
//      ctx.restore() 之后，等于按设备像素绘制：遮罩只盖住左上 1/4，
//      卡片半尺寸挤在左上角。
//   2. 舞台尺寸变化时，页面必须同步 canvas.width/height 并调用 engine.resize()。
//      否则画面被压扁 / 只占左上角，触屏坐标也会错。
// ============================================================================

const path = require('path')

// ---------------------------------------------------------------- 断言
let pass = 0
const fails = []
function ok(cond, label, extra) {
  if (cond) { pass += 1 }
  else fails.push(label + (extra === undefined ? '' : '  → ' + extra))
}
function eq(a, b, label) { ok(a === b, label, a + ' !== ' + b) }
function near(a, b, tol, label) { ok(Math.abs(a - b) <= tol, label, a + ' vs ' + b) }

// ---------------------------------------------------------------- 记录型 ctx
function makeRecordingCtx() {
  const state = { a: 1, d: 1, stack: [] }
  const calls = []
  const grad = { addColorStop() {} }
  const target = {
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: (t) => ({ width: String(t).length * 7 }),
    setTransform(a, b, c, d) { state.a = a; state.d = d },
    save() { state.stack.push({ a: state.a, d: state.d }) },
    restore() { const s = state.stack.pop(); if (s) { state.a = s.a; state.d = s.d } },
    fillRect(x, y, w, h) {
      calls.push({ type: 'fillRect', x: x, y: y, w: w, h: h, scale: state.a })
    }
  }
  const proxy = new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k]
      return function () {}
    },
    set(t, k, v) { t[k] = v; return true }
  })
  return {
    ctx: proxy,
    calls: calls,
    reset() { calls.length = 0 },
    get scale() { return state.a }
  }
}

// ---------------------------------------------------------------- 运行环境桩
const store = {}
global.wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v },
  removeStorageSync: (k) => { delete store[k] },
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 2 }),
  getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 2 }),
  createInnerAudioContext: () => ({
    play() {}, pause() {}, stop() {}, seek() {}, destroy() {},
    onEnded() {}, onError() {}, onPlay() {}, onStop() {}, offEnded() {}, offError() {}
  }),
  showToast() {}, showModal() {}, vibrateShort() {}, nextTick: (fn) => fn(),
  createSelectorQuery: () => null
}

const { getStore } = require('../utils/game/config.js')
const { GameEngine, STATE } = require('../utils/game/engine.js')

function makeEngine(opt) {
  const o = opt || {}
  const rec = makeRecordingCtx()
  const cfg = getStore()
  cfg.reset()
  if (o.patch) cfg.patch(o.patch, 'test')
  const canvas = { width: 0, height: 0, getContext: () => rec.ctx, requestAnimationFrame: () => 0 }
  const engine = new GameEngine({
    canvas: canvas,
    ctx: rec.ctx,
    width: o.w || 390,
    height: o.h || 600,
    dpr: o.dpr || 2,
    cfg: cfg,
    handlers: { onState() {}, onEvent() {} }
  })
  return { engine, rec, cfg }
}

// ---------------------------------------------------------------- 1. 遮罩在 dpr 变换内
console.log('\n[1] 开始遮罩：必须整屏、居中、按 dpr 缩放')
{
  const { engine, rec } = makeEngine({ w: 390, h: 600, dpr: 2 })
  rec.reset()
  engine.render()

  const scrim = rec.calls.find((c) => c.type === 'fillRect' && Math.abs(c.w - 390) < 0.5 && Math.abs(c.h - 600) < 0.5)
  ok(!!scrim, '有一块 390x600 的整屏覆盖矩形（遮罩）')
  if (scrim) {
    eq(scrim.scale, 2, '遮罩是在 dpr=2 的变换下画的')
    eq(scrim.x, 0, '遮罩从 x=0 开始')
    eq(scrim.y, 0, '遮罩从 y=0 开始')
  }

  // 卡片：宽 = 0.8W，水平居中；x 由 roundRect 决定，这里用元素位置间接验证：
  // 遮罩之后不应该再有 scale=1 的绘制（那说明画到了变换外面）
  const afterScrim = rec.calls.slice(rec.calls.indexOf(scrim) + 1)
  const badScale = afterScrim.filter((c) => c.scale !== 2)
  eq(badScale.length, 0, '遮罩之后的所有 fillRect 仍在 dpr 变换内')
}

// ---------------------------------------------------------------- 2. 遮罩位置随尺寸
console.log('\n[2] 小画布 / 大画布都不能画到框外')
{
  const sizes = [[320, 420], [390, 600], [414, 896]]
  sizes.forEach(([w, h]) => {
    const { engine, rec } = makeEngine({ w: w, h: h, dpr: 3 })
    rec.reset()
    engine.render()
    const scrim = rec.calls.find((c) => c.type === 'fillRect' && Math.abs(c.w - w) < 0.5 && Math.abs(c.h - h) < 0.5)
    ok(!!scrim, w + 'x' + h + ' 有整屏遮罩')
    if (scrim) eq(scrim.scale, 3, w + 'x' + h + ' 遮罩用 dpr=3')
    ok(rec.scale === 1, w + 'x' + h + ' 渲染结束后变换已还原（不污染下一帧）')
  })
}

// ---------------------------------------------------------------- 3. 暂停/结算也走同一条路
console.log('\n[3] 暂停与结算遮罩同样在 dpr 变换内')
{
  const { engine, rec } = makeEngine({ w: 390, h: 600, dpr: 2 })
  engine.start()
  engine.update(1 / 60, 0)
  engine.pause()
  rec.reset()
  engine.render()
  let scrim = rec.calls.find((c) => c.type === 'fillRect' && Math.abs(c.w - 390) < 0.5 && Math.abs(c.h - 600) < 0.5)
  ok(!!scrim && scrim.scale === 2, '暂停遮罩在 dpr 变换内')

  engine._end()
  rec.reset()
  engine.render()
  scrim = rec.calls.find((c) => c.type === 'fillRect' && Math.abs(c.w - 390) < 0.5 && Math.abs(c.h - 600) < 0.5)
  ok(!!scrim && scrim.scale === 2, '结算遮罩在 dpr 变换内')
  eq(engine.state, STATE.ENDED, '确实进入了 ENDED')
}

// ---------------------------------------------------------------- 4. 尺寸变化后画面填满
console.log('\n[4] resize 之后整屏覆盖跟着新尺寸走')
{
  const { engine, rec } = makeEngine({ w: 390, h: 600, dpr: 2 })
  engine.render()
  engine.resize(320, 480, 2)
  rec.reset()
  engine.render()
  const scrim = rec.calls.find((c) => c.type === 'fillRect' && Math.abs(c.w - 320) < 0.5 && Math.abs(c.h - 480) < 0.5)
  ok(!!scrim, 'resize 到 320x480 后遮罩按新尺寸铺满')
  eq(engine.width, 320, '引擎宽度已更新')
  eq(engine.height, 480, '引擎高度已更新')
}

// ---------------------------------------------------------------- 5. 页面层 UI
console.log('\n[5] 页面层 UI：开始 / 暂停 / 结算各有自己的按钮')
{
  const { ShootUI, STATE } = require('../pkgShoot/games/shoot/ui.js')
  const { engine, rec } = makeEngine({ w: 390, h: 700, dpr: 2 })
  const ui = new ShootUI({ ctx: rec.ctx, engine: engine, cfg: engine.cfg })
  ui.resize(390, 700, 2)
  ui.setInsets(50, 0)

  // 开始页
  engine.state = STATE.READY
  ui.render()
  const readyIds = ui.buttons.map((b) => b.id)
  ok(readyIds.indexOf('start') >= 0, '开始页有「开始训练」热区')
  ok(readyIds.indexOf('back') >= 0, '开始页有「返回」热区')
  ok(readyIds.indexOf('settings') >= 0, '开始页有「设置」热区')
  ok(readyIds.indexOf('pause') < 0, '开始页没有「暂停」')

  const startBtn = ui.buttons.find((b) => b.id === 'start')
  eq(ui.hitTest(startBtn.x + startBtn.w / 2, startBtn.y + startBtn.h / 2), 'start', '点开始按钮中心命中 start')
  eq(ui.hitTest(4, 4), null, '点左上角空白不命中任何按钮')

  // 训练中
  engine.state = STATE.RUNNING
  ui.render()
  const runIds = ui.buttons.map((b) => b.id)
  ok(runIds.indexOf('pause') >= 0, '训练中有「暂停」热区')
  ok(runIds.indexOf('resume') < 0, '训练中没有「继续」')
  ok(runIds.indexOf('start') < 0, '训练中没有「开始」')

  // 暂停
  engine.state = STATE.PAUSED
  ui.render()
  const pauseIds = ui.buttons.map((b) => b.id)
  ok(pauseIds.indexOf('resume') >= 0, '暂停页卡片里有「继续训练」')
  ok(pauseIds.indexOf('restart') >= 0, '暂停页卡片里有「重来」')
  ok(pauseIds.indexOf('pause') < 0, '暂停后底栏不再有「暂停」，避免重复主操作')

  // 结算
  engine.state = STATE.ENDED
  ui.render()
  const endIds = ui.buttons.map((b) => b.id)
  ok(endIds.indexOf('restart') >= 0, '结算页有「再来一局」')
  ok(endIds.indexOf('home') >= 0, '结算页有「返回首页」')
  ok(endIds.indexOf('pause') < 0, '结算页没有「暂停」')
}

// ---------------------------------------------------------------- 6. 页面层也在 dpr 变换内
console.log('\n[6] afterRender 注入的 UI 必须在 dpr 变换内绘制')
{
  const { engine, rec } = makeEngine({ w: 390, h: 700, dpr: 2 })
  let seen = null
  engine.afterRender = () => { seen = rec.scale }
  rec.reset()
  engine.render()
  eq(seen, 2, 'UI 回调拿到的变换是 dpr=2（否则会半尺寸挤在左上角）')
  eq(rec.scale, 1, 'UI 画完变换已还原')
}

// ---------------------------------------------------------------- 7. 页面 dispatch 映射
console.log('\n[7] 页面点击 → 引擎动作 / 跳转')
{
  let pageObj = null
  global.Page = (o) => { pageObj = o }
  const nav = []
  global.wx.navigateTo = (o) => nav.push(o.url)
  global.wx.switchTab = (o) => nav.push(o.url)
  global.wx.navigateBack = () => nav.push('back')
  global.wx.vibrateShort = () => {}
  global.wx.showToast = () => {}
  delete require.cache[require.resolve('../pkgShoot/pages/shoot/shoot.js')]
  require('../pkgShoot/pages/shoot/shoot.js')
  ok(!!pageObj, '拿到 Page 对象')

  const calls = []
  pageObj.game = {
    state: 'ready',
    pose: { stale: true },
    start: () => calls.push('start'),
    pause: () => calls.push('pause'),
    restart: () => calls.push('restart'),
    render: () => calls.push('render')
  }
  pageObj.ui = { markPress() {}, hitTest: () => null }

  pageObj.dispatch('start')
  pageObj.dispatch('pause')
  pageObj.dispatch('restart')
  pageObj.dispatch('settings')
  pageObj.dispatch('back')

  eq(calls.indexOf('start') >= 0, true, 'start → engine.start()')
  eq(calls.indexOf('pause') >= 0, true, 'pause → engine.pause()')
  eq(calls.indexOf('restart') >= 0, true, 'restart → engine.restart()')
  ok(nav.indexOf('/pkgShoot/pages/shoot-settings/shoot-settings') >= 0, 'settings → 打开独立参数页')
}

// ---------------------------------------------------------------- 8. 独立参数页
console.log('\n[8] 参数页：分组 / 滑块 / 难度都能写进配置')
{
  let pg = null
  global.Page = (o) => { pg = o }
  global.wx.showToast = () => {}
  global.wx.showModal = () => {}
  delete require.cache[require.resolve('../pkgShoot/pages/shoot-settings/shoot-settings.js')]
  require('../pkgShoot/pages/shoot-settings/shoot-settings.js')
  ok(!!pg, '拿到参数页 Page 对象')
  pg.setData = function (patch) { Object.assign(this.data, patch) }
  pg.onLoad()

  const keys = pg.data.groups.reduce((acc, g) => acc.concat(g.items.map((i) => i.key)), [])
  ok(pg.data.groups.length > 0, '参数分组不为空（' + pg.data.groups.length + ' 组）')
  ok(keys.indexOf('keepRangeDeg') >= 0, '保持范围在参数里')
  ok(keys.indexOf('fireRate') >= 0, '发射频率在参数里')
  ok(keys.indexOf('hitRange') >= 0, '判定半径在参数里')
  eq(pg.data.difficulties.length, 4, '四个难度档位')
  ok(pg.data.durationText !== '', '概要里有训练时长')

  const before = pg.cfg.get('keepRangeDeg')
  pg.onSlide({ currentTarget: { dataset: { key: 'keepRangeDeg' } }, detail: { value: 9 } })
  eq(pg.cfg.get('keepRangeDeg'), 9, '拖动滑块直接写进配置')
  eq(pg.data.groups.reduce((a, g) => a.concat(g.items), []).find((i) => i.key === 'keepRangeDeg').display,
    '9 °', '滑块后显示同步更新')

  pg.onDifficultyTap({ currentTarget: { dataset: { key: 'easy' } } })
  eq(pg.cfg.get('difficulty'), 'easy', '切难度写入档位')
  eq(pg.cfg.get('keepRangeDeg'), 10, '切难度同时套用该档参数')

  pg.cfg.reset()
}

finish()

// ---------------------------------------------------------------- 汇总
function finish() {
  console.log('\n' + '='.repeat(47))
  if (fails.length) {
    console.log('失败 ' + fails.length + ' 项：')
    fails.forEach((f) => console.log('  ✗ ' + f))
    process.exitCode = 1
  } else {
    console.log('全部通过（' + pass + ' 项）')
  }
}
