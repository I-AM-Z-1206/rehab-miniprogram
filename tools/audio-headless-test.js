// ============================================================================
// tools/audio-headless-test.js —— 音效层自检（Node 运行，不播真实声音）
// ----------------------------------------------------------------------------
// 用 Mock InnerAudioContext 验证 utils/game/audio.js 的行为：
//   1. 两套音效集（shooter / casual）的素材映射是否正确
//   2. sfxOn / bgmOn 开关、sfxVolume / bgmVolume 是否生效
//   3. 同一音效的最小触发间隔（连击时不会糊成一片）
//   4. stop()/seek() 抛错时 play() 仍然执行（老版本的真 bug）
//   5. play() 抛错时能换一个新播放器顶上，不会永久沉默
//   6. BGM：loop、音量、暂停/停止/继续、开关关闭时不播
//   7. 配置里没有 bgmOn / sfxVolume 时（走钢丝、节奏的配置）走默认值不报错
//   8. destroy 后清空，不残留播放器
//
// 用法：node tools/audio-headless-test.js
// ============================================================================

/* eslint-disable no-console */

let pass = 0
let fail = 0
const failures = []

function ok(cond, label) {
  if (cond) {
    pass += 1
    console.log('  ✓ ' + label)
  } else {
    fail += 1
    failures.push(label)
    console.log('  ✗ ' + label)
  }
}

function eq(a, b, label) {
  ok(a === b, label + (a === b ? '' : '（实际 ' + JSON.stringify(a) + '，期望 ' + JSON.stringify(b) + '）'))
}

// ---------------------------------------------------------------- Mock 播放器
const created = []

class MockAudio {
  constructor() {
    this.src = ''
    this.volume = 0.8
    this.loop = false
    this.obeyMuteSwitch = true
    this.played = 0
    this.paused = 0
    this.stopped = 0
    this.seeks = 0
    this.destroyed = false
    this.throwStop = false
    this.throwSeek = false
    this.throwPlay = false
    this.onErrorCb = null
  }
  play() {
    if (this.throwPlay) throw new Error('mock play fail')
    this.played += 1
  }
  pause() { this.paused += 1 }
  stop() {
    if (this.throwStop) throw new Error('mock stop fail')
    this.stopped += 1
  }
  seek() {
    if (this.throwSeek) throw new Error('mock seek fail')
    this.seeks += 1
  }
  destroy() { this.destroyed = true }
  onError(cb) { this.onErrorCb = cb }
}

global.wx = {
  createInnerAudioContext: () => {
    const a = new MockAudio()
    created.push(a)
    return a
  },
  setInnerAudioOption: () => {}
}

const { AudioKit, PROFILES } = require('../utils/game/audio.js')

function makeCfg(over) {
  const store = Object.assign({
    sfxOn: true,
    bgmOn: true,
    sfxVolume: 0.8,
    bgmVolume: 0.26
  }, over || {})
  return {
    get: (k) => (store[k] === undefined ? undefined : store[k]),
    set: (k, v) => { store[k] = v; return v },
    all: () => Object.assign({}, store)
  }
}

function lastKit(profile, over) {
  const cfg = makeCfg(over)
  const kit = new AudioKit(cfg, profile)
  kit.init()
  return { kit, cfg }
}

// ============================================================================
console.log('\n[1] 音效集映射')
{
  ok(!!PROFILES.shooter && !!PROFILES.casual, '存在 shooter / casual 两套音效集')
  eq(PROFILES.shooter.base, '/audio/game/', '射击集仍指向原素材目录')
  eq(PROFILES.casual.base, '/audio/game/sfx/', 'casual 集指向合成素材目录')
  eq(PROFILES.casual.sfx.catch, 'fruit_catch.mp3', '接住音效是 fruit_catch.mp3')
  eq(PROFILES.shooter.sfx.hit, 'hit.mp3', '射击集没有被动过')

  created.length = 0
  const a = lastKit('casual')
  const srcs = Object.keys(a.kit.pools).map((k) => a.kit.pools[k].length && a.kit.pools[k][0].src)
  ok(srcs.every((s) => s.indexOf('/audio/game/sfx/') === 0), 'casual 集所有 src 都在 sfx 目录')
  ok(a.kit.pools.catch && a.kit.pools.catch.length === 2, '接住音效池 2 个播放器（够叠放、不超实例上限）')
  // 回归：每套音效集的总播放器数 + BGM 必须低于旧基础库 10 个的上限
  Object.keys(PROFILES).forEach((k) => {
    const n = Object.values(PROFILES[k].pool || {}).reduce((x, y) => x + y, 0) + 1
    ok(n <= 10, k + ' 音效集实例数 ' + n + ' ≤ 10')
  })

  created.length = 0
  const b = lastKit('shooter')
  ok(b.kit.pools.shoot[0].src.indexOf('shoot.mp3') >= 0, '射击集开火音效不变')
  b.kit.destroy()
  a.kit.destroy()
}

