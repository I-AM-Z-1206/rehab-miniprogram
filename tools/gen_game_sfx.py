#!/usr/bin/env python3
# ============================================================================
# tools/gen_game_sfx.py —— 生成「接水果 / 走钢丝 / 节奏」用的柔和音效与果园 BGM
# ----------------------------------------------------------------------------
# 为什么要重做：
#   接水果以前直接复用射击游戏的素材（接住 = explosion.mp3 爆炸声），
#   语义不对，对康复人群也偏刺激；而且整局没有背景音乐。
#   这里用纯 Python 合成一套轻量、柔和、可循环的素材，避免版权问题。
#
# 生成物（8kHz / 16bit / 单声道，体积可控）：
#   audio/game/sfx/fruit_catch.wav   接住（清脆的"叮"）
#   audio/game/sfx/fruit_combo.wav   连击（上行双音）
#   audio/game/sfx/fruit_miss.wav    漏接（柔和低音"噗"）
#   audio/game/sfx/fruit_ui.wav      按钮（极轻的点击）
#   audio/game/sfx/garden_loop.wav   果园背景音乐（110 BPM，四小节循环）
#
# 注意：这里先输出 wav，再用 tools/wav2mp3.py 转成 mp3（需要 lameenc）。
#       游戏实际加载的是 mp3；wav 只是中间产物，转换后会被删除。
# ============================================================================

import math
import os
import random
import struct
import wave

SR = 8000
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       'audio', 'game', 'sfx')


def decay(t, attack, tau):
    if t < 0:
        return 0.0
    if t < attack:
        return t / attack
    return math.exp(-(t - attack) / tau)


def bell(buf, start, freq, dur, gain, tau=0.16, partials=((1, 1.0), (2.01, 0.35), (3.02, 0.12))):
    n = int(dur * SR)
    for i in range(n):
        idx = start + i
        if idx >= len(buf):
            break
        t = i / SR
        a = decay(t, 0.004, tau) * gain
        v = 0.0
        for mul, amp in partials:
            v += math.sin(2 * math.pi * freq * mul * t) * amp
        buf[idx] += v * a


def thud(buf, start, f0, f1, dur, gain):
    n = int(dur * SR)
    phase = 0.0
    for i in range(n):
        idx = start + i
        if idx >= len(buf):
            break
        t = i / SR
        f = f0 + (f1 - f0) * min(1.0, t / 0.12)
        phase += 2 * math.pi * f / SR
        buf[idx] += math.sin(phase) * decay(t, 0.006, 0.075) * gain


def pluck(buf, start, freq, dur, gain, rng):
    """马林巴/木琴感的短音：基频 + 四倍泛音 + 一点点噪声起音"""
    n = int(dur * SR)
    for i in range(n):
        idx = start + i
        if idx >= len(buf):
            break
        t = i / SR
        a = decay(t, 0.003, 0.11) * gain
        v = math.sin(2 * math.pi * freq * t) * 0.72
        v += math.sin(2 * math.pi * freq * 4 * t) * 0.16
        if t < 0.012:
            v += rng.uniform(-0.35, 0.35)
        buf[idx] += v * a


def kick(buf, start, gain):
    n = int(0.2 * SR)
    phase = 0.0
    for i in range(n):
        idx = start + i
        if idx >= len(buf):
            break
        t = i / SR
        f = 48 + 55 * math.exp(-t / 0.03)
        phase += 2 * math.pi * f / SR
        buf[idx] += math.sin(phase) * decay(t, 0.004, 0.075) * gain


def shaker(buf, start, gain, rng):
    n = int(0.045 * SR)
    prev = 0.0
    for i in range(n):
        idx = start + i
        if idx >= len(buf):
            break
        t = i / SR
        w = rng.uniform(-1, 1)
        hp = w - prev * 0.8
        prev = w
        buf[idx] += hp * decay(t, 0.001, 0.012) * gain


