// ============================================================================
// games/shoot/ui.js —— 射击训练的「页面层」UI（画在引擎画面之上）
// ----------------------------------------------------------------------------
// 为什么单独一层：
//   · 引擎只管玩法（背景 / 保持区 / 角色 / 怪兽 / 子弹 / HUD）；
//   · 开始页、暂停页、结算页、底部按钮条、传感器状态，都属于页面 UI。
//   把治疗师参数面板从游戏页搬走以后（改到 pages/shoot-settings），
//   游戏页就是「整屏画布 + 这一层 UI」，和接水果 / 走钢丝 / 节奏训练一致。
//
// 约定：
//   · 引擎设置 externalOverlay = true，不再画自己那套遮罩；
//   · 引擎每帧 render() 结束后回调 afterRender → 由这里接管绘制；
//   · 所有可点区域注册到 this.buttons，页面把触摸坐标交给 hitTest()。
// ============================================================================

const STATE = { READY: 'ready', RUNNING: 'running', PAUSED: 'paused', ENDED: 'ended' }

const C = {
  scrim: 'rgba(4,9,18,0.74)',
  card: 'rgba(14,28,46,0.97)',
  cardLine: 'rgba(79,209,197,0.42)',
  ink: '#FFFFFF',
  soft: 'rgba(186,208,230,0.92)',
  mute: 'rgba(150,178,204,0.72)',
  teal: '#17B39B',
  tealDeep: '#0F9C8C',
  amber: '#FFB44D',
  danger: '#FF8A7A',
  ghost: 'rgba(255,255,255,0.08)',
  ghostLine: 'rgba(255,255,255,0.18)'
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.lineTo(x + w - rad, y)
  ctx.arcTo(x + w, y, x + w, y + rad, rad)
  ctx.lineTo(x + w, y + h - rad)
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad)
  ctx.lineTo(x + rad, y + h)
  ctx.arcTo(x, y + h, x, y + h - rad, rad)
  ctx.lineTo(x, y + rad)
  ctx.arcTo(x, y, x + rad, y, rad)
  ctx.closePath()
}

class ShootUI {
  constructor(opts) {
    const o = opts || {}
    this.ctx = o.ctx
    this.engine = o.engine
    this.cfg = o.cfg
    this.W = 390
    this.H = 700
    this.dpr = 2
    this.s = 1
    this.insetTop = 0
    this.insetBottom = 0
    this.buttons = []
    this.pressed = {}
  }

  resize(w, h, dpr) {
    this.W = Math.max(160, w)
    this.H = Math.max(200, h)
    this.dpr = dpr || this.dpr
    this.s = clamp(this.W / 375, 0.88, 1.4)
  }

  setInsets(top, bottom) {
    this.insetTop = top || 0
    this.insetBottom = bottom || 0
  }

  // ---------------------------------------------------------------- 基础绘制
  _font(size, weight) {
    return (weight ? weight + ' ' : '') + Math.round(size) +
      'px -apple-system, "PingFang SC", "Helvetica Neue", sans-serif'
  }

  _text(t, x, y, o) {
    const opt = o || {}
    const c = this.ctx
    c.font = this._font(opt.size || 12, opt.weight)
    c.fillStyle = opt.color || C.ink
    c.textAlign = opt.align || 'left'
    c.textBaseline = opt.baseline || 'middle'
    c.fillText(t, x, y)
  }

  _measure(t, size, weight) {
    const c = this.ctx
    c.font = this._font(size || 12, weight)
    return c.measureText(String(t)).width
  }

  _dot(x, y, r, color) {
    const c = this.ctx
    c.beginPath()
    c.arc(x, y, r, 0, Math.PI * 2)
    c.fillStyle = color
    c.fill()
  }

