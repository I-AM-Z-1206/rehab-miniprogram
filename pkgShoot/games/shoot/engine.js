// ============================================================================
// pkgShoot/games/shoot/engine.js —— 游戏引擎（GameEngine）
// ----------------------------------------------------------------------------
// 一个引擎实例 = 一局游戏。负责：
//   1. 帧循环（canvas.requestAnimationFrame，掉帧时用 setTimeout 兜底）
//   2. 双时钟：0.1s 判定/计分刻度 + 1.0s 基础计时/计分刻度（见 score.js）
//   3. 传感器姿态 → 角色横向位置、保持范围（见 pose.js）
//   4. 自动开火（发射频率来自配置）、固定光核判定（hit.js / bullet.js）
//   5. Canvas 2D 渲染：2.5D 背景 / 城市灯火 / 保持区 / 战机 / 光核 / 子弹 / 粒子 / HUD
//   6. 参数热更新：任何配置变更下一帧生效，无需重开游戏
//
// 玩法：屏幕中间悬停一座城市的光核。无论是否在保持范围内都会自动开火；
//       出界时提示回到中间并暂停基础分（子弹不停），回到范围恢复基础分。
//       击中 → 装甲过曝 + 火花 + 得分 + 连击。
//
// 状态机：ready → running ⇄ paused → ended → restart
// ============================================================================

const { ScoreManager } = require('./score.js')
const { BulletSystem } = require('./bullet.js')
const { HitDetector } = require('./hit.js')
const { PoseTracker } = require('./pose.js')
const { SpriteBank } = require('./sprites.js')
const scene = require('./scene2d.js')

const STATE = {
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  ENDED: 'ended'
}

const PAD = 16           // 屏幕左右安全边距(px)
const GROUND_RATIO = 0.87
const PLAYER_H = 76
// 光核（靶）中心在屏幕高度的位置。
// 0.40 → 0.36（2026-10-30）：城市第一次放大到 1.5 倍，0.40 时「光核下沿到
// 地平线」只有 62px 余量，最高的塔会插进光核下半部分。
// 0.36 → 0.33（2026-10-30 同日）：城市分布重做后最高塔 99px，0.36 只剩 90px
// 可用，塔尖会顶到光核下沿。上移到 0.33 后有 114px，最高塔离下沿还有 16px 空气。
// **改这个值或改 CITY_SCALE 都必须重算这个余量**（scene2d.js 的塔高注释里有算式）。
const MONSTER_Y_RATIO = 0.33

// —— 城市灯火（整局的「成果条」）——
// PER_HIT：一次命中点亮多少。60 秒 × 3 发/秒 = 180 发，全中约 48 秒铺满，
//   留出余量给「中途出界掉一些、再补回来」的波动。
// DECAY：出界时每秒流失多少。出界 3 秒掉 10.5%，约要 15 发补回来（5 秒）。
//   太狠会让一次失手毁掉整局，太轻则「出界」没有代价。
const LIGHT_PER_HIT = 0.007
const LIGHT_DECAY = 0.035
// 传感器姿态采样频率：固定 60Hz，与渲染帧率解耦（渲染掉帧时也按 60Hz 补采样）
const SENSOR_HZ = 60
const SENSOR_STEP_MS = 1000 / SENSOR_HZ

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2)
  ctx.lineTo(x + rr, y + h)
  ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI)
  ctx.lineTo(x, y + rr)
  ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5)
  ctx.closePath()
}

class GameEngine {
  /**
   * @param {Object} opts
   *   cfg      ConfigStore
   *   canvas   Canvas 2D 节点
   *   ctx      CanvasRenderingContext2D
   *   width/height  逻辑尺寸(CSS px)
   *   dpr      devicePixelRatio
   *   audio    AudioKit（可选）
   *   handlers { onState, onEvent }
   */
  constructor(opts) {
    const o = opts || {}
    this.cfg = o.cfg
    this.canvas = o.canvas
    this.ctx = o.ctx
    this.dpr = o.dpr || 1
    this.audio = o.audio || null
    this.handlers = o.handlers || {}
    // 顶部安全区（custom navigation 时 HUD 要躲开状态栏）
    this.insetTop = 0
    // 页面自己画开始/暂停/结算面板时，引擎不再画自己那套（避免两套叠在一起）
    this.externalOverlay = false
    // 每帧渲染完的回调：页面用它把状态条 / 按钮画在引擎画面之上
    this.afterRender = null

    this.width = o.width || 375
    this.height = o.height || 600

    this.score = new ScoreManager(this.cfg)
    this.bullets = new BulletSystem(this.cfg, { width: this.width, height: this.height })
    this.hit = new HitDetector(this.cfg)
    this.pose = new PoseTracker(this.cfg)
    this.sprites = new SpriteBank(this.canvas)
    this.sprites.load().then((loaded) => {
      if (this.destroyed) return
      // 贴图是异步的：加载完成后必须主动重绘一次，
      // 否则「开始前」的画面会一直停在矢量兜底（老素材），直到开局才刷新
      if (this.state !== STATE.RUNNING) this.render()
      this._emitState(true)
      if (loaded < this.sprites.total) {
        console.warn('[game] 部分贴图未加载，已回退矢量绘制：' + loaded + '/' + this.sprites.total)
      }
    })

    this.state = STATE.READY
    this.monster = null
    this.particles = []
    this.floats = []
    this.hitBucket = []
    this.seq = 0

    this.tickIndex = 0
    this.secIndex = 0
    this.accTick = 0
    this.accSec = 0
    this.poseAcc = 0
    this.fireAcc = 0
    this.elapsedMs = 0
    this.t = 0

    this.playerX = this.width / 2
    this.recoil = 0
    this.muzzle = 0
    this.shake = 0
    this.flash = 0
    this.rangeFlash = 0
    this.wasInZone = true
    this.outSince = 0
    this.destroyed = false
    this.stateEmitAt = 0
    this.lastTs = 0
    this.rafId = 0
    this.usingRaf = false

    // —— 2.5D 渲染状态 ——
    // quality: 2 全开 / 1 中（大屏、中端机）/ 0 省电（连续掉帧后自动降）
    this.quality = undefined
    this._qualityLocked = false
    this._slowFrames = 0
    this.scene = null
    // 命中冲击波（镜头推近的小冲击）与连击推拉
    this.shocks = []
    this.zoom = 0
    // 城市灯火：0..1 的「成果条」。命中 +LIGHT_PER_HIT，出界按秒流失。
    // 它同时驱动三样东西：窗灯亮起、地平线辉光、光核亮度。
    this.light = 0
    this.lampsLit = 0

    this._layout()
    this._resetMonster()
    this._unsub = this.cfg.subscribe((p) => this._onConfig(p))
  }

  // ---------------------------------------------------------------- 尺寸 / 布局
  resize(width, height, dpr) {
    this.width = Math.max(160, width)
    this.height = Math.max(200, height)
    this.dpr = dpr || this.dpr
    this.bullets.resize(this.width, this.height)
    this._layout()
    this.playerX = clamp(this.playerX, PAD, this.width - PAD)
    if (this.monster) this.monster.x = this.cx
    if (this.state !== STATE.RUNNING) this.render()
  }

  _layout() {
    this.cx = this.width / 2
    this.groundY = this.height * GROUND_RATIO
    this.monsterY = this.height * MONSTER_Y_RATIO
    this.scale = clamp(this.width / 375, 0.72, 1.6)
    // 子弹纵深参考面：枪口（地面附近）最近，光核所在高度最远。
    // 只影响子弹的绘制缩放，HitDetector 用目标半径与 hitRange，手感不变。
    if (this.bullets) {
      this.bullets.setDepthRange(this.groundY - 26 * this.scale, this.monsterY)
    }
    // 画质档位：大屏（平板 / 折叠屏）先降一档，跑起来再看帧率
    if (!this._qualityLocked) {
      const area = this.width * this.height
      const dpr = this.dpr || 1
      this.quality = (area > 520000 || dpr >= 3.5) ? 1 : 2
    }
    this.scene = scene.buildScene(this.width, this.height, this.quality)
  }

  _resetMonster() {
    this.monster = {
      id: 'monster',
      x: this.cx,
      y: this.monsterY,
      radius: Number(this.cfg.get('targetRadius')) || 22,
      sad: 0,
      smug: false,
      hitThisFrame: false,
      dead: false
    }
  }

  /** 保持范围在屏幕上的半宽(px) */
  keepHalfPx() {
    const keep = Number(this.cfg.get('keepRangeDeg')) || 6
    const maxLean = Math.max(5, Number(this.cfg.get('maxLeanDeg')) || 20)
    const half = Math.min(1, keep / maxLean) * (this.width / 2 - 10)
    return Math.max(18, half)
  }

  // ---------------------------------------------------------------- 生命周期
  start() {
    if (this.state === STATE.RUNNING) return
    if (this.state === STATE.ENDED) this._resetRound()
    this.state = STATE.RUNNING
    this.lastTs = 0
    this._emitEvent({ type: 'start' })
    if (this.audio) {
      this.audio.init()
      this.audio.sfx('ui')
      this.audio.startBgm()
    }
    this._startLoop()
  }

