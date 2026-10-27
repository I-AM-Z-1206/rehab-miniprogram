// ============================================================================
// utils/game/audio.js —— 游戏音效 / 背景音乐（素材来源见 audio/game/CREDITS.md）
// ----------------------------------------------------------------------------
// 音效集（profile）：
//   · shooter —— 射击训练用（开火/爆炸），沿用 audio/game/*.mp3
//   · casual  —— 接水果 / 走钢丝 / 节奏训练用（清脆的"叮"、柔和低音），
//                素材由 tools/gen_game_sfx.py 合成后转成 mp3，见 audio/game/sfx/
//                （mp3 兼容性最好；节奏训练那两首必须样本精确，才保留 wav）
//
// 播放策略：
//   1. 音效池：同类音效多个 InnerAudioContext，可叠放（连发不吞音）；
//   2. 同一音效有最小触发间隔，避免高频触发时糊成一片；
//   3. stop() / seek(0) / play() **分开 try**：某些机型 stop 后再 seek 会抛错，
//      以前三段写在同一个 try 里，一旦抛错就直接没声音（这是老坑）；
//   4. 某个播放器出错时尝试重建一个，避免"一次失败后整个音效永久沉默"；
//   5. 音量跟随配置（sfxVolume / bgmVolume），改完立即生效。
// ============================================================================

const PROFILES = {
  // 射击：保持原素材与手感
  shooter: {
    base: '/audio/game/',
    sfx: { shoot: 'shoot.mp3', hit: 'hit.mp3', combo: 'combo.mp3', miss: 'miss.mp3', ui: 'ui.mp3' },
    // 池子别开太大：旧基础库对 InnerAudioContext 有数量上限（历史上是 10），
    // 超了会创建失败且不报错，表现成"没声音"。7 个音效 + 1 BGM 足够叠放。
    pool: { shoot: 2, hit: 2, combo: 1, miss: 1, ui: 1 },
    gap: { default: 45, shoot: 45 },
    bgm: 'bgm.mp3'
  },
  // 接水果 / 走钢丝 / 节奏：柔和一套（hit 是"接住"的别名，兼容旧调用点）
  casual: {
    base: '/audio/game/sfx/',
    sfx: {
      catch: 'fruit_catch.mp3',
      hit: 'fruit_catch.mp3',
      combo: 'fruit_combo.mp3',
      miss: 'fruit_miss.mp3',
      ui: 'fruit_ui.mp3'
    },
    pool: { catch: 2, hit: 2, combo: 1, miss: 1, ui: 1 },
    gap: { default: 40, catch: 40, hit: 40, combo: 120, miss: 120 },
    bgm: 'garden_loop.mp3'
  }
}

const DEFAULT_PROFILE = 'shooter'
const DEFAULT_SFX_VOLUME = 0.8
const DEFAULT_BGM_VOLUME = 0.38

function clamp01(v, def) {
  const n = Number(v)
  if (!isFinite(n)) return def
  return n < 0 ? 0 : (n > 1 ? 1 : n)
}

class AudioKit {
  /**
   * @param {object} cfg 配置 store（提供 sfxOn / bgmOn / sfxVolume / bgmVolume）
   * @param {string} profile 'shooter' | 'casual'
   */
  constructor(cfg, profile) {
    this.cfg = cfg
    this.profileKey = PROFILES[profile] ? profile : DEFAULT_PROFILE
    this.profile = PROFILES[this.profileKey]
    this.pools = {}
    this.lastAt = {}
    this.cursor = {}
    this.bgm = null
    this.bgmPlaying = false
    this.ready = false
    this.optionSet = false
    this.errors = 0
  }

  // ---------------------------------------------------------------- 开关与音量
  _flag(key, def) {
    const v = this.cfg ? this.cfg.get(key) : undefined
    return v === undefined ? def : !!v
  }

  get sfxOn() {
    return this._flag('sfxOn', true)
  }

  get bgmOn() {
    return this._flag('bgmOn', true)
  }

  sfxVolume() {
    const v = this.cfg ? this.cfg.get('sfxVolume') : undefined
    return clamp01(v, DEFAULT_SFX_VOLUME)
  }

  bgmVolume() {
    const v = this.cfg ? this.cfg.get('bgmVolume') : undefined
    return clamp01(v, this.profileKey === 'casual' ? 0.26 : DEFAULT_BGM_VOLUME)
  }

  _gap(name) {
    const g = this.profile.gap || {}
    return g[name] !== undefined ? g[name] : (g.default || 45)
  }

