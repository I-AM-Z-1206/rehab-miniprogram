// ============================================================================
// utils/game/pose.js —— 体感姿态映射（PoseTracker）
// ----------------------------------------------------------------------------
// 输入：WitMotion 传感器帧（已由 utils/zero.js 扣掉虚拟零点）
//
// 实机佩戴约定（以真机反馈为准）：
//   左右移动读取 Pitch 轴（实测该轴对应左右方向）；Roll 只做缓存，不参与左右移动。
//   （传感器按右手系 X+ 朝前安装，但实测 Roll/Pitch 与直觉轴不同，以患者左右
//    移动时能正确控制为准。）
//   游戏小人按“镜像”方式跟随患者：Pitch 取反后再映射到屏幕 x；
//   同时保留 bodyAngle 作为身体真实方向，用于倾角显示与回中提示。
//   不再提供「左右轴切换 / 左右反向」开关。
//
// 输出：
//   angle      镜像后的角色横向角（°，正 = 屏幕右侧，用于摆位置）
//   bodyAngle  患者身体真实倾角（°，正 = 患者右侧，用于 HUD / 回中提示）
//   norm       -1(左) … 0(中) … +1(右)
//   x01        屏幕横向归一化位置 0…1（用于摆放角色 / 准星）
//   inZone     是否仍保持在治疗师允许的偏离范围内（|bodyAngle| <= keepRangeDeg）
//   dir        'left' | 'right' | 'center'（按 bodyAngle 判定，带滞回，避免抖动刷屏）
//   stale      传感器是否掉线（>1.2s 没有新帧）
//
// 治疗师通过「允许偏离角度」定义保持范围：出界 → 停止基础分并提示回到中间，
// 但子弹仍然继续发射（见 engine.js）。
// ============================================================================

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

// 角色按产品要求做镜像（Pitch 取反）后再映射到屏幕。
// 如整套佩戴方向相反，只需改这一个符号，不再提供左右轴/反向开关。
const MIRROR_SIGN = -1

class PoseTracker {
  constructor(cfg) {
    this.cfg = cfg
    this.roll = 0
    this.pitch = 0
    this.angle = 0       // 镜像后的角色横向角度（用于摆位置）
    this.bodyAngle = 0   // 患者身体实际倾角（用于显示与回中提示）
    this.norm = 0
    this.x01 = 0.5
    this.inZone = true
    this.dir = 'center'
    this.stale = true
    this.hasSignal = false
    this.lastSignalAt = 0
    this.simAngle = 0     // 触屏模拟倾角
    this.age = 0
    // 实际收到的传感器帧率（每秒统计一次）
    this.rateHz = 0
    this._rateAt = 0
    this._rateCount = 0
  }

  /** 传感器数据帧：{ roll, pitch } —— 只要带 roll/pitch 的帧就刷新信号时间 */
  feed(frame) {
    if (!frame) return
    if (typeof frame.roll === 'number') this.roll = frame.roll
    if (typeof frame.pitch === 'number') this.pitch = frame.pitch
    if (typeof frame.roll === 'number' || typeof frame.pitch === 'number') {
      this.hasSignal = true
      this.lastSignalAt = Date.now()
      this.stale = false
      // 帧率统计（1s 窗口）
      const now = this.lastSignalAt
      if (!this._rateAt) {
        this._rateAt = now
        this._rateCount = 0
      }
      this._rateCount += 1
      const span = now - this._rateAt
      if (span >= 1000) {
        this.rateHz = Math.round((this._rateCount * 1000) / span)
        this._rateAt = now
        this._rateCount = 0
      }
    }
  }

  /** 触屏模拟（未连接传感器 / 没有真机时用来演示） */
  setSimAngle(deg) {
    this.simAngle = deg
  }

  isSimulating() {
    return this.stale || !this.hasSignal
  }

  /** 左右移动读取的原始角度：按实机佩戴方向，Pitch 对应左右 */
  rawAngle() {
    return this.pitch
  }

  /** 每帧更新（now 为引擎时间戳，dt 用于做帧率无关的平滑） */
  update(now, dt) {
    const age = now - this.lastSignalAt
    if (this.hasSignal && age > 1200) this.stale = true
    this.age = age

    const cfg = this.cfg
    // 小人做固定镜像（Pitch 取反）；触屏模拟本身已是屏幕方向，不取反。
    // bodyAngle 始终保留患者身体的真实方向，避免“小人镜像”把回中提示带反。
    const raw = this.rawAngle()
    const target = this.stale ? this.simAngle : MIRROR_SIGN * raw
    const targetBody = this.stale ? this.simAngle : raw

    // 一阶低通（EMA）平滑：smooth 越大越跟手、越小越平滑。
    // 按 dt 换算，保证 30fps / 60fps 下手感一致；最低 0.5，避免旧配置 0.3 造成明显拖尾。
    const smoothCfg = Number(cfg.get('smooth'))
    const base = clamp(isFinite(smoothCfg) ? Math.max(0.5, smoothCfg) : 0.6, 0.05, 1)
    const step = clamp(Number(dt) || 1 / 60, 0.001, 0.1)
    const alpha = 1 - Math.pow(1 - base, step * 60)
    this.angle += (target - this.angle) * alpha
    this.bodyAngle += (targetBody - this.bodyAngle) * alpha

    // 中心死区
    const dead = Number(cfg.get('deadzoneDeg')) || 0
    let v = this.angle
    if (Math.abs(v) < dead) v = 0
    let bodyV = this.bodyAngle
    if (Math.abs(bodyV) < dead) bodyV = 0

    const maxLean = Math.max(5, Number(cfg.get('maxLeanDeg')) || 20)
    const keep = Math.max(1, Number(cfg.get('keepRangeDeg')) || 6)

    this.norm = clamp(v / maxLean, -1, 1)
    this.x01 = (this.norm + 1) / 2
    this.inZone = Math.abs(bodyV) <= keep + 0.001

    // 左右方向（滞回 2°）：这里用身体真实方向，保证回中提示不因小人镜像而反掉
    const thr = 2
    if (bodyV < -thr) this.dir = 'left'
    else if (bodyV > thr) this.dir = 'right'
    else this.dir = 'center'

    return this
  }

  /** 当前患者身体偏离角度（°），用于 HUD / 页面显示 */
  getAngle() {
    return Math.round(this.bodyAngle * 10) / 10
  }

  /** 保持范围内还剩多少余量（0…1），用于画进度条 */
  zoneRatio() {
    const keep = Math.max(1, Number(this.cfg.get('keepRangeDeg')) || 6)
    return clamp(1 - Math.abs(this.bodyAngle) / keep, 0, 1)
  }

  reset() {
    this.angle = 0
    this.bodyAngle = 0
    this.norm = 0
    this.x01 = 0.5
    this.inZone = true
    this.dir = 'center'
  }
}

module.exports = { PoseTracker }
