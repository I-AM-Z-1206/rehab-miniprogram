// ============================================================================
// games/wire/safety.js —— 越界与引导（原「保险绳」，2026-11-01 改语义）
// ----------------------------------------------------------------------------
// 状态：IDLE → WARN → ENGAGED → RECOVERING → IDLE
//
// 【为什么改】原来绳索介入时会**自动把患者拉回中线**：`getSuppression()`
// 把控制量乘 (1 - ropePull × 张力)，第 2 档 ropePull = 0.6 —— 患者身体偏到
// 1.0，游戏只按 0.4 算。等于「游戏替你站稳」。康复训练里这是最不该做的：
// 患者学不到「自己把重心找回来」这件事本身。
//
// 现在绳索**不再碰控制量**，它只做三件事：
//   1. 判断失衡等级（失衡 / 越界），给引擎决定「要不要停下来」；
//   2. 给出**引导方向**（该往哪边压回去），渲染层据此画方向光带与角色倾斜；
//   3. 记录次数与时长（治疗师要看的指标）。
//
// 也就是说：**回正是患者自己做出来的，游戏只负责让他知道往哪边、并且在他
// 没做到的时候不再假装走得很顺。**
//
// 阈值使用「归一化偏移量」load ∈ [0,1]，不是角度、不是厘米。
// ============================================================================

const SAFETY_STATE = {
  IDLE: 'IDLE',
  WARN: 'WARN',
  ENGAGED: 'ENGAGED',
  RECOVERING: 'RECOVERING'
}

