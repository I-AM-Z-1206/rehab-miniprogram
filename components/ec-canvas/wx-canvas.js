// wx-canvas.js —— ECharts 小程序 Canvas 适配层（CommonJS 版，源自 echarts-for-weixin）
// 作用：把小程序的 canvas 2d context 包装成 ECharts/zrender 能用的 canvas 对象，
//       补齐 width/height、measureText、requestAnimationFrame、事件派发等能力。
class WxCanvas {
  constructor(ctx, canvasId, isNew, canvasNode) {
    this.ctx = ctx
    this.canvasId = canvasId
    this.chart = null
    this.isNew = isNew
    if (isNew) {
      this.canvasNode = canvasNode
    } else {
      this._initStyle(ctx)
    }
    this._initEvent()
  }

  getContext(contextType) {
    if (contextType === '2d') return this.ctx
  }

  setChart(chart) {
    this.chart = chart
  }

  attachEvent() {
    // noop
  }

  detachEvent() {
    // noop
  }

  // zrender 初始化时会把 canvas 当 DOM 元素用，这里补齐最小 DOM 能力，避免
  // "r.addEventListener is not a function"。触摸事件由 ec-canvas 组件手动 dispatch
  addEventListener() { /* noop */ }
  removeEventListener() { /* noop */ }
  setAttribute() { /* noop */ }
  removeAttribute() { /* noop */ }
  getBoundingClientRect() {
    return { left: 0, top: 0, right: this.width, bottom: this.height, width: this.width, height: this.height }
  }

  _initStyle(ctx) {
    const styles = ['fillStyle', 'strokeStyle', 'globalAlpha',
      'textAlign', 'textBaseAlign', 'shadow', 'lineWidth',
      'lineCap', 'lineJoin', 'lineDash', 'miterLimit', 'fontSize']

    styles.forEach(style => {
      Object.defineProperty(ctx, style, {
        set: value => {
          if ((style !== 'fillStyle' && style !== 'strokeStyle') ||
            (value !== 'none' && value !== null)) {
            ctx['set' + style.charAt(0).toUpperCase() + style.slice(1)](value)
          }
        }
      })
    })

    ctx.createRadialGradient = () => {
      return ctx.createCircularGradient(arguments)
    }
  }

  _initEvent() {
    this.event = {}
    const eventNames = [{
      wxName: 'touchStart', ecName: 'mousedown'
    }, {
      wxName: 'touchMove', ecName: 'mousemove'
    }, {
      wxName: 'touchEnd', ecName: 'mouseup'
    }, {
      wxName: 'touchEnd', ecName: 'click'
    }]

    eventNames.forEach(name => {
      this.event[name.wxName] = e => {
        const touch = e.touches[0]
        this.chart.getZr().handler.dispatch(name.ecName, {
          zrX: name.wxName === 'tap' ? touch.clientX : touch.x,
          zrY: name.wxName === 'tap' ? touch.clientY : touch.y
        })
      }
    })
  }

  set width(w) {
    if (this.canvasNode) this.canvasNode.width = w
  }
  set height(h) {
    if (this.canvasNode) this.canvasNode.height = h
  }
  get width() {
    return this.canvasNode ? this.canvasNode.width : 0
  }
  get height() {
    return this.canvasNode ? this.canvasNode.height : 0
  }
}

module.exports = WxCanvas
