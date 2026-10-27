// ============================================================================
// games/rhythm/beat-clock.js —— 音乐时钟（节拍与音符时间的唯一时间基准）
// ----------------------------------------------------------------------------
// 设计要点：
//   1. 主时钟用**单调递增**的 performance.now()（小程序里是 Date.now 兜底），
//      不用系统时间戳做差值，避免改时间/校时让节拍跳变；
//   2. 音频 currentTime 只用来**纠偏**：偏差大于 80ms 硬纠正，否则按 5% 软拉，
//      这样既有稳定帧间步进，又不会与音乐慢慢错开；
//   3. 音频 loop 播放时 currentTime 会回绕，用"回绕检测"累计 loopCount，
//      得到连续的音乐时间（谱面可以跨循环小节，不受单文件长度限制）；
//   4. 音频不可用 / 加载失败时进入 silent 模式：仍然用单调时钟跑完整局，
//      但界面必须显示「无音乐」，不能声称与音乐同步；
//   5. 暂停时冻结时间（记 pausedAt），恢复时重设锚点，音频从暂停点继续。
// ============================================================================

const { songById, beatMs, loopMs } = require('../../../utils/rhythm-songs.js')

const HARD_DRIFT_MS = 80
const SOFT_DRIFT_RATE = 0.05

function monoNow() {
  try {
    if (typeof performance !== 'undefined' && performance.now) {
      return performance.now()
    }
  } catch (e) { /* 忽略 */ }
  return Date.now()
}

class BeatClock {
  /**
   * @param {object} opts { cfg, audio, song, nowFn }
   *   audio 可注入（测试用假播放器）；不传则用 wx.createInnerAudioContext
   */
  constructor(opts) {
    const o = opts || {}
    this.cfg = o.cfg
    this.nowFn = o.nowFn || monoNow
    this.song = o.song ? songById(o.song.songId || o.song) : null
    this.loopMs = this.song ? loopMs(this.song) : 0
    this.beatMs = this.song ? beatMs(this.song) : 500

    this.audio = null
    this.injectAudio = o.audio || null
    this.mode = 'silent' // audio | silent
    this.state = 'idle' // idle | playing | paused
    this.error = ''

    this.anchor = 0
    this.pausedAt = 0
    this.loops = 0
    this.lastCt = 0
    this.ctSeen = 0
    this.audioValid = false
    this.lastNow = 0
  }

  // ---------------------------------------------------------------- 音频
  setSong(song) {
    this.stop()
    this.song = typeof song === 'string' ? songById(song) : (song || null)
    this.loopMs = this.song ? loopMs(this.song) : 0
    this.beatMs = this.song ? beatMs(this.song) : 500
    this.destroyAudio()
    this._ensureAudio()
    return this
  }

  _ensureAudio() {
    if (this.audio) return this.audio
    this.audio = this.injectAudio || this._createAudio()
    return this.audio
  }

  _createAudio() {
    if (typeof wx === 'undefined' || !wx.createInnerAudioContext || !this.song) {
      this.mode = 'silent'
      return null
    }
    try {
      const a = wx.createInnerAudioContext()
      a.src = this.song.file
      a.loop = true
      a.volume = this.volume()
      a.obeyMuteSwitch = false
      a.onError((err) => {
        this.error = (err && err.errMsg) || '音频播放失败'
        this.mode = 'silent'
      })
      this.mode = 'audio'
      return a
    } catch (e) {
      this.error = '无法创建音频播放器'
      this.mode = 'silent'
      return null
    }
  }

  volume() {
    const v = Number(this.cfg && this.cfg.get('musicVolume'))
    return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.7
  }

  syncVolume() {
    if (!this.audio) return
    try { this.audio.volume = this.volume() } catch (e) { /* 忽略 */ }
  }

