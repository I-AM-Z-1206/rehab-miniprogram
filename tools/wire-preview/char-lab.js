// tools/wire-preview/char-lab.js —— 角色步态对照台（开发用）
// 把同一个 drawWalker 在固定相位下画成一排，用来判断走路循环有没有跳变、
// 抬脚弧线是否连续、以及背影的层次是否读得出来。
// 与游戏共用 pkgWire/games/wire/character.js，不是另外画的示意稿。

const { drawWalker } = require('../../pkgWire/games/wire/character.js')

const params = new URLSearchParams(window.location.search)
const SPEEDS = (params.get('speeds') || '0,0.45,0.85').split(',').map(Number)
const N = Number(params.get('n')) || 8
const CELL_W = Number(params.get('cellw')) || 150
const CELL_H = Number(params.get('cellh')) || 300
// 默认把角色塞满格子（190 是角色原始高度）
const SCALE = Number(params.get('scale')) || (CELL_H - 56) / 190

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

// 背景：取游戏里谷底云海的中段色，角色在后面能不能"站住"一眼就看得出来
function paintBg() {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#8FA2B4')
  g.addColorStop(0.45, '#6C7B93')
  g.addColorStop(1, '#4A5872')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // 几道横向的云层，模拟真实背景的明度分布
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

  // 脚的落脚点画一条基准线，判断抬脚是否离地
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
document.title = 'char-lab ok ' + i
