# 射击训练 · 浏览器预览与界面回归

不用微信开发者工具，直接在 Chrome 里跑 `pages/shoot`，用来抓渲染问题和 JS 报错。

改造后**游戏页只剩一块画布**（开始页 / 暂停 / 结算 / 底部按钮条都画在画布里），
治疗师参数搬到了 `pages/shoot-settings`，所以预览也只需要一个 canvas。

## 一、页面预览

```bash
node_modules/.bin/esbuild tools/shoot-preview/main.js --bundle --format=iife \
  --target=es2018 --define:global=window --outfile=tools/shoot-preview/bundle.js

# 拷到任意目录，然后
chrome --headless=new --window-size=390,844 --force-device-scale-factor=2 \
  --virtual-time-budget=4000 --screenshot=out.png \
  "file:///.../index.html?bare=1&screen=ready"
```

| 参数 | 说明 |
| --- | --- |
| `?screen=ready\|running\|paused\|ended` | 进入哪个状态（默认 ready） |
| `?angle=2` | 固定模拟倾角；不传就慢慢左右摆 |
| `?hz=50` | 模拟传感器帧率，`0` = 不喂数据（看「未连接 · 触屏模拟」） |
| `?bare=1` | 去掉外框留白 |

页面用真实代码：`onLoad → onReady → initCanvas`，点击换算成 `onTouchStart/onTouchEnd`，
所以按钮热区、状态切换、引擎事件都是真的在跑。

> headless 下 `requestAnimationFrame` 几乎不推进，`running/ended` 会在预览脚本里
> 手动推 150 帧（2.5 秒），否则截出来全是 0 分。

## 二、纯画布预览（只看引擎，不含页面层 UI）

```bash
node_modules/.bin/esbuild tools/shoot-preview/canvas-main.js --bundle --format=iife \
  --target=es2018 --define:global=window --outfile=tools/shoot-preview/canvas-bundle.js
chrome --headless=new --window-size=390,600 --force-device-scale-factor=2 \
  --screenshot=out.png "file:///.../canvas.html?w=390&h=600&dpr=2&state=paused"
```

参数：`?w= &h= &dpr= &state=ready|running|paused|ended&angle=`。

> 脚本最后会等 400ms 再冻结画面：引擎贴图是异步加载的，冻结太早会停在矢量兜底，
> 容易误判成「素材没生效」。浏览器里 `sprites.js` 走原生 `new Image()`（小程序才是
> `canvas.createImage()`），所以这里看到的就是真机上的贴图效果。

## 三、界面回归

```bash
node tools/shoot-ui-test.js     # 53 项
```

锁住四件事：

1. **开始 / 暂停 / 结算遮罩必须画在 dpr 变换之内**（曾经画在 `restore()` 之后，
   遮罩只盖左上 1/4、卡片半尺寸挤在左上角）；
2. 状态变化后 `canvas.width/height` 与 `engine.resize()` 要跟上；
3. 页面层 UI 的按钮热区（开始页只有开始/返回/设置；训练中才有暂停；暂停页主操作在卡片里）；
4. `afterRender` 注入的页面层同样要套 dpr 变换。

## 四、2.5D 场景

引擎画面（星空 / 星云 / 行星 / 山脊 / 透视地面 / 保持区光柱 / 冲击波）由
`pkgShoot/games/shoot/scene2d.js` 负责，纯 Canvas 2D，不用 WebGL、不用 three.js。

改动这块以后跑 `npm test`，其中「射击场景」一套会用假 ctx 把每层都真跑一遍，
钉住三件事：不崩、不出现 NaN 坐标、保持区边界严格等于 `keepHalfPx()`
（最后一条是医疗产品的红线，患者看到的范围必须就是判定范围）。

画质档位在 `engine._layout()` 按屏幕面积定，另外 `update()` 里做了掉帧自适应：
连续 110 帧超过 36ms 会降一档，只降不升。

### 截图对比（2026-10-29 纵深改造）

```bash
# 1) 改完代码先重建 bundle（esbuild 直接写盘会被拦，见 tools/build_race.js 的 write:false 绕法）
node -e "require('esbuild').build({entryPoints:['tools/shoot-preview/canvas-main.js'],bundle:true,format:'iife',target:'es2018',define:{global:'window'},write:false}).then(r=>require('fs').writeFileSync('tools/shoot-preview/canvas-bundle.js',r.outputFiles[0].contents))"

# 2) 无头截图（dpr=2，注意中文路径要百分号编码）
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu \
  --window-size=390,700 --force-device-scale-factor=2 --virtual-time-budget=6000 \
  --screenshot="E:/demo - 副本/tools/shoot-preview/shots/after-25d.png" \
  "file:///E:/demo%20-%20%E5%89%AF%E6%9C%AC/tools/shoot-preview/canvas.html?w=390&h=700&dpr=2&state=running&angle=2"
```

`angle` 是模拟侧屈角度。想验证背景视差有没有在边缘露缝，用 `angle=14` 把
`parallax` 顶到 clamp 上限——`shots/after-lean-max.png` 就是这一张。

现存三张：`before-2d.png`（改造前）、`after-25d.png`（改造后，angle=2）、
`after-lean-max.png`（改造后，angle=14 满侧屈）。

## 五、观察参数（2026-10-29 加）

| 参数 | 作用 |
|---|---|
| `?zoom=N&zx=195&zy=280` | 把画面上的 (zx, zy) 放大 N 倍放到窗口中心。**整屏截图无论多少 dpr 都像缩略图**，检查小尺寸元素（外星人的眼睛、翼尖灯）只能靠它。 |
| `?face=normal\|smug\|hit` | 定格靶子表情。自动开火下几乎只能截到「受击」画面，不定格就会把受击表情当常态去评审。 |
| `?angle=N` | 模拟侧屈 N 度。`angle` 超过 `keepRangeDeg` 会进入出界状态（画面转红 + 停火）。 |

示例（截外星人特写）：

```bash
chrome --headless=new --disable-gpu --window-size=390,700 --force-device-scale-factor=1 \
  --virtual-time-budget=9000 --screenshot="shots/zoom-alien.png" \
  "file:///.../canvas.html?w=390&h=700&dpr=3&state=running&angle=2&face=normal&zoom=5&zx=195&zy=280"
```

注意 `--force-device-scale-factor=1`：放大靠 CSS transform，用 ≥2 的缩放因子反而会让
可见区域变小、裁掉想看的部位。

## 六、两个曾经让截图「不是真机画面」的坑

1. **贴图从来没加载过**。`sprites.js` 的 `BASE` 是 `/assets/games/shoot/`——这是小程序
   「代码包根目录」的绝对路径，浏览器里会被解析成 `file:///assets/...` → 404，
   整屏长期退回矢量兜底。**在修 `setBase()` 之前，所有预览截图画的都是矢量小人，
   不是真实的飞船贴图。** 现在 `canvas-main.js` 启动时会调
   `setBase('../../assets/games/shoot/')`，别删。
2. **`engine.stopLoop()` 是空操作**。引擎的方法名是 `_stopLoop`，所谓「冻结」其实从没停过，
   400ms 后内部循环又把画面刷走了 —— 截出来的图和以为的那一帧不是同一帧（表现是
   `?face=` 定格失效、分数还在涨）。现在统一走 `freezeEngine()`。

判断预览是否真的加载了贴图：看子弹。矢量兜底的子弹是**青色细线**，贴图版是
**绿色胶囊状激光**。看到青线就说明贴图没进来。
