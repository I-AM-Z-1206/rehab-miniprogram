// ============================================================================
// utils/game/audio.js —— 游戏音效 / 背景音乐（素材来源见 audio/game/CREDITS.md）
// ----------------------------------------------------------------------------
// · 音效池：同类音效准备多个 InnerAudioContext，可叠放（连发不吞音）
// · 同一音效 45ms 内不重复触发，避免高频开火时爆音
// · 背景音乐 loop 播放，音量压低；音效/音乐开关跟随配置项 sfxOn / bgmOn
// ============================================================================

const BASE = '/audio/game/'
const SFX_FILES = {
  shoot: 'shoot.mp3',
  hit: 'hit.mp3',
  combo: 'combo.mp3',
  miss: 'miss.mp3',
  ui: 'ui.mp3'
}
const POOL_SIZE = { shoot: 3, hit: 3, combo: 2, miss: 2, ui: 2 }
const MIN_GAP = 45 // 同一音效最小触发间隔(ms)
const BGM_FILE = 'bgm.mp3'
const BGM_VOLUME = 0.38

class AudioKit {
  constructor(cfg) {
    this.cfg = cfg
    this.pools = {}
    this.lastAt = {}
    this.cursor = {}
    this.bgm = null
    this.ready = false
    this.optionSet = false
  }

  /** 页面 onLoad 调用：提前建立播放器，首次发声零延迟 */
  init() {
    if (this.ready || typeof wx === 'undefined') return
    this.ready = true
    if (!this.optionSet) {
      this.optionSet = true
      try {
        // iOS 静音键打开时也要出声
        wx.setInnerAudioOption({ obeyMuteSwitch: false })
      } catch (e) { /* 忽略 */ }
    }
    Object.keys(SFX_FILES).forEach((name) => {
      const size = POOL_SIZE[name] || 2
      const pool = []
      for (let i = 0; i < size; i++) {
        try {
          const ctx = wx.createInnerAudioContext()
          ctx.src = BASE + SFX_FILES[name]
          ctx.volume = 0.8
          pool.push(ctx)
        } catch (e) { /* 忽略 */ }
      }
      this.pools[name] = pool
      this.cursor[name] = 0
    })
  }

  sfx(name) {
    if (!this.ready || !this.cfg.get('sfxOn')) return
    const pool = this.pools[name]
    if (!pool || !pool.length) return
    const now = Date.now()
    if (this.lastAt[name] && now - this.lastAt[name] < MIN_GAP) return
    this.lastAt[name] = now
    const ctx = pool[this.cursor[name] % pool.length]
    this.cursor[name] += 1
    try {
      ctx.stop()
      ctx.seek(0)
      ctx.play()
    } catch (e) { /* 忽略 */ }
  }

  startBgm() {
    if (!this.ready || !this.cfg.get('bgmOn')) return
    if (!this.bgm) {
      try {
        this.bgm = wx.createInnerAudioContext()
        this.bgm.src = BASE + BGM_FILE
        this.bgm.loop = true
        this.bgm.volume = BGM_VOLUME
      } catch (e) {
        this.bgm = null
        return
      }
    }
    try { this.bgm.play() } catch (e) { /* 忽略 */ }
  }

  pauseBgm() {
    if (!this.bgm) return
    try { this.bgm.pause() } catch (e) { /* 忽略 */ }
  }

  stopBgm() {
    if (!this.bgm) return
    try { this.bgm.stop() } catch (e) { /* 忽略 */ }
  }

  /** 配置变化时由引擎调用：音效/音乐开关实时生效 */
  sync() {
    if (!this.bgm) return
    if (!this.cfg.get('bgmOn')) this.stopBgm()
  }

  destroy() {
    Object.keys(this.pools).forEach((name) => {
      this.pools[name].forEach((ctx) => {
        try { ctx.stop(); ctx.destroy() } catch (e) { /* 忽略 */ }
      })
      this.pools[name] = []
    })
    if (this.bgm) {
      try { this.bgm.stop(); this.bgm.destroy() } catch (e) { /* 忽略 */ }
      this.bgm = null
    }
    this.ready = false
  }
}

module.exports = { AudioKit, BASE }
