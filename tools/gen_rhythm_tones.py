#!/usr/bin/env python3
# ============================================================================
# tools/gen_rhythm_tones.py —— 生成「命中推进旋律」用的单音采样（可复现）
# ----------------------------------------------------------------------------
# 为什么只要**一个**音：
#   门控模式下每完成一个音符，旋律往前走一步。需要一个五声音阶的 5~6 个音高，
#   但如果每个音高都存一个文件，光是素材就 200KB+，而且五个 InnerAudioContext
#   各自加载一份，低端机容易抢不到音频焦点。
#
#   做法是**只存一个 C5 的钟琴音**，播放时改 playbackRate 变调：
#     C5 1.000 / D5 1.125 / E5 1.250 / G5 1.500 / A5 1.667 / C6 2.000
#   微信 InnerAudioContext 的 playbackRate 支持 0.5~2.0，正好覆盖一个八度。
#   变调会同时改变时长（C6 只有 C5 的一半），对钟琴这种衰减音来说反而是对的：
#   高音本来余音就短。
#
# 为什么用 wav 不用 m4a：
#   本机没有 ffmpeg（转 AAC 需要它）。0.9 秒 22.05kHz 单声道 16bit 约 39KB，
#   放进 pkgRhythm 分包完全可以接受（分包上限 2MB，当前 500KB 出头）。
#
# 音色：钟琴 / 音乐盒。基频 + 三个泛音（2f 0.30 / 3f 0.12 / 4.2f 0.055），
#   泛音衰减比基频快（真实金属体的物理特征），起音 8ms，总长 0.9s。
# ============================================================================

import math
import os
import struct
import wave

SR = 22050
BASE_HZ = 523.251  # C5
DUR = 0.9
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'pkgRhythm', 'audio', 'rhythm')


def bell(freq, dur=DUR, sr=SR):
    n = int(dur * sr)
    buf = [0.0] * n
    # (倍频, 振幅, 衰减时间常数)
    partials = [(1.0, 1.00, 0.34), (2.0, 0.30, 0.20), (3.0, 0.12, 0.13), (4.2, 0.055, 0.09)]
    attack = 0.008
    for i in range(n):
        t = i / sr
        if t < attack:
            a = t / attack
        else:
            a = 1.0
        s = 0.0
        for mult, amp, tau in partials:
            s += math.sin(2 * math.pi * freq * mult * t) * amp * math.exp(-t / tau)
        # 尾部整体收干净，避免截断产生爆音
        if t > dur - 0.06:
            s *= max(0.0, (dur - t) / 0.06)
        buf[i] = s * a
    return buf


def normalize(buf, peak=0.72):
    m = max(1e-9, max(abs(v) for v in buf))
    k = peak / m
    return [v * k for v in buf]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    buf = normalize(bell(BASE_HZ))
    path = os.path.join(OUT_DIR, 'tone_c5.wav')
    with wave.open(path, 'w') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = bytearray()
        for v in buf:
            frames += struct.pack('<h', int(max(-1.0, min(1.0, v)) * 32767))
        w.writeframes(bytes(frames))
    print('写出 ' + path + '（' + str(os.path.getsize(path)) + ' 字节）')


if __name__ == '__main__':
    main()