console.log('\n[2] 开关与音量')
{
  created.length = 0
  const { kit, cfg } = lastKit('casual')

  kit.sfx('catch')
  ok(kit.pools.catch[0].played === 1, 'sfxOn=true 时接住音效会播放')
  eq(kit.pools.catch[0].volume, 0.8, '音效音量取自配置')

  // 换一个音效名（不会被 40ms 限流拦住）来验证音量即时生效
  cfg.set('sfxVolume', 0.3)
  kit.sfx('combo')
  eq(kit.pools.combo[0].volume, 0.3, '改配置后音量立即生效')

  cfg.set('sfxOn', false)
  const before = kit.pools.catch.reduce((s, c) => s + c.played, 0)
  kit.sfx('catch')
  const after = kit.pools.catch.reduce((s, c) => s + c.played, 0)
  eq(after, before, 'sfxOn=false 时不再播放')

  cfg.set('sfxOn', true)
  kit.sync()
  ok(kit.pools.catch.every((c) => Math.abs(c.volume - 0.3) < 1e-9), 'sync() 会把新音量应用到所有播放器')
  kit.destroy()
}

console.log('\n[3] 触发间隔（连击不糊）')
{
  created.length = 0
  const { kit } = lastKit('casual')
  kit.sfx('catch')
  kit.sfx('catch')
  kit.sfx('catch')
  const plays = kit.pools.catch.reduce((s, c) => s + c.played, 0)
  eq(plays, 1, '40ms 内的重复接住只播一次')
  kit.destroy()

  created.length = 0
  const k2 = lastKit('casual').kit
  k2.sfx('combo')
  k2.sfx('combo')
  const comboPlays = k2.pools.combo.reduce((s, c) => s + c.played, 0)
  eq(comboPlays, 1, '连击音效同样受限流')
  k2.destroy()
}

console.log('\n[4] 播放健壮性（老 bug 回归）')
{
  created.length = 0
  const { kit } = lastKit('casual')
  // 模拟"stop 之后再 seek 会抛错"的机型
  kit.pools.catch.forEach((c) => { c.throwStop = true; c.throwSeek = true })
  kit.sfx('catch')
  ok(kit.pools.catch[0].played === 1, 'stop/seek 抛错时 play 仍然执行（不会没声）')
  kit.destroy()

  created.length = 0
  const k2 = lastKit('casual').kit
  const broken = k2.pools.catch[0]
  broken.throwPlay = true
  k2.sfx('catch')
  ok(k2.pools.catch[0] !== broken, 'play 抛错会换一个新播放器顶上')
  ok(k2.errors > 0, '错误计数有记录，便于排查')
  k2.destroy()
}

console.log('\n[5] 背景音乐')
{
  created.length = 0
  const { kit, cfg } = lastKit('casual')
  kit.startBgm()
  ok(!!kit.bgm, 'BGM 播放器已创建')
  ok(kit.bgm.src.indexOf('garden_loop.mp3') >= 0, 'BGM 指向果园循环')
  eq(kit.bgm.loop, true, 'BGM 循环播放')
  eq(kit.bgm.volume, 0.26, 'BGM 音量取自配置（默认压得比音效低）')
  eq(kit.bgm.played, 1, 'BGM 已开始播放')

  kit.pauseBgm()
  eq(kit.bgm.paused, 1, 'pauseBgm 会暂停')
  kit.resumeBgm()
  eq(kit.bgm.played, 2, 'resumeBgm 会继续')
  kit.stopBgm()
  eq(kit.bgm.stopped, 1, 'stopBgm 会停止')

  cfg.set('bgmOn', false)
  const playedBefore = kit.bgm.played
  kit.startBgm()
  eq(kit.bgm.played, playedBefore, 'bgmOn=false 时不再播放')

  cfg.set('bgmOn', true)
  kit.startBgm()
  kit.destroy()
  ok(kit.bgm === null, 'destroy 后 BGM 清空')
}

console.log('\n[6] 缺省配置不报错（走钢丝 / 节奏的配置没有 bgmOn）')
{
  created.length = 0
  const sparse = {
    get: (k) => (k === 'sfxOn' ? true : undefined),
    set: () => {},
    all: () => ({})
  }
  const kit = new AudioKit(sparse, 'casual')
  kit.init()
  let threw = false
  try {
    kit.sfx('catch')
    kit.startBgm()
    kit.pauseBgm()
    kit.stopBgm()
    kit.sync()
  } catch (e) {
    threw = true
  }
  ok(!threw, '没有 bgmOn/bgmVolume/sfxVolume 时按默认值工作，不抛错')
  eq(kit.bgm.volume, 0.26, '缺省 BGM 音量用 casual 的默认值')
  eq(kit.pools.catch[0].volume, 0.8, '缺省音效音量 0.8')
  kit.destroy()
}

console.log('\n[7] 生命周期')
{
  created.length = 0
  const { kit } = lastKit('casual')
  const total = created.length
  ok(total > 0, 'init 创建了 ' + total + ' 个播放器')
  kit.destroy()
  const allDestroyed = created.every((c) => c.destroyed)
  ok(allDestroyed, 'destroy 会销毁全部播放器')
  ok(Object.keys(kit.pools).every((k) => kit.pools[k].length === 0), '音效池已清空')
  eq(kit.ready, false, 'ready 复位')
}

console.log('\n----------------------------------------')
if (fail === 0) {
  console.log('结果：全部通过（' + pass + ' 项）')
} else {
  console.log('结果：' + fail + ' 项失败 / 共 ' + (pass + fail) + ' 项')
  failures.forEach((f) => console.log('  · ' + f))
  process.exitCode = 1
}
