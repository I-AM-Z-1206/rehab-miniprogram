// ============================================================================
// utils/rhythm-songs.js —— 曲目表（BPM 与循环长度均为"已知值"）
// ----------------------------------------------------------------------------
// 为什么不用外部音乐素材：
//   节奏训练要求音符时间与音乐节拍严格一致，因此 BPM 必须是精确已知值。
//   这里两首曲目由 tools/gen_rhythm_audio.py 合成，循环长度 = 整数小节，
//   循环播放不会累积漂移；文件见 pkgRhythm/audio/rhythm/*.m4a。
//
// 关于格式：这里用 AAC(m4a) 而不是 wav —— 三首 wav 合计 1.5MB，直接顶爆
//   2MB 主包限制。AAC 64kbps 单声道后只剩约 290KB。代价是循环边界会有约
//   40ms 间隙；BeatClock 以 audio.currentTime 为基准做软校正，相位抖动不会
//   累积，判定窗口（±80ms）内可接受。原始 *.wav 仍在仓库里，只是不参与打包
//   （见 project.config.json 的 packOptions.ignore），需要样本精确时可直接换回。
//
// 字段说明：
//   bpm          每分钟拍数（已知，不是估算）
//   beatsPerBar  每小节拍数（4/4）
//   loopBars     循环小节数（音频文件就是这么多小节）
//   offsetMs     音乐起始偏移：谱面第 0 拍对应的音频时间
//   loopMs       = loopBars * beatsPerBar * 60000 / bpm
//
// 如果要接入真实歌曲：把文件放进 audio/rhythm/，填上**确认过**的 BPM 与
// 小节数即可；BPM 不确定时不要猜，先用工具测速或让治疗师在设置页校准，
// 否则谱面会和音乐错拍。
// ============================================================================

const SONGS = [
  {
    songId: 'slow_wave',
    name: '静水深流',
    sub: '慢速 · 四小节循环',
    file: '/pkgRhythm/audio/rhythm/slow_wave.m4a',
    bpm: 66,
    beatsPerBar: 4,
    loopBars: 4,
    offsetMs: 0,
    tag: '康复',
    credit: 'tools/gen_rhythm_audio.py 合成，无第三方素材'
  },
  {
    songId: 'dawn_walk',
    name: '晨光漫步',
    sub: '中速 · 四小节循环',
    file: '/pkgRhythm/audio/rhythm/dawn_walk.m4a',
    bpm: 90,
    beatsPerBar: 4,
    loopBars: 4,
    offsetMs: 0,
    tag: '入门',
    credit: 'tools/gen_rhythm_audio.py 合成，无第三方素材'
  },
  {
    songId: 'heart_pulse',
    name: '心跳律动',
    sub: '中快 · 四小节循环',
    file: '/pkgRhythm/audio/rhythm/heart_pulse.m4a',
    bpm: 110,
    beatsPerBar: 4,
    loopBars: 4,
    offsetMs: 0,
    tag: '进阶',
    credit: 'tools/gen_rhythm_audio.py 合成，无第三方素材'
  }
]

const DEFAULT_SONG_ID = SONGS[0].songId

function songById(id) {
  return SONGS.find((s) => s.songId === id) || SONGS[0]
}

/** 一拍多少毫秒 */
function beatMs(song) {
  const s = typeof song === 'string' ? songById(song) : song
  return 60000 / Math.max(30, Math.min(240, Number(s.bpm) || 100))
}

/** 音频循环长度（毫秒） */
function loopMs(song) {
  const s = typeof song === 'string' ? songById(song) : song
  const beats = (Number(s.beatsPerBar) || 4) * (Number(s.loopBars) || 4)
  return beats * beatMs(s)
}

/** 一小节多少毫秒 */
function barMs(song) {
  const s = typeof song === 'string' ? songById(song) : song
  return (Number(s.beatsPerBar) || 4) * beatMs(s)
}

module.exports = { SONGS, DEFAULT_SONG_ID, songById, beatMs, loopMs, barMs }
