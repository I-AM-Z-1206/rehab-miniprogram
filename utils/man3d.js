// utils/man3d.js —— 3D 小人渲染（基于 threejs-miniprogram）
// 借鉴：
//   - BrianLesko/imu-three.js：把 IMU 的 roll/pitch/yaw 映射到 3D 模型旋转
//   - boytchev/mannequin.js：纯代码程序化构建人体，无需外部模型文件
// 对外接口：
//   init(canvasNode) → 初始化场景与小人（canvas 尺寸由页面按舞台实际大小设置好）
//   setPose({ roll, pitch, yaw }) → 实时喂入姿态角（度），小人旋转
//   setFlash(on) → 达标瞬间放大反馈
//   resize(w, h) → canvas 尺寸变化
//   dispose() → 释放资源
//
// 造型说明（Q 版 chibi 风格，圆润友好，适合康复场景）：
//   大头 + 蛋形躯干 + 球形关节（肩/肘/膝）+ 小鞋子，脚底贴合 y=0 地面
const { createScopedThreejs } = require('../libs/three.miniprogram.js')

let THREE = null
let renderer = null
let scene = null
let camera = null
let man = null
let armL = null
let armR = null
let canvas = null
let rafId = null
let flashTimer = null

// 目标姿态（来自传感器），渲染循环用插值平滑过渡，避免抖动
let targetRoll = 0
let targetPitch = 0
let targetYaw = 0

function deg2rad(d) {
  return (d * Math.PI) / 180
}

// ---------- 程序化构建 Q 版 3D 小人 ----------
function buildMan() {
  const root = new THREE.Group()

  // 材质：Phong 低光泽，柔和立体
  const matSkin = new THREE.MeshPhongMaterial({ color: 0xffdfae, shininess: 18, specular: 0x222222 })
  const matSkinDark = new THREE.MeshPhongMaterial({ color: 0xe8b56f, shininess: 18, specular: 0x222222 })
  const matBody = new THREE.MeshPhongMaterial({ color: 0x14b8a6, shininess: 22, specular: 0x223333 })
  const matShorts = new THREE.MeshPhongMaterial({ color: 0x0d8a7c, shininess: 20, specular: 0x223333 })
  const matLimb = new THREE.MeshPhongMaterial({ color: 0x0f9384, shininess: 20, specular: 0x223333 })
  const matLeg = new THREE.MeshPhongMaterial({ color: 0x3b5b8f, shininess: 20, specular: 0x223333 })
  const matKnee = new THREE.MeshPhongMaterial({ color: 0x34507e, shininess: 20, specular: 0x223333 })
  const matShoe = new THREE.MeshPhongMaterial({ color: 0x223252, shininess: 30, specular: 0x333333 })
  const matEye = new THREE.MeshPhongMaterial({ color: 0x2b3446, shininess: 60 })
  const matWhite = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const matBlush = new THREE.MeshBasicMaterial({ color: 0xf2a9a2, transparent: true, opacity: 0.75 })

  // ---- 头（大，Q 版比例） ----
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.72, 40, 40), matSkin)
  head.position.y = 4.15
  root.add(head)

  // 眼睛 + 高光
  ;[-1, 1].forEach((s) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 18), matEye)
    eye.position.set(0.24 * s, 4.27, 0.66)
    root.add(eye)
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), matWhite)
    hl.position.set(0.24 * s + 0.032, 4.3, 0.72)
    root.add(hl)
  })

  // 微笑（下半圆环）
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.032, 10, 24, Math.PI), matEye)
  smile.position.set(0, 3.93, 0.63)
  smile.rotation.z = Math.PI
  root.add(smile)

  // 腮红
  ;[-1, 1].forEach((s) => {
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.085, 20), matBlush)
    blush.position.set(0.45 * s, 4.02, 0.55)
    root.add(blush)
  })

  // 脖子
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.3, 18), matSkinDark)
  neck.position.y = 3.5
  root.add(neck)

  // ---- 躯干（蛋形：缩放球体，平滑无接缝） ----
  const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 36), matBody)
  torso.scale.set(0.78, 0.95, 0.62)
  torso.position.y = 2.55
  root.add(torso)

  // 短裤（下层蛋形，深色，露出一点更可爱）
  const shorts = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), matShorts)
  shorts.scale.set(0.8, 0.5, 0.66)
  shorts.position.y = 1.62
  root.add(shorts)

  // ---- 手臂（肩球 + 上臂 + 肘球 + 前臂 + 手球） ----
  function makeArm(side) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.27, 22, 22), matLimb)
    shoulder.position.set(0.88 * side, 3.05, 0)
    root.add(shoulder)

    const arm = new THREE.Group()
    arm.position.set(0.9 * side, 3.0, 0)
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.6, 18), matLimb)
    upper.position.y = -0.3
    arm.add(upper)
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 18), matSkin)
    elbow.position.y = -0.62
    arm.add(elbow)
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.55, 18), matSkin)
    fore.position.y = -0.92
    arm.add(fore)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 18), matSkin)
    hand.position.y = -1.3
    arm.add(hand)
    // 自然下垂略外展
    arm.rotation.z = 0.28 * side
    root.add(arm)
    return arm
  }
  armL = makeArm(1)
  armR = makeArm(-1)

  // ---- 腿（大腿 + 膝球 + 小腿 + 小鞋子），脚底贴 y=0 ----
  function makeLeg(side) {
    const leg = new THREE.Group()
    leg.position.set(0.42 * side, 1.15, 0)
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.23, 0.55, 18), matLeg)
    thigh.position.y = -0.28
    leg.add(thigh)
    const knee = new THREE.Group()
    knee.position.y = -0.56
    leg.add(knee)
    const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 18), matKnee)
    knee.add(kneeBall)
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.46, 18), matLeg)
    shin.position.y = -0.23
    knee.add(shin)
    // 小鞋子：压扁拉长的球，鞋头朝前
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 20), matShoe)
    shoe.scale.set(1, 0.5, 1.45)
    shoe.position.set(0, -0.47, 0.12)
    knee.add(shoe)
    root.add(leg)
    return leg
  }
  makeLeg(1)
  makeLeg(-1)

  return root
}

