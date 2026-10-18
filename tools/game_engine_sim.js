// ============================================================================
// tools/game_engine_sim.js —— 无 UI 引擎冒烟测试（桩化 canvas/ctx，node 直接跑）
//   node tools/game_engine_sim.js
// 目的：在没有微信/真机的环境里跑满 1200 帧，确认帧循环、开火、碰撞、结算、
//       渲染调用、参数热更新都不会抛异常，并检查数值是否符合预期。
// ============================================================================

const { ConfigStore } = require('../utils/game/config.js')
const { GameEngine, STATE } = require('../utils/game/engine.js')

function makeCtx() {
  const grad = { addColorStop() {} }
  const target = {
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: () => ({ width: 12 })
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k]
      return function () {}
    },
    set() { return true }
  })
}

const canvasStub = {
  requestAnimationFrame(fn) { return setTimeout(() => fn(Date.now()), 16) },
  cancelAnimationFrame(id) { clearTimeout(id) }
}

const cfg = new ConfigStore({ persist: false })
// 按实机方向：左右摆动用 pitch 模拟；duration 60 用于验证倒计时
cfg.patch({
  gameDuration: 60, fireRate: 4,
  keepRangeDeg: 6, maxLeanDeg: 20
})

const events = []
const engine = new GameEngine({
  cfg,
  canvas: canvasStub,
  ctx: makeCtx(),
  width: 375,
  height: 640,
  dpr: 2,
  audio: null,
  handlers: {
    onState() {},
    onEvent(ev) { events.push(ev) }
  }
})

engine.state = STATE.RUNNING

let now = 0
const dt = 1 / 60
let frames = 0
let maxScore = 0
let bulletsPeak = 0
let timeLeftAfter2s = null

for (let i = 0; i < 1200; i++) {
  now += dt * 1000
  // 模拟患者左右摆动（±7°，在 ±6° 保持范围边缘来回），中心时正好击中固定怪兽
  const pitch = Math.sin(i / 40) * 7
  engine.feedSensor({ pitch: pitch })
  engine.update(dt, now)
  engine.render()
  frames += 1
  maxScore = Math.max(maxScore, engine.score.score)
  bulletsPeak = Math.max(bulletsPeak, engine.bullets.count)

  if (i === 120) timeLeftAfter2s = engine.getState().timeLeft

  // 中途热更新，模拟治疗师实时调参
  if (i === 300) engine.setHitArea(90)
  if (i === 420) engine.setFireRate(3)
  if (i === 600) engine.setDifficulty('hard', false)
  if (i === 700) engine.setScoreRange(5, 5)
  if (i === 800) engine.setKeepRange(12)
}

const st = engine.getState()
const hitEvents = events.filter(e => e.type === 'hit').length
const combos = events.filter(e => e.type === 'hit' && e.combo >= 2).length

console.log('模拟帧数        :', frames)
console.log('得分            :', st.score)
console.log('命中次数        :', st.hits, '（命中事件', hitEvents + '）')
console.log('最高连击        :', st.maxCombo, '（连击次数', combos + '）')
console.log('子弹峰值        :', bulletsPeak)
console.log('倒计时(2s后)    :', timeLeftAfter2s, 's（应 < 60）')
console.log('最终难度/判定   :', st.difficulty, st.hitRange + 'px')
console.log('怪兽表情状态    :', st.monsterState)
console.log('状态            :', st.state)

// 出界验证：必须停火（且在飞子弹被清空）、基础分暂停、怪兽得意
engine.setKeepRange(10)
for (let i = 0; i < 40; i++) {
  now += dt * 1000
  engine.feedSensor({ pitch: 40 })
  engine.update(dt, now)
}
const shotsBefore = engine.score.shots
const baseBefore = engine.score.baseScore
for (let i = 0; i < 120; i++) {
  now += dt * 1000
  engine.feedSensor({ pitch: 40 })
  engine.update(dt, now)
}
const outZoneFires = engine.score.shots > shotsBefore
const outZoneBullets = engine.bullets.count
const outZoneBasePaused = engine.score.baseScore === baseBefore
const outZoneState = engine.pose.inZone === false
const outZoneMirror = engine.pose.x01 < 0.5
const outZoneSmug = engine.monster.smug === true
console.log('出界后开火      :', outZoneFires ? '是(异常)' : '否(已停火)', '(出界前', shotsBefore, '→ 现在', engine.score.shots, ')')
console.log('出界在飞子弹    :', outZoneBullets, '颗（应为 0）')
console.log('出界怪兽得意    :', outZoneSmug ? '是' : '否')
console.log('出界暂停基础分  :', outZoneBasePaused ? '是' : '否', '(基础分', baseBefore, '→', engine.score.baseScore, ')')
console.log('出界判定        :', outZoneState ? 'inZone=false' : 'inZone=true')
console.log('出界小人位置    :', outZoneMirror ? '屏幕左侧（镜像）' : '屏幕右侧')

// 回中击中后怪兽悲伤
for (let i = 0; i < 70; i++) {
  now += dt * 1000
  engine.feedSensor({ pitch: 0 })
  engine.update(dt, now)
}
console.log('击中后怪兽悲伤  :', engine.monster.sad > 0 ? '是(悲伤中)' : '否')

// 暂停 / 恢复 / 重启
engine.pause()
engine.resume()
engine.restart()
console.log('暂停→恢复→重启  :', 'ok, state =', engine.state, ', score =', engine.score.score)

engine.render()

const checks = [
  ['跑满 1200 帧无异常', frames === 1200],
  ['产生了命中', st.hits > 0],
  ['得分 > 0', st.score > 0],
  ['判定半径热更新成功', st.hitRange === 90],
  ['难度切换成功', st.difficulty === 'hard'],
  ['倒计时在减少', timeLeftAfter2s !== null && timeLeftAfter2s < 60],
  ['出界不再发射子弹', !outZoneFires],
  ['出界清空在飞子弹', outZoneBullets === 0],
  ['出界怪兽得意', outZoneSmug],
  ['出界暂停基础分', outZoneBasePaused],
  ['出界判定正确', outZoneState],
  ['出界小人镜像到左侧', outZoneMirror]
]

console.log('')
let bad = 0
checks.forEach(([name, pass]) => {
  if (!pass) bad += 1
  console.log((pass ? '  ✓ ' : '  ✗ ') + name)
})
console.log('\n' + (bad ? '存在 ' + bad + ' 项失败' : '全部通过'))
process.exit(bad ? 1 : 0)
