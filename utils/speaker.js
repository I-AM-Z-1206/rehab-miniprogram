// utils/speaker.js —— 全局语音播报
// 播放优先级：
//   1. 本地语音包（audio/xxx.mp3，由 tools/gen_voice.ps1 生成）—— 不依赖任何插件，推荐
//   2. 微信同声传译插件 textToSpeech（仅在小程序后台已添加该插件时生效）
//   3. 都不可用则仅提示一次，不影响业务流程
// 特性：
//   - 同一时刻只播放一条（新的播报会打断旧的）
//   - 相同文案 3 秒内不重复播报，避免高频事件刷屏
//   - iOS 静音开关下也能出声

const { VOICE_FILES } = require('./voiceMap.js')

const KEY_SPEECH = 'speech_enabled'
const MAX_LEN = 50 // 插件限制：单次合成 50 个字符
const REPEAT_GUARD = 3000 // 相同文案重复播报的最小间隔(ms)
const AUDIO_DIR = '/audio/'
const AUDIO_EXTS = ['.mp3', '.wav'] // 依次尝试，生成脚本没装 ffmpeg 时会产出 wav

let plugin = null
let pluginLoaded = false
let unavailable = false // 插件未接入标记
let tipped = false // 每次启动只提示一次，避免刷屏
let audio = null
let lastText = ''
let lastAt = 0
let audioOptionSet = false

// 语音不可用时给用户一个可见提示（便于排查「为什么没有声音」）
function tipOnce(msg) {
  if (tipped) return
  tipped = true
  wx.showToast({ title: msg || '语音播报不可用', icon: 'none', duration: 2500 })
}

// 懒加载插件：未接入插件时 requirePlugin 会抛错，这里兜住
function getPlugin() {
  if (!pluginLoaded) {
    pluginLoaded = true
    try {
      plugin = requirePlugin('WechatSI')
    } catch (e) {
      plugin = null
      unavailable = true
    }
  }
  return plugin
}

function isEnabled() {
  try {
    const val = wx.getStorageSync(KEY_SPEECH)
    // 未设置过默认开启
    return val === undefined || val === null || val === '' ? true : !!val
  } catch (e) {
    return true
  }
}

function setEnabled(on) {
  try {
    wx.setStorageSync(KEY_SPEECH, !!on)
  } catch (e) { /* 忽略 */ }
}

// 停止当前播报（页面卸载、手动关闭开关时调用）
function stop() {
  if (!audio) return
  try {
    audio.stop()
    audio.destroy()
  } catch (e) { /* 忽略 */ }
  audio = null
}

function release(ctx) {
  if (audio === ctx) audio = null
  try { ctx.destroy() } catch (e) { /* 忽略 */ }
}

function playUrl(url, fallbackText) {
  stop()
  if (!audioOptionSet) {
    audioOptionSet = true
    try {
      wx.setInnerAudioOption({ obeyMuteSwitch: false })
    } catch (e) { /* 忽略 */ }
  }
  const ctx = wx.createInnerAudioContext()
  audio = ctx
  ctx.src = url
  ctx.onEnded(() => release(ctx))
  ctx.onError(() => {
    release(ctx)
    if (fallbackText) speakByPlugin(fallbackText)
  })
  ctx.play()
}

// 播放本地语音包：mp3 找不到再试 wav，都没有才回落插件
function playLocal(file, fallbackText) {
  stop()
  let extIndex = 0
  const tryNext = () => {
    if (extIndex >= AUDIO_EXTS.length) {
      // 本地语音包缺失：多半是还没生成音频
      tipOnce('未找到语音包，请先生成 audio 目录下的音频')
      if (fallbackText) speakByPlugin(fallbackText)
      return
    }
    const url = AUDIO_DIR + file + AUDIO_EXTS[extIndex]
    extIndex += 1
    if (!audioOptionSet) {
      audioOptionSet = true
      try {
        wx.setInnerAudioOption({ obeyMuteSwitch: false })
      } catch (e) { /* 忽略 */ }
    }
    const ctx = wx.createInnerAudioContext()
    audio = ctx
    ctx.src = url
    ctx.onEnded(() => release(ctx))
    ctx.onError(() => {
      release(ctx)
      tryNext()
    })
    ctx.play()
  }
  tryNext()
}

// 插件方式合成（需要小程序后台已添加「微信同声传译」插件）
function speakByPlugin(text) {
  const p = getPlugin()
  if (!p || typeof p.textToSpeech !== 'function') {
    tipOnce(unavailable ? '未接入同声传译插件，且无本地语音包' : '语音播报不可用')
    return
  }
  const content = String(text || '').trim()
  if (!content) return
  p.textToSpeech({
    lang: 'zh_CN',
    tts: true,
    content: content.slice(0, MAX_LEN),
    success: (res) => {
      if (res && res.retcode === 0 && res.filename) {
        playUrl(res.filename)
      } else {
        console.warn('[speaker] 合成失败', res)
        tipOnce('语音合成失败')
      }
    },
    fail: (err) => {
      console.warn('[speaker] 合成失败', err)
      tipOnce('语音合成失败')
    }
  })
}

// 播报一句话（唯一对外入口）
function speak(text) {
  const content = String(text || '').trim()
  if (!content) return
  if (!isEnabled()) return

  const now = Date.now()
  if (content === lastText && now - lastAt < REPEAT_GUARD) return
  lastText = content
  lastAt = now

  const file = VOICE_FILES[content]
  if (file) {
    playLocal(file, content)
    return
  }
  speakByPlugin(content)
}

module.exports = { speak, stop, isEnabled, setEnabled, KEY_SPEECH }