  destroyAudio() {
    if (!this.audio) return
    try { this.audio.stop() } catch (e) { /* 忽略 */ }
    // 注入的假播放器不销毁，方便测试复用
    if (!this.injectAudio) {
      try { this.audio.destroy() } catch (e) { /* 忽略 */ }
    }
    this.audio = null
    this.mode = 'silent'
  }

  // ---------------------------------------------------------------- 传输控制
  start() {
    this.stop()
    const a = this._ensureAudio()
    this.state = 'playing'
    this.anchor = this.nowFn()
    this.loops = 0
    this.lastCt = 0
    this.ctSeen = 0
    this.audioValid = false
    this.pausedAt = 0
    if (!a) {
      this.mode = 'silent'
      return this
    }
    // 先 play 再 seek：部分机型在音频尚未加载时 seek(0) 会抛错，
    // 一旦和 play 写在同一个 try 里，play 根本不会执行，音乐直接静音（老坑）。
    try {
      a.src = this.song.file
      a.volume = this.volume()
      a.play()
      this.mode = 'audio'
    } catch (e) {
      this.error = '音频启动失败'
      this.mode = 'silent'
    }
    // 重新赋值 src 后本就从 0 开始，seek 只是兜底，失败不影响播放
    try { a.seek(0) } catch (e) { /* 忽略 */ }
    return this
  }

  pause() {
    if (this.state !== 'playing') return this
    this.pausedAt = this.nowMs()
    this.state = 'paused'
    if (this.audio) {
      try { this.audio.pause() } catch (e) { /* 忽略 */ }
    }
    return this
  }

  resume() {
    if (this.state !== 'paused') return this
    this.state = 'playing'
    this.anchor = this.nowFn() - this.pausedAt
    if (this.audio && this.mode === 'audio') {
      try { this.audio.play() } catch (e) { /* 忽略 */ }
    }
    return this
  }

  stop() {
    this.state = 'idle'
    this.anchor = 0
    this.pausedAt = 0
    this.lastNow = 0
    if (this.audio) {
      try { this.audio.stop() } catch (e) { /* 忽略 */ }
    }
    return this
  }

  // ---------------------------------------------------------------- 时间
  _readAudioMs() {
    if (!this.audio || this.mode !== 'audio') return null
    let ct = null
    try { ct = this.audio.currentTime } catch (e) { return null }
    if (typeof ct !== 'number' || !isFinite(ct) || ct < 0) return null

    // 回绕检测：loop 播放时 currentTime 从末尾跳回 0
    if (this.loopMs > 0 && this.lastCt - ct > this.loopMs * 0.5) {
      this.loops += 1
    }
    this.lastCt = ct
    this.ctSeen += 1
    if (this.ctSeen > 2) this.audioValid = true
    return this.loops * this.loopMs + ct * 1000
  }

  /** 音乐时间（ms）——引擎里所有音符时间都以它比较 */
  nowMs() {
    if (this.state === 'idle') return 0
    if (this.state === 'paused') return this.pausedAt

    const mono = this.nowFn()
    let t = mono - this.anchor

    const audioMs = this._readAudioMs()
    if (audioMs !== null && this.audioValid) {
      const drift = audioMs - t
      if (Math.abs(drift) > HARD_DRIFT_MS) this.anchor -= drift
      else this.anchor -= drift * SOFT_DRIFT_RATE
      t = mono - this.anchor
    }

    if (t < 0) t = 0
    this.lastNow = t
    return t
  }

  /** 节拍相位 0~1（0 = 正拍） */
  beatPhase(offsetMs) {
    if (!this.beatMs) return 0
    const t = this.nowMs() - (offsetMs || 0)
    const m = ((t % this.beatMs) + this.beatMs) % this.beatMs
    return m / this.beatMs
  }

  /** 当前是第几拍（从音乐开始算） */
  beatIndex() {
    if (!this.beatMs) return 0
    return Math.floor(this.nowMs() / this.beatMs)
  }

  get isSilent() {
    return this.mode !== 'audio'
  }
}

module.exports = { BeatClock, monoNow }
