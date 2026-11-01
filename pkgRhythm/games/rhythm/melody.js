// ============================================================================
// games/rhythm/melody.js —— 命中推进旋律
// ----------------------------------------------------------------------------
// 门控模式下音符是患者自己「叫出来」的，所以音乐不该是旁边放着的一首曲子，
// 而应该是**他每完成一个动作就往前走一步的旋律**。停下来，音乐就悬在那儿等他。
//
// 实现取巧的地方：**只存一个 C5 钟琴音**，播放时改 playbackRate 变调。
//   C5 1.000 / D5 1.125 / E5 1.250 / G5 1.500 / A5 1.667 / C6 2.000
// 微信 InnerAudioContext 支持 0.5~2.0，正好一个八度。变调同时改变时长，
// 但钟琴本来高音余音就短，听起来反而更自然。省掉 5 份素材与 5 次解码。
//
// 六个 InnerAudioContext 按度数各一个（不是复用同一个）：同一个对象在余音
// 未消时再次 play 会硬切，快速连击会听起来像卡带；分池之后余音自然叠加。
//
// 旋律走向（MELODY）是固定的 12 步循环，不用 Math.random ——
// 同一个患者每次练同一首，旋律完全相同，才谈得上「练熟」。
// ============================================================================

const TONE_FILE = '/pkgRhythm/audio/rhythm/tone_c5.wav'

// 五声音阶（C 大调五声：C D E G A）的变调比 + 一个高八度
const DEGREE_RATE = [1.0, 1.125, 1.25, 1.5, 1.667, 2.0]

// 12 步旋律：上下起伏，不出现大跳（康复场景听着不刺耳、也不容易走神）
const MELODY = [0, 2, 4, 3, 1, 2, 0, 3, 4, 2, 1, 3]

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

class Melody {
  /**
   * @param {object} opts { cfg }
   *   cfg 提供 musicVolume / melodyOn / sfxOn
   */
  constructor(opts) {
    const o = opts || {}
    this.cfg = o.cfg || null
    this.pool = []
    this.ok = false
    this.error = ''
    this.created = false
  }

  get enabled() {
    if (!this.cfg) return false
    if (!this.cfg.get('melodyOn')) return false
    const v = Number(this.cfg.get('musicVolume'))
    return !(isFinite(v) && v <= 0)
  }

  volume() {
    const v = Number(this.cfg && this.cfg.get('musicVolume'))
    const base = isFinite(v) ? clamp(v, 0, 1) : 0.7
    // 0.55：命中音要清楚但不能盖过语音播报
    return clamp(base * 0.55, 0, 1)
  }

  /** 延迟到真正开局再建音频对象：避免一进页面就占 6 个音频句柄 */
  _ensure() {
    if (this.created) return this.ok
    this.created = true
    if (typeof wx === 'undefined' || !wx.createInnerAudioContext) {
      this.ok = false
      this.error = 'no-wx'
      return false
    }
    try {
      const vol = this.volume()
      for (let i = 0; i < DEGREE_RATE.length; i++) {
        const a = wx.createInnerAudioContext()
        a.src = TONE_FILE
        a.volume = vol
        a.obeyMuteSwitch = false
        a.playbackRate = DEGREE_RATE[i]
        // 单个音失败不影响其他音，也不弹错
        a.onError(() => { this.error = 'audio-error' })
        this.pool.push(a)
      }
      this.ok = this.pool.length > 0
    } catch (e) {
      this.ok = false
      this.error = 'create-failed'
    }
    return this.ok
  }

  /** 音高：由「完成到第几个」决定。强拍落在主音上，句子有头有尾 */
  degreeFor(step, accent) {
    const s = Math.max(0, Math.round(Number(step) || 0))
    if (accent) return 0
    return MELODY[(s - 1 + MELODY.length) % MELODY.length] % DEGREE_RATE.length
  }

  /**
   * 完成一个音符时调用
   * @param {number} step 已经完成到第几个（1 起）
   * @param {object} opts { accent }
   */
  play(step, opts) {
    if (!this.enabled) return false
    if (!this._ensure()) return false
    const o = opts || {}
    const deg = this.degreeFor(step, o.accent)
    const a = this.pool[deg]
    if (!a) return false
    try {
      a.volume = this.volume()
      try { a.playbackRate = DEGREE_RATE[deg] } catch (e) { /* 少数机型只读 */ }
      try { a.seek(0) } catch (e) { /* 未加载时 seek 会抛，忽略 */ }
      a.play()
      return true
    } catch (e) {
      return false
    }
  }

  /** 音量改了之后调用（设置页） */
  syncVolume() {
    if (!this.pool.length) return
    const vol = this.volume()
    for (let i = 0; i < this.pool.length; i++) {
      try { this.pool[i].volume = vol } catch (e) { /* 忽略 */ }
    }
  }

  stop() {
    for (let i = 0; i < this.pool.length; i++) {
      try { this.pool[i].stop() } catch (e) { /* 忽略 */ }
    }
  }

  destroy() {
    this.stop()
    for (let i = 0; i < this.pool.length; i++) {
      try { this.pool[i].destroy() } catch (e) { /* 忽略 */ }
    }
    this.pool = []
    this.created = false
    this.ok = false
  }
}

module.exports = { Melody, MELODY, DEGREE_RATE, TONE_FILE }
