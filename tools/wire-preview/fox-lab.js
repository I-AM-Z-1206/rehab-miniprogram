// tools/wire-preview/fox-lab.js —— 小狐狸角色步态对照台（开发用）
const { drawWalker } = require('../../pkgWire/games/wire/character-fox.js')

const params = new URLSearchParams(window.location.search)
const SPEEDS = (params.get('speeds') || '0,0.45,0.85').split(',').map(Number)
const N = Number(params.get('n')) || 8
const CELL_W = Number(params.get('cellw')) || 150
const CELL_H = Number(params.get('cellh')) || 300
const SCALE = Number(params.get('scale')) || (CELL_H - 56) / 185

const canvas = document.getElementById('c')
const dpr = Math.min(window.devicePixelRatio || 2, 2)
const W = CELL_W * N
const H = CELL_H * SPEEDS.length
canvas.width = W * dpr
canvas.height = H * dpr
canvas.style.width = W + 'px'
canvas.style.height = H + 'px'
const ctx = canvas.getContext('2d')
ctx.scale(dpr, dpr)

function paintBg() {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#8FA2B4')
  g.addColorStop(0.45, '#6C7B93')
  g.addColorStop(1, '#4A5872')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  for (let i = 0; i < 12; i++) {
    const y = H * (0.10 + i * 0.075)
    ctx.beginPath()
    ctx.moveTo(0, y)
    for (let x = 0; x <= W; x += 20) {
      ctx.lineTo(x, y + Math.sin(x * 0.012 + i) * 7)
    }
    ctx.lineWidth = 16
    ctx.strokeStyle = i % 2 ? 'rgba(226,236,242,0.20)' : 'rgba(232,240,246,0.13)'
    ctx.stroke()
  }
}

function frame(walkPhase, speed, idx, row) {
  const cx = idx * CELL_W + CELL_W / 2
  const feetY = row * CELL_H + CELL_H - 34

  ctx.beginPath()
  ctx.moveTo(cx - 46, feetY + 0.5)
  ctx.lineTo(cx + 46, feetY + 0.5)
  ctx.setLineDash([3, 4])
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(20,32,44,0.45)'
  ctx.stroke()
  ctx.setLineDash([])

  drawWalker(ctx, {
    x: cx,
    y: feetY,
    scale: SCALE,
    lean: 0,
    walkPhase: walkPhase,
    balance: 1,
    ropeTension: 0,
    speedRatio: speed,
    t: 0.35
  })

  ctx.font = '600 11px "PingFang SC", monospace'
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(238,246,250,0.82)'
  ctx.fillText((walkPhase / Math.PI).toFixed(2) + 'π', cx, row * CELL_H + 16)
  if (idx === 0) {
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,222,178,0.92)'
    ctx.fillText('speed ' + speed.toFixed(2), 8, row * CELL_H + CELL_H - 10)
  }
}

paintBg()
let i = 0
SPEEDS.forEach((sp, r) => {
  for (let k = 0; k < N; k++) {
    frame((k / N) * Math.PI * 2, sp, k, r)
    i++
  }
})
document.title = 'fox-lab ok ' + i
