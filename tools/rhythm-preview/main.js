// tools/rhythm-preview/main.js —— 在浏览器里跑真实的节奏训练渲染层（开发预览用）
// 与小程序共用 games/rhythm/* 与 utils/*，不是另外画的示意稿。
// 时钟用 PreviewClock（虚拟时间），因此可以瞬间"快进"到某一局的中后段再定格截图。

import { installWx } from './wx-stub.js'

installWx()

const { getStore } = require('../../utils/rhythm-config.js')
const { songById } = require('../../utils/rhythm-songs.js')
const { RhythmEngine } = require('../../pkgRhythm/games/rhythm/engine.js')
const { RhythmRenderer } = require('../../pkgRhythm/games/rhythm/renderer.js')

const params = new URLSearchParams(window.location.search)
const CSS_W = Math.max(280, Number(params.get('w')) || 390)
const CSS_H = Math.max(480, Number(params.get('h')) || 844)
const FROZEN = /[?&]freeze=1/.test(window.location.search)
const canvas = document.getElementById('stage')
const dpr = Math.min(window.devicePixelRatio || 2, 2)

const screenEl = document.querySelector('.screen')
if (screenEl && /[?&]bare=1/.test(window.location.search)) {
  document.body.classList.add('bare')
  screenEl.style.width = CSS_W + 'px'
  screenEl.style.height = CSS_H + 'px'
}

canvas.width = Math.round(CSS_W * dpr)
canvas.height = Math.round(CSS_H * dpr)
canvas.style.width = CSS_W + 'px'
canvas.style.height = CSS_H + 'px'

// ---------------------------------------------------------------- 虚拟音乐时钟
/** 与 BeatClock 同接口，但时间由 simulate() 推进，便于快进与定格 */
class PreviewClock {
  constructor(song) {
    this.song = song
    this.t = 0
    this.state = 'idle'
    this.pausedAt = 0
    this.isSilent = false
    this.beatMs = song ? 60000 / song.bpm : 500
  }
  setSong(song) {
    this.song = song
    if (song) this.beatMs = 60000 / song.bpm
    return this
  }
  start() { this.state = 'playing'; this.t = 0; return this }
  pause() { if (this.state === 'playing') { this.pausedAt = this.t; this.state = 'paused' } return this }
  resume() { if (this.state === 'paused') this.state = 'playing'; return this }
  stop() { this.state = 'idle'; this.t = 0; return this }
  nowMs() { return this.state === 'paused' ? this.pausedAt : this.t }
  beatPhase() {
    const m = ((this.t % this.beatMs) + this.beatMs) % this.beatMs
    return m / this.beatMs
  }
  syncVolume() {}
  destroyAudio() {}
  advance(ms) { if (this.state === 'playing') this.t += ms; return this.t }
}

const cfg = getStore()
cfg.reset()
const clock = new PreviewClock(songById(cfg.get('songId')))
const engine = new RhythmEngine({ cfg: cfg, clock: clock })
engine.setSimMode(true)

const renderer = new RhythmRenderer({
  canvas: canvas,
  ctx: canvas.getContext('2d'),
  engine: engine,
  cfg: cfg
})
renderer.resize(CSS_W, CSS_H, dpr)

// ---------------------------------------------------------------- 快进
const DT = 1 / 60

function simulate(ms, each) {
  const steps = Math.max(1, Math.round(ms / (DT * 1000)))
  for (let i = 0; i < steps; i++) {
    clock.advance(DT * 1000)
    if (each) each(i)
    engine.update(DT)
    engine.drainEvents()
  }
}

function runCountdown() {
  let guard = 0
  while (engine.state === 'COUNTDOWN' && guard < 2000) {
    engine.update(DT)
    engine.drainEvents()
    guard += 1
  }
}

/** 自动跟拍：在音符到达判定线前 160ms 移到正确一侧 */
function autoTarget() {
  const next = engine.active.find((n) => !n.judged)
  if (!next) return
  if (clock.t >= next.targetTimeMs - 160) {
    engine.setSimTarget(next.targetSide === 'left' ? -1 : (next.targetSide === 'right' ? 1 : 0))
  }
}

const scenario = (params.get('screen') || '').toLowerCase()
let frozen = FROZEN
let stateText = ''

if (scenario === 'prepare') {
  engine.prepare()
} else if (scenario === 'calib') {
  engine.prepare()
  engine.startPreview()
  simulate(700)
} else if (scenario === 'play' || scenario === 'combo') {
  engine.prepare()
  engine.startCountdown()
  runCountdown()
  const targetHits = scenario === 'combo' ? 18 : 6
  let guard = 0
  while (engine.state === 'PLAYING' && engine.score.hits < targetHits && guard < 6000) {
    autoTarget()
    clock.advance(DT * 1000)
    engine.update(DT)
    engine.drainEvents()
    guard += 1
  }
  // 再走一点，让飘字 / 连击 / 粒子处在"刚命中"的状态
  simulate(180)
} else if (scenario === 'pause') {
  engine.prepare()
  engine.startCountdown()
  runCountdown()
  simulate(6000, autoTarget)
  engine.pause()
} else if (scenario === 'sensor') {
  engine.prepare()
  engine.startCountdown()
  runCountdown()
  simulate(5000, autoTarget)
  engine.enterSensorError('preview')
} else if (scenario === 'result') {
  cfg.patch({ durationSec: 30 }, 'preview')
  engine.prepare()
  engine.startCountdown()
  runCountdown()
  simulate(26000, autoTarget)
  engine.finish('timeout')
  frozen = true
}

