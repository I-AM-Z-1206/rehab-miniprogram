# pkgFruit/assets/sprites —— 素材来源

## 3D 模型（Polyfork，https://polyfork.dev）
免费层资产（≤600 tris），商用免署名。模型源文件在 ../models/。

| 精灵 | 模型 id | 三角形 |
|---|---|---|
| fruit-apple.png | apple-b15012 | 276 |
| fruit-golden.png | apple-b15012（顶点色改金，见 from_polyfork.py） | 276 |
| fruit-orange.png | orange-ea3791 | 306 |
| fruit-banana.png | banana-09c206 | 286 |
| fruit-strawberry.png | strawberry-57b7d5 | 129 |
| fruit-watermelon.png | watermelon-slice-bd255f | 108 |

渲染管线：tools/blender/from_polyfork.py（Blender 5.2 WORKBENCH **顶点色模式**，
正交相机，统一摄影棚光，透明底）。西瓜采用 Polyfork 的切片模型（游戏语义本来就是切片）。
果篮 basket 沿用矢量绘制（drawBasket），未采用外部模型 —— 没有合适的敞口编织篮。

## 程序化建模
fruit-golden.png —— tools/blender/fruits.py（黄金苹果为自建，Polyfork 无对应模型）
