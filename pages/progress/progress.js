// progress.js —— 我的进步（患者端）
//
// 首页那张卡只回答「我变好没有」。这页回答「哪个游戏在进步、我练得多不多」。
// 数据全部来自 utils/progress.js，页面只管排版和画一条线。
const progress = require('../../utils/progress.js')
const { LineChart } = require('../../utils/lightchart.js')

// 少于 3 次不画线：一周三四次训练，一两次的波动会被当成趋势
const CHART_MIN = 3

Page({
  data: {
    ready: false,
    tone: 'none',
    headline: '--',
    detailText: '',
    arrow: '',
    week: [],
    trainedDays: 0,
    trendCount: 0,
    hasChart: false,
    games: [],
    totalCount: 0,
    totalMinutes: 0
  },

  onLoad() {
    this.load()
  },

  onShow() {
    // 从游戏页回来可能刚练完一局，重新读一次
    if (this.data.ready) this.load()
  },

  onUnload() {
    this.trendChart = null
  },

  load() {
    let d
    try {
      d = progress.detail()
    } catch (e) {
      console.error('[progress] 读取失败', e)
      return
    }
    const desc = progress.describe(d)
    const trainedDays = d.week.filter((w) => w.trained).length
    const games = d.byGame.map((g) => {
      const dlt = g.delta
      let tone = 'none'
      if (dlt != null) {
        tone = Math.abs(dlt) < progress.FLAT_BAND ? 'flat' : (dlt > 0 ? 'up' : 'down')
      }
      return {
        name: g.name,
        count: g.count,
        value: g.stability == null ? '--' : Math.round(g.stability * 100) + '%',
        // 变化用百分点整数，带符号；0 不显示，避免「+0」这种噪音
        delta: dlt == null || Math.round(Math.abs(dlt) * 100) === 0
          ? ''
          : (dlt > 0 ? '+' : '-') + Math.round(Math.abs(dlt) * 100),
        tone: tone
      }
    })

    this.setData({
      ready: true,
      tone: desc.tone,
      headline: desc.headline,
      detailText: desc.detail,
      arrow: desc.tone === 'up' ? '\u2191' : (desc.tone === 'down' ? '\u2193' : (desc.tone === 'flat' ? '\u2192' : '')),
      week: d.week,
      trainedDays: trainedDays,
      trendCount: d.trend.count,
      hasChart: d.trend.count >= CHART_MIN,
      games: games,
      totalCount: d.totalCount,
      totalMinutes: d.totalMinutes
    }, () => {
      if (d.trend.count >= CHART_MIN) this.drawTrend(d.trend)
    })
  },

  /** 画稳定率走势。canvas 节点可能还没布局完，量到 0 宽就直接放弃（下次进来再画） */
  drawTrend(trend) {
    if (!trend || !trend.values || trend.values.length < CHART_MIN) return
    wx.createSelectorQuery().in(this).select('#chartTrend').fields({ node: true, size: true }).exec((res) => {
      const info = res && res[0]
      if (!info || !info.node || !info.width || !info.height) return
      if (!this.trendChart) {
        this.trendChart = new LineChart(info.node, {
          series: [{ color: '#0f9c8c', fill: 'rgba(15, 156, 140, 0.10)' }],
          unit: '%',
          showXAxis: true
        })
        this.trendChart.setSize(info.width, info.height, this.getDpr())
      }
      this.trendChart.setData(trend.labels, [trend.values])
    })
  },

  getDpr() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      return Math.min(info.pixelRatio || 2, 2)
    } catch (e) {
      return 2
    }
  },

  goGames() {
    wx.switchTab({ url: '/pages/games/games' })
  }
})
