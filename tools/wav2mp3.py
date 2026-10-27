# tools/wav2mp3.py —— 把 audio/ 目录下的 wav 批量压缩为 mp3（32kbps 单声道 22050Hz）
# 目的：语音包体积从 ~10MB 降到 ~1MB，才能放进小程序包
# 用法：python tools/wav2mp3.py
# 依赖：python -m pip install lameenc

import os
import sys
import array
import wave
import glob

try:
    import lameenc
except ImportError:
    print('缺少依赖，请先执行： python -m pip install lameenc')
    sys.exit(1)

OUT_RATE = 22050
BIT_RATE = 32


def to_mono(pcm, channels):
    """多声道混成单声道"""
    if channels == 1:
        return pcm
    return array.array('h', [(pcm[i] + pcm[i + 1]) // 2 for i in range(0, len(pcm) - 1, 2)])


def resample(pcm, src_rate, dst_rate):
    """线性插值重采样"""
    if src_rate == dst_rate:
        return pcm
    ratio = src_rate / float(dst_rate)
    out_len = int(len(pcm) / ratio)
    out = array.array('h')
    for i in range(out_len):
        pos = i * ratio
        idx = int(pos)
        frac = pos - idx
        a = pcm[idx] if idx < len(pcm) else pcm[-1]
        b = pcm[idx + 1] if idx + 1 < len(pcm) else a
        out.append(int(a + (b - a) * frac))
    return out


def convert(path):
    with wave.open(path, 'rb') as w:
        channels = w.getnchannels()
        sampwidth = w.getsampwidth()
        rate = w.getframerate()
        raw = w.readframes(w.getnframes())

    if sampwidth != 2:
        print('  跳过（仅支持 16bit PCM）：%s' % os.path.basename(path))
        return None

    pcm = array.array('h')
    pcm.frombytes(raw)
    if sys.byteorder == 'big':
        pcm.byteswap()
    pcm = to_mono(pcm, channels)
    pcm = resample(pcm, rate, OUT_RATE)

    encoder = lameenc.Encoder()
    encoder.set_bit_rate(BIT_RATE)
    encoder.set_in_sample_rate(OUT_RATE)
    encoder.set_channels(1)
    encoder.set_quality(2)  # 2=高质量
    data = encoder.encode(pcm.tobytes())
    data += encoder.flush()

    out = os.path.splitext(path)[0] + '.mp3'
    with open(out, 'wb') as f:
        f.write(data)
    os.remove(path)
    return out


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    audio_dir = os.path.join(os.path.dirname(here), 'audio')
    # 默认转换：语音包（audio/*.wav）+ 游戏音效（audio/game/sfx/*.wav）
    # 注意：audio/rhythm/*.wav 不在这里转 —— 它们由 ffmpeg 单独转成
    #       audio/rhythm/*.m4a（AAC 64kbps 单声道）后再加进打包忽略列表，
    #       原因和代价见 utils/rhythm-songs.js 顶部注释。原始 wav 保留在仓库。
    targets = [
        os.path.join(audio_dir, '*.wav'),
        os.path.join(audio_dir, 'game', 'sfx', '*.wav'),
    ]
    files = []
    for pattern in targets:
        files.extend(sorted(glob.glob(pattern)))
    if not files:
        print('没有需要转换的 wav 文件')
        return

    ok = 0
    for path in files:
        name = os.path.relpath(path, audio_dir)
        try:
            convert(path)
            ok += 1
            print('  [OK] %s' % name)
        except Exception as e:
            print('  [FAIL] %s: %s' % (name, e))

    total = sum(os.path.getsize(p) for p in glob.glob(os.path.join(audio_dir, '*')))
    print('完成：%d / %d，audio 目录总大小 %.2f MB' % (ok, len(files), total / 1024.0 / 1024.0))


if __name__ == '__main__':
    main()
