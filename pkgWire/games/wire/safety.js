// ============================================================================
// games/wire/safety.js —— 保险绳状态机
// ----------------------------------------------------------------------------
// 状态：IDLE → WARN → ENGAGED → RECOVERING → IDLE
//
// 关键规则（对应需求「保险绳机制」）：
//  · 偏移超过警戒阈值 → WARN，只提示，不判负、不停游戏。
//  · 继续增大到触发阈值 → ENGAGED：绳索介入、把角色轻拉回中线、平衡不再恶化，
//    但**不会**结束本局，也**不会**清空本局得分。
//  · 回到解除阈值以下并保持 ropeHoldMs → RECOVERING → IDLE，退出后进入冷却，
//    冷却期内的抖动不会立刻再次触发（避免边界反复触发）。
//  · 保险绳关闭时本机不介入，越界规则交由引擎按 failRule 处理。
//
// 阈值使用的是「归一化偏移量」load ∈ [0,1]，不是角度、不是厘米。
// ============================================================================

const SAFETY_STATE = {
  IDLE: 'IDLE',
  WARN: 'WARN',
  ENGAGED: 'ENGAGED',
  RECOVERING: 'RECOVERING'
}

class SafetyRope {
  constructor(cfg) {
    this.cfg = cfg
    this.reset()
  }

  reset() {
    this.state = SAFETY_STATE.IDLE
    this.enabled = true
    this.tension = 0 // 0~1：绳索绷紧程度（渲染用）
    this.triggers = 0 // 本局触发次数
    this.engagedSec = 0 // 绳索介入累计时长
    this.longestEngage = 0
    this._engagedStart = 0
    this._holdStart = 0
    this._lastEndAt = 0
    this._warned = false
    this.events = []
  }

  get engaged() {
    return this.state === SAFETY_STATE.ENGAGED
  }

  get warning() {
    return this.state === SAFETY_STATE.WARN || this.state === SAFETY_STATE.ENGAGED
  }

  getStateLabel() {
    if (!this.enabled) return '已关闭'
    if (this.state === SAFETY_STATE.ENGAGED) return '已介入'
    if (this.state === SAFETY_STATE.RECOVERING) return '正在解除'
    if (this.state === SAFETY_STATE.WARN) return '待命（需回正）'
    return '待命'
  }

  /** HUD 用的短文案 */
  getShortLabel() {
    if (!this.enabled) return '关闭'
    if (this.state === SAFETY_STATE.ENGAGED) return '已介入'
    if (this.state === SAFETY_STATE.RECOVERING) return '解除中'
    return '待命'
  }

  _push(type, extra) {
    this.events.push(Object.assign({ type: type, at: Date.now() }, extra || {}))
  }

  /**
   * @param {number} dt 秒
   * @param {number} load 原始归一化偏移（0~1），用未经过回拉抑制的值
   */
  update(dt, load) {
    const cfg = this.cfg
    const now = Date.now()
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0))
    this.events = []

    this.enabled = !!cfg.get('ropeEnabled')
    const warn = Number(cfg.get('warnThreshold')) || 0.66
    const trigger = Math.max(warn + 0.02, Number(cfg.get('ropeTrigger')) || 0.88)
    const release = Math.min(trigger - 0.02, Number(cfg.get('ropeRelease')) || 0.52)
    const holdMs = Number(cfg.get('ropeHoldMs')) || 600
    const cooldown = Number(cfg.get('ropeCooldownMs')) || 1500
    const v = Math.max(0, Math.min(1, Number(load) || 0))

    if (!this.enabled) {
      // 关闭时只保留失衡提示，不介入
      if (this.state !== SAFETY_STATE.IDLE) {
        this.state = SAFETY_STATE.IDLE
        this._push('rope:off')
      }
      this.tension += (0 - this.tension) * Math.min(1, step * 4)
      if (v >= warn && !this._warned) {
        this._warned = true
        this._push('warn', { load: v })
      } else if (v < warn * 0.9 && this._warned) {
        this._warned = false
        this._push('warnEnd')
      }
      return this
    }

    switch (this.state) {
      case SAFETY_STATE.IDLE:
        if (v >= trigger && now - this._lastEndAt >= cooldown) {
          this._engage(now, v)
        } else if (v >= warn) {
          this.state = SAFETY_STATE.WARN
          if (!this._warned) {
            this._warned = true
            this._push('warn', { load: v })
          }
        }
        break

      case SAFETY_STATE.WARN:
        if (v >= trigger && now - this._lastEndAt >= cooldown) {
          this._engage(now, v)
        } else if (v < warn * 0.9) {
          this.state = SAFETY_STATE.IDLE
          this._warned = false
          this._push('warnEnd')
        }
        break

      case SAFETY_STATE.ENGAGED:
        this.engagedSec += step
        this.longestEngage = Math.max(this.longestEngage, now - this._engagedStart)
        if (v <= release) {
          this.state = SAFETY_STATE.RECOVERING
          this._holdStart = now
        }
        break

      case SAFETY_STATE.RECOVERING:
        if (v >= trigger) {
          // 刚回正又冲出去：直接回到介入态，不重复计数（同一次失衡）
          this.state = SAFETY_STATE.ENGAGED
          if (!this._engagedStart) this._engagedStart = now
        } else if (v <= release && now - this._holdStart >= holdMs) {
          this.state = SAFETY_STATE.IDLE
          this._lastEndAt = now
          this._warned = v >= warn
          this._engagedStart = 0
          this._push('rope:out', { load: v })
        } else if (v > release) {
          this._holdStart = now
        }
        break

      default:
        this.state = SAFETY_STATE.IDLE
    }

    // 张力：介入时快速绷紧，解除后缓慢松弛
    const target = this.state === SAFETY_STATE.ENGAGED ? 1 : (this.state === SAFETY_STATE.RECOVERING ? 0.45 : 0)
    const rate = target > this.tension ? 5.5 : 2.2
    this.tension += (target - this.tension) * Math.min(1, step * rate)
    this.tension = Math.max(0, Math.min(1, this.tension))

    return this
  }

  _engage(now, load) {
    // 直接冲到触发阈值时也要补一次「失衡」事件，统计才完整
    if (!this._warned) this._push('warn', { load: load })
    this.state = SAFETY_STATE.ENGAGED
    this.triggers += 1
    this._engagedStart = now
    this._warned = true
    this._push('rope:in', { load: load, count: this.triggers })
  }

  /** 介入时对控制量的抑制比例（0~1）：由回拉强度与当前张力决定 */
  getSuppression() {
    if (this.state !== SAFETY_STATE.ENGAGED) return 0
    const pull = Math.max(0, Math.min(1, Number(this.cfg.get('ropePull')) || 0.6))
    return pull * (0.55 + 0.45 * this.tension)
  }

  snapshot() {
    const enabled = !!this.cfg.get('ropeEnabled')
    return {
      state: this.state,
      label: enabled ? this.getStateLabel() : '已关闭',
      short: enabled ? this.getShortLabel() : '关闭',
      enabled: enabled,
      triggers: this.triggers,
      engagedSec: Math.round(this.engagedSec * 10) / 10,
      tension: Math.round(this.tension * 100) / 100
    }
  }
}

module.exports = { SafetyRope, SAFETY_STATE }