// ---------- 初始化 ----------
function init(canvasNode) {
  canvas = canvasNode
  THREE = createScopedThreejs(canvas)

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2
  renderer.setPixelRatio(dpr)
  renderer.setSize(canvas.width, canvas.height, false)

  scene = new THREE.Scene()

  // 相机取景：小人总高约 4.9 单位，占画面约 70%
  camera = new THREE.PerspectiveCamera(40, canvas.width / canvas.height, 0.1, 100)
  camera.position.set(0, 2.6, 9.4)
  camera.lookAt(0, 2.5, 0)

  // 光照：半球光（天蓝地暗）+ 主光 + 逆光轮廓
  scene.add(new THREE.HemisphereLight(0xcfe5ff, 0x22314e, 0.85))
  const dir = new THREE.DirectionalLight(0xffffff, 0.75)
  dir.position.set(5, 9, 7)
  scene.add(dir)
  const rim = new THREE.DirectionalLight(0x9fd8ff, 0.25)
  rim.position.set(-6, 3, -4)
  scene.add(rim)

  // 地面圆盘 + 青绿圆环（舞台感）
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 56),
    new THREE.MeshPhongMaterial({ color: 0x16233c, transparent: true, opacity: 0.4 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = 0
  scene.add(ground)

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.42, 2.6, 56),
    new THREE.MeshBasicMaterial({ color: 0x14b8a6, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.02
  scene.add(ring)

  man = buildMan()
  // 欧拉旋转顺序：先 yaw(Y) 再 pitch(X) 再 roll(Z)，侧倾最直观
  man.rotation.order = 'YXZ'
  scene.add(man)

  loop()
}

function loop() {
  rafId = canvas.requestAnimationFrame(loop)
  if (!man) return

  // 姿态插值平滑
  man.rotation.x += (deg2rad(targetPitch) - man.rotation.x) * 0.3
  man.rotation.z += (deg2rad(targetRoll) - man.rotation.z) * 0.3
  man.rotation.y += (deg2rad(targetYaw) - man.rotation.y) * 0.3

  // 待机呼吸 + 手臂轻微摆动，让小人有生命感
  const t = Date.now()
  man.position.y = Math.sin(t * 0.0016) * 0.035
  if (armL && armR) {
    const sway = Math.sin(t * 0.0012) * 0.045
    armL.rotation.z = 0.28 + sway
    armR.rotation.z = -0.28 - sway
  }

  if (renderer && scene && camera) renderer.render(scene, camera)
}

// ---------- 对外接口 ----------
function setPose(p) {
  if (!p) return
  if (typeof p.roll === 'number') targetRoll = p.roll
  if (typeof p.pitch === 'number') targetPitch = p.pitch
  if (typeof p.yaw === 'number') targetYaw = p.yaw
}

function setFlash(on) {
  if (!man) return
  clearTimeout(flashTimer)
  if (on) {
    man.scale.setScalar(1.12)
    flashTimer = setTimeout(() => {
      if (man) man.scale.setScalar(1)
    }, 320)
  } else {
    man.scale.setScalar(1)
  }
}

function resize(w, h) {
  if (!canvas || !renderer || !camera) return
  canvas.width = w
  canvas.height = h
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

function dispose() {
  if (rafId != null && canvas) {
    canvas.cancelAnimationFrame(rafId)
    rafId = null
  }
  clearTimeout(flashTimer)
  flashTimer = null
  if (scene) {
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose && obj.geometry.dispose()
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose && m.dispose())
        else obj.material.dispose && obj.material.dispose()
      }
    })
    scene = null
  }
  if (renderer) {
    renderer.dispose && renderer.dispose()
    renderer.forceContextLoss && renderer.forceContextLoss()
    renderer = null
  }
  THREE = null
  man = null
  armL = null
  armR = null
  canvas = null
  targetRoll = targetPitch = targetYaw = 0
}

module.exports = { init, setPose, setFlash, resize, dispose }