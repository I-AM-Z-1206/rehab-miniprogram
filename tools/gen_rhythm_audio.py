#!/usr/bin/env python3
# ============================================================================
# tools/gen_rhythm_audio.py —— 生成「左右节奏训练」的循环节拍音轨（可复现）
# ----------------------------------------------------------------------------
# 为什么自己合成：
#   1. 节奏训练必须让「音符时间」和「音乐节拍」严格一致，因此曲目的 BPM
#      必须是已知且精确的。外部素材的 BPM 需要额外分析，容易对不准；
#   2. 纯 Python 合成可以保证循环长度 = 整数小节，循环播放时不会累积漂移；
#   3. 工程里没有可商用授权的节奏音乐素材，避免版权问题。
#
# 生成物：audio/rhythm/{songId}.wav（22.05kHz / 16bit / 单声道，四小节无缝循环）
# 质量取舍：22.05kHz 对「软底鼓 + 木鱼点击 + 铺底和声」足够，且各机型 InnerAudioContext
# 兼容性远好于 8kHz（部分机型对极低采样率 WAV 会拒播或变速）；主包体积仍可控。
#
# 打包前的必要一步：本脚本产出的 wav 三首合计约 1.5MB，会顶爆 2MB 主包限制，
# 所以要先用 ffmpeg 转成 AAC 再打包（wav 原件保留在仓库、不参与打包）：
#   ffmpeg -y -i X.wav -codec:a aac -b:a 64k -ac 1 -ar 22050 -movflags +faststart X.m4a
# 转完记得同步 utils/rhythm-songs.js 里的 file 字段。
# ============================================================================

import math
import os
import random
import struct
import wave

SR = 22050
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'pkgRhythm', 'audio', 'rhythm')

# songId, 文件名, BPM, 小节数, 每小节拍数, 音色风格
TRACKS = [
    {'song_id': 'slow_wave', 'bpm': 66, 'bars': 4, 'beats': 4, 'style': 'soft'},
    {'song_id': 'dawn_walk', 'bpm': 90, 'bars': 4, 'beats': 4, 'style': 'soft'},
    {'song_id': 'heart_pulse', 'bpm': 110, 'bars': 4, 'beats': 4, 'style': 'drive'},
]


def env_decay(t, attack, decay):
    if t < 0:
        return 0.0
    if t < attack:
        return t / attack
    return math.exp(-(t - attack) / decay)


def add_kick(buf, start, gain, sr=SR):
    dur = 0.26
    n = int(dur * sr)
    for i in range(n):
        idx = start + i
        if idx >= len(buf):
            break
        t = i / sr
        f = 52 + 70 * math.exp(-t / 0.035)          # 低频下坠
        a = env_decay(t, 0.004, 0.10) * gain
        buf[idx] += math.sin(2 * math.pi * f * t) * a


def add_click(buf, start, gain, freq, sr=SR):
    dur = 0.09
    n = int(dur * sr)
    for i in range(n):
        idx = start + i
        if idx >= len(buf):
            break
        t = i / sr
        a = env_decay(t, 0.002, 0.028) * gain
        v = math.sin(2 * math.pi * freq * t) * 0.75
        v += math.sin(2 * math.pi * freq * 1.53 * t) * 0.25
        buf[idx] += v * a


def add_hat(buf, start, gain, rng, sr=SR):
    dur = 0.05
    n = int(dur * sr)
    prev = 0.0
    for i in range(n):
        idx = start + i
        if idx >= len(buf):
            break
        t = i / sr
        white = rng.uniform(-1, 1)
        hp = white - prev * 0.85          # 简易高通，得到"沙"感
        prev = white
        buf[idx] += hp * env_decay(t, 0.001, 0.014) * gain


def add_pad(buf, start, dur, freq, gain, sr=SR):
    n = int(dur * sr)
    for i in range(n):
        idx = start + i
        if idx >= len(buf):
            break
        t = i / sr
        # 慢起慢落，避免循环边界"咔"声
        a = min(1.0, t / 0.5) * min(1.0, (dur - t) / 0.6)
        v = math.sin(2 * math.pi * freq * t) * 0.6
        v += math.sin(2 * math.pi * freq * 2 * t + 0.7) * 0.18
        v += math.sin(2 * math.pi * freq * 3 * t + 1.9) * 0.07
        buf[idx] += v * a * gain


def build(track):
    bpm = track['bpm']
    beats = track['beats']
    bars = track['bars']
    beat_sec = 60.0 / bpm
    loop_sec = beat_sec * beats * bars
    total = int(round(loop_sec * SR))
    buf = [0.0] * total
    rng = random.Random(hash(track['song_id']) & 0xFFFF)

    # 和声铺底：每两小节换一个和弦（A 小调 → F → C → G 的柔和进行）
    chords = [220.00, 174.61, 261.63, 196.00]   # A3 F3 C4 G3
    bar_sec = beat_sec * beats
    for b in range(bars):
        root = chords[b % len(chords)]
        start = int(round(b * bar_sec * SR))
        add_pad(buf, start, bar_sec * 0.98, root * 0.5, 0.075)
        add_pad(buf, start, bar_sec * 0.98, root * 0.75, 0.045)
        add_pad(buf, start, bar_sec * 0.98, root * 1.5, 0.022)

    # 每拍
    for bar in range(bars):
        for beat in range(beats):
            t = (bar * beats + beat) * beat_sec
            start = int(round(t * SR))
            strong = (beat % beats) == 0

            # 木鱼点击：每拍都有，作为主要节拍提示（音量克制，不刺耳）
            add_click(buf, start, 0.30 if strong else 0.20, 1180 if strong else 940)

            if track['style'] == 'soft':
                # 慢速：1、3 拍软底鼓，8 分音符只有很轻的沙锤
                if beat % 2 == 0:
                    add_kick(buf, start, 0.55)
                add_hat(buf, int(round((t + beat_sec / 2) * SR)), 0.05, rng)
            else:
                # 中速：四拍底鼓 + 反拍沙锤，推动感更强
                add_kick(buf, start, 0.48)
                add_hat(buf, int(round((t + beat_sec / 2) * SR)), 0.085, rng)

    # 软限幅 + 归一化
    peak = max(1e-6, max(abs(v) for v in buf))
    scale = 0.82 / peak
    out = bytearray()
    for v in buf:
        v = math.tanh(v * scale * 1.12) * 0.88
        s = int(max(-1.0, min(1.0, v)) * 32767)
        out += struct.pack('<h', s)
    return bytes(out), loop_sec


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for track in TRACKS:
        pcm, loop_sec = build(track)
        path = os.path.join(OUT_DIR, track['song_id'] + '.wav')
        with wave.open(path, 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm)
        size = os.path.getsize(path)
        print('%-14s bpm=%3d loop=%6.3fs  %6.1f KB  %s' % (
            track['song_id'], track['bpm'], loop_sec, size / 1024.0, path))


if __name__ == '__main__':
    main()