// 失衡等级：0 正常 / 1 失衡（还能走，但变慢）/ 2 越界（几乎停住）
const LEVEL = { OK: 0, WARN: 1, OVER: 2 }

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
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
    this.triggers = 0 // 本局越界次数
    this.engagedSec = 0 // 越界累计时长
    this.longestEngage = 0
    this.warnSec = 0 // 失衡累计时长
    this.level = LEVEL.OK
    this.guideDir = 0 // -1 往左压 / 1 往右压 / 0 不用引导
    this.guideAxis = '' // 'x' 左右（有光带） / 'y' 前后（只有语音） / '' 无
    this.guideStrength = 0 // 0~1：引导强度（光带亮度、语音频次）
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

  /** 该往哪边压：nx > 0（偏右）→ 要往左压 → -1 */
  getStateLabel() {
    if (!this.enabled) return '已关闭'
    if (this.state === SAFETY_STATE.ENGAGED) return '越界：请回正'
    if (this.state === SAFETY_STATE.RECOVERING) return '正在回正'
    if (this.state === SAFETY_STATE.WARN) return '失衡：请回正'
    return '待命'
  }

  /** HUD 用的短文案 */
  getShortLabel() {
    if (!this.enabled) return '关闭'
    if (this.state === SAFETY_STATE.ENGAGED) return '越界'
    if (this.state === SAFETY_STATE.RECOVERING) return '回正中'
    if (this.state === SAFETY_STATE.WARN) return '失衡'
    return '待命'
  }

  _push(type, extra) {
    this.events.push(Object.assign({ type: type, at: Date.now() }, extra || {}))
  }

  /**
   * @param {object} o
   *   dt    秒
   *   load  归一化偏移量 0~1（原始值，不经过任何抑制）
   *   nx    带符号的左右偏移 -1~1（用来算引导方向）
   *   ny    前后偏移
   */
  update(o) {
    const opts = o || {}
    const cfg = this.cfg
    const now = Date.now()
    const step = Math.max(0, Math.min(0.1, Number(opts.dt) || 0))
    const nx = Number(opts.nx) || 0
    const ny = Number(opts.ny) || 0
    this.events = []

    this.enabled = !!cfg.get('ropeEnabled')
    const warn = Number(cfg.get('warnThreshold')) || 0.66
    const trigger = Math.max(warn + 0.02, Number(cfg.get('ropeTrigger')) || 0.88)
    const release = Math.min(trigger - 0.02, Number(cfg.get('ropeRelease')) || 0.52)
    const holdMs = Number(cfg.get('ropeHoldMs')) || 600
    const cooldown = Number(cfg.get('ropeCooldownMs')) || 1500
    const v = clamp(Number(opts.load) || 0, 0, 1)

    // ---- 引导方向：怎么歪的就反着压回去 ----
    // 前后和左右哪个更大就先说哪个；都在死区里就不给方向。
    //
    // **左右才有光带，前后只用语音**。理由是很具体的：一道横向光带能直接
    // 表示「重心往这边移」，而前后失衡（往前栽/往后仰）用同样的光带画出来
    // 只能横着指，读起来是错的；竖着画又会和钢丝、绳索抢同一条轴线。
    // 前后失衡在康复里的处置本来就是口令（「收腹」「重心往后」），所以交给语音。
    const ax = Math.abs(nx)
    const ay = Math.abs(ny)
    this.guideAxis = ''
    if (v < 0.22) {
      this.guideDir = 0
    } else if (ax >= ay) {
      this.guideDir = nx > 0 ? -1 : 1
      this.guideAxis = 'x'
    } else {
      this.guideDir = 0
      this.guideAxis = 'y'
    }
    const pull = clamp(Number(cfg.get('ropePull')) || 0.6, 0, 1)
    this.guideStrength = this.guideDir === 0 ? 0 : clamp(pull * (0.35 + 0.65 * (v / Math.max(0.01, trigger))), 0, 1)

    if (!this.enabled) {
      // 关闭「越界停住」时只保留失衡提示，不介入也不减速
      if (this.state !== SAFETY_STATE.IDLE) {
        this.state = SAFETY_STATE.IDLE
        this._push('rope:off')
      }
      this.level = v >= warn ? LEVEL.WARN : LEVEL.OK
      this.tension += (0 - this.tension) * Math.min(1, step * 4)
      if (v >= warn && !this._warned) {
        this._warned = true
        this._push('warn', { load: v, dir: this.guideDir })
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
            this._push('warn', { load: v, dir: this.guideDir })
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
          // 刚回正又冲出去：算同一次越界，不重复计数
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

    if (this.state === SAFETY_STATE.WARN || this.state === SAFETY_STATE.ENGAGED) {
      this.warnSec += step
    }

    this.level = this.state === SAFETY_STATE.ENGAGED ? LEVEL.OVER
      : (this.state === SAFETY_STATE.WARN || this.state === SAFETY_STATE.RECOVERING ? LEVEL.WARN : LEVEL.OK)

    // 张力：越界时快速绷紧，其它情况缓慢松弛
    const target = this.state === SAFETY_STATE.ENGAGED ? 1 : (this.state === SAFETY_STATE.RECOVERING ? 0.45 : 0)
    const rate = target > this.tension ? 5.5 : 2.2
    this.tension += (target - this.tension) * Math.min(1, step * rate)
    this.tension = clamp(this.tension, 0, 1)

    return this
  }

  _engage(now, load) {
    if (!this._warned) this._push('warn', { load: load, dir: this.guideDir })
    this.state = SAFETY_STATE.ENGAGED
    this.triggers += 1
    this._engagedStart = now
    this._warned = true
    this._push('rope:in', { load: load, count: this.triggers, dir: this.guideDir })
  }

  snapshot() {
    const enabled = !!this.cfg.get('ropeEnabled')
    return {
      state: this.state,
      label: enabled ? this.getStateLabel() : '已关闭',
      short: enabled ? this.getShortLabel() : '关闭',
      enabled: enabled,
      level: this.level,
      guideDir: this.guideDir,
      guideAxis: this.guideAxis,
      guideStrength: Math.round(this.guideStrength * 100) / 100,
      triggers: this.triggers,
      engagedSec: Math.round(this.engagedSec * 10) / 10,
      warnSec: Math.round(this.warnSec * 10) / 10,
      tension: Math.round(this.tension * 100) / 100
    }
  }
}

module.exports = { SafetyRope, SAFETY_STATE, LEVEL }