def write_wav(name, buf, peak_target=0.86):
    peak = max(1e-6, max(abs(v) for v in buf))
    scale = peak_target / peak
    out = bytearray()
    for v in buf:
        s = int(max(-1.0, min(1.0, math.tanh(v * scale))) * 32767)
        out += struct.pack('<h', s)
    path = os.path.join(OUT_DIR, name)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(bytes(out))
    print('%-22s %6.1f KB  %s' % (name, os.path.getsize(path) / 1024.0, path))


def build_sfx():
    rng = random.Random(20261026)

    # 接住：C6 + 五度泛音，短促清脆，不刺耳
    buf = [0.0] * int(0.30 * SR)
    bell(buf, 0, 1046.5, 0.28, 0.55, 0.11, ((1, 1.0), (2.0, 0.22), (2.98, 0.08)))
    write_wav('fruit_catch.wav', buf, 0.72)

    # 连击：上行双音（A5 → D6），两个短音叠一点
    buf = [0.0] * int(0.46 * SR)
    bell(buf, 0, 880.0, 0.26, 0.45, 0.10, ((1, 1.0), (2.0, 0.2)))
    bell(buf, int(0.075 * SR), 1174.7, 0.32, 0.42, 0.12, ((1, 1.0), (2.0, 0.2)))
    write_wav('fruit_combo.wav', buf, 0.70)

    # 漏接：低音下滑，音量克制（不吓人）
    buf = [0.0] * int(0.34 * SR)
    thud(buf, 0, 190.0, 120.0, 0.32, 0.6)
    write_wav('fruit_miss.wav', buf, 0.55)

    # 按钮：极轻的一点
    buf = [0.0] * int(0.09 * SR)
    bell(buf, 0, 1568.0, 0.08, 0.30, 0.03, ((1, 1.0),))
    write_wav('fruit_ui.wav', buf, 0.35)


def build_garden():
    """110 BPM、4/4、四小节循环：木琴分解和弦 + 轻底鼓 + 沙锤 + 铺底"""
    bpm = 110
    beat = 60.0 / bpm
    bars = 4
    beats_per_bar = 4
    loop_sec = beat * beats_per_bar * bars
    total = int(round(loop_sec * SR))
    buf = [0.0] * total
    rng = random.Random(7788)

    # C 大调五声：C E G A D
    pattern = [
        [523.25, 659.25, 783.99, 659.25],
        [587.33, 698.46, 880.00, 698.46],
        [523.25, 659.25, 783.99, 1046.50],
        [440.00, 587.33, 698.46, 587.33]
    ]
    chord = [261.63, 220.00, 261.63, 196.00]

    for bar in range(bars):
        bar_start = bar * beats_per_bar * beat
        # 铺底：每小节一个长音，音量很低，避免盖住提示音
        n = int(beats_per_bar * beat * SR)
        start = int(round(bar_start * SR))
        for i in range(n):
            idx = start + i
            if idx >= total:
                break
            t = i / SR
            a = min(1.0, t / 0.4) * min(1.0, (n / SR - t) / 0.5) * 0.09
            buf[idx] += (math.sin(2 * math.pi * chord[bar] * t) * 0.6 +
                         math.sin(2 * math.pi * chord[bar] * 1.5 * t) * 0.25) * a

        # 木琴分解：八分音符
        for step in range(beats_per_bar * 2):
            t = bar_start + step * beat / 2
            note = pattern[bar][step % 4]
            pluck(buf, int(round(t * SR)), note, 0.34, 0.30 if step % 2 == 0 else 0.20, rng)

        # 底鼓：1、3 拍
        for b in (0, 2):
            kick(buf, int(round((bar_start + b * beat) * SR)), 0.42)
        # 沙锤：反拍
        for b in range(beats_per_bar):
            shaker(buf, int(round((bar_start + b * beat + beat / 2) * SR)), 0.09, rng)

    write_wav('garden_loop.wav', buf, 0.72)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    build_sfx()
    build_garden()


if __name__ == '__main__':
    main()
