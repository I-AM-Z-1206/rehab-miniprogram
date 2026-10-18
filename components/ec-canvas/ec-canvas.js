// ec-canvas.js —— ECharts 小程序图表组件（CommonJS 版，源自 echarts-for-weixin）
// 用法：
//   <ec-canvas id="mychart" canvas-id="mychart" ec="{{ ec }}"></ec-canvas>
//   页面里 ec 对象：{ onInit(canvas,width,height,dpr){ return echarts.init(...) } } 或 { lazyLoad: true }
//   lazyLoad 模式下由页面调用 this.selectComponent('#mychart').init(callback)
const WxCanvas = require('./wx-canvas.js')
const echarts = require('./echarts.js')

function compareVersion(v1, v2) {
  v1 = v1.split('.')
  v2 = v2.split('.')
  const len = Math.max(v1.length, v2.length)
  while (v1.length < len) v1.push('0')
  while (v2.length < len) v2.push('0')
  for (let i = 0; i < len; i++) {
    const num1 = parseInt(v1[i])
    const num2 = parseInt(v2[i])
    if (num1 > num2) return 1
    else if (num1 < num2) return -1
  }
  return 0
}

Component({
  properties: {
    canvasId: {
      type: String,
      value: 'ec-canvas'
    },
    ec: {
      type: Object
    },
    forceUseOldCanvas: {
      type: Boolean,
      value: false
    }
  },

  data: {
    isUseNewCanvas: false
  },

  lifetimes: {
    ready: function () {
      // 小程序 canvas 不支持 DOM 参数，关闭 progressive 渲染
      echarts.registerPreprocessor(option => {
        if (option && option.series) {
          if (option.series.length > 0) {
            option.series.forEach(series => { series.progressive = 0 })
          } else if (typeof option.series === 'object') {
            option.series.progressive = 0
          }
        }
      })

      if (!this.data.ec) {
        console.warn('组件需绑定 ec 变量，例：<ec-canvas id="mychart" ec="{{ ec }}"></ec-canvas>')
        return
      }

      if (!this.data.ec.lazyLoad) {
        this.init()
      }
    }
  },

  methods: {
    init: function (callback) {
      let version = ''
      try {
        version = (wx.getSystemInfoSync && wx.getSystemInfoSync().SDKVersion) || '2.9.0'
      } catch (e) {
        version = '2.9.0'
      }

      const canUseNewCanvas = compareVersion(version, '2.9.0') >= 0
      const forceUseOldCanvas = this.data.forceUseOldCanvas
      const isUseNewCanvas = canUseNewCanvas && !forceUseOldCanvas
      this.setData({ isUseNewCanvas })

      if (isUseNewCanvas) {
        this.initByNewWay(callback)
      } else {
        this.initByOldWay(callback)
      }
    },

    initByOldWay(callback) {
      const ctx = wx.createCanvasContext(this.data.canvasId, this)
      const canvas = new WxCanvas(ctx, this.data.canvasId, false)
      echarts.setCanvasCreator(() => canvas)

      const query = wx.createSelectorQuery().in(this)
      query.select('.ec-canvas').boundingClientRect(res => {
        const canvasDpr = 1
        if (typeof callback === 'function') {
          this.chart = callback(canvas, res.width, res.height, canvasDpr)
        } else if (this.data.ec && typeof this.data.ec.onInit === 'function') {
          this.chart = this.data.ec.onInit(canvas, res.width, res.height, canvasDpr)
        } else {
          this.triggerEvent('init', {
            canvas: canvas, width: res.width, height: res.height, canvasDpr: canvasDpr
          })
        }
      }).exec()
    },

    initByNewWay(callback) {
      const query = wx.createSelectorQuery().in(this)
      query
        .select('.ec-canvas')
        .fields({ node: true, size: true })
        .exec(res => {
          if (!res || !res[0] || !res[0].node) {
            console.error('[ec-canvas] canvas node 未获取到', res)
            return
          }
          const canvasNode = res[0].node
          this.canvasNode = canvasNode

          const canvasDpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2
          const canvasWidth = res[0].width
          const canvasHeight = res[0].height

          const ctx = canvasNode.getContext('2d')
          const canvas = new WxCanvas(ctx, this.data.canvasId, true, canvasNode)
          echarts.setCanvasCreator(() => canvas)

          if (typeof callback === 'function') {
            this.chart = callback(canvas, canvasWidth, canvasHeight, canvasDpr)
          } else if (this.data.ec && typeof this.data.ec.onInit === 'function') {
            this.chart = this.data.ec.onInit(canvas, canvasWidth, canvasHeight, canvasDpr)
          } else {
            this.triggerEvent('init', {
              canvas: canvas, width: canvasWidth, height: canvasHeight, dpr: canvasDpr
            })
          }
        })
    },

    canvasToTempFilePath(opt) {
      if (this.data.isUseNewCanvas) {
        const query = wx.createSelectorQuery().in(this)
        query.select('.ec-canvas').fields({ node: true, size: true }).exec(res => {
          const canvasNode = res[0].node
          opt.canvas = canvasNode
          wx.canvasToTempFilePath(opt)
        })
      } else {
        if (!opt.canvasId) opt.canvasId = this.data.canvasId
        wx.canvasToTempFilePath(opt, this)
      }
    },

    touchStart(e) {
      if (this.chart && e.touches.length > 0) {
        const touch = e.touches[0]
        const handler = this.chart.getZr().handler
        handler.dispatch('mousedown', { zrX: touch.x, zrY: touch.y })
        handler.dispatch('mousemove', { zrX: touch.x, zrY: touch.y })
        handler.processGesture(wrapTouch(e), 'start')
      }
    },

    touchMove(e) {
      if (this.chart && e.touches.length > 0) {
        const touch = e.touches[0]
        const handler = this.chart.getZr().handler
        handler.dispatch('mousemove', { zrX: touch.x, zrY: touch.y })
        handler.processGesture(wrapTouch(e), 'change')
      }
    },

    touchEnd(e) {
      if (this.chart) {
        const touch = e.changedTouches ? e.changedTouches[0] : {}
        const handler = this.chart.getZr().handler
        handler.dispatch('mouseup', { zrX: touch.x, zrY: touch.y })
        handler.dispatch('click', { zrX: touch.x, zrY: touch.y })
        handler.processGesture(wrapTouch(e), 'end')
      }
    }
  }
})

function wrapTouch(event) {
  for (let i = 0; i < event.touches.length; ++i) {
    const touch = event.touches[i]
    touch.offsetX = touch.x
    touch.offsetY = touch.y
  }
  return event
}
