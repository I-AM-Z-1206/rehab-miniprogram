// ============================================================================
// utils/game/engine.js —— 游戏引擎（GameEngine）
// ----------------------------------------------------------------------------
// 一个引擎实例 = 一局游戏。负责：
//   1. 帧循环（canvas.requestAnimationFrame，掉帧时用 setTimeout 兜底）
//   2. 双时钟：0.1s 判定/计分刻度 + 1.0s 基础计时/计分刻度（见 score.js）
//   3. 传感器姿态 → 角色横向位置、保持范围（见 pose.js）
//   4. 自动开火（发射频率来自配置）、固定小怪兽判定（hit.js / bullet.js）
//   5. Canvas 2D 渲染：背景 / 保持区 / 角色 / 怪兽(表情) / 子弹 / 粒子 / HUD
//   6. 参数热更新：任何配置变更下一帧生效，无需重开游戏
//
// 玩法：屏幕中间固定一只小怪兽。无论是否在保持范围内都会自动开火；
//       出界时提示回到中间并暂停基础分（子弹不停），回到范围恢复基础分。
//       击中 → 怪兽悲伤表情 + 得分 + 连击。
//
// 状态机：ready → running ⇄ paused → ended → restart
// ============================================================================

const { ScoreManager } = require('./score.js')
const { BulletSystem } = require('./bullet.js')
const { HitDetector } = require('./hit.js')
const { PoseTracker } = require('./pose.js')
const { SpriteBank } = require('./sprites.js')

const STATE = {
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  ENDED: 'ended'
}