  // ---------------------------------------------------------------- 初始化
  /** 页面 onLoad / onReady 调用：提前建立播放器，首次发声零延迟 */
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
    Object.keys(this.profile.sfx).forEach((name) => {
      const size = (this.profile.pool && this.profile.pool[name]) || 2
      const pool = []
      for (let i = 0; i < size; i++) {
        const ctx = this._create(this.profile.sfx[name])
        if (ctx) pool.push(ctx)
      }
      this.pools[name] = pool
      this.cursor[name] = 0
    })
  }

  _create(file) {
    try {
      const ctx = wx.createInnerAudioContext()
      ctx.src = this.profile.base + file
      ctx.volume = this.sfxVolume()
      ctx.obeyMuteSwitch = false
      return ctx
    } catch (e) {
      this.errors += 1
      return null
    }
  }

  // ---------------------------------------------------------------- 音效
  sfx(name) {
    if (!this.ready || typeof wx === 'undefined') return
    if (!this.sfxOn) return
    const pool = this.pools[name]
    if (!pool || !pool.length) return

    const now = Date.now()
    const gap = this._gap(name)
    if (this.lastAt[name] && now - this.lastAt[name] < gap) return
    this.lastAt[name] = now

    const idx = this.cursor[name] % pool.length
    this.cursor[name] += 1
    const ctx = pool[idx]
    if (!ctx) return

    // 关键：三步分开 catch —— 任何一步抛错都不能影响后面 play()
    try { ctx.stop() } catch (e) { /* 还没播放过时部分机型会抛错 */ }
    try { ctx.seek(0) } catch (e) { /* 同上，忽略 */ }
    try {
      ctx.volume = this.sfxVolume()
      ctx.play()
    } catch (e) {
      // 这个播放器坏了，换一个新的顶上，别让整个音效永久沉默
      this.errors += 1
      const fresh = this._create(this.profile.sfx[name])
      if (fresh) pool[idx] = fresh
    }
  }

  // ---------------------------------------------------------------- 背景音乐
  _ensureBgm() {
    if (this.bgm) return this.bgm
    if (typeof wx === 'undefined' || !this.profile.bgm) return null
    try {
      const ctx = wx.createInnerAudioContext()
      ctx.src = this.profile.base + this.profile.bgm
      ctx.loop = true
      ctx.volume = this.bgmVolume()
      ctx.obeyMuteSwitch = false
      try {
        ctx.onError(() => { this.bgmPlaying = false })
      } catch (e) { /* 老基础库可能没有 onError */ }
      this.bgm = ctx
    } catch (e) {
      this.bgm = null
      this.errors += 1
    }
    return this.bgm
  }

  startBgm() {
    if (!this.ready || !this.bgmOn) return
    const ctx = this._ensureBgm()
    if (!ctx) return
    try {
      ctx.volume = this.bgmVolume()
      ctx.play()
      this.bgmPlaying = true
    } catch (e) {
      this.bgmPlaying = false
    }
  }

  /** 从暂停处继续（onShow 用），与 startBgm 同实现但语义更清楚 */
  resumeBgm() {
    if (!this.bgmOn) return
    this.startBgm()
  }

  pauseBgm() {
    if (!this.bgm) return
    try { this.bgm.pause() } catch (e) { /* 忽略 */ }
    this.bgmPlaying = false
  }

  stopBgm() {
    if (!this.bgm) return
    try { this.bgm.stop() } catch (e) { /* 忽略 */ }
    this.bgmPlaying = false
  }

  /** 配置变化时调用：开关关闭立即停；音量变化立即生效 */
  sync() {
    if (this.bgm) {
      if (!this.bgmOn) this.stopBgm()
      else {
        try { this.bgm.volume = this.bgmVolume() } catch (e) { /* 忽略 */ }
      }
    }
    Object.keys(this.pools).forEach((name) => {
      this.pools[name].forEach((ctx) => {
        try { ctx.volume = this.sfxVolume() } catch (e) { /* 忽略 */ }
      })
    })
  }

  destroy() {
    Object.keys(this.pools).forEach((name) => {
      this.pools[name].forEach((ctx) => {
        try { ctx.stop() } catch (e) { /* 忽略 */ }
        try { ctx.destroy() } catch (e) { /* 忽略 */ }
      })
      this.pools[name] = []
    })
    if (this.bgm) {
      try { this.bgm.stop() } catch (e) { /* 忽略 */ }
      try { this.bgm.destroy() } catch (e) { /* 忽略 */ }
      this.bgm = null
    }
    this.bgmPlaying = false
    this.ready = false
  }
}

module.exports = { AudioKit, PROFILES, BASE: PROFILES.shooter.base }