// ---------------------------------------------------------------- 循环
let last = 0
function loop(ts) {
  const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60
  last = ts
  if (!frozen) {
    clock.advance(dt * 1000)
    if (engine.state === 'PLAYING') autoTarget()
    engine.update(dt)
    engine.drainEvents()
  }
  renderer.render(frozen ? 0 : dt, Date.now())
  updateStateText()
  window.requestAnimationFrame(loop)
}

const STATE_TEXT = {
  IDLE: '介绍页',
  READY: '准备页',
  CALIBRATING: '标定中',
  COUNTDOWN: '预备拍',
  PLAYING: '游戏中',
  PAUSED: '已暂停',
  SENSOR_ERROR: '信号中断',
  RESULT: '结算页',
  ABORTED: '已中止'
}

function updateStateText() {
  const el = document.getElementById('state')
  if (el) el.textContent = (frozen ? '（已定格）' : '') + (STATE_TEXT[engine.state] || engine.state)
  const live = document.getElementById('live')
  if (live) {
    live.textContent = '得分 ' + engine.score.total +
      ' · P ' + engine.score.perfect + ' / G ' + engine.score.great + ' / GD ' + engine.score.good +
      ' · MISS ' + engine.score.miss + ' · 连击 ' + engine.score.combo +
      ' · 音符 ' + engine.active.length + ' · 时间 ' + (clock.t / 1000).toFixed(1) + 's'
  }
}

function bind(id, fn) {
  const el = document.getElementById(id)
  if (el) el.addEventListener('click', fn)
}

bind('btn-intro', () => { frozen = false; engine.toIntro() })
bind('btn-prepare', () => { frozen = false; engine.prepare() })
bind('btn-play', () => {
  frozen = false
  engine.prepare()
  engine.startCountdown()
})
bind('btn-fast', () => {
  if (engine.state === 'COUNTDOWN') runCountdown()
  simulate(4000, autoTarget)
})
bind('btn-pause', () => { frozen = false; engine.togglePause() })
bind('btn-sensor', () => { frozen = false; engine.enterSensorError('preview') })
bind('btn-result', () => {
  frozen = false
  if (engine.state === 'PLAYING' || engine.state === 'PAUSED') engine.finish('timeout')
})
bind('btn-freeze', () => { frozen = true })

const simX = document.getElementById('sim-x')
if (simX) {
  simX.addEventListener('input', () => {
    engine.setSimTarget(Number(simX.value))
    const lx = document.getElementById('sim-x-val')
    if (lx) lx.textContent = Number(simX.value).toFixed(2)
  })
}

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  const x = (e.clientX - rect.left) * (CSS_W / rect.width)
  const y = (e.clientY - rect.top) * (CSS_H / rect.height)
  const id = renderer.hitTest(x, y)
  if (!id) return
  renderer.markPress(id)
  handleAction(id)
})

function handleAction(id) {
  if (id === 'start') { engine.prepare(); return }
  if (id === 'back') { engine.toIntro(); return }
  if (id === 'calibrate') { engine.calibrate(); return }
  if (id === 'enter') { engine.startCountdown(); return }
  if (id === 'pause') { engine.togglePause(); return }
  if (id === 'resume') { engine.resume(); return }
  if (id === 'again' || id === 'restart') { engine.startCountdown(); return }
  if (id === 'calib:play') { engine.previewing ? engine.stopPreview() : engine.startPreview(); return }
  if (id === 'calib:minus') { cfg.set('syncOffsetMs', (Number(cfg.get('syncOffsetMs')) || 0) - 5); return }
  if (id === 'calib:plus') { cfg.set('syncOffsetMs', (Number(cfg.get('syncOffsetMs')) || 0) + 5); return }
  if (id === 'beat') { cfg.set('beatPulseOn', !cfg.get('beatPulseOn')); return }
  if (id === 'vol') { cfg.set('musicVolume', ((Number(cfg.get('musicVolume')) || 0.7) + 0.3) % 1.1); return }
  if (id.indexOf('song:') === 0) { cfg.set('songId', id.slice(5)); engine.syncSong(); clock.setSong(engine.song); return }
  if (id.indexOf('lv:') === 0) { cfg.applyDifficulty(Number(id.slice(3))); return }
  if (id === 'sim:left') { engine.nudgeSim(-0.45); return }
  if (id === 'sim:right') { engine.nudgeSim(0.45); return }
  if (id === 'sim:center') { engine.centerSim(); return }
  if (id === 'sim:force-left') { engine.debugPushNote('left', 1400); return }
  if (id === 'sim:force-right') { engine.debugPushNote('right', 1400); return }
  if (id === 'sim:lost') { engine.enterSensorError('sim'); return }
  if (id === 'quit' || id === 'exit' || id === 'home') { engine.finish('aborted'); return }
  renderer.showHint('预览页不跳转：' + id, '#B9F4FF')
}

if (scenario !== 'bg') window.requestAnimationFrame(loop)
void stateText
