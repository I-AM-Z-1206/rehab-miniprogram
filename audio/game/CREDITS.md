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