  pause() {
    if (this.state !== STATE.RUNNING) return
    this.state = STATE.PAUSED
    this._stopLoop()
    if (this.audio) this.audio.pauseBgm()
    this.render()
    this._emitEvent({ type: 'pause' })
    this._emitState(true)
  }

  resume() {
    if (this.state !== STATE.PAUSED) return
    this.state = STATE.RUNNING
    this.lastTs = 0
    if (this.audio) this.audio.startBgm()
    this._startLoop()
    this._emitEvent({ type: 'resume' })
  }

  toggle() {
    if (this.state === STATE.RUNNING) this.pause()
    else if (this.state === STATE.PAUSED) this.resume()
    else this.start()
  }

  restart() {
    this._stopLoop()
    this._resetRound()
    this.state = STATE.READY
    this.render()
    this.start()
  }

  destroy() {
    this.destroyed = true
    this._stopLoop()
    if (this._unsub) this._unsub()
    this._unsub = null
    if (this.audio) {
      this.audio.stopBgm()
      this.audio.destroy()
    }
    this.bullets.clear()
    this.particles = []
    this.floats = []
  }

  _resetRound() {
    this.score.reset()
    this.bullets.clear()
    this.particles = []
    this.floats = []
    this.hitBucket = []
    this.tickIndex = 0
    this.secIndex = 0
    this.accTick = 0
    this.accSec = 0
    this.fireAcc = 0
    this.elapsedMs = 0
    this.t = 0
    this.recoil = 0
    this.muzzle = 0
    this.shake = 0
    this.flash = 0
    this.zoom = 0
    this.shocks = []
    this.light = 0
    this.lampsLit = 0
    this.wasInZone = this.pose.inZone
    this.pose.reset()
    this.playerX = this.cx
    this._resetMonster()
    this._emitEvent({ type: 'reset' })
  }

  // ---------------------------------------------------------------- 帧循环
  _startLoop() {
    if (this.rafId) return
    const that = this
    const step = function () {
      that.rafId = 0
      if (that.destroyed || that.state !== STATE.RUNNING) return
      // 统一用 Date.now()：与 pose.feed 的传感器时间戳同源，
      // 否则 canvas rAF 的相对时间戳会让“1.2s 掉线”判断永远不成立。
      const now = Date.now()
      let dt = that.lastTs ? (now - that.lastTs) / 1000 : 0.016
      if (!isFinite(dt) || dt <= 0) dt = 0.016
      if (dt > 0.12) dt = 0.016
      that.lastTs = now
      that.t += dt
      that.update(dt, now)
      that.render()
      that._emitState(false)
      if (that.state !== STATE.RUNNING) {
        that.rafId = 0
        return
      }
      that.rafId = that._raf(step)
    }
    this.lastTs = 0
    this.rafId = this._raf(step)
  }

  _stopLoop() {
    if (!this.rafId) return
    if (this.usingRaf && this.canvas && typeof this.canvas.cancelAnimationFrame === 'function') {
      try { this.canvas.cancelAnimationFrame(this.rafId) } catch (e) { /* 忽略 */ }
    } else {
      try { clearTimeout(this.rafId) } catch (e) { /* 忽略 */ }
    }
    this.rafId = 0
  }

  _raf(fn) {
    if (this.canvas && typeof this.canvas.requestAnimationFrame === 'function') {
      this.usingRaf = true
      return this.canvas.requestAnimationFrame(fn)
    }
    this.usingRaf = false
    return setTimeout(function () { fn(Date.now()) }, 16)
  }

  // ---------------------------------------------------------------- 传感器
  feedSensor(frame) {
    this.pose.feed(frame)
  }

  setSimAngle(deg) {
    this.pose.setSimAngle(deg)
  }

  // ---------------------------------------------------------------- 一帧逻辑
  update(dt, now) {
    const cfg = this.cfg

    // 1) 姿态：固定 60Hz 采样（与渲染帧率解耦；渲染掉帧时一次补多步）
    this.poseAcc += dt * 1000
    let samples = 0
    while (this.poseAcc >= SENSOR_STEP_MS && samples < 4) {
      this.poseAcc -= SENSOR_STEP_MS
      this.pose.update(now - this.poseAcc, SENSOR_STEP_MS / 1000)
      samples += 1
    }
    if (!samples) this.pose.update(now, dt) // 高刷屏（>60fps）也保证每帧响应

    this.elapsedMs += dt * 1000
    const targetX = PAD + this.pose.x01 * (this.width - PAD * 2)
    const follow = 1 - Math.exp(-60 * dt)
    this.playerX += (targetX - this.playerX) * follow

    // 2) 光核状态：出界警戒 / 击中过曝
    const m = this.monster
    m.radius = Number(cfg.get('targetRadius')) || 22
    m.smug = !this.pose.inZone
    if (m.sad > 0) m.sad = Math.max(0, m.sad - dt)

    // 3) 保持范围进出事件
    if (this.pose.inZone !== this.wasInZone) {
      this.wasInZone = this.pose.inZone
      if (this.pose.inZone) {
        this.outSince = 0
        this._emitEvent({ type: 'back', angle: this.pose.getAngle() })
      } else {
        this.outSince = now
        this._emitEvent({
          type: 'out',
          dir: this.pose.dir,
          charDir: this.pose.norm < -0.12 ? 'left' : (this.pose.norm > 0.12 ? 'right' : 'center'),
          angle: this.pose.getAngle()
        })
        // 出界：立即停火，并清空在飞子弹（避免"出界了还在打"的观感）
        this.fireAcc = 0
        this.bullets.clear()
        if (this.audio) this.audio.sfx('miss')
        this._vibrate()
      }
    }
    if (!this.pose.inZone && this.outSince && now - this.outSince > 2500) {
      this.outSince = now
      this._emitEvent({ type: 'outHint', dir: this.pose.dir })
    }

    // 4) 自动开火：只有保持在范围内才开火；出界立即停火
    if (this.pose.inZone) {
      const rate = Math.max(0.1, Number(cfg.get('fireRate')) || 1)
      const interval = 1 / rate
      this.fireAcc += dt
      let guard = 0
      while (this.fireAcc >= interval && guard < 24) {
        this.fireAcc -= interval
        this._fire()
        guard += 1
      }
    } else {
      this.fireAcc = 0
    }

    // 5) 子弹移动 + 碰撞判定（每帧扫掠，命中入桶等 0.1s 刻度结算）
    this.bullets.update(dt)
    this._collide()

    // 6) 0.1s 刻度：累计击中 + 连击
    const tickMs = Math.max(20, Number(cfg.get('tickMs')) || 100)
    this.accTick += dt * 1000
    let tickGuard = 0
    while (this.accTick >= tickMs && tickGuard < 8) {
      this.accTick -= tickMs
      this._tick()
      tickGuard += 1
    }

    // 7) 1.0s 刻度：基础计时 + 基础分
    const baseMs = Math.max(1, Number(cfg.get('baseTickMs')) || 1000)
    this.accSec += dt * 1000
    let secGuard = 0
    while (this.accSec >= baseMs && secGuard < 4) {
      this.accSec -= baseMs
      this._second()
      secGuard += 1
    }

    // 8) 特效衰减
    this.recoil = Math.max(0, this.recoil - dt * 4)
    this.muzzle = Math.max(0, this.muzzle - dt)
    this.shake = Math.max(0, this.shake - dt * 3.5)
    this.flash = Math.max(0, this.flash - dt * 2)
    this.rangeFlash = Math.max(0, this.rangeFlash - dt)

    // —— 城市灯火：出界时能量流失 ——
    // 这是全游戏最重要的一条反馈设计。惩罚是「你点亮的东西在变暗」，
    // 而不是「敌人得意地嘲笑你」——同样的强度，但不羞辱人。
    // 居家自助训练，旁边没有人接住挫败感。
    if (this.state === STATE.RUNNING && !this.pose.inZone) {
      this.light = Math.max(0, this.light - LIGHT_DECAY * dt)
    }
    // 镜头推拉回弹（指数衰减，约 0.3s 归零）
    this.zoom = this.zoom > 0.0005 ? this.zoom * Math.exp(-7 * dt) : 0
    this._updateEffects(dt)

    // 画质自适应：连续掉帧（>36ms/帧）就降一档，只降不升，避免来回抖
    if (dt > 0.036) this._slowFrames += 1
    else if (this._slowFrames > 0) this._slowFrames -= 1
    if (this._slowFrames > 110 && this.quality > 0) {
      this.quality -= 1
      this._qualityLocked = true
      this._slowFrames = 0
      this.scene = scene.buildScene(this.width, this.height, this.quality)
    }

    // 9) 时长到点
    const duration = Number(cfg.get('gameDuration')) || 0
    if (duration > 0 && this.elapsedMs >= duration * 1000) {
      this._end()
    }
  }