const PAD = 16           // 屏幕左右安全边距(px)
const GROUND_RATIO = 0.87
const PLAYER_H = 76
const MONSTER_Y_RATIO = 0.40 // 怪兽中心在屏幕高度的位置
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
    this.stars = []
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
    this.bgScroll = 0

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

    this._layout()
    this._makeStars()
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
    this._makeStars()
    this.playerX = clamp(this.playerX, PAD, this.width - PAD)
    if (this.monster) this.monster.x = this.cx
    if (this.state !== STATE.RUNNING) this.render()
  }

  _layout() {
    this.cx = this.width / 2
    this.groundY = this.height * GROUND_RATIO
    this.monsterY = this.height * MONSTER_Y_RATIO
    this.scale = clamp(this.width / 375, 0.72, 1.6)
  }

  _makeStars() {
    this.stars = []
    const n = Math.round((this.width * this.height) / 9000)
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height * 0.72,
        r: 0.6 + Math.random() * 1.4,
        a: 0.25 + Math.random() * 0.55,
        p: Math.random() * Math.PI * 2
      })
    }
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
    this.bgScroll += dt * 16
    const targetX = PAD + this.pose.x01 * (this.width - PAD * 2)
    const follow = 1 - Math.exp(-60 * dt)
    this.playerX += (targetX - this.playerX) * follow

    // 2) 怪兽表情：出界得意 / 击中悲伤
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
    this._updateEffects(dt)

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
        this._addFloat(ev.x, ev.y, '+' + ev.gain, ev.combo >= 2 ? '#ffd166' : '#7dffcf', ev.combo >= 2 ? 1.15 : 1)
        if (ev.combo >= 3) this._addFloat(ev.x, ev.y - 16, 'COMBO x' + ev.combo, '#ff9f43', 0.9)
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

    this._drawBackground()
    this._drawKeepZone()
    this._drawAimLine()
    this._drawMonster()
    this._drawPlayer()
    this._drawBullets()
    this._drawParticles()
    this._drawFloats()
    this._drawHud()
    ctx.restore()

    if (this.state !== STATE.RUNNING) this._drawOverlay()
  }

  _drawBackground() {
    const ctx = this.ctx
    const w = this.width
    const h = this.height
    const bg = this.sprites.get('bg')

    if (bg) {
      // 星空贴图平铺 + 缓慢下移（视差），比纯渐变更有游戏感
      const tile = Math.max(200, Math.round(w * 0.66))
      const off = (this.bgScroll % tile)
      ctx.save()
      for (let y = -tile - off; y < h + tile; y += tile) {
        for (let x = -tile * 0.5; x < w + tile; x += tile) {
          ctx.drawImage(bg, x, y, tile, tile)
        }
      }
      ctx.restore()
      // 压暗，保证角色 / 文字可读
      const shade = ctx.createLinearGradient(0, 0, 0, h)
      shade.addColorStop(0, 'rgba(6,9,20,0.55)')
      shade.addColorStop(0.5, 'rgba(6,9,20,0.20)')
      shade.addColorStop(1, 'rgba(6,9,20,0.66)')
      ctx.fillStyle = shade
      ctx.fillRect(0, 0, w, h)
      // 底部导航辉光
      const glow2 = ctx.createRadialGradient(this.cx, this.groundY + 30, 8, this.cx, this.groundY + 30, this.width * 0.9)
      glow2.addColorStop(0, 'rgba(15,156,140,0.22)')
      glow2.addColorStop(1, 'rgba(15,156,140,0)')
      ctx.fillStyle = glow2
      ctx.fillRect(0, this.groundY - 80, w, h - this.groundY + 80)
      return
    }

    // ——— 贴图未就绪时的矢量兜底 ———
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#070d1c')
    g.addColorStop(0.5, '#0d1a31')
    g.addColorStop(1, '#122a47')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i]
      const a = s.a * (0.65 + 0.35 * Math.sin(this.t * 1.6 + s.p))
      ctx.globalAlpha = a
      ctx.fillStyle = '#cfe8ff'
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    const glow = ctx.createRadialGradient(this.cx, this.groundY, 8, this.cx, this.groundY, this.width * 0.85)
    glow.addColorStop(0, 'rgba(15,156,140,0.30)')
    glow.addColorStop(1, 'rgba(15,156,140,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, this.groundY - this.width * 0.5, this.width, this.width * 0.9)

    const floor = ctx.createLinearGradient(0, this.groundY, 0, h)
    floor.addColorStop(0, 'rgba(12,32,52,0.92)')
    floor.addColorStop(1, '#050a14')
    ctx.fillStyle = floor
    ctx.fillRect(0, this.groundY, w, h - this.groundY)
  }

  _drawKeepZone() {
    const ctx = this.ctx
    const half = this.keepHalfPx()
    const top = 74 * this.scale
    const bottom = this.groundY - 30
    const inZone = this.pose.inZone
    const accent = inZone ? 'rgba(15,156,140,1)' : 'rgba(255,86,86,1)'
    const fill = inZone ? 'rgba(15,156,140,0.10)' : 'rgba(255,86,86,0.12)'

    ctx.fillStyle = fill
    ctx.fillRect(this.cx - half, top, half * 2, bottom - top)

    ctx.save()
    ctx.setLineDash([7, 7])
    ctx.lineWidth = 1.4
    ctx.strokeStyle = inZone ? 'rgba(88,214,199,0.55)' : 'rgba(255,120,120,0.7)'
    ctx.beginPath()
    ctx.moveTo(this.cx - half, top)
    ctx.lineTo(this.cx - half, bottom)
    ctx.moveTo(this.cx + half, top)
    ctx.lineTo(this.cx + half, bottom)
    ctx.stroke()
    ctx.restore()

    ctx.save()
    ctx.setLineDash([3, 9])
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(this.cx, top)
    ctx.lineTo(this.cx, bottom)
    ctx.stroke()
    ctx.restore()

    const fs = Math.round(11 * this.scale)
    ctx.font = fs + 'px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = accent
    ctx.globalAlpha = 0.95
    ctx.fillText('保 持 区  ±' + this.cfg.get('keepRangeDeg') + '°', this.cx, top - 6)
    ctx.globalAlpha = 1
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

  // ---------------------------------------------------------------- 怪兽
  _drawMonster() {
    const ctx = this.ctx
    const m = this.monster
    if (!m) return
    const showRange = !!this.cfg.get('showHitArea') || this.rangeFlash > 0
    const range = this.cfg.get('hitRange')
    const s = this.scale
    const x = m.x
    const smug = !!m.smug
    const sad = m.sad > 0
    // 停火时外星人笑到发抖（轻微弹跳），配合张嘴嘴型
    const laugh = smug ? Math.abs(Math.sin(this.t * 9)) * 2.6 * s : 0
    const y = m.y + Math.sin(this.t * 2.2) * 3 * s - laugh
    const r = m.radius

    // 判定范围提示圈
    if (showRange) {
      ctx.save()
      ctx.setLineDash([4, 5])
      ctx.lineWidth = 1.2
      ctx.strokeStyle = 'rgba(255,255,255,0.42)'
      ctx.beginPath()
      ctx.arc(x, y, Math.max(range, r), 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    // 光晕：出界偏红，正常暖黄
    const haloColor = smug ? 'rgba(255,120,110,0.30)' : 'rgba(255,209,102,0.26)'
    const halo = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2.2)
    halo.addColorStop(0, haloColor)
    halo.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(x, y, r * 2.2, 0, Math.PI * 2)
    ctx.fill()

    const body = this.sprites.get('monsterBody')
    if (body) {
      // ——— 贴图版小怪兽：身体 + 眼睛 + 嘴（+ 得意眉毛）———
      const bh = r * 2.62 * (smug ? 1.03 : 1)
      const bw = bh * (141 / 194)
      const bx = x - bw / 2
      const by = y - bh / 2
      ctx.drawImage(body, bx, by, bw, bh)

      const eye = this.sprites.get('monsterEye')
      if (eye) {
        const ew = bw * 0.32
        const eh = ew * (69 / 64)
        ctx.drawImage(eye, x - ew / 2, by + bh * 0.41 - eh / 2, ew, eh)
      }

      // 停火（出界）时外星人「张嘴大笑」，被击中时撇嘴
      const mouthKey = sad && !smug ? 'mouthSad' : 'mouthIdle'
      const mouth = this.sprites.get(mouthKey)
      if (mouth) {
        // 停火大笑时嘴再张大一点，和平静笑区分开
        const mw = bw * (smug ? 0.42 : (mouthKey === 'mouthIdle' ? 0.36 : 0.33))
        const mh = mw * (mouth.height / mouth.width)
        ctx.drawImage(mouth, x - mw / 2, by + bh * 0.63, mw, mh)
      }

      if (smug) {
        const brow = this.sprites.get('browSmug')
        if (brow) {
          const brw = bw * 0.30
          const brh = brw * (brow.height / brow.width)
          ctx.save()
          ctx.translate(x + bw * 0.03, by + bh * 0.22)
          ctx.rotate(-0.16)
          ctx.globalAlpha = 0.95
          ctx.drawImage(brow, -brw / 2, -brh / 2, brw, brh)
          ctx.restore()
        }
      }
      return
    }

    // ——— 贴图未就绪时的矢量兜底 ———
    const g = ctx.createLinearGradient(x, y - r, x, y + r)
    g.addColorStop(0, '#a78bfa')
    g.addColorStop(1, '#6d5bd0')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()

    // 角
    ctx.fillStyle = '#ffd166'
    ctx.beginPath()
    ctx.moveTo(x - r * 0.7, y - r * 0.85)
    ctx.lineTo(x - r * 0.9, y - r * 1.35)
    ctx.lineTo(x - r * 0.35, y - r * 0.95)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x + r * 0.7, y - r * 0.85)
    ctx.lineTo(x + r * 0.9, y - r * 1.35)
    ctx.lineTo(x + r * 0.35, y - r * 0.95)
    ctx.closePath()
    ctx.fill()

    // 表情
    this._drawMonsterFace(x, y, r, m)
  }

  _drawMonsterFace(x, y, r, m) {
    const ctx = this.ctx
    const eyeY = y - r * 0.12
    const eyeDx = r * 0.38
    const eyeR = r * 0.14

    ctx.fillStyle = '#2b2440'
    ctx.strokeStyle = '#2b2440'
    ctx.lineWidth = Math.max(1.4, r * 0.08)
    ctx.lineCap = 'round'

    if (m.smug) {
      // 停火：外星人张嘴大笑（弯月眼 + 张开的嘴）
      ctx.beginPath()
      ctx.arc(x - eyeDx, eyeY + eyeR * 0.35, eyeR * 0.95, Math.PI * 1.15, Math.PI * 1.85)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x + eyeDx, eyeY + eyeR * 0.35, eyeR * 0.95, Math.PI * 1.15, Math.PI * 1.85)
      ctx.stroke()
      ctx.fillStyle = '#2b2440'
      ctx.beginPath()
      ctx.arc(x, y + r * 0.24, r * 0.32, 0, Math.PI)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#ff7a8a'
      ctx.beginPath()
      ctx.arc(x, y + r * 0.3, r * 0.19, 0, Math.PI)
      ctx.closePath()
      ctx.fill()
    } else if (m.sad > 0) {
      // 悲伤：下垂眼 + 眼泪 + 撇嘴
      ctx.beginPath()
      ctx.arc(x - eyeDx, eyeY, eyeR, Math.PI, Math.PI * 2)
      ctx.moveTo(x + eyeDx + eyeR, eyeY)
      ctx.arc(x + eyeDx, eyeY, eyeR, Math.PI, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = '#7cc7ff'
      ctx.beginPath()
      ctx.arc(x - eyeDx + eyeR * 0.4, eyeY + eyeR * 1.2, eyeR * 0.4, 0, Math.PI * 2)
      ctx.arc(x + eyeDx + eyeR * 0.4, eyeY + eyeR * 1.2, eyeR * 0.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#2b2440'
      ctx.beginPath()
      ctx.arc(x, y + r * 0.62, r * 0.3, Math.PI * 1.15, Math.PI * 1.85)
      ctx.stroke()
    } else {
      // 平静：圆眼 + 微笑
      ctx.fillStyle = '#2b2440'
      ctx.beginPath()
      ctx.arc(x - eyeDx, eyeY, eyeR, 0, Math.PI * 2)
      ctx.arc(x + eyeDx, eyeY, eyeR, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(x - eyeDx + eyeR * 0.35, eyeY - eyeR * 0.35, eyeR * 0.35, 0, Math.PI * 2)
      ctx.arc(x + eyeDx + eyeR * 0.35, eyeY - eyeR * 0.35, eyeR * 0.35, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#2b2440'
      ctx.beginPath()
      ctx.arc(x, y + r * 0.32, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI)
      ctx.stroke()
    }
  }

  /** 子弹出生点（贴图飞船时对准机头，矢量小人时对准枪口） */
  gunY() {
    if (this.sprites.get('ship')) return this.groundY - 50 * this.scale
    return this.groundY - PLAYER_H + 4
  }

  _drawPlayer() {
    const ctx = this.ctx
    const x = this.playerX
    const gy = this.groundY
    const tilt = clamp(this.pose.angle / Math.max(6, this.cfg.get('maxLeanDeg')), -1, 1) * 0.22
    const recoil = this.recoil * 4
    const s = this.scale
    const ship = this.sprites.get('ship')

    if (ship) {
      // ——— 贴图版：飞船 + 尾焰 + 枪口光 ———
      const shipH = 46 * s
      const shipW = shipH * (99 / 75)
      const cy = gy - 24 * s + recoil

      // 尾焰
      const flame = 12 * s + Math.sin(this.t * 26) * 3 * s + this.recoil * 8 * s
      const fg = ctx.createLinearGradient(x, cy + shipH * 0.3, x, cy + shipH * 0.3 + flame)
      fg.addColorStop(0, 'rgba(255,255,255,0.95)')
      fg.addColorStop(0.4, 'rgba(120,230,255,0.8)')
      fg.addColorStop(1, 'rgba(60,120,255,0)')
      ctx.fillStyle = fg
      ctx.beginPath()
      ctx.moveTo(x - 7 * s, cy + shipH * 0.26)
      ctx.lineTo(x, cy + shipH * 0.26 + flame)
      ctx.lineTo(x + 7 * s, cy + shipH * 0.26)
      ctx.closePath()
      ctx.fill()

      ctx.save()
      ctx.translate(x, cy)
      ctx.rotate(tilt)
      ctx.drawImage(ship, -shipW / 2, -shipH / 2, shipW, shipH)
      ctx.restore()

      if (this.muzzle > 0) {
        const mm = this.muzzle / 0.07
        ctx.globalAlpha = mm
        const mg = ctx.createRadialGradient(x, cy - shipH * 0.5, 1, x, cy - shipH * 0.5, 16 * s)
        mg.addColorStop(0, 'rgba(255,255,255,1)')
        mg.addColorStop(0.45, 'rgba(120,255,220,0.9)')
        mg.addColorStop(1, 'rgba(60,220,180,0)')
        ctx.fillStyle = mg
        ctx.beginPath()
        ctx.arc(x, cy - shipH * 0.5, 16 * s, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
      return
    }

    // ——— 贴图未就绪时的矢量小人兜底 ———
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.translate(x, gy + 4)
    ctx.scale(1, 0.27)
    ctx.beginPath()
    ctx.arc(0, 0, 26 * s, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.translate(x, gy)
    ctx.rotate(tilt)

    const bodyW = 24 * s
    const bodyH = 34 * s
    const bodyY = -PLAYER_H * s

    ctx.strokeStyle = '#2d4a6b'
    ctx.lineWidth = 7 * s
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-6 * s, bodyY + bodyH - 2 * s)
    ctx.lineTo(-9 * s, -2)
    ctx.moveTo(6 * s, bodyY + bodyH - 2 * s)
    ctx.lineTo(9 * s, -2)
    ctx.stroke()

    const bg = ctx.createLinearGradient(0, bodyY, 0, bodyY + bodyH)
    bg.addColorStop(0, '#4fd1c5')
    bg.addColorStop(1, '#0f9c8c')
    ctx.fillStyle = bg
    roundRect(ctx, -bodyW / 2, bodyY, bodyW, bodyH, 8 * s)
    ctx.fill()

    ctx.fillStyle = this.pose.inZone ? '#eafff9' : '#ff8a80'
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this.t * 4)
    ctx.beginPath()
    ctx.arc(0, bodyY + bodyH * 0.55, 4 * s, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    ctx.fillStyle = '#e8f6ff'
    ctx.beginPath()
    ctx.arc(0, bodyY - 8 * s, 9 * s, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0f9c8c'
    ctx.beginPath()
    ctx.arc(0, bodyY - 8 * s, 5.4 * s, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.fill()

    const gunY = bodyY + 4 * s - recoil * 0.75
    ctx.fillStyle = '#d7e6f5'
    roundRect(ctx, -3.2 * s, gunY - 16 * s, 6.4 * s, 20 * s, 2 * s)
    ctx.fill()
    ctx.fillStyle = '#8fb0cc'
    roundRect(ctx, -7 * s, gunY + 2 * s, 14 * s, 6 * s, 2 * s)
    ctx.fill()

    if (this.muzzle > 0) {
      const mm = this.muzzle / 0.07
      ctx.globalAlpha = mm
      const mg = ctx.createRadialGradient(0, gunY - 18 * s, 1, 0, gunY - 18 * s, 14 * s)
      mg.addColorStop(0, 'rgba(255,255,255,1)')
      mg.addColorStop(0.4, 'rgba(255,214,102,0.9)')
      mg.addColorStop(1, 'rgba(255,138,101,0)')
      ctx.fillStyle = mg
      ctx.beginPath()
      ctx.arc(0, gunY - 18 * s, 14 * s, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }

    ctx.restore()
  }

  _drawBullets() {
    const ctx = this.ctx
    const laser = this.sprites.get('laser')
    for (let i = 0; i < this.bullets.list.length; i++) {
      const b = this.bullets.list[i]
      if (laser) {
        // 贴图版子弹：激光束
        const h = 36
        const w = h * (9 / 37)
        ctx.globalAlpha = 0.96
        ctx.drawImage(laser, b.x - w / 2, b.y - h / 2, w, h)
        ctx.globalAlpha = 1
        continue
      }
      // 矢量化激光线兜底
      const tx = b.x - b.vx * 0.022
      const ty = b.y - b.vy * 0.022
      const g = ctx.createLinearGradient(tx, ty, b.x, b.y)
      g.addColorStop(0, 'rgba(120,255,220,0)')
      g.addColorStop(1, 'rgba(200,255,245,0.95)')
      ctx.strokeStyle = g
      ctx.lineWidth = 3.2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(tx, ty)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()

      ctx.fillStyle = 'rgba(235,255,250,0.95)'
      ctx.beginPath()
      ctx.arc(b.x, b.y, 2.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  _drawParticles() {
    const ctx = this.ctx
    const star = this.sprites.get('star')
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]
      ctx.globalAlpha = Math.max(0, p.life / p.max)
      if (star) {
        const sz = p.r * 4.2
        ctx.drawImage(star, p.x - sz / 2, p.y - sz / 2, sz, sz)
      } else {
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
  }

  _drawFloats() {
    const ctx = this.ctx
    for (let i = 0; i < this.floats.length; i++) {
      const f = this.floats[i]
      const a = Math.max(0, f.life / f.max)
      ctx.globalAlpha = a
      ctx.fillStyle = f.color
      ctx.font = 'bold ' + Math.round(16 * this.scale * f.scale) + 'px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(f.text, f.x, f.y)
    }
    ctx.globalAlpha = 1
  }

  _drawHud() {
    const ctx = this.ctx
    const s = this.scale
    const st = this.getState()
    const pad = 14 * s

    // ---- 面板底板（半透明卡片，替代裸文字）----
    const cardW1 = 112 * s
    const cardW2 = 118 * s
    const cardH = 76 * s
    ctx.fillStyle = 'rgba(8,16,32,0.55)'
    roundRect(ctx, pad - 8 * s, pad - 8 * s, cardW1, cardH, 12 * s)
    ctx.fill()
    roundRect(ctx, this.width - pad - cardW2 + 8 * s, pad - 8 * s, cardW2, cardH, 12 * s)
    ctx.fill()
    ctx.strokeStyle = 'rgba(120,180,220,0.18)'
    ctx.lineWidth = 1
    roundRect(ctx, pad - 8 * s, pad - 8 * s, cardW1, cardH, 12 * s)
    ctx.stroke()
    roundRect(ctx, this.width - pad - cardW2 + 8 * s, pad - 8 * s, cardW2, cardH, 12 * s)
    ctx.stroke()

    // ---- 左上：得分 ----
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(160,196,224,0.85)'
    ctx.font = Math.round(11 * s) + 'px sans-serif'
    ctx.fillText('得分', pad, pad + 2)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold ' + Math.round(34 * s) + 'px sans-serif'
    ctx.fillText(String(st.score), pad, pad + 16 * s)

    ctx.fillStyle = 'rgba(140,170,200,0.85)'
    ctx.font = Math.round(11 * s) + 'px sans-serif'
    ctx.fillText('命中 ' + st.hits + ' 次', pad, pad + 58 * s)

    // ---- 右上：倒计时（大号、整数秒） ----
    ctx.textAlign = 'right'
    const dur = st.duration
    const label = dur > 0 ? '倒计时' : '已用时'
    const numText = dur > 0 ? Math.ceil(st.timeLeft) + 's' : Math.floor(st.elapsed) + 's'
    ctx.fillStyle = 'rgba(160,196,224,0.85)'
    ctx.font = Math.round(11 * s) + 'px sans-serif'
    ctx.fillText(label, this.width - pad, pad + 2)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold ' + Math.round(36 * s) + 'px sans-serif'
    ctx.fillText(numText, this.width - pad, pad + 15 * s)

    // 时间进度条
    const barW = 92 * s
    const barX = this.width - pad - barW
    const barY = pad + 62 * s
    const ratio = dur > 0 ? clamp(st.timeLeft / dur, 0, 1) : 0
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    roundRect(ctx, barX, barY, barW, 6 * s, 3 * s)
    ctx.fill()
    ctx.fillStyle = ratio > 0.25 ? '#4fd1c5' : '#ff8a65'
    roundRect(ctx, barX, barY, Math.max(4, barW * ratio), 6 * s, 3 * s)
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

    // ---- 左下：姿态 / 保持状态 ----
    const zoneOk = st.inZone
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    const infoY = this.groundY - 6 * s
    ctx.fillStyle = zoneOk ? 'rgba(125,255,207,0.95)' : 'rgba(255,138,128,0.95)'
    ctx.font = 'bold ' + Math.round(13 * s) + 'px sans-serif'
    ctx.fillText(
      (st.sensorStale ? '模拟 ' : '倾角 ') + (st.angle > 0 ? '+' : '') + st.angle + '°',
      pad, infoY
    )
    ctx.fillStyle = 'rgba(160,196,224,0.8)'
    ctx.font = Math.round(11 * s) + 'px sans-serif'
    ctx.fillText(
      zoneOk ? '保持在范围内 · 自动开火' : '超出保持范围 · 基础分暂停',
      pad, infoY - 18 * s
    )

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

    // 传感器未连接提示
    if (st.sensorStale && this.state !== STATE.READY) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = 'rgba(255,214,102,0.9)'
      ctx.font = Math.round(11 * s) + 'px sans-serif'
      ctx.fillText('未连接传感器 · 可左右拖动画面模拟', this.cx, 74 * s)
    }
  }

  _drawOverlay() {
    const ctx = this.ctx
    const s = this.scale
    const st = this.getState()
    ctx.fillStyle = 'rgba(4,9,18,0.72)'
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
      const lines = [
        '总分 ' + stats.score + ' 分',
        '命中 ' + stats.hits + ' 次',
        '最高连击 x' + stats.maxCombo,
        '保持在范围内 ' + stats.zoneRate + '% 的时间'
      ]
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], this.cx, y + 56 * s + i * 22 * s)
      }
    } else if (st.paused) {
      ctx.fillText('点击「继续」回到训练', this.cx, y + 58 * s)
      ctx.fillText('治疗师可在下方面板实时调整参数', this.cx, y + 82 * s)
    } else {
      ctx.fillText('保持身体在中间，对准小怪兽自动开火', this.cx, y + 54 * s)
      ctx.fillText('偏离保持范围会停火，外星人还会笑你', this.cx, y + 76 * s)
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
