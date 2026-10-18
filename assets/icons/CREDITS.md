# 界面图标（assets/icons）

全部来自 **Lucide**（https://lucide.dev），ISC License，可自由商用。
图标源取自 npm 包 `lucide-static@1.59.0` 的 `icons/*.svg`（24×24 viewBox，2px 描边）。

| 文件 | 用途 |
| --- | --- |
| `house-*` / `gamepad-2-*` / `user-round-*` | 底部 tabBar（gray 未选中 / teal 选中） |
| `bluetooth-teal` | 首页「连接蓝牙传感器」 |
| `bluetooth-white` | 深色/渐变底上的蓝牙标识 |
| `focus-blue` | 首页「零点标定」 |
| `target-blue` / `waves-blue` / `apple-blue` | 游戏中心 · 静态保持三款 |
| `car-orange` / `music-orange` | 游戏中心 · 动态训练两款 |
| `volume-2-teal` / `play-teal` / `pencil-teal` / `book-open-teal` / `info-teal` | 我的 · 设置与关于 |
| `chevron-right-light` | 列表行右侧箭头 |
| `sliders-horizontal-teal` | 射击页治疗师控制台标题 |
| `battery-gray` / `thermometer-gray` | 传感器页电量 / 温度 |
| `rotate-ccw-teal` / `play-white` / `pause-white` | 射击页操作按钮 |

## 为什么是 PNG

小程序 `<image>` 对 SVG 的支持在不同基础库 / Skyline 下不一致（Skyline 还有 SVG style 选择器限制），
因此这里用 **96×96 PNG（3 倍图）**，视觉上与矢量一致且各端稳定。
`src/` 下保留了**同色 SVG 源文件**，需要换色/换尺寸时改 `tools/gen_icons.js` 重新生成即可。

## 重新生成

```bash
npm i lucide-static sharp
node tools/gen_icons.js
```

颜色表在 `tools/gen_icons.js` 顶部：teal `#0F9C8C`、gray `#8B8F9A`、blue `#2F7BD6`、orange `#E8802A`、light `#C8C9CC`、white `#FFFFFF`。