  _tick() {
    this.tickIndex += 1
    const events = this.score.onTick(this.tickIndex, this.hitBucket)
    this.hitBucket = []
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]
      if (ev.type === 'hit') {
        // 飘字下移到光核之外：原来看在 +26，正好压在光核下半部，
        // 白色核心 + 白色数字叠在一起，两边都看不清。
        this._addFloat(ev.x, ev.y + 52, '+' + ev.gain, ev.combo >= 2 ? '#ffd166' : '#e6fff8', ev.combo >= 2 ? 1.15 : 1)
        if (ev.combo >= 3) this._addFloat(ev.x, ev.y + 74, 'COMBO x' + ev.combo, '#ff9f43', 0.9)
        if (this.audio) this.audio.sfx(ev.combo >= 3 ? 'combo' : 'hit')
        this.flash = Math.min(1, this.flash + 0.35)
        if (ev.combo >= 5) this._vibrate()
        this._emitEvent(ev)
      } else if (ev.type === 'comboEnd') {
        this._emitEvent(ev)
      }
    }
  }

  _second() {
    this.secIndex += 1
    const ev = this.score.onSecond(this.pose.inZone)
    if (ev.gain > 0) {
      this._addFloat(this.playerX, this.groundY - PLAYER_H - 10, '+' + ev.gain, '#9fe8ff', 0.85)
    }
    this._emitEvent(ev)
    this._emitState(true)
  }

  _end() {
    if (this.state === STATE.ENDED) return
    this.state = STATE.ENDED
    this._stopLoop()
    const stats = this.score.stats()
    if (this.audio) {
      this.audio.sfx('combo')
      this.audio.stopBgm()
    }
    this._emitEvent({ type: 'end', stats: stats })
    this._emitState(true)
    this.render()
  }

  _vibrate() {
    if (typeof wx === 'undefined' || !wx.vibrateShort) return
    try { wx.vibrateShort({ type: 'light' }) } catch (e) { /* 忽略 */ }
  }

  // ---------------------------------------------------------------- 开火 / 碰撞
  _fire() {
    // 双保险：出界时任何路径都不允许产生子弹
    if (!this.pose.inZone) return false
    const gunX = this.playerX
    const gunY = this.gunY()
    this.bullets.fire(gunX, gunY)
    this.score.shots += 1
    this.recoil = Math.min(1, this.recoil + 0.45)
    this.muzzle = 0.07
    if (this.audio) this.audio.sfx('shoot')
    return true
  }

  _collide() {
    const m = this.monster
    m.hitThisFrame = false
    const hits = []
    for (let i = this.bullets.list.length - 1; i >= 0; i--) {
      const b = this.bullets.list[i]
      if (m.hitThisFrame) break
      const hit = this.hit.sweep(b.px, b.py, b.x, b.y, m)
      if (!hit) continue
      this.bullets.kill(b)
      m.hitThisFrame = true
      m.sad = 0.7
      hits.push({ x: hit.x, y: hit.y, targetId: 'monster' })
      this._burst(hit.x, hit.y)
      this.shake = Math.min(1, this.shake + 0.25)
      // 2.5D 打击感：冲击环 + 镜头微推（连击越高推得越明显，但有上限）
      this.shocks.push({
        x: hit.x,
        y: hit.y,
        life: 0.22,
        max: 0.22,
        color: 'rgba(190,255,240,1)'
      })
      if (this.shocks.length > 8) this.shocks.shift()
      const combo = this.score.combo || 0
      this.zoom = Math.min(0.026, this.zoom + 0.008 + Math.min(0.012, combo * 0.0015))
      // 点亮一段城市。这是这个游戏的核心回路：
      // 命中 → 亮一盏 → 患者看到「我的城在长出来」。
      this.light = Math.min(1, this.light + LIGHT_PER_HIT)
    }
    if (hits.length) {
      this.hitBucket = this.hitBucket.concat(hits)
    }
  }

  // ---------------------------------------------------------------- 特效
  _burst(x, y) {
    const color = '#ff9f6e'
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 40 + Math.random() * 150
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: 1 + Math.random() * 2.6,
        life: 0.45 + Math.random() * 0.35,
        max: 0.8,
        color: color
      })
    }
  }

  _addFloat(x, y, text, color, scale) {
    this.floats.push({ x: x, y: y, text: text, color: color || '#fff', scale: scale || 1, life: 0.9, max: 0.9 })
  }

  _updateEffects(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 260 * dt
      p.vx *= 0.98
      p.life -= dt
      if (p.life <= 0) this.particles.splice(i, 1)
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]
      f.y -= 34 * dt
      f.life -= dt
      if (f.life <= 0) this.floats.splice(i, 1)
    }
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      this.shocks[i].life -= dt
      if (this.shocks[i].life <= 0) this.shocks.splice(i, 1)
    }
  }

  // ---------------------------------------------------------------- 状态外发
  _emitEvent(ev) {
    if (this.handlers.onEvent) {
      try { this.handlers.onEvent(ev) } catch (e) { console.error('[engine] onEvent', e) }
    }
  }

  _emitState(force) {
    const now = Date.now()
    // 约 15Hz 刷新 HUD 文本；再快只会增加 setData 压力，canvas 本身仍按帧渲染
    if (!force && now - this.stateEmitAt < 66) return
    this.stateEmitAt = now
    if (this.handlers.onState) {
      try { this.handlers.onState(this.getState()) } catch (e) { console.error('[engine] onState', e) }
    }
  }

  getState() {
    const duration = Number(this.cfg.get('gameDuration')) || 0
    const elapsed = this.elapsedMs / 1000
    const st = this.score.stats()
    return {
      state: this.state,
      running: this.state === STATE.RUNNING,
      paused: this.state === STATE.PAUSED,
      ended: this.state === STATE.ENDED,
      score: st.score,
      hits: st.hits,
      shots: st.shots,
      combo: this.score.combo,
      maxCombo: st.maxCombo,
      zoneRate: st.zoneRate,
      elapsed: Math.round(elapsed * 10) / 10,
      timeLeft: duration > 0 ? Math.max(0, Math.round((duration - elapsed) * 10) / 10) : -1,
      duration: duration,
      angle: this.pose.getAngle(),
      inZone: this.pose.inZone,
      dir: this.pose.dir,
      // 屏幕里小人的左右（镜像后的位置），回中提示按它给方向
      charDir: this.pose.norm < -0.12 ? 'left' : (this.pose.norm > 0.12 ? 'right' : 'center'),
      zoneRatio: Math.round(this.pose.zoneRatio() * 100),
      sensorStale: this.pose.stale,
      sensorHz: this.pose.rateHz || 0,
      samplingHz: SENSOR_HZ,
      fireRate: this.cfg.get('fireRate'),
      hitRange: this.cfg.get('hitRange'),
      comboWindowMs: this.cfg.get('comboWindowMs'),
      difficulty: this.cfg.get('difficulty'),
      bullets: this.bullets.count,
      monsterState: this.monster.smug ? 'smug' : (this.monster.sad > 0 ? 'sad' : 'idle')
    }
  }

  // ---------------------------------------------------------------- 配置热更新
  _onConfig(payload) {
    if (!payload) return
    if (payload.changed.indexOf('hitRange') >= 0) this.rangeFlash = 1.4
    if (this.audio) this.audio.sync()
    this._emitState(true)
    if (this.state !== STATE.RUNNING) this.render()
  }

  // ---------------------------------------------------------------- 对外参数 API
  setHitArea(range) {
    const v = this.hit.setRange(range)
    this.rangeFlash = 2
    this._emitState(true)
    return v
  }

  setFireRate(fps) {
    const v = this.cfg.set('fireRate', fps, 'api:setFireRate')
    this.fireAcc = 0
    return v
  }

  setDifficulty(level, applyPreset) {
    const changed = this.cfg.applyDifficulty(level, applyPreset !== false)
    const mul = this.cfg.getScoreMul()
    this.rangeFlash = 1.6
    return { level: this.cfg.get('difficulty'), scoreMul: mul, changed: changed }
  }

  setScoreRange(min, max) {
    this.cfg.patch({ scoreMin: min, scoreMax: max }, 'api:setScoreRange')
    return this.cfg.getScoreRange()
  }

  setKeepRange(deg) {
    return this.cfg.set('keepRangeDeg', deg, 'api:setKeepRange')
  }

  setMaxLean(deg) {
    return this.cfg.set('maxLeanDeg', deg, 'api:setMaxLean')
  }

  // ================================================================ 渲染
  render() {
    const ctx = this.ctx
    if (!ctx) return
    const w = this.width
    const h = this.height
    ctx.save()
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    if (this.shake > 0) {
      const s = this.shake * 4
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s)
    }

    // 2.5D 镜头推拉：命中时以角色脚下为锚点轻微推近，回弹即「有重量」。
    // 只改绘制变换，逻辑坐标与命中判定完全不受影响。
    if (this.zoom > 0.0005) {
      const z = 1 + this.zoom
      ctx.translate(this.cx, this.groundY)
      ctx.scale(z, z)
      ctx.translate(-this.cx, -this.groundY)
    }

    this._drawBackground()
    this._drawKeepZone()
    this._drawAimLine()
    this._drawBeacon()
    this._drawPlayer()
    this._drawBullets()
    this._drawParticles()
    this._drawFloats()
    // 暗角压在场景之上、HUD 之下：四周变暗但指标仍然清晰
    if (this.scene) scene.drawVignette(this.ctx, this.scene)

    // 颗粒：独立于镜头变换（不跟着 shake / zoom 走）。
    // 它是「屏幕」的属性，不是「世界」的属性 —— 跟着缩放会从 1px 变成
    // 1.3px 的糊点，反而更假。放在暗角之后、HUD 之前：
    // 压在场景上才能消掉矢量完美感，压在 HUD 上会弄脏分数。
    if (this.scene && this.scene.grain && this.scene.grain.length) {
      ctx.save()
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      scene.drawGrain(ctx, this.scene, this.t)
      ctx.restore()
    }

    this._drawShockwaves()
    this._drawHud()
    // 开始 / 暂停 / 结算的遮罩必须画在 dpr 变换之内。
    // 之前放在 restore() 之后，等于按设备像素绘制：遮罩只盖住左上 1/4，
    // 卡片也是半尺寸挤在左上角。
    if (this.state !== STATE.RUNNING && !this.externalOverlay) this._drawOverlay()
    ctx.restore()

    // 页面层（按钮 / 状态条）最后画，天然覆盖在游戏画面之上。
    // 注意也要套上 dpr 变换：restore() 之后变换已经回到 1:1，
    // 直接画会变成"半尺寸挤在左上角"（和之前遮罩那个 bug 是同一个坑）。
    if (typeof this.afterRender === 'function') {
      ctx.save()
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      try { this.afterRender() } catch (e) { console.error('[engine] afterRender', e) }
      ctx.restore()
    }
  }

  // ---------------------------------------------------------------- 背景（2.5D）
  // 层次：天空渐变 → 星云 → 三层视差星 → 行星 → 透视地面 → 暗角
  // 不用 bg.png 平铺：平铺做不出纵深，换成按消失点投影的程序化地面
  _drawBackground() {
    const ctx = this.ctx
    const sc = this.scene
    if (!sc) return
    const t = this.t
    const q = this.quality === undefined ? 2 : this.quality

    // 背景视差：患者侧屈把镜头「带偏」一点点。
    // 只作用于装饰层（星 / 行星 / 山脊），地面与光柱不动 ——
    // 光柱就是判定范围，它一动，患者看到的范围和实际判定就对不上了。
    // 用 playerX 而不是 pose.x01：playerX 已经是平滑过的，不会抖。
    const px = this.width > 0 ? ((this.playerX - this.cx) / (this.width / 2)) * (this.width * 0.014) : 0
    sc.parallax = isFinite(px) ? clamp(px, -this.width * 0.02, this.width * 0.02) : 0

    scene.drawSky(ctx, sc, { t: t })
    if (q >= 1) scene.drawNebula(ctx, sc, t)
    // 越远视差越小：星 0.35、行星 0.6、山脊 1.0（山脊最近，所以位移最大）
    ctx.save()
    ctx.translate(sc.parallax * 0.35, 0)
    scene.drawStars(ctx, sc, t)
    ctx.restore()
    if (q >= 2) {
      ctx.save()
      ctx.translate(sc.parallax * 0.6, 0)
      scene.drawPlanet(ctx, sc, t)
      ctx.restore()
    }
    ctx.save()
    ctx.translate(sc.parallax, 0)
    scene.drawRidge(ctx, sc)
    ctx.restore()
    scene.drawGround(ctx, sc, {
      cx: this.cx,
      t: t,
      quality: q
    })

    // —— 城市灯火 ——
    // 必须画在 drawGround **之后**：它自带的地平线辉光要盖在地面网格上，
    // 才像「城市的光映在地上」；画在前面会被地面的近处压暗层吃掉。
    // 跟着剪影一起做视差，否则灯会从塔身上滑下来。
    ctx.save()
    ctx.translate(sc.parallax, 0)
    scene.drawCityLights(ctx, sc, this.light, t)
    ctx.restore()

    // —— 水面反光 ——
    // 必须画在灯火之后：倒影是灯火的下半截，盖在城上就变成了一层雾。
    // 不做视差：它贴在地上，和地面一样不许平移。
    scene.drawWater(ctx, sc, {
      cx: this.cx,
      half: this.keepHalfPx(),
      bottom: this.groundY - 30,
      light: this.light,
      t: t,
      inZone: this.pose.inZone,
      quality: q
    })
  }

  _drawKeepZone() {
    const ctx = this.ctx
    const half = this.keepHalfPx()
    const top = 74 * this.scale + (this.insetTop || 0)
    const bottom = this.groundY - 30
    const inZone = this.pose.inZone

    // 非训练态（开始 / 暂停 / 结算）把光柱压得很淡：
    // 否则遮罩之下会从卡片下沿露出一条竖直方块，看着像排版错位。
    const dim = this.state === STATE.RUNNING
      ? 1
      : (this.state === STATE.PAUSED ? 0.32 : 0)
    ctx.save()
    ctx.globalAlpha = dim

    // 落在脚下的发光通道：近端宽度 = 2*half（严格等于判定范围），向消失点收窄。
    // 没有它，光柱就是一块贴在屏幕上的竖直色块 —— 这是「扁」的主要来源。
    scene.drawFloorPath(ctx, this.scene, {
      cx: this.cx,
      half: half,
      bottom: bottom,
      inZone: inZone
    })
    // 2.5D 光柱：中间亮两侧渐隐 + 边界流光 + 落地光斑（见 scene2d.drawKeepPillar）
    scene.drawKeepPillar(ctx, {
      w: this.width,
      cx: this.cx,
      half: half,
      top: top,
      bottom: bottom,
      inZone: inZone,
      t: this.t,
      quality: this.quality
    })
    // 光柱在地面上的反光，让它「立」在地上而不是贴在屏幕上
    scene.drawFloorGlow(ctx, this.scene, {
      cx: this.cx,
      half: half,
      bottom: bottom,
      inZone: inZone
    })

    const fs = Math.round(12 * this.scale)
    ctx.font = fs + 'px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    const zoneText = '保 持 区  ±' + this.cfg.get('keepRangeDeg') + '°'
    // 描边：这行字压在天空 / 城市剪影 / 光柱上，背景亮度跨度很大，
    // 不描边会在亮处发虚（11px 细字尤其明显）。
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3 * this.scale
    ctx.strokeStyle = 'rgba(3,9,15,0.72)'
    ctx.strokeText(zoneText, this.cx, top - 6)
    ctx.fillStyle = inZone ? 'rgba(150,255,238,0.98)' : 'rgba(255,158,148,0.98)'
    ctx.fillText(zoneText, this.cx, top - 6)
    ctx.restore()
  }

  _drawAimLine() {
    if (this.state !== STATE.RUNNING) return
    const ctx = this.ctx
    const x = this.playerX
    const y = this.gunY()
    ctx.save()
    ctx.setLineDash([2, 8])
    ctx.lineWidth = 1
    ctx.strokeStyle = this.pose.inZone ? 'rgba(88,214,199,0.35)' : 'rgba(255,120,120,0.3)'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x, 74 * this.scale)
    ctx.stroke()
    ctx.restore()
  }

  // ---------------------------------------------------------------- 城市光核（靶）
  // 这里原来是「机械哨兵」—— 一个要被打败的敌人。换成光核的原因不是造型，是语义：
  //   1. 五个游戏里只有射击是「攻击」，其余是收集 / 平衡 / 竞速；
  //   2. 出界时敌人「得意」，是用羞耻驱动患者 —— 居家自助训练没人接住这个情绪；
  //   3. 它全身都在动（浮游炮绕轨 / 机械臂摆动 / 三层环反向旋转 / 扫描缝），
  //      而它的职责是当视线锚点。每一样动态都在把视线从中心带走。
  //
  // 光核只有一个状态量：**亮度**。亮度就是「你维持得怎么样」。
  // 把它当一块电压表来画，而不是当一个角色来画。
  //
  // 红线不变：绘制中心严格等于判定中心（m.x / m.y）。
  // 所有动态只允许改亮度、环的半径、射线的长度 —— 不许整体平移或缩放。
  _drawBeacon() {
    const ctx = this.ctx
    const m = this.monster
    if (!m) return
    // 开始 / 暂停 / 结算都会盖一张居中的卡片，而靶子在地平线之上，
    // 会从卡片上沿露出半截 —— 看起来像排版错位。遮罩态直接不画。
    if (this.state !== STATE.RUNNING && !this.externalOverlay) return

    const x = m.x
    const y = m.y
    const r = m.radius
    const t = this.t
    const light = clamp(this.light, 0, 1)
    const hurt = m.sad > 0
    const warn = !!m.smug // 出界 = 能量正在流失
    const RGB = warn ? '255,132,104' : '128,242,212'

    // —— 供能束：把光核和底下那座城连起来 ——
    // 没有它，光核就是一块悬在天上的贴纸。有了它，画面第一次有因果：
    // 你在光柱里维持 → 供能不断 → 城市亮着 → 你看到自己维持的东西。
    const beamTop = y + r * 0.86
    const beamBot = this.scene ? this.scene.horizonY - 1 : y + r * 6
    if (beamBot > beamTop + 4) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const bg = ctx.createLinearGradient(0, beamBot, 0, beamTop)
      const a0 = 0.03 + light * 0.08
      const a1 = 0.06 + light * 0.19
      bg.addColorStop(0, 'rgba(' + RGB + ',' + (a0 * 0.35).toFixed(3) + ')')
      bg.addColorStop(0.55, 'rgba(' + RGB + ',' + a0.toFixed(3) + ')')
      bg.addColorStop(1, 'rgba(' + RGB + ',' + a1.toFixed(3) + ')')
      ctx.fillStyle = bg
      const bw = 1.1 + light * 2.1
      ctx.fillRect(x - bw / 2, beamTop, bw, beamBot - beamTop)
      ctx.restore()
    }

    // —— 外辉光：光核是这座城唯一的光源 ——
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const haloR = r * (1.75 + light * 1.05) * (warn ? 1.22 : 1)
    const ha = (0.13 + light * 0.15) * (warn ? 1.22 : 1)
    const hg = ctx.createRadialGradient(x, y, r * 0.15, x, y, haloR)
    hg.addColorStop(0, 'rgba(' + RGB + ',' + ha.toFixed(3) + ')')
    hg.addColorStop(0.44, 'rgba(' + RGB + ',' + (ha * 0.28).toFixed(3) + ')')
    hg.addColorStop(1, 'rgba(' + RGB + ',0)')
    ctx.fillStyle = hg
    ctx.beginPath()
    ctx.arc(x, y, haloR, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // —— 两道细环：只是「有东西在绕着转」，不是包着核心的壳 ——
    //
    // 三道 210° 的环叠在一起会读成**一个盘子的边**：三个近同心圆在缩略图上
    // 就是一圈厚白边，配上白心就是一枚按钮。这是它「不像能量体」的根因。
    // 改成两道、每道 120°、1px —— 它们是运动，不是轮廓。
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 2; i++) {
      const dir = i % 2 ? -1 : 1
      const spin = t * (0.42 + i * 0.18) * dir
      const rr = r * (1.06 + i * 0.32) * (1 - light * 0.08)
      const alpha = (0.17 + light * 0.30) * (1 - i * 0.26) * (warn ? 0.8 : 1)
      ctx.strokeStyle = warn
        ? 'rgba(255,224,214,' + alpha.toFixed(3) + ')'
        : 'rgba(214,252,246,' + alpha.toFixed(3) + ')'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(x, y, rr, spin + i * 2.1, spin + i * 2.1 + 2.1)
      ctx.stroke()
    }
    ctx.restore()

    // —— 核心：实心亮核，半径与亮度都跟着 light ——
    const pulse = 0.94 + 0.06 * Math.sin(t * 2.4)
    const cr = r * (0.46 + light * 0.20) * pulse
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    // 核心是「有形状的发光源」，不是一团白光。
    // 之前 0.35 处就给到 1.0 的 alpha，叠上 lighter 直接烧成一片纯白 ——
    // 结构全没了，只剩一个光球，跟「能量核心」这四个字没有关系。
    // 现在：白心很窄 → 青绿主体 → 长尾巴渐隐，层次读得出来。
    // 把「实心盘」拆成两件事：**很小的亮点** + 一层大得多的柔光。
    // 之前白心 0.68、再叠受击的整团白，核心永远是一块过曝的圆盘。
    // 现在最亮的一圈只在半径 10% 以内，其余全是渐隐的光 —— 有体积感，
    // 也不会再在缩略图上糊成一个白球。
    const cg = ctx.createRadialGradient(x, y, 0, x, y, cr * 2.2)
    cg.addColorStop(0, 'rgba(255,255,255,' + (0.30 + light * 0.18).toFixed(3) + ')')
    cg.addColorStop(0.10, 'rgba(240,255,252,' + (0.32 + light * 0.24).toFixed(3) + ')')
    cg.addColorStop(0.26, 'rgba(' + RGB + ',' + (0.26 + light * 0.26).toFixed(3) + ')')
    cg.addColorStop(0.62, 'rgba(' + RGB + ',' + (0.07 + light * 0.12).toFixed(3) + ')')
    cg.addColorStop(1, 'rgba(' + RGB + ',0)')
    ctx.fillStyle = cg
    ctx.beginPath()
    ctx.arc(x, y, cr * 2.2, 0, Math.PI * 2)
    ctx.fill()

    // 受击：核心过曝 + 六条外溅射线。**不做整体抖动** ——
    // 抖动会瞬移视觉中心，而患者的瞄准依据就是那个中心。
    if (hurt) {
      // 受击闪白减半：每秒 3 次命中，0.55 的整团白等于让核心长期过曝。
      ctx.globalAlpha = Math.min(0.28, m.sad * 0.40)
      ctx.fillStyle = 'rgba(255,255,255,1)'
      ctx.beginPath()
      ctx.arc(x, y, cr * (1.3 + m.sad * 0.9), 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      const k = m.sad
      ctx.strokeStyle = 'rgba(' + RGB + ',' + (0.85 * k).toFixed(3) + ')'
      ctx.lineWidth = Math.max(1, r * 0.055)
      ctx.lineCap = 'round'
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + 0.4
        const r0 = r * (0.42 + 0.34 * (1 - k))
        const r1 = r0 + r * 0.46 * k
        ctx.beginPath()
        ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0)
        ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1)
        ctx.stroke()
      }
    }
    ctx.restore()
  }


  /**
   * 战机的几何尺寸（未乘 scale 的基准 × scale）。
   * 绘制与 gunY() 共用同一份，否则「枪口」和「机头」会慢慢对不上。
   */
  _shipBox() {
    const s = this.scale
    return {
      s: s,
      w: 68 * s,
      h: 48 * s,
      cy: this.groundY - 32 * s + this.recoil * 4
    }
  }

  /** 子弹出生点：机头尖端 */
  gunY() {
    const b = this._shipBox()
    return b.cy - b.h * 0.5 + 2
  }

  // ---------------------------------------------------------------- 战机（玩家）
  // 后视/追尾视角：机头朝上（飞向远处），双引擎朝下（对着镜头）。
  // 之前用的是 Kenney 的俯视飞船贴图，摆在一个透视地面上 = 视角矛盾：
  // 俯视的机翼和「地面透视」永远不会是同一个相机。
  _drawPlayer() {
    const ctx = this.ctx
    const b = this._shipBox()
    const x = this.playerX
    const cy = b.cy
    const gy = this.groundY
    const s = b.s
    const W = b.w
    const H = b.h
    const hw = W / 2
    const hh = H / 2
    // —— 倾斜幅度：指数映射，不是线性 ——
    //
    // 线性映射的问题是**用力区间用错了**：患者实际活动区间是 keepRange ±6°，
    // 而满量程 20°，线性映射过来只有 ±5.8° 的倾斜 —— 在 68pt 的机体上等于没有反馈。
    // 改成 pow 0.75 之后，小角度区间几乎翻倍、满量程几乎不变：
    // 幅度 0.42 rad（满量程约 24°）：
    //     侧屈  上一版   现在
    //      2°   3.7°    4.3°
    //      6°   8.4°    9.8°   ← 保持区边缘，患者天天看到的一档
    //     20°  20.6°   24.1°
    //
    // 上限不是随便定的：试过 0.46（26.4°），侧屈 14° 时**贴图看起来「躺平」了**。
    // 原因是贴图的旋转是「整张纸片在屏幕平面内转」，而真实横滚是绕机身纵轴滚 ——
    // 前者不会产生机翼一侧朝向镜头、一侧背向的透视变化。角度超过 ~24° 就会露馅。
    // 矢量版不受这个限制（轮廓是算出来的），这也是贴图唯一的硬伤。
    //
    // 倾斜只影响旋转。判定仍然是 playerX 的纯像素逻辑，怎么歪都不改手感。
    // 绝对不要在这里加横向位移 —— 那会让「看到的飞机位置」偏离判定位置。
    const leanRaw = clamp(this.pose.angle / Math.max(6, this.cfg.get('maxLeanDeg')), -1, 1)
    const tilt = (leanRaw < 0 ? -1 : 1) * Math.pow(Math.abs(leanRaw), 0.75) * 0.42

    // —— 高度感：影子落在更远处的甲板上（屏幕上偏上、更小更淡）——
    // 直接压在机腹下方会变成「停在停机坪」，和飞行是矛盾的。
    scene.softShadow(ctx, x + tilt * 22 * s, gy - 24 * s, 24 * s, 6.5 * s, 0.32)

    // 尾焰照在甲板上的一片冷光，随推力脉动
    const wash = 0.09 + 0.03 * Math.sin(this.t * 7.3)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    scene.fillEllipse(ctx, x, gy + 2 * s, W * 0.66, 9 * s, 'rgba(88,220,255,' + wash.toFixed(3) + ')')
    ctx.restore()

    ctx.save()
    ctx.translate(x, cy)
    ctx.rotate(tilt)
    // 转向时的横向压缩 = 侧倾的透视收缩，比纯旋转更像「在转弯」。
    // 1.4 → 1.5：倾斜 24° 时横向压到 0.85 倍。再压就扁成一张纸了 ——
    // 旋转已经吃掉了一部分「像实体」的感觉，压缩不能跟着加码。
    ctx.scale(Math.cos(tilt * 1.5), 1)

    // —— 机身：贴图优先，矢量兜底 ——
    //
    // fighter.png 是 Blender 离线渲染的 306×216 位图，比例正好是 _shipBox 的 68:48，
    // 所以直接铺满 [-hw,-hh]..[hw,hh] 就对齐了，不需要改任何布局参数。
    // 运行时没有任何 3D —— 小程序 canvas 只有 2D 上下文，这就是一次 drawImage。
    //
    // 贴图加载失败（或还没加载完）时 get() 返回 null，走 else 的矢量版：
    // 矢量版一行都没删，它现在是**兜底**，不是主路径。
    const ship = this.sprites.get('fighter')
    // 贴图比 _shipBox 略放大一点：渲染图里机身上下留了透明边距，
    // 1:1 铺满会让飞机在屏幕上显得比矢量版小一号。
    const SHIP_K = 1.32
    if (ship) {
      // 轮廓光：贴图本身没有边缘发光，在暗场景里就是一块深蓝。
      // 用 shadowBlur 给整张剪影勾一圈冷光 —— 这是它和光柱、光核之间唯一的颜色联系。
      ctx.save()
      ctx.shadowColor = 'rgba(122,226,255,0.55)'
      ctx.shadowBlur = 4 * s
      ctx.drawImage(ship, -hw * SHIP_K, -hh * SHIP_K, W * SHIP_K, H * SHIP_K)
      ctx.restore()
    } else {
      // —— 机身 + 主翼（后视轮廓）——
      // 轮廓只写一次：填充、裁剪、描边都复用它。
      // （原来同一段 14 行路径在文件里重复了 3 遍，改一个点要改三处）
      const hull = () => {
        ctx.beginPath()
        ctx.moveTo(0, -hh)                      // 机头
        ctx.lineTo(hw * 0.17, -hh * 0.40)       // 右机肩
        ctx.lineTo(hw * 0.99, hh * 0.30)        // 右翼尖
        ctx.lineTo(hw * 0.78, hh * 0.70)        // 右翼后缘
        ctx.lineTo(hw * 0.40, hh * 0.56)        // 右翼根
        ctx.lineTo(hw * 0.40, hh * 0.92)        // 右喷口外沿
        ctx.lineTo(hw * 0.16, hh * 0.76)        // 尾中缝
        ctx.lineTo(-hw * 0.16, hh * 0.76)
        ctx.lineTo(-hw * 0.40, hh * 0.92)
        ctx.lineTo(-hw * 0.40, hh * 0.56)
        ctx.lineTo(-hw * 0.78, hh * 0.70)
        ctx.lineTo(-hw * 0.99, hh * 0.30)
        ctx.lineTo(-hw * 0.17, -hh * 0.40)
        ctx.closePath()
      }

      // —— 装甲分块 ——
      // 原来是一整块从机头到尾部的线性渐变 + 一圈同亮度的描边，那是图标的画法。
      // 战机的机翼和机身是两块朝向不同的面：翼面朝上（吃星光，暗），
      // 中脊朝后（吃引擎回光，亮）。用硬边把这两面分开，机体才有折角。
      hull()
      ctx.save()
      ctx.clip()

      // 底色：整机最暗，读作机翼下表面
      ctx.fillStyle = '#0C1726'
      ctx.fillRect(-hw * 1.05, -hh * 1.15, hw * 2.1, hh * 2.3)

      // 左右翼面：比底色亮一档，硬边
      ctx.fillStyle = '#1E3048'
      for (let sd = 0; sd < 2; sd++) {
        const k = sd ? 1 : -1
        ctx.beginPath()
        ctx.moveTo(k * hw * 0.19, -hh * 0.38)
        ctx.lineTo(k * hw * 1.02, hh * 0.30)
        ctx.lineTo(k * hw * 0.78, hh * 0.72)
        ctx.lineTo(k * hw * 0.38, hh * 0.58)
        ctx.closePath()
        ctx.fill()
      }

      // 机身中脊：最亮的一块，从机头收到尾部
      ctx.fillStyle = '#3B5578'
      ctx.beginPath()
      ctx.moveTo(0, -hh)
      ctx.lineTo(hw * 0.20, -hh * 0.36)
      ctx.lineTo(hw * 0.18, hh * 0.78)
      ctx.lineTo(-hw * 0.18, hh * 0.78)
      ctx.lineTo(-hw * 0.20, -hh * 0.36)
      ctx.closePath()
      ctx.fill()

      // 翼面涂装：每条翼上一道琥珀色斜条。
      // 这是「去 AI 味」最有效的一招 —— AI 生成的载具几乎从不带涂装，
      // 而人类造的每台机器都有编号、条纹、警示色：那是「有人造过它」的证据。
      // 用色必须压到 0.26 以下，再高就会把青色主调挤成俗套的 teal & orange。
      ctx.fillStyle = 'rgba(255,168,88,0.34)'
      for (let sd = 0; sd < 2; sd++) {
        const k = sd ? 1 : -1
        ctx.beginPath()
        ctx.moveTo(k * hw * 0.63, hh * 0.04)
        ctx.lineTo(k * hw * 0.95, hh * 0.27)
        ctx.lineTo(k * hw * 0.89, hh * 0.41)
        ctx.lineTo(k * hw * 0.57, hh * 0.18)
        ctx.closePath()
        ctx.fill()
      }

      // 翼根 AO：机翼和机身交界处压一道暗带。
      // 没有 AO 的色块会全部「贴在同一个平面上」——
      // 这是矢量插画和实体渲染真正的分水岭，比加渐变有用得多。
      ctx.strokeStyle = 'rgba(2,6,14,0.58)'
      ctx.lineWidth = 3.4 * s
      ctx.beginPath()
      for (let sd = 0; sd < 2; sd++) {
        const k = sd ? 1 : -1
        ctx.moveTo(k * hw * 0.19, -hh * 0.38)
        ctx.lineTo(k * hw * 0.38, hh * 0.58)
      }
      ctx.stroke()

      // 翼根面板缝：把翼面分成内外两段，机体才不是一个色块
      ctx.strokeStyle = 'rgba(4,10,20,0.55)'
      ctx.lineWidth = 1.4 * s
      ctx.beginPath()
      for (let sd = 0; sd < 2; sd++) {
        const k = sd ? 1 : -1
        ctx.moveTo(k * hw * 0.31, -hh * 0.20)
        ctx.lineTo(k * hw * 0.43, hh * 0.50)
      }
      ctx.stroke()

      // 翼前缘受光带：沿机头 → 翼尖的两条，光只擦边缘
      ctx.strokeStyle = 'rgba(150,225,255,0.24)'
      ctx.lineWidth = 2.2 * s
      ctx.beginPath()
      ctx.moveTo(0, -hh)
      ctx.lineTo(hw * 0.17, -hh * 0.40)
      ctx.lineTo(hw * 0.99, hh * 0.30)
      ctx.moveTo(0, -hh)
      ctx.lineTo(-hw * 0.17, -hh * 0.40)
      ctx.lineTo(-hw * 0.99, hh * 0.30)
      ctx.stroke()
      ctx.restore()

      // 外轮廓：细、暗。均匀重描边是图标语言，这里只需要把机体从背景里剥离出来
      hull()
      ctx.strokeStyle = 'rgba(126,238,255,0.40)'
      ctx.lineWidth = Math.max(1, 1.0 * s)
      ctx.stroke()

      // 座舱盖：后视角度只看到机背上的一个弧顶。
      // 原来是一整块发光的青绿椭圆（0.80 alpha）—— 在整机最亮的位置，
      // 读起来像「机身上长了颗蛋」。玻璃在夜景里是暗的，只有一道弧形反光。
      ctx.save()
      ctx.translate(0, -hh * 0.34)
      ctx.scale(1, 1.5)
      ctx.fillStyle = '#14243C'
      ctx.beginPath()
      ctx.arc(0, 0, hw * 0.115, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(120,190,230,0.38)'
      ctx.lineWidth = 1.2 * s
      ctx.stroke()
      // 弧形反光：贴着上缘的一道细弧，是这个形状里唯一「是玻璃」的证据
      ctx.strokeStyle = 'rgba(196,246,255,0.62)'
      ctx.lineWidth = 1.7 * s
      ctx.beginPath()
      ctx.arc(0, 0, hw * 0.082, Math.PI * 1.12, Math.PI * 1.78)
      ctx.stroke()
      ctx.restore()
    }

    // 翼尖航行灯：左红右绿（真实飞机的约定，一眼有「载具感」）
    const blink = 0.55 + 0.45 * Math.sin(this.t * 4.2)
    ctx.globalAlpha = blink
    // 翼尖灯跟着贴图一起放大，否则会从翼尖滑到机翼内侧
    const tipX = hw * 0.96 * SHIP_K
    const tipY = hh * 0.30 * SHIP_K
    ctx.fillStyle = '#ff6b6b'
    ctx.beginPath()
    ctx.arc(-tipX, tipY, 1.7 * s, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#7bff9d'
    ctx.beginPath()
    ctx.arc(tipX, tipY, 1.7 * s, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    // —— 双引擎：喷口 + 尾焰 ——
    // 后视角度：尾焰是朝镜头喷出来的，看到的是「光团」，不是一根朝下烧的锥体。
    // 画成长锥会被读成侧视火焰，细长时甚至像两颗牙。
    const boost = this.recoil * 0.9
    // 引擎位置：贴图版和矢量版**不一样**。
    // 矢量版是设计出来的（±0.28hw），贴图版必须用模型里真实的位置（±0.115hw、hh*0.71）。
    // 用错位置，光团会飘到机翼上 —— 变成「机翼在发光」。
    const eDX = ship ? hw * 0.115 * SHIP_K : hw * 0.28
    const eDY = ship ? hh * 0.71 * SHIP_K : hh * 0.88
    const eBase = ship ? 4.4 : 6.4
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 2; i++) {
      const nx = (i ? 1 : -1) * eDX
      const ny = eDY
      const pulse = 1 + 0.12 * Math.sin(this.t * 26 + i * 1.9)
      const gr = (eBase * pulse + boost * (ship ? 2.2 : 3)) * s

      const plume = ctx.createRadialGradient(nx, ny, 0, nx, ny, gr * 1.32)
      plume.addColorStop(0, 'rgba(255,255,255,0.98)')
      plume.addColorStop(0.26, 'rgba(176,250,255,0.86)')
      plume.addColorStop(0.56, 'rgba(80,180,255,0.34)')
      plume.addColorStop(1, 'rgba(56,110,255,0)')
      ctx.fillStyle = plume
      ctx.beginPath()
      ctx.arc(nx, ny, gr * 1.32, 0, Math.PI * 2)
      ctx.fill()

      // 喷口本体：一小团高亮，把「引擎」这件事点明
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.beginPath()
      ctx.arc(nx, ny + gr * 0.12, gr * 0.40, 0, Math.PI * 2)
      ctx.fill()
    }

    // 机炮口焰：开火瞬间机头亮一下
    if (this.muzzle > 0) {
      ctx.globalAlpha = this.muzzle / 0.07
      const mg = ctx.createRadialGradient(0, -hh * 0.92, 1, 0, -hh * 0.92, 15 * s)
      mg.addColorStop(0, 'rgba(255,255,255,1)')
      mg.addColorStop(0.45, 'rgba(120,255,220,0.9)')
      mg.addColorStop(1, 'rgba(60,220,180,0)')
      ctx.fillStyle = mg
      ctx.beginPath()
      ctx.arc(0, -hh * 0.92, 15 * s, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.restore()

    ctx.restore()
  }

  _drawBullets() {
    const ctx = this.ctx
    const laser = this.sprites.get('laser')
    for (let i = 0; i < this.bullets.list.length; i++) {
      const b = this.bullets.list[i]
      // 纵深缩放（1 → 0.45）：只改绘制尺寸与透明度，命中判定完全不受影响
      const k = b.k > 0 ? b.k : 1
      const ba = b.a > 0 ? b.a : 1
      if (laser) {
        // 贴图版子弹：激光束 + 向下渐隐的尾迹（有速度感）
        // 28 而不是 36：战机换成贴图后整体变宽（SHIP_K=1.32），
        // 原来那根 36px 的激光在 90px 宽的机翼上像一根插在前面的绿棒子。
        const h = 28 * k
        const w = h * (9 / 37)
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        const tg = ctx.createLinearGradient(b.x, b.y + 30 * k, b.x, b.y - 4 * k)
        tg.addColorStop(0, 'rgba(110,255,215,0)')
        tg.addColorStop(0.55, 'rgba(140,255,228,0.26)')
        tg.addColorStop(1, 'rgba(200,255,245,0.62)')
        ctx.fillStyle = tg
        ctx.fillRect(b.x - 1.7 * k, b.y - 4 * k, 3.4 * k, 34 * k)
        ctx.restore()

        ctx.globalAlpha = 0.96 * ba
        ctx.drawImage(laser, b.x - w / 2, b.y - h / 2, w, h)
        ctx.globalAlpha = 1
        // 白色核心：贴图是绿色，在青色光柱里对比太弱
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = ba
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.beginPath()
        ctx.arc(b.x, b.y - 2 * k, 1.9 * k, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        continue
      }
      // 矢量化激光线兜底
      // 尾迹长度也要随 k 缩：只缩端点不缩尾迹，看起来会像一根固定的棍子
      const tx = b.x - b.vx * 0.022 * k
      const ty = b.y - b.vy * 0.022 * k
      const g = ctx.createLinearGradient(tx, ty, b.x, b.y)
      g.addColorStop(0, 'rgba(120,255,220,0)')
      g.addColorStop(1, 'rgba(200,255,245,0.95)')
      ctx.strokeStyle = g
      ctx.lineWidth = 3.2 * k
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(tx, ty)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()

      ctx.fillStyle = 'rgba(235,255,250,0.95)'
      ctx.beginPath()
      ctx.arc(b.x, b.y, 2.6 * k, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  _drawParticles() {
    const ctx = this.ctx
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]
      const k = Math.max(0, p.life / p.max)
      if (k <= 0) continue
      ctx.globalAlpha = k
      // 火花 = 沿速度方向的一条短拖尾 + 一个亮点。
      //
      // 原来统一画 star.png（四角星）。四角星是「闪光」的通用符号，
      // 一屏几十颗四角星正是 AI 生成图最标志性的装饰 —— 漂亮，但没有信息。
      // 火花有方向，方向来自它自己的速度，那就是一条信息。
      const vx = p.vx || 0
      const vy = p.vy || 0
      const sp = Math.sqrt(vx * vx + vy * vy) || 1
      const len = Math.min(p.r * 3.4, sp * 0.028)
      ctx.strokeStyle = p.color
      ctx.lineWidth = Math.max(0.9, p.r * 0.5)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - (vx / sp) * len, p.y - (vy / sp) * len)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,248,238,0.9)'
      ctx.beginPath()
      ctx.arc(p.x, p.y, Math.max(0.7, p.r * 0.42), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  _drawFloats() {
    const ctx = this.ctx
    for (let i = 0; i < this.floats.length; i++) {
      const f = this.floats[i]
      const a = Math.max(0, f.life / f.max)
      const size = Math.round(16 * this.scale * f.scale)
      ctx.globalAlpha = a
      ctx.font = 'bold ' + size + 'px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      // 描边：飘字压在粒子、光柱和机体上，没有描边会糊成一团
      ctx.lineJoin = 'round'
      ctx.lineWidth = Math.max(2, size * 0.2)
      ctx.strokeStyle = 'rgba(5,12,22,0.86)'
      ctx.strokeText(f.text, f.x, f.y)
      ctx.fillStyle = f.color
      ctx.fillText(f.text, f.x, f.y)
    }
    ctx.globalAlpha = 1
  }

  /** 命中冲击环：从命中点扩散的同心圆，配合 zoom 形成打击感 */
  _drawShockwaves() {
    if (!this.shocks || !this.shocks.length) return
    const ctx = this.ctx
    for (let i = 0; i < this.shocks.length; i++) {
      const s = this.shocks[i]
      const k = 1 - Math.max(0, s.life / s.max)
      scene.drawShock(ctx, s.x, s.y, k, s.color)
    }
  }

  _drawHud() {
    const ctx = this.ctx
    const s = this.scale
    const st = this.getState()
    const pad = 14 * s
    const top0 = pad + (this.insetTop || 0)

    // ---- 顶部压暗（不画容器）----
    // 这里原来是两块「玻璃卡片」：渐变底 + 顶部高光 + 描边 + 顶边反光。
    // 那是手游 HUD 的模板 —— 整个画面里最「有厚度」的两块东西，
    // 恰好是最不该有厚度的两块：它们是读数，不是场景里的物体。
    // 现在只压一条从屏幕顶端散掉的淡遮罩，保证文字可读，不画任何框。
    const scrimH = 104 * s
    const scrim = ctx.createLinearGradient(0, 0, 0, top0 + scrimH)
    scrim.addColorStop(0, 'rgba(2,6,12,0.58)')
    scrim.addColorStop(0.45, 'rgba(2,6,12,0.22)')
    scrim.addColorStop(1, 'rgba(2,6,12,0)')
    ctx.fillStyle = scrim
    ctx.fillRect(0, 0, this.width, top0 + scrimH)

    const cardW1 = 112 * s
    const cardW2 = 118 * s

    // ---- 左上：得分 ----
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(150,182,208,0.72)'
    ctx.font = Math.round(10 * s) + 'px sans-serif'
    ctx.fillText('得分', pad, top0 + 2)
    // 数字用细字重 + 略降的白：粗白大字是「贴上去的标签」，
    // 细一点才像「仪表读数」。
    ctx.fillStyle = 'rgba(228,242,252,0.95)'
    ctx.font = '300 ' + Math.round(30 * s) + 'px sans-serif'
    ctx.fillText(String(st.score), pad, top0 + 16 * s)

    // —— 点亮盏数 + 进度条 ——
    // 这个数字比得分更能说明「你做得怎么样」：得分是随机的 1~3 加连击加成，
    // 患者很难从「1247」里读出自己的表现；盏数是确定的「我点亮了几盏」。
    const lampTotal = (this.scene && this.scene.lamps) ? this.scene.lamps.length : 0
    const lampLit = Math.round(this.light * lampTotal)
    ctx.fillStyle = 'rgba(255,196,130,0.80)'
    ctx.font = Math.round(10 * s) + 'px sans-serif'
    ctx.fillText('点亮 ' + lampLit + ' 盏', pad, top0 + 56 * s)

    const lw = cardW1 - 16 * s
    const ly = top0 + 72 * s
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    roundRect(ctx, pad, ly, lw, 2.5 * s, 1.2 * s)
    ctx.fill()
    if (this.light > 0.004) {
      ctx.fillStyle = 'rgba(255,178,104,0.85)'
      roundRect(ctx, pad, ly, Math.max(2, lw * this.light), 2.5 * s, 1.2 * s)
      ctx.fill()
    }

    // ---- 右上：倒计时（大号、整数秒） ----
    ctx.textAlign = 'right'
    const dur = st.duration
    const label = dur > 0 ? '倒计时' : '已用时'
    const numText = dur > 0 ? Math.ceil(st.timeLeft) + ' s' : Math.floor(st.elapsed) + ' s'
    ctx.fillStyle = 'rgba(150,182,208,0.72)'
    ctx.font = Math.round(10 * s) + 'px sans-serif'
    ctx.fillText(label, this.width - pad, top0 + 2)
    ctx.fillStyle = 'rgba(228,242,252,0.95)'
    ctx.font = '300 ' + Math.round(30 * s) + 'px sans-serif'
    ctx.fillText(numText, this.width - pad, top0 + 16 * s)

    // 时间进度条
    const barW = cardW2 - 16 * s
    const barX = this.width - pad - barW
    const barY = top0 + 72 * s
    const ratio = dur > 0 ? clamp(st.timeLeft / dur, 0, 1) : 0
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    roundRect(ctx, barX, barY, barW, 2.5 * s, 1.2 * s)
    ctx.fill()
    ctx.fillStyle = ratio > 0.25 ? 'rgba(79,209,197,0.85)' : 'rgba(255,138,101,0.90)'
    roundRect(ctx, barX, barY, Math.max(4, barW * ratio), 2.5 * s, 1.2 * s)
    ctx.fill()

    // ---- 中部：连击 ----
    if (st.combo >= 2) {
      const bob = 1 + 0.06 * Math.sin(this.t * 12)
      ctx.save()
      ctx.translate(this.cx, 150 * s)
      ctx.scale(bob, bob)
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffd166'
      ctx.font = 'bold ' + Math.round(26 * s) + 'px sans-serif'
      ctx.fillText('COMBO x' + st.combo, 0, 0)
      ctx.fillStyle = 'rgba(255,209,102,0.75)'
      ctx.font = Math.round(11 * s) + 'px sans-serif'
      ctx.fillText('连击加成中', 0, 20 * s)
      ctx.restore()
    }

    // ---- 左下：姿态 / 保持状态（开始页不画，避免和底部按钮挤成一团）----
    const zoneOk = st.inZone
    if (this.state === STATE.READY) return
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    const infoY = this.groundY - 6 * s
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3 * s
    ctx.strokeStyle = 'rgba(3,9,15,0.72)'
    const line1 = (st.sensorStale ? '模拟 ' : '倾角 ') + (st.angle > 0 ? '+' : '') + st.angle + '°'
    const line2 = zoneOk ? '自动开火中' : '基础分暂停'
    ctx.font = Math.round(11 * s) + 'px sans-serif'
    ctx.strokeText(line2, pad, infoY - 18 * s)
    ctx.fillStyle = 'rgba(170,204,230,0.85)'
    ctx.fillText(line2, pad, infoY - 18 * s)
    ctx.font = 'bold ' + Math.round(13 * s) + 'px sans-serif'
    ctx.strokeText(line1, pad, infoY)
    // 区内用淡蓝白：青绿是保持区的专属色，UI 占用了患者会分不清哪个是判定范围
    ctx.fillStyle = zoneOk ? 'rgba(214,232,250,0.95)' : 'rgba(255,138,128,0.98)'
    ctx.fillText(line1, pad, infoY)

    // 出界提示：红色边框 + 明确的回中方向（箭头指向要移动的方向）
    if (!zoneOk && this.state === STATE.RUNNING) {
      const pulse = 0.35 + 0.25 * Math.sin(this.t * 6)
      ctx.globalAlpha = pulse
      ctx.strokeStyle = '#ff5a5a'
      ctx.lineWidth = 6 * s
      ctx.strokeRect(0, 0, this.width, this.height)
      ctx.globalAlpha = 1
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#ffb3ad'
      ctx.font = 'bold ' + Math.round(17 * s) + 'px sans-serif'
      // 提示按「屏幕里的小人」给方向：小人偏左 → 请向右；小人偏右 → 请向左
      const tip = st.charDir === 'left'
        ? '请向右偏  →'
        : (st.charDir === 'right' ? '←  请向左偏' : '请回到中间')
      ctx.fillText(tip, this.cx, this.groundY - 140 * s)
    }

  }

  _drawOverlay() {
    if (this.externalOverlay) return
    const ctx = this.ctx
    const s = this.scale
    const st = this.getState()
    // 遮罩不能压太黑：结算时患者最想看到的是「自己点亮的城」，
    // 0.72 的遮罩会把地平线上那片灯火整个吃掉，只剩数字。
    ctx.fillStyle = 'rgba(4,9,18,0.52)'
    ctx.fillRect(0, 0, this.width, this.height)

    const w = this.width * 0.8
    const hh = st.ended ? 250 * s : 176 * s
    const x = (this.width - w) / 2
    const y = (this.height - hh) / 2

    ctx.fillStyle = 'rgba(16,32,52,0.96)'
    roundRect(ctx, x, y, w, hh, 16 * s)
    ctx.fill()
    ctx.strokeStyle = 'rgba(79,209,197,0.45)'
    ctx.lineWidth = 1.2
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold ' + Math.round(21 * s) + 'px sans-serif'
    const title = st.ended ? '训练结束' : (st.paused ? '已暂停' : '射击训练')
    ctx.fillText(title, this.cx, y + 22 * s)

    ctx.fillStyle = 'rgba(170,200,225,0.85)'
    ctx.font = Math.round(12 * s) + 'px sans-serif'
    if (st.ended) {
      const stats = this.score.stats()
      const lampTotal = (this.scene && this.scene.lamps) ? this.scene.lamps.length : 0
      const lampLit = Math.round(this.light * lampTotal)
      // 第一行是「你点亮了多少盏」，不是总分。
      // 对这一局来说，一座亮起来的城比一个 1280 分有意义得多 ——
      // 分数是随机的 1~3 加连击，患者读不出自己做了什么；
      // 盏数是他能一眼看见的、自己造成的东西。
      ctx.fillStyle = '#ffc078'
      ctx.font = 'bold ' + Math.round(15 * s) + 'px sans-serif'
      ctx.fillText('点亮 ' + lampLit + ' / ' + lampTotal + ' 盏灯火', this.cx, y + 52 * s)

      ctx.fillStyle = 'rgba(170,200,225,0.85)'
      ctx.font = Math.round(12 * s) + 'px sans-serif'
      const lines = [
        '总分 ' + stats.score + ' 分 · 命中 ' + stats.hits + ' 次',
        '最高连击 x' + stats.maxCombo,
        '保持在范围内 ' + stats.zoneRate + '% 的时间'
      ]
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], this.cx, y + 80 * s + i * 22 * s)
      }
    } else if (st.paused) {
      ctx.fillText('点击「继续」回到训练', this.cx, y + 58 * s)
      ctx.fillText('治疗师可在下方面板实时调整参数', this.cx, y + 82 * s)
    } else {
      ctx.fillText('保持身体在中间，光核会自动开火点亮城市', this.cx, y + 54 * s)
      ctx.fillText('偏离保持范围会停火，已经亮起的灯会熄灭', this.cx, y + 76 * s)
      ctx.fillText('未连接传感器时，可左右拖动画面模拟', this.cx, y + 98 * s)
    }

    ctx.fillStyle = '#0f9c8c'
    roundRect(ctx, this.cx - 62 * s, y + hh - 52 * s, 124 * s, 36 * s, 18 * s)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold ' + Math.round(15 * s) + 'px sans-serif'
    ctx.textBaseline = 'middle'
    const btnText = st.ended ? '再来一局' : (st.paused ? '继续训练' : '开始训练')
    ctx.fillText(btnText, this.cx, y + hh - 34 * s)
  }

  /** 覆盖层按钮的命中检测（页面 tap 时调用） */
  isOverlayButtonHit(x, y) {
    if (this.state === STATE.RUNNING) return false
    const s = this.scale
    const st = this.getState()
    const hh = st.ended ? 250 * s : 176 * s
    const cy = (this.height - hh) / 2 + hh - 52 * s
    return x >= this.cx - 70 * s && x <= this.cx + 70 * s && y >= cy - 6 * s && y <= cy + 42 * s
  }
}

module.exports = { GameEngine, STATE }
