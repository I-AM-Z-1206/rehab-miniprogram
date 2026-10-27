# 音频素材来源（audio/game）

本目录音频用于「射击训练」游戏（FR-GAME-01）的音效与背景音乐，均取自 GitHub 开源示例仓库 **phaserjs/examples**（原 photonstorm/phaser3-examples）的 `public/assets/audio`，遵循该仓库的示例素材使用约定，仅供学习 / 演示。若需商用，请自行替换为已购授权或 CC0 素材。

| 本地文件 | 用途 | 上游路径 | 原始大小 |
| --- | --- | --- | --- |
| `shoot.mp3` | 开火 | `SoundEffects/blaster.mp3` | 5.9 KB |
| `hit.mp3` | 命中 | `SoundEffects/explosion.mp3` | 23.9 KB |
| `combo.mp3` | 连击奖励 | `SoundEffects/p-ping.mp3` | 18.8 KB |
| `miss.mp3` | 脱靶 / 出界 | `SoundEffects/squit.mp3` | 5.0 KB |
| `ui.mp3` | 开始 / 按钮 | `SoundEffects/menu_select.mp3` | 49.7 KB |
| `bgm.mp3` | 背景音乐（循环） | `CatAstroPhi_shmup_normal.mp3` | 85.9 KB |

合计约 196 KB。

## 获取方式（可复现）

GitHub raw 域名在部分网络下不可达，改用 GitHub Contents API 拉取 base64 再解码：

```bash
curl -s "https://api.github.com/repos/phaserjs/examples/contents/public/assets/audio/SoundEffects/blaster.mp3" \
  | python -c "import sys,json,base64; print(base64.b64decode(json.load(sys.stdin)['content']))" \
  > audio/game/shoot.mp3
```

## 替换建议

`utils/game/audio.js` 顶部的 `SFX_FILES` / `BGM_FILE` 是唯一映射表，换成同名文件即可，代码不用改。

---

## 补充：audio/game/sfx（接水果 / 走钢丝 / 节奏训练）

这几个游戏以前直接复用上面的射击素材（接住水果播的是 `hit.mp3`＝爆炸声），
语义不对、对康复人群也偏刺激，因此单独合成了一套柔和音效。全部由
`tools/gen_game_sfx.py` 生成（纯 Python 合成，无第三方素材）：

| 文件 | 用途 | 时长 | 大小 |
| --- | --- | --- | --- |
| `sfx/fruit_catch.mp3` | 接住 / 命中（清脆的"叮"） | 0.30s | 1.4 KB |
| `sfx/fruit_combo.mp3` | 连击奖励（上行双音） | 0.46s | 2.0 KB |
| `sfx/fruit_miss.mp3` | 漏接 / 未命中（柔和低音） | 0.34s | 1.6 KB |
| `sfx/fruit_ui.mp3` | 按钮点击（极轻） | 0.09s | 0.6 KB |
| `sfx/garden_loop.mp3` | 接水果背景音乐（110 BPM，四小节循环） | 8.7s | 34 KB |

格式：由 8kHz / 16bit / 单声道 WAV 转成 32kbps mp3（兼容性最好，合计约 40KB）。

重新生成：

```bash
python tools/gen_game_sfx.py        # 先合成 wav
python tools/wav2mp3.py             # 再转 mp3（需要 lameenc；会删除中间 wav）
# wav2mp3.py 会扫 audio/*.wav 与 audio/game/sfx/*.wav，
# 故意跳过 audio/rhythm/*.wav（节奏训练的循环必须样本精确）
```

`utils/game/audio.js` 顶部 `PROFILES` 是唯一的映射表：
`shooter` 用原来的 mp3（射击不受影响），`casual` 用上面这套 mp3。