  _icon(name, cx, cy, size, color) {
    const c = this.ctx
    const s = size / 2
    c.save()
    c.translate(cx, cy)
    c.lineWidth = Math.max(1.4, size * 0.12)
    c.lineCap = 'round'
    c.lineJoin = 'round'
    c.strokeStyle = color
    c.fillStyle = color
    if (name === 'play') {
      c.beginPath()
      c.moveTo(-s * 0.42, -s * 0.72)
      c.lineTo(s * 0.74, 0)
      c.lineTo(-s * 0.42, s * 0.72)
      c.closePath()
      c.fill()
    } else if (name === 'pause') {
      c.beginPath()
      c.moveTo(-s * 0.46, -s * 0.68)
      c.lineTo(-s * 0.46, s * 0.68)
      c.moveTo(s * 0.46, -s * 0.68)
      c.lineTo(s * 0.46, s * 0.68)
      c.stroke()
    } else if (name === 'back') {
      c.beginPath()
      c.moveTo(s * 0.3, -s * 0.62)
      c.lineTo(-s * 0.34, 0)
      c.lineTo(s * 0.3, s * 0.62)
      c.stroke()
    } else if (name === 'home') {
      c.beginPath()
      c.moveTo(-s * 0.66, -s * 0.06)
      c.lineTo(0, -s * 0.68)
      c.lineTo(s * 0.66, -s * 0.06)
      c.stroke()
      c.beginPath()
      c.moveTo(-s * 0.44, -s * 0.02)
      c.lineTo(-s * 0.44, s * 0.62)
      c.lineTo(s * 0.44, s * 0.62)
      c.lineTo(s * 0.44, -s * 0.02)
      c.stroke()
    } else if (name === 'gear') {
      c.beginPath()
      c.arc(0, 0, s * 0.34, 0, Math.PI * 2)
      c.stroke()
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8
        c.beginPath()
        c.moveTo(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5)
        c.lineTo(Math.cos(a) * s * 0.74, Math.sin(a) * s * 0.74)
        c.stroke()
      }
    } else if (name === 'refresh') {
      c.beginPath()
      c.arc(0, 0, s * 0.56, Math.PI * 0.35, Math.PI * 1.72)
      c.stroke()
      c.beginPath()
      c.moveTo(s * 0.1, -s * 0.62)
      c.lineTo(s * 0.62, -s * 0.42)
      c.lineTo(s * 0.26, -s * 0.02)
      c.stroke()
    } else if (name === 'bt') {
      c.beginPath()
      c.moveTo(-s * 0.36, -s * 0.4)
      c.lineTo(s * 0.36, s * 0.36)
      c.lineTo(0, s * 0.72)
      c.lineTo(0, -s * 0.72)
      c.lineTo(s * 0.36, -s * 0.36)
      c.lineTo(-s * 0.36, s * 0.4)
      c.stroke()
    }
    c.restore()
  }

  _button(id, x, y, w, h, label, o) {
    const opt = o || {}
    const c = this.ctx
    this.buttons.push({ id: id, x: x, y: y, w: w, h: h })
    const hit = this.pressed[id] && Date.now() - this.pressed[id] < 150
    c.save()
    if (hit) {
      c.translate(x + w / 2, y + h / 2)
      c.scale(0.97, 0.97)
      c.translate(-(x + w / 2), -(y + h / 2))
    }
    rr(c, x, y, w, h, opt.radius === undefined ? h / 2 : opt.radius)
    if (opt.variant === 'primary') {
      const g = c.createLinearGradient(x, y, x, y + h)
      g.addColorStop(0, '#1AB9A2')
      g.addColorStop(1, '#0E8B7C')
      c.fillStyle = g
      c.fill()
    } else {
      c.fillStyle = opt.variant === 'ghost' ? C.ghost : 'rgba(255,255,255,0.05)'
      c.fill()
      c.lineWidth = 1
      c.strokeStyle = C.ghostLine
      c.stroke()
    }

    const size = opt.size || 14
    const iconW = opt.icon ? size * 1.1 : 0
    const gap = opt.icon ? 6 : 0
    const textW = this._measure(label, size, '600')
    const total = iconW + gap + textW
    const startX = x + w / 2 - total / 2
    const midY = y + h / 2
    const color = opt.variant === 'primary' ? '#FFFFFF' : (opt.color || C.soft)
    if (opt.icon) this._icon(opt.icon, startX + iconW / 2, midY, iconW, color)
    this._text(label, startX + iconW + gap, midY + 0.5, {
      size: size, weight: '600', color: color, align: 'left'
    })
    c.restore()
  }

  /** 卡片底板（返回内容区高度） */
  _card(x, y, w, h) {
    const c = this.ctx
    c.save()
    c.shadowColor = 'rgba(0,0,0,0.45)'
    c.shadowBlur = 24
    c.shadowOffsetY = 10
    rr(c, x, y, w, h, 20 * this.s)
    c.fillStyle = C.card
    c.fill()
    c.restore()
    rr(c, x, y, w, h, 20 * this.s)
    c.lineWidth = 1
    c.strokeStyle = C.cardLine
    c.stroke()
  }

  // ---------------------------------------------------------------- 主绘制
  render() {
    const st = this.engine ? this.engine.getState() : { state: STATE.READY }
    this.buttons = []
    // 顺序很重要：卡片（含遮罩）先画，状态胶囊与底部按钮条后画，
    // 否则会被遮罩压暗，看着像"不可点"
    if (st.state === STATE.READY) this._drawIntro(st)
    else if (st.state === STATE.PAUSED) this._drawPause(st)
    else if (st.state === STATE.ENDED) this._drawResult(st)
    this._drawSensorChip(st)
    this._drawBar(st)
  }

  /** 左上角状态胶囊：传感器连没连、多少 Hz */
  _drawSensorChip(st) {
    const c = this.ctx
    const live = st.sensorStale === false
    const label = live
      ? '传感器' + (st.sensorHz ? ' ' + st.sensorHz + 'Hz' : '')
      : '未连接 · 触屏模拟'
    const size = 9.5
    const w = this._measure(label, size, '600') + 26
    const h = 22
    const x = 14
    const y = this.insetTop + 92 * this.s
    rr(c, x, y, w, h, h / 2)
    c.fillStyle = 'rgba(6,14,26,0.62)'
    c.fill()
    c.lineWidth = 1
    c.strokeStyle = live ? 'rgba(125,255,207,0.36)' : 'rgba(255,209,102,0.36)'
    c.stroke()
    this._dot(x + 9, y + h / 2, 3, live ? '#7DFFCF' : '#FFD166')
    this._text(label, x + 17, y + h / 2 + 0.5, {
      size: size, weight: '600', color: live ? 'rgba(160,255,220,0.95)' : 'rgba(255,214,102,0.95)'
    })
    this.buttons.push({ id: 'connect', x: x, y: y, w: w, h: h })
  }

  /** 底部操作条：返回 / 设置 / 暂停-继续 */
  _drawBar(st) {
    this.barH = 46
    const y = this.H - this.insetBottom - 14 - this.barH
    this.barY = y
    const gap = 8
    // 结算卡片里已经有「返回首页 / 训练设置 / 再来一局」，底栏整条收起来，避免重复
    if (st.state === STATE.ENDED) {
      this.barY = -1
      return
    }
    const list = [{ id: 'back', icon: 'back', label: '返回', variant: 'ghost' }]
    // 暂停时卡片里已经有「调整参数」，底栏不再重复放设置
    if (st.state !== STATE.PAUSED) {
      list.push({ id: 'settings', icon: 'gear', label: '设置', variant: 'ghost' })
    }
    if (st.state === STATE.RUNNING) list.push({ id: 'pause', icon: 'pause', label: '暂停', variant: 'primary' })

    const n = list.length
    const totalW = this.W - 28 - gap * (n - 1)
    const w = totalW / n
    list.forEach((b, i) => {
      this._button(b.id, 14 + i * (w + gap), y, w, this.barH, b.label, {
        variant: b.variant, icon: b.icon, size: 12
      })
    })
  }

  // ---------------------------------------------------------------- 开始页
  _drawIntro(st) {
    const c = this.ctx
    const s = this.s
    const W = this.W
    c.fillStyle = C.scrim
    c.fillRect(0, 0, W, this.H)

    const cardW = W - 32
    const x = 16
    const rowH = 24 * s
    const stepsH = 3 * rowH
    const chipsH = 2 * 32 + 8
    const h = 22 + 26 + 18 + 10 + stepsH + 12 + chipsH + 14 + 48 + 20 + 22
    const top = Math.max(this.insetTop + 24, (this.H - h) / 2 - 10)
    this._card(x, top, cardW, h)

    let y = top + 26
    this._text('射击训练', W / 2, y, { size: 21, weight: '800', color: C.ink, align: 'center' })
    y += 22
    this._text('身体保持在中间，对准小怪兽自动开火', W / 2, y, {
      size: 11, weight: '500', color: C.mute, align: 'center'
    })
    y += 20

    const steps = [
      '戴好传感器，先做一次零点标定',
      '身体保持在绿色「保持区」里',
      '自动开火，击中小怪兽累计得分'
    ]
    steps.forEach((t, i) => {
      const sy = y + i * rowH + 6
      c.beginPath()
      c.arc(x + 24, sy, 8 * s, 0, Math.PI * 2)
      c.fillStyle = 'rgba(79,209,197,0.16)'
      c.fill()
      this._text(String(i + 1), x + 24, sy + 0.5, { size: 9, weight: '700', color: '#9DEBFF', align: 'center' })
      this._text(t, x + 40, sy + 0.5, { size: 10.5, weight: '500', color: C.soft })
    })
    y += stepsH + 6

    const diff = this.cfg.getDifficulty ? this.cfg.getDifficulty() : { label: '标准' }
    const chips = [
      '难度 ' + (diff.label || '标准'),
      '保持 ±' + (Number(this.cfg.get('keepRangeDeg')) || 6) + '°',
      '发射 ' + (Number(this.cfg.get('fireRate')) || 3) + ' 发/秒',
      '时长 ' + (Number(this.cfg.get('gameDuration')) || 60) + ' 秒'
    ]
    const cellW = (cardW - 40) / 2
    chips.forEach((t, i) => {
      const cx = x + 20 + (i % 2) * cellW
      const cy = y + Math.floor(i / 2) * 32
      rr(c, cx, cy, cellW - 8, 26, 13)
      c.fillStyle = 'rgba(255,255,255,0.05)'
      c.fill()
      this._text(t, cx + (cellW - 8) / 2, cy + 13.5, {
        size: 9.5, weight: '600', color: C.soft, align: 'center'
      })
    })
    y += chipsH + 8

    this._button('start', x + 20, y, cardW - 40, 48, '开始训练', {
      variant: 'primary', icon: 'play', size: 15
    })
    y += 48 + 16
    this._text('训练参数在「设置」里，治疗师可随时调整', W / 2, y + 4, {
      size: 9, weight: '500', color: 'rgba(150,178,204,0.55)', align: 'center'
    })
    void st
  }

  // ---------------------------------------------------------------- 暂停
  _drawPause(st) {
    const c = this.ctx
    c.fillStyle = C.scrim
    c.fillRect(0, 0, this.W, this.H)

    const cardW = this.W - 48
    const x = 24
    const h = 222
    const top = Math.max(this.insetTop + 24, (this.H - h) / 2 - 8)
    this._card(x, top, cardW, h)

    this._text('已暂停', this.W / 2, top + 40, { size: 20, weight: '800', color: C.ink, align: 'center' })
    this._text('计时和计分都停住了，继续后接着来', this.W / 2, top + 66, {
      size: 10.5, weight: '500', color: C.mute, align: 'center'
    })
    this._text('保持 ' + Math.round((st.zoneRate || 0)) + '% · 得分 ' + st.score, this.W / 2, top + 88, {
      size: 11, weight: '600', color: C.teal, align: 'center'
    })

    this._button('resume', x + 20, top + 108, cardW - 40, 46, '继续训练', {
      variant: 'primary', icon: 'play', size: 14
    })
    const half = (cardW - 48) / 2
    this._button('restart', x + 20, top + 166, half, 40, '重来', { variant: 'ghost', icon: 'refresh', size: 11 })
    this._button('settings', x + 28 + half, top + 166, half, 40, '调整参数', {
      variant: 'ghost', icon: 'gear', size: 11
    })
  }

  // ---------------------------------------------------------------- 结算
  _drawResult(st) {
    const c = this.ctx
    c.fillStyle = C.scrim
    c.fillRect(0, 0, this.W, this.H)

    const cardW = this.W - 40
    const x = 20
    const h = 300
    const top = Math.max(this.insetTop + 24, (this.H - h) / 2 - 8)
    this._card(x, top, cardW, h)

    this._text('训练结束', this.W / 2, top + 34, { size: 19, weight: '800', color: C.ink, align: 'center' })

    const scoreStr = String(st.score || 0)
    const scSize = 40
    const scoreW = this._measure(scoreStr, scSize, '800')
    this._text(scoreStr, this.W / 2 - 8, top + 84, { size: scSize, weight: '800', color: C.ink, align: 'right' })
    this._text('分', this.W / 2 + 2, top + 92, { size: 12, weight: '600', color: C.mute })
    void scoreW

    this._text('命中 ' + (st.hits || 0) + ' 次 · 最高连击 x' + (st.maxCombo || 0), this.W / 2, top + 116, {
      size: 10.5, weight: '500', color: C.soft, align: 'center'
    })

    const tiles = [
      { k: '命中', v: st.hits || 0 },
      { k: '最高连击', v: 'x' + (st.maxCombo || 0) },
      { k: '在界率', v: Math.round(st.zoneRate || 0) + '%' }
    ]
    const gap = 8
    const tw = (cardW - 40 - gap * 2) / 3
    tiles.forEach((t, i) => {
      const tx = x + 20 + i * (tw + gap)
      rr(c, tx, top + 134, tw, 46, 10)
      c.fillStyle = 'rgba(255,255,255,0.05)'
      c.fill()
      this._text(String(t.v), tx + tw / 2, top + 152, { size: 15, weight: '700', color: C.ink, align: 'center' })
      this._text(t.k, tx + tw / 2, top + 170, { size: 8.5, weight: '500', color: C.mute, align: 'center' })
    })

    this._button('restart', x + 20, top + 194, cardW - 40, 46, '再来一局', {
      variant: 'primary', icon: 'refresh', size: 14
    })
    const half = (cardW - 48) / 2
    this._button('home', x + 20, top + 250, half, 36, '返回首页', { variant: 'ghost', icon: 'home', size: 11 })
    this._button('settings', x + 28 + half, top + 250, half, 36, '训练设置', {
      variant: 'ghost', icon: 'gear', size: 11
    })
  }

  // ---------------------------------------------------------------- 交互
  markPress(id) {
    this.pressed[id] = Date.now()
    if (this.engine) this.engine.render()
  }

  hitTest(x, y) {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i]
      if (x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 6 && y <= b.y + b.h + 6) {
        return b.id
      }
    }
    return null
  }
}

module.exports = { ShootUI, STATE }
