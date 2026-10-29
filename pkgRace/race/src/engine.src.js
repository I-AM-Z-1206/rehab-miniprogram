var ge = Object.defineProperty;
var Ne = Object.getOwnPropertyDescriptor;
var Ue = Object.getOwnPropertyNames;
var Ye = Object.prototype.hasOwnProperty;
var We = (a, e) => {
    for (var t in e) ge(a, t, { get: e[t], enumerable: !0 });
  },
  Fe = (a, e, t, i) => {
    if ((e && typeof e == "object") || typeof e == "function")
      for (let s of Ue(e))
        !Ye.call(a, s) &&
          s !== t &&
          ge(a, s, {
            get: () => e[s],
            enumerable: !(i = Ne(e, s)) || i.enumerable,
          });
    return a;
  };
var $e = (a) => Fe(ge({}, "__esModule", { value: !0 }), a);
var xe = {};
We(xe, { GameEngine: () => me });
module.exports = $e(xe);
var I = { designWidth: 1334, designHeight: 750, maxDpr: 2 },
  c = {
    sky0: "#05000f",
    sky1: "#1b0140",
    sky2: "#3d0a5c",
    neonBlue: "#00e5ff",
    neonPink: "#ff2ea6",
    neonGreen: "#39ff88",
    neonPurple: "#9b5cff",
    neonYellow: "#ffe14d",
    road: "#0b0b18",
    roadAlt: "#12122a",
    grass: "#08021a",
    grassAlt: "#10032c",
    lane: "rgba(0,229,255,0.85)",
    rumble: "#ff2ea6",
    rumbleAlt: "#00e5ff",
    text: "#eaf6ff",
    textDim: "rgba(234,246,255,0.55)",
    warn: "#ff3b5c",
    ok: "#39ff88",
  },
  w = {
    segmentLength: 200,
    rumbleLength: 3,
    roadWidth: 2200,
    lanes: 3,
    cameraHeight: 1150,
    cameraDepth: 0.72,
    drawDistance: 200,
    fogDensity: 4.2,
    centrifugal: 0.36,
    accelFactor: 5600,
    brakeFactor: 11e3,
    decelFactor: 2400,
    offRoadDecel: 7e3,
    offRoadLimit: 4200,
    steerRate: 2.6,
    crashSlow: 0.42,
  },
  be = { halfWidth: 0.13, widthAtMaxSpeed: 0.62, nitroThreshold: 0.82 },
  U = [
    null,
    {
      level: 1,
      name: "L1 卧榻起步",
      seed: 20250101,
      maxSpeed: 6200,
      density: 0.16,
      curve: 1.6,
      hill: 0.5,
      movingRatio: 0,
      ringRatio: 0.35,
      sessionSeconds: 120,
    },
    {
      level: 2,
      name: "L2 坐姿巡航",
      seed: 20250102,
      maxSpeed: 7800,
      density: 0.24,
      curve: 2.4,
      hill: 1,
      movingRatio: 0.05,
      ringRatio: 0.3,
      sessionSeconds: 150,
    },
    {
      level: 3,
      name: "L3 站立平衡",
      seed: 20250103,
      maxSpeed: 9400,
      density: 0.32,
      curve: 3.2,
      hill: 1.4,
      movingRatio: 0.12,
      ringRatio: 0.26,
      sessionSeconds: 180,
    },
    {
      level: 4,
      name: "L4 动态抗扰",
      seed: 20250104,
      maxSpeed: 10800,
      density: 0.4,
      curve: 4,
      hill: 1.8,
      movingRatio: 0.2,
      ringRatio: 0.22,
      sessionSeconds: 180,
    },
    {
      level: 5,
      name: "L5 极限协调",
      seed: 20250105,
      maxSpeed: 12e3,
      density: 0.5,
      curve: 4.8,
      hill: 2.2,
      movingRatio: 0.28,
      ringRatio: 0.18,
      sessionSeconds: 210,
    },
  ],
  we = {
    rollSensitivity: 1,
    pitchSensitivity: 1,
    deadZone: 3.5,
    maxAngle: 20,
    brakeAngle: 8,
    smoothing: 0.35,
    assist: 0.18,
    invertRoll: !1,
    invertPitch: !1,
    difficulty: 2,
    sessionSeconds: 150,
    patientWeight: 60,
    vibration: !0,
  },
  O = {
    preferredNotifyUUIDs: [
      "0000ffe4-0000-1000-8000-00805f9b34fb",
      "0000ffe9-0000-1000-8000-00805f9b34fb",
      "0000ffe1-0000-1000-8000-00805f9b34fb",
      "0000fff1-0000-1000-8000-00805f9b34fb",
    ],
    nameFilter: /wt|wit|901|imu|ble/i,
    scanTimeoutMs: 25e3,
    mountPoint: "腋下最高点",
    cmdUnlock: [255, 170, 105, 136, 181],
    cmdSave: [255, 170, 0, 0, 0],
  },
  ye = "";
var Y = { ACCEL: 81, GYRO: 82, ANGLE: 83, MAG: 84, FULL: 97 };
function qe(a) {
  return a === Y.FULL ? 20 : a >= 80 && a <= 95 ? 11 : 0;
}
function P(a, e) {
  let t = a[e] | (a[e + 1] << 8);
  return (t & 32768 && (t -= 65536), t);
}
function Ve(a) {
  let e = 0;
  for (let t = 0; t < a.length - 1; t++) e += a[t];
  return (e & 255) === a[a.length - 1];
}
var j = class {
  constructor() {
    ((this.buffer = []), (this.stats = { frames: 0, dropped: 0 }));
  }
  push(e) {
    let t = e instanceof Uint8Array ? e : new Uint8Array(e);
    for (let i = 0; i < t.length; i++) this.buffer.push(t[i] & 255);
    return this.consume();
  }
  consume() {
    let e = [],
      t = 0;
    for (; t++ < 64;) {
      let i = this.buffer,
        s = i.indexOf(85);
      if (s < 0) {
        i.length = 0;
        break;
      }
      if ((s > 0 && i.splice(0, s), i.length < 2)) break;
      let n = i[1],
        o = qe(n);
      if (!o) {
        (i.shift(), this.stats.dropped++);
        continue;
      }
      if (i.length < o) break;
      let r = i.slice(0, o);
      if (!Ve(r)) {
        (i.shift(), this.stats.dropped++);
        continue;
      }
      i.splice(0, o);
      let l = this.decode(n, r);
      l && (e.push(l), this.stats.frames++);
    }
    return e;
  }
  decode(e, t) {
    switch (e) {
      case Y.ACCEL:
        return {
          kind: "accel",
          accel: {
            x: (P(t, 2) / 32768) * 16,
            y: (P(t, 4) / 32768) * 16,
            z: (P(t, 6) / 32768) * 16,
          },
          temp: P(t, 8) / 100,
        };
      case Y.GYRO:
        return {
          kind: "gyro",
          gyro: {
            x: (P(t, 2) / 32768) * 2e3,
            y: (P(t, 4) / 32768) * 2e3,
            z: (P(t, 6) / 32768) * 2e3,
          },
        };
      case Y.ANGLE:
        return {
          kind: "angle",
          angle: {
            roll: (P(t, 2) / 32768) * 180,
            pitch: (P(t, 4) / 32768) * 180,
            yaw: (P(t, 6) / 32768) * 180,
          },
        };
      case Y.FULL:
        return {
          kind: "full",
          accel: {
            x: (P(t, 2) / 32768) * 16,
            y: (P(t, 4) / 32768) * 16,
            z: (P(t, 6) / 32768) * 16,
          },
          gyro: {
            x: (P(t, 8) / 32768) * 2e3,
            y: (P(t, 10) / 32768) * 2e3,
            z: (P(t, 12) / 32768) * 2e3,
          },
          angle: {
            roll: (P(t, 14) / 32768) * 180,
            pitch: (P(t, 16) / 32768) * 180,
            yaw: (P(t, 18) / 32768) * 180,
          },
        };
      default:
        return null;
    }
  }
};
var m = (a, e, t) => (a < e ? e : a > t ? t : a),
  K = (a, e, t) => a + (e - a) * t;
var Z = (a, e, t) => a + (e - a) * t * t;
var W = (a, e, t) => a + (e - a) * (-Math.cos(t * Math.PI) / 2 + 0.5),
  J = (a, e, t) => {
    let i = a + e;
    for (; i >= t;) i -= t;
    for (; i < 0;) i += t;
    return i;
  };
var T = (a, e) => a + Math.random() * (e - a);
function v(a, e) {
  let t = a.replace("#", ""),
    i = parseInt(
      t.length === 3
        ? t
            .split("")
            .map((s) => s + s)
            .join("")
        : t,
      16,
    );
  return `rgba(${(i >> 16) & 255},${(i >> 8) & 255},${i & 255},${e})`;
}
function ve(a, e) {
  let t = a.replace("#", ""),
    i = parseInt(
      t.length === 3
        ? t
            .split("")
            .map((r) => r + r)
            .join("")
        : t,
      16,
    ),
    s = Math.round(((i >> 16) & 255) * e),
    n = Math.round(((i >> 8) & 255) * e),
    o = Math.round((i & 255) * e);
  return `rgb(${s},${n},${o})`;
}
function Se(a, e, t, i, s, n, o, r) {
  ((a.camera.x = (a.world.x || 0) - e),
    (a.camera.y = (a.world.y || 0) - t),
    (a.camera.z = (a.world.z || 0) - i),
    (a.screen.scale = s / a.camera.z),
    (a.screen.x = Math.round(n / 2 + (a.screen.scale * a.camera.x * n) / 2)),
    (a.screen.y = Math.round(o / 2 - (a.screen.scale * a.camera.y * o) / 2)),
    (a.screen.w = Math.round((a.screen.scale * r * n) / 2)));
}
function Le(a, e, t, i, s = 1) {
  let n = s / 2,
    o = a - e * n,
    r = a + e * n,
    l = t - i * n,
    h = t + i * n;
  return !(r < l || o > h);
}
var H = (a, e, t, i) => a + (e - a) * (1 - Math.exp(-t * i));
var je = 50,
  X = class {
    constructor() {
      ((this.target = { roll: 0, pitch: 0 }),
        (this.current = { roll: 0, pitch: 0 }),
        (this.acc = 0),
        (this.noiseAmp = 0.55),
        (this.spikeChance = 0.01),
        (this.yaw = 0),
        (this.enabled = !1));
    }
    enable() {
      this.enabled = !0;
    }
    disable() {
      this.enabled = !1;
    }
    setInput(e, t) {
      ((this.target.roll = m(e, -1, 1) * 30),
        (this.target.pitch = m(t, -1, 1) * 30));
    }
    tick(e) {
      if (!this.enabled) return [];
      this.acc += e;
      let t = 1 / je,
        i = [],
        s = 0;
      for (; this.acc >= t && s++ < 8;) {
        this.acc -= t;
        let n = 0.22;
        ((this.current.roll += (this.target.roll - this.current.roll) * n),
          (this.current.pitch += (this.target.pitch - this.current.pitch) * n));
        let o = Math.random() < this.spikeChance ? Math.random() * 8 - 4 : 0,
          r = () => (Math.random() * 2 - 1) * this.noiseAmp;
        i.push({
          angle: {
            roll: this.current.roll + r() + o,
            pitch: this.current.pitch + r(),
            yaw: (this.yaw += (Math.random() - 0.5) * 0.4),
          },
          gyro: {
            x: (this.target.roll - this.current.roll) * 8,
            y: (this.target.pitch - this.current.pitch) * 8,
            z: 0,
          },
          accel: { x: 0, y: 0, z: 1 },
        });
      }
      return i;
    }
    reset() {
      ((this.current = { roll: 0, pitch: 0 }),
        (this.target = { roll: 0, pitch: 0 }));
    }
  };
var C = class {
  constructor() {
    this._handlers = {};
  }
  on(e, t) {
    return (
      this._handlers[e] || (this._handlers[e] = []),
      this._handlers[e].push(t),
      () => this.off(e, t)
    );
  }
  off(e, t) {
    let i = this._handlers[e];
    if (!i) return;
    let s = i.indexOf(t);
    s >= 0 && i.splice(s, 1);
  }
  emit(e, t) {
    let i = this._handlers[e];
    if (i) for (let s = 0; s < i.length; s++) i[s](t);
  }
};
var F = typeof wx != "undefined",
  Ke = (a) => new Promise((e) => setTimeout(e, a));
function z(a, e = {}) {
  return new Promise((t, i) => {
    if (!F || typeof a != "function")
      return i(new Error("当前环境不支持微信 BLE API"));
    a(
      Object.assign({}, e, {
        success: t,
        fail: (s) => i(s || new Error("API 调用失败")),
      }),
    );
  });
}
var Q = class extends C {
  constructor() {
    (super(),
      (this.state = "idle"),
      (this.devices = []),
      (this.allDevices = []),
      (this.showAll = !1),
      (this.lastError = ""),
      (this.hint = ""),
      (this._foundBound = !1),
      (this._scanTimer = null),
      (this._stopTimer = null),
      (this.deviceId = null),
      (this.serviceId = null),
      (this.characteristicId = null),
      (this.parser = new j()),
      (this.mock = new X()),
      (this.isMock = !1),
      (this.latest = {
        angle: { roll: 0, pitch: 0, yaw: 0 },
        gyro: { x: 0, y: 0, z: 0 },
        accel: { x: 0, y: 0, z: 1 },
      }),
      (this.sampleRate = 0),
      (this._sampleCount = 0),
      (this._rateTs = 0),
      (this._partial = null),
      (this._partialTs = 0));
  }
  _setState(e, t = "") {
    ((this.state = e), this.emit("state", { state: e, message: t }));
  }
  async init() {
    if (!F) return (this.enableMock("非微信环境，自动进入 Debug 模拟模式"), !1);
    if (!(await this._ensurePrivacy())) return !1;
    try {
      return (
        await z(wx.openBluetoothAdapter, { mode: "central" }),
        this._adapterBound ||
          ((this._adapterBound = !0),
          wx.onBluetoothAdapterStateChange &&
            wx.onBluetoothAdapterStateChange((t) => {
              (t.available ||
                ((this.lastError = "adapter unavailable"),
                (this.hint =
                  "系统蓝牙不可用：请打开手机蓝牙（安卓还需开启定位/GPS），然后返回重试"),
                this._setState("error", this.hint)),
                !t.discovering &&
                  this.state === "scanning" &&
                  this._setState("idle", "搜索已停止"));
            }),
          wx.onBLEConnectionStateChange &&
            wx.onBLEConnectionStateChange((t) => {
              !t.connected &&
                this.state === "connected" &&
                this._setState("idle", "传感器已断开");
            })),
        (this.lastError = ""),
        (this.hint = ""),
        this._setState("idle", "蓝牙适配器就绪"),
        !0
      );
    } catch (t) {
      return (this._fail(t), !1);
    }
  }
  _ensurePrivacy() {
    return new Promise((e) => {
      if (!F || !wx.getPrivacySetting) return e(!0);
      wx.getPrivacySetting({
        success: (t) => {
          if (!t.needAuthorization) return e(!0);
          (this._setState("privacy", "需同意隐私协议后才能使用蓝牙"),
            this.emit("privacy", t),
            e(!1));
        },
        fail: () => e(!0),
      });
    });
  }
  _fail(e) {
    let t = String(
      (e && (e.errMsg || e.errCode || e.message)) || e || "未知错误",
    );
    this.lastError = t;
    let i =
      "排查：① 开发者工具不支持蓝牙，必须真机调试；② 手机需开启蓝牙，安卓还需开启定位/GPS 并给微信定位权限；③ 传感器是否上电、是否已被其他 App 连接（BLE 被连接后会停止广播）；④ 小程序后台是否配置了《用户隐私保护指引》并勾选蓝牙。";
    return (
      /1026|announce your privacy/i.test(t)
        ? (i =
            "隐私接口未声明（errno 1026）：请到 mp.weixin.qq.com →「设置-服务内容声明-用户隐私保护指引」中添加「蓝牙」并发布，然后重新编译真机调试。")
        : /authorize|auth deny|permission|隐私|privacy/i.test(t)
          ? (i =
              "蓝牙权限未授权：请在手机「设置-微信」中开启蓝牙与定位权限，并确认小程序后台已配置《用户隐私保护指引》并勾选「蓝牙」。")
          : /location|定位|gps/i.test(t)
            ? (i =
                "安卓扫描 BLE 必须开启定位服务（GPS）并授予微信定位权限，请开启后重试。")
            : /not available|unavailable|adapter|state/i.test(t)
              ? (i =
                  "系统蓝牙未开启或不可用：请打开手机蓝牙后重试（安卓同时需要开启定位）。")
              : /already connect|10004|10005|service/i.test(t) &&
                (i =
                  "该传感器可能已被其他 App 连接，或刚断开仍处于锁定状态：请在其他 App 中断开，等待 5 秒后重连。"),
      (this.hint = i),
      this._setState("error", `蓝牙异常：${t}`),
      i
    );
  }
  async startScan() {
    if (
      this.isMock ||
      ((this.devices = []), (this.allDevices = []), !(await this.init()))
    )
      return !1;
    (this._bindFound(),
      this._setState("scanning", "正在搜索 BLE 设备…（请确保传感器已上电）"));
    try {
      await z(wx.startBluetoothDevicesDiscovery, {
        allowDuplicatesKey: !0,
        interval: 0,
      });
    } catch (t) {
      return (this._fail(t), !1);
    }
    return (
      this._scanTimer && clearInterval(this._scanTimer),
      (this._scanTimer = setInterval(() => this._refreshViaGet(), 2500)),
      this._stopTimer && clearTimeout(this._stopTimer),
      (this._stopTimer = setTimeout(() => this.stopScan(), O.scanTimeoutMs)),
      !0
    );
  }
  _bindFound() {
    this._foundBound ||
      !wx.onBluetoothDeviceFound ||
      ((this._foundBound = !0),
      wx.onBluetoothDeviceFound((e) => this._mergeDevices(e.devices || [])));
  }
  _mergeDevices(e) {
    for (let t of e) {
      if (!t || !t.deviceId) continue;
      let i = t.name || t.localName || "",
        s = O.nameFilter.test(i);
      if (
        (this.allDevices.find((o) => o.deviceId === t.deviceId) ||
          this.allDevices.push({
            deviceId: t.deviceId,
            name: i || "(未知名称)",
            RSSI: t.RSSI,
            match: s,
          }),
        (!s && !t.advertisData) ||
          this.devices.find((o) => o.deviceId === t.deviceId))
      )
        continue;
      let n = { deviceId: t.deviceId, name: i || "(未知名称)", RSSI: t.RSSI };
      (this.devices.push(n), this.emit("device", n));
    }
  }
  _refreshViaGet() {
    wx.getBluetoothDevices &&
      wx.getBluetoothDevices({
        success: (e) => this._mergeDevices(e.devices || []),
        fail: () => {},
      });
  }
  stopScan() {
    (this._scanTimer &&
      (clearInterval(this._scanTimer), (this._scanTimer = null)),
      this._stopTimer &&
        (clearTimeout(this._stopTimer), (this._stopTimer = null)),
      F &&
        (this._refreshViaGet(),
        wx.stopBluetoothDevicesDiscovery({
          success: () => {
            this.state === "scanning" &&
              this._setState(
                "idle",
                `搜索结束，共发现 ${this.allDevices.length} 个设备`,
              );
          },
          fail: () => {},
        })));
  }
  get displayDevices() {
    return this.showAll ? this.allDevices : this.devices;
  }
  async connect(e) {
    ((this.deviceId = e), this._setState("connecting", "正在连接传感器…"));
    try {
      await z(wx.createBLEConnection, { deviceId: e, timeout: 8e3 });
      let t = null;
      for (let n = 0; n < 3; n++) {
        try {
          if (
            ((t = await z(wx.getBLEDeviceServices, { deviceId: e })),
            t && t.services && t.services.length)
          )
            break;
          t = null;
        } catch (o) {
          if (n === 2) throw o;
          this._setState("connecting", `正在获取服务…（重试 ${n + 1}/2）`);
        }
        await Ke(1200);
      }
      if (!t) throw new Error("未发现任何 BLE 服务");
      let i = null,
        s = [];
      for (let n of t.services || []) {
        let o = await z(wx.getBLEDeviceCharacteristics, {
          deviceId: e,
          serviceId: n.uuid,
        });
        for (let r of o.characteristics || []) {
          if (!(r.properties && (r.properties.notify || r.properties.indicate)))
            continue;
          let h = (r.uuid || "").toLowerCase(),
            f = O.preferredNotifyUUIDs.indexOf(h) >= 0 ? 2 : 1;
          s.push({ serviceId: n.uuid, characteristicId: r.uuid, score: f });
        }
      }
      if (
        (s.sort((n, o) => o.score - n.score),
        (i = s[0]),
        i ||
          ((i = {
            serviceId: null,
            characteristicId: O.preferredNotifyUUIDs[0],
          }),
          this._setState(
            "connecting",
            "未发现 notify 特征，使用默认 UUID 兜底",
          )),
        (this.serviceId = i.serviceId),
        (this.characteristicId = i.characteristicId),
        wx.setBLEMTU)
      )
        try {
          await z(wx.setBLEMTU, { deviceId: e, mtu: 247 });
        } catch (n) {}
      return (
        this._sendWitCommand(O.cmdUnlock).catch(() => {}),
        await z(wx.notifyBLECharacteristicValueChange, {
          deviceId: e,
          serviceId: i.serviceId || void 0,
          characteristicId: i.characteristicId,
          state: !0,
        }),
        wx.onBLECharacteristicValueChange &&
          wx.onBLECharacteristicValueChange((n) => {
            this._onData(n.value);
          }),
        this._setState(
          "connected",
          "WT9011 已连接（佩戴位置：" + O.mountPoint + "）",
        ),
        !0
      );
    } catch (t) {
      return (this._fail(t), !1);
    }
  }
  async disconnect() {
    if (this.deviceId && F)
      try {
        await z(wx.closeBLEConnection, { deviceId: this.deviceId });
      } catch (e) {}
    ((this.deviceId = null), this._setState("idle", "已断开"));
  }
  _sendWitCommand(e) {
    if (!this.deviceId || !this.serviceId) return Promise.resolve(!1);
    let t = new Uint8Array(e).buffer;
    return z(wx.writeBLECharacteristicValue, {
      deviceId: this.deviceId,
      serviceId: this.serviceId,
      characteristicId: this.characteristicId,
      value: t,
    })
      .then(() => !0)
      .catch(() => !1);
  }
  _onData(e) {
    let t = this.parser.push(e);
    if (!t.length) return;
    let i = Date.now();
    for (let s of t)
      s.kind === "full"
        ? this._commit(s.angle, s.gyro, s.accel)
        : s.kind === "angle"
          ? this._commit(
              s.angle,
              this._partial ? this._partial.gyro : null,
              this._partial ? this._partial.accel : null,
            )
          : ((this._partial = this._partial || { ts: i }),
            (this._partial.ts = i),
            s.kind === "accel" && (this._partial.accel = s.accel),
            s.kind === "gyro" && (this._partial.gyro = s.gyro));
    ((this._sampleCount += t.length),
      this._rateTs || (this._rateTs = i),
      i - this._rateTs >= 1e3 &&
        ((this.sampleRate = Math.round(
          (this._sampleCount * 1e3) / (i - this._rateTs),
        )),
        (this._sampleCount = 0),
        (this._rateTs = i)));
  }
  _commit(e, t, i) {
    let s = {
      angle: e || this.latest.angle,
      gyro: t || { x: 0, y: 0, z: 0 },
      accel: i || { x: 0, y: 0, z: 1 },
      ts: Date.now(),
    };
    ((this.latest = s), this.emit("sample", s));
  }
  enableMock(e = "Debug 模拟模式") {
    ((this.isMock = !0), this.mock.enable(), this._setState("mock", e));
  }
  setMockInput(e, t) {
    this.mock.setInput(e, t);
  }
  tickMock(e) {
    if (!this.isMock) return;
    let t = this.mock.tick(e);
    for (let i of t) this._commit(i.angle, i.gyro, i.accel);
    this.sampleRate = 50;
  }
  injectSample(e) {
    this._commit(e.angle, e.gyro, e.accel);
  }
  get statusText() {
    switch (this.state) {
      case "connected":
        return `传感器已连接 ${this.sampleRate}Hz`;
      case "mock":
        return "Debug 模拟模式（键盘/触摸）";
      case "scanning":
        return "搜索中…";
      case "connecting":
        return "连接中…";
      case "error":
        return "蓝牙异常";
      default:
        return "未连接传感器";
    }
  }
};
var Me = class {
    constructor(e = 0.02, t = 1.6, i = 0) {
      ((this.q = e), (this.r = t), (this.x = i), (this.p = 1), (this.k = 0));
    }
    filter(e) {
      return (
        (this.p += this.q),
        (this.k = this.p / (this.p + this.r)),
        (this.x += this.k * (e - this.x)),
        (this.p *= 1 - this.k),
        this.x
      );
    }
    reset(e = 0) {
      ((this.x = e), (this.p = 1));
    }
  },
  ke = class {
    constructor(e = 6) {
      ((this.size = e), (this.buf = []));
    }
    push(e, t = 0.35) {
      this.buf.push(e);
      let i = Math.max(2, Math.round(2 + t * 18));
      for (; this.buf.length > i;) this.buf.shift();
      let s = 0,
        n = 0,
        o = this.buf.length;
      for (let r = 0; r < o; r++) {
        let l = 1 + (r / Math.max(1, o - 1)) * (1 - t) * 4;
        ((s += this.buf[r] * l), (n += l));
      }
      return s / n;
    }
    reset() {
      this.buf.length = 0;
    }
  },
  $ = class {
    constructor(e = 0) {
      ((this.kalman = new Me(0.3, 1, e)),
        (this.wma = new ke(6)),
        (this.value = e));
    }
    update(e, t = 0.35) {
      let i = this.kalman.filter(e);
      return ((this.value = this.wma.push(i, t)), this.value);
    }
    reset(e = 0) {
      (this.kalman.reset(e), this.wma.reset(), (this.value = e));
    }
  };
var Pe = {},
  Te = typeof wx != "undefined" && typeof wx.getStorageSync == "function";
function q(a, e) {
  try {
    let t = Te ? wx.getStorageSync(a) : Pe[a];
    if (t === "" || t === void 0 || t === null) return e;
    let i = typeof t == "string" ? JSON.parse(t) : t;
    return i == null ? e : i;
  } catch (t) {
    return e;
  }
}
function N(a, e) {
  try {
    let t = JSON.stringify(e);
    return (Te ? wx.setStorageSync(a, t) : (Pe[a] = t), !0);
  } catch (t) {
    return !1;
  }
}
function Ee(a) {
  try {
    Te ? wx.removeStorageSync(a) : delete Pe[a];
  } catch (e) {}
}
var D = {
  therapist: "nrr_therapist_params_v1",
  leaderboard: "nrr_leaderboard_v1",
  patient: "nrr_patient_v1",
  device: "nrr_last_device_v1",
};
var x = class {
  constructor(e) {
    ((this.ble = e),
      (this.params = Object.assign({}, we, q(D.therapist, {}))),
      (this.rollFilter = new $(0)),
      (this.pitchFilter = new $(0)),
      (this.neutral = { roll: 0, pitch: 0 }),
      (this.calibrating = !1),
      (this._calBuf = []),
      (this.raw = { roll: 0, pitch: 0, yaw: 0 }),
      (this.smoothed = { roll: 0, pitch: 0 }),
      (this.vel = { roll: 0, pitch: 0 }),
      (this.jitter = 0),
      (this.control = { steer: 0, throttle: 0, brake: 0 }),
      (this.match = 1),
      (this.stability = 1),
      (this.target = { roll: 0, pitch: 0 }),
      (this._last = { roll: 0, pitch: 0 }),
      (this.connected = !1),
      e &&
        (e.on("sample", (t) => this.onSample(t)),
        e.on("state", (t) => {
          this.connected = t.state === "connected" || t.state === "mock";
        })));
  }
  onSample(e) {
    !e ||
      !e.angle ||
      ((this.raw.roll = e.angle.roll),
      (this.raw.pitch = e.angle.pitch),
      (this.raw.yaw = e.angle.yaw || 0),
      (this.connected = !0),
      this.calibrating &&
        this._calBuf.push({ roll: this.raw.roll, pitch: this.raw.pitch }));
  }
  startCalibration() {
    ((this.calibrating = !0), (this._calBuf = []));
  }
  finishCalibration() {
    this.calibrating = !1;
    let e = this._calBuf.length;
    if (!e) return !1;
    let t = 0,
      i = 0;
    for (let s of this._calBuf) ((t += s.roll), (i += s.pitch));
    return (
      (this.neutral.roll = t / e),
      (this.neutral.pitch = i / e),
      this.rollFilter.reset(0),
      this.pitchFilter.reset(0),
      !0
    );
  }
  setParams(e) {
    (Object.assign(this.params, e), N(D.therapist, this.params));
  }
  resetParams() {
    ((this.params = Object.assign({}, we)), N(D.therapist, this.params));
  }
  setTarget(e, t) {
    ((this.target.roll = e), (this.target.pitch = t));
  }
  update(e) {
    let t = this.params,
      i = m(t.smoothing, 0, 0.95),
      s = this.rollFilter.update(this.raw.roll, i),
      n = this.pitchFilter.update(this.raw.pitch, i);
    ((this.smoothed.roll = s), (this.smoothed.pitch = n));
    let o = s - this._last.roll,
      r = n - this._last.pitch;
    ((this.vel.roll = e > 0 ? o / e : 0), (this.vel.pitch = e > 0 ? r / e : 0));
    let l = m((Math.abs(this.vel.roll) + Math.abs(this.vel.pitch)) / 90, 0, 1);
    ((this.jitter = H(this.jitter, l, 6, e)),
      (this.stability = m(1 - this.jitter * 1.6, 0, 1)),
      (this._last.roll = s),
      (this._last.pitch = n));
    let h = (s - this.neutral.roll) * (t.invertRoll ? -1 : 1),
      f = (n - this.neutral.pitch) * (t.invertPitch ? -1 : 1),
      d = (k, _e) => {
        let Oe = Math.sign(k),
          Ge = Math.max(0, Math.abs(k) - t.deadZone),
          He = Math.max(1, t.maxAngle - t.deadZone);
        return Oe * m(Ge / He, 0, 1) * _e;
      },
      u = m(d(h, t.rollSensitivity), -1, 1),
      g = m(d(f, t.pitchSensitivity), -1, 1),
      y = m(t.assist, 0, 1);
    y > 0 &&
      ((u = u * (1 - y * (1 - Math.min(1, Math.abs(u) * 2)))),
      (g = g * (1 - y * (1 - Math.min(1, Math.abs(g) * 2)))));
    let S = 0,
      M = 0;
    (g > 0 ? (S = g) : Math.abs(f) > t.brakeAngle && (M = m(-g, 0, 1)),
      (this.control.steer = u),
      (this.control.throttle = S),
      (this.control.brake = M));
    let L = Math.abs(h - this.target.roll),
      E = Math.abs(f - this.target.pitch),
      A = Math.max(1, t.maxAngle);
    return ((this.match = m(1 - (L * 0.6 + E * 0.4) / A, 0, 1)), this.control);
  }
  get offset() {
    return {
      roll: this.smoothed.roll - this.neutral.roll,
      pitch: this.smoothed.pitch - this.neutral.pitch,
    };
  }
  get isTilting() {
    return Math.abs(this.offset.roll) > this.params.maxAngle * 0.65;
  }
  reset() {
    (this.rollFilter.reset(0),
      this.pitchFilter.reset(0),
      (this.control = { steer: 0, throttle: 0, brake: 0 }),
      (this.jitter = 0),
      (this.stability = 1));
  }
};
function Ze(a) {
  let e = a >>> 0;
  return function () {
    ((e |= 0), (e = (e + 1831565813) | 0));
    let t = Math.imul(e ^ (e >>> 15), 1 | e);
    return (
      (t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t),
      ((t ^ (t >>> 14)) >>> 0) / 4294967296
    );
  };
}
function G(a) {
  let e = Ze(a);
  return {
    next: e,
    range: (t, i) => t + e() * (i - t),
    int: (t, i) => Math.floor(t + e() * (i - t + 1)),
    chance: (t) => e() < t,
    pick: (t) => t[Math.floor(e() * t.length)],
  };
}
var p = {
    LENGTH: { NONE: 0, SHORT: 25, MEDIUM: 50, LONG: 100 },
    CURVE: { NONE: 0, EASY: 2, MEDIUM: 4, HARD: 6 },
    HILL: { NONE: 0, LOW: 20, MEDIUM: 40, HIGH: 60 },
  },
  ee = class {
    constructor(e) {
      ((this.difficulty = e),
        (this.segments = []),
        this.build(e),
        (this.length = this.segments.length * w.segmentLength));
    }
    build(e) {
      let t = G(e.seed),
        i = e.curve / 3,
        s = e.hill;
      ((this.segments = []),
        (this.rng = t),
        this.addStraight(p.LENGTH.SHORT),
        this.addLowRollingHills(p.LENGTH.SHORT, p.HILL.LOW * s),
        this.addSCurves(i),
        this.addCurve(p.LENGTH.MEDIUM, p.CURVE.MEDIUM * i, p.HILL.LOW * s),
        this.addBumps(p.LENGTH.SHORT),
        this.addLowRollingHills(p.LENGTH.MEDIUM, p.HILL.MEDIUM * s),
        this.addCurve(p.LENGTH.LONG * 2, p.CURVE.MEDIUM * i, p.HILL.MEDIUM * s),
        this.addStraight(p.LENGTH.MEDIUM),
        this.addHill(p.LENGTH.MEDIUM, p.HILL.HIGH * s),
        this.addSCurves(i),
        this.addCurve(p.LENGTH.LONG, -p.CURVE.MEDIUM * i, p.HILL.NONE),
        this.addHill(p.LENGTH.LONG, p.HILL.HIGH * s),
        this.addCurve(p.LENGTH.LONG, p.CURVE.MEDIUM * i, -p.HILL.LOW * s),
        this.addBumps(p.LENGTH.MEDIUM),
        this.addHill(p.LENGTH.LONG, -p.HILL.MEDIUM * s),
        this.addStraight(p.LENGTH.MEDIUM),
        this.addSCurves(i),
        this.addDownhillToEnd(i, s));
      let n = this.lastY(),
        o = this.segments.length;
      for (let r = 0; r < o; r++) {
        let l = r / o;
        ((this.segments[r].p1.world.y -= n * Z(0, 1, l)),
          (this.segments[r].p2.world.y -= n * Z(0, 1, l)));
      }
      ((this.segments[2].color.start = !0),
        (this.segments[this.segments.length - 3].color.finish = !0));
    }
    lastY() {
      return this.segments.length === 0
        ? 0
        : this.segments[this.segments.length - 1].p2.world.y;
    }
    addSegment(e, t) {
      let i = this.segments.length,
        s = Math.floor(i / w.rumbleLength) % 2;
      this.segments.push({
        index: i,
        p1: {
          world: { y: this.lastY(), z: i * w.segmentLength },
          camera: {},
          screen: {},
        },
        p2: {
          world: { y: t, z: (i + 1) * w.segmentLength },
          camera: {},
          screen: {},
        },
        curve: e,
        color: {
          road: Math.floor(i / w.rumbleLength) % 2 ? c.road : c.roadAlt,
          grass: Math.floor(i / w.rumbleLength) % 2 ? c.grass : c.grassAlt,
          rumble: s ? c.neonPink : c.neonBlue,
          lane: c.lane,
          start: !1,
          finish: !1,
        },
        fog: 0,
        clip: 0,
        looped: !1,
        obstacles: [],
      });
    }
    addRoad(e, t, i, s, n) {
      let o = this.lastY(),
        r = o + n * w.segmentLength,
        l = e + t + i;
      for (let h = 0; h < e; h++)
        this.addSegment(Z(0, s, h / e), W(o, r, h / l));
      for (let h = 0; h < t; h++) this.addSegment(s, W(o, r, (e + h) / l));
      for (let h = 0; h < i; h++)
        this.addSegment(W(s, 0, h / i), W(o, r, (e + t + h) / l));
    }
    addStraight(e) {
      this.addRoad(e, e, e, 0, 0);
    }
    addCurve(e, t, i) {
      this.addRoad(e, e, e, t, i);
    }
    addHill(e, t) {
      this.addRoad(e, e, e, 0, t);
    }
    addBumps(e) {
      let t = e,
        i = this.rng;
      for (; t-- > 0;)
        this.addRoad(
          10,
          10,
          10,
          0,
          p.HILL.LOW * (i.next() > 0.5 ? 1 : -1) * 0.4,
        );
    }
    addLowRollingHills(e, t) {
      (this.addRoad(e, e, e, 0, t / 2),
        this.addRoad(e, e, e, 0, -t),
        this.addRoad(e, e, e, p.CURVE.EASY, t),
        this.addRoad(e, e, e, 0, 0),
        this.addRoad(e, e, e, -p.CURVE.EASY, t / 2),
        this.addRoad(e, e, e, 0, 0));
    }
    addSCurves(e) {
      (this.addRoad(
        p.LENGTH.MEDIUM,
        p.LENGTH.MEDIUM,
        p.LENGTH.MEDIUM,
        -p.CURVE.EASY * e,
        p.HILL.NONE,
      ),
        this.addRoad(
          p.LENGTH.MEDIUM,
          p.LENGTH.MEDIUM,
          p.LENGTH.MEDIUM,
          p.CURVE.MEDIUM * e,
          p.HILL.MEDIUM,
        ),
        this.addRoad(
          p.LENGTH.MEDIUM,
          p.LENGTH.MEDIUM,
          p.LENGTH.MEDIUM,
          p.CURVE.EASY * e,
          -p.HILL.LOW,
        ),
        this.addRoad(
          p.LENGTH.MEDIUM,
          p.LENGTH.MEDIUM,
          p.LENGTH.MEDIUM,
          -p.CURVE.EASY * e,
          p.HILL.MEDIUM,
        ),
        this.addRoad(
          p.LENGTH.MEDIUM,
          p.LENGTH.MEDIUM,
          p.LENGTH.MEDIUM,
          -p.CURVE.MEDIUM * e,
          -p.HILL.MEDIUM,
        ));
    }
    addDownhillToEnd(e, t) {
      (this.addRoad(
        p.LENGTH.LONG,
        p.LENGTH.LONG,
        p.LENGTH.LONG,
        -p.CURVE.EASY * e,
        -p.HILL.LOW * t,
      ),
        this.addRoad(
          p.LENGTH.LONG,
          p.LENGTH.LONG,
          p.LENGTH.LONG,
          p.CURVE.EASY * e,
          p.HILL.LOW * t,
        ),
        this.addStraight(p.LENGTH.MEDIUM));
    }
    findSegment(e) {
      let t = Math.floor(e / w.segmentLength);
      return this.segments[t % this.segments.length];
    }
    segmentAt(e, t) {
      let i = Math.floor(e / w.segmentLength);
      return this.segments[(i + t) % this.segments.length];
    }
    curveAt(e) {
      let t = this.findSegment(e),
        i = (e % w.segmentLength) / w.segmentLength,
        s = this.segments[(t.index + 1) % this.segments.length];
      return t.curve * (1 - i) + s.curve * i;
    }
    lookAheadCurve(e, t = 12) {
      let i = 0;
      for (let s = 0; s < t; s++) {
        let n = this.segmentAt(e, s);
        i += n.curve * (1 - s / t);
      }
      return i / t;
    }
    range(e, t) {
      let i = [];
      for (let s = 0; s < t; s++)
        i.push(this.segments[(e + s) % this.segments.length]);
      return i;
    }
    wrap(e) {
      return J(e, 0, this.length);
    }
    get segmentLength() {
      return w.segmentLength;
    }
  };
var Ce = { block: 0.26, cone: 0.16, ring: 0.3, drone: 0.22 },
  te = class {
    constructor(e, t) {
      ((this.track = e),
        (this.difficulty = t),
        (this.items = []),
        (this.passed = 0),
        (this.hits = 0),
        (this.rings = 0),
        this.generate());
    }
    generate() {
      let e = this.difficulty,
        t = G(e.seed + 7777),
        i = this.track.segments,
        s = 60,
        n = i.length - 20,
        o = e.density * 0.05;
      this.items = [];
      let r = -999;
      for (let l = s; l < n; l++) {
        let f = Math.abs(i[l].curve) > 4 ? 0.45 : 1;
        if (l - r < 18 || !t.chance(o * f)) continue;
        r = l;
        let d = t.next(),
          u = "block";
        (d < e.ringRatio
          ? (u = "ring")
          : d < e.ringRatio + e.movingRatio
            ? (u = "drone")
            : d < e.ringRatio + e.movingRatio + 0.2 && (u = "cone"),
          this.items.push({
            index: l,
            z: l * w.segmentLength,
            offset: t.range(-0.78, 0.78),
            type: u,
            w: Ce[u] * 0.5,
            moving: u === "drone",
            phase: t.range(0, Math.PI * 2),
            speed: t.range(0.35, 0.75),
            hit: !1,
            passed: !1,
          }),
          i[l].obstacles.push(this.items[this.items.length - 1]));
      }
    }
    update(e, t) {
      for (let i of this.items)
        i.moving &&
          ((i.phase += e * i.speed),
          (i.offset = m(Math.sin(i.phase) * 0.72, -0.85, 0.85)));
    }
    checkPass(e, t, i, s) {
      let n = [],
        o = this.track.length;
      for (let r of this.items) {
        if (r.passed) {
          t > r.z && (r.passed = !1);
          continue;
        }
        if (!((e <= r.z && t >= r.z) || (t < e && (e <= r.z || t >= r.z))))
          continue;
        ((r.passed = !0), this.passed++);
        let h = Math.abs(i - r.offset),
          f = Le(i, s, r.offset, r.w, 0.85);
        r.type === "ring"
          ? h < 0.28
            ? (this.rings++, n.push({ type: "ring", item: r, gap: h }))
            : n.push({ type: "miss", item: r, gap: h })
          : f
            ? ((r.hit = !0),
              this.hits++,
              n.push({ type: "hit", item: r, gap: h }))
            : h < 0.55
              ? n.push({ type: "perfect", item: r, gap: h })
              : n.push({ type: "pass", item: r, gap: h });
      }
      return n;
    }
    reset() {
      for (let e of this.items) ((e.passed = !1), (e.hit = !1));
      ((this.passed = 0), (this.hits = 0), (this.rings = 0));
    }
    render(e, t, i, s) {
      let n = w.segmentLength,
        o = [],
        r = Math.floor(i.z / n);
      for (let l of this.items) {
        let f = l.index - r;
        if ((f < 0 && (f += t.segments.length), f > w.drawDistance)) continue;
        let d = t.segments[l.index];
        !d ||
          !d.p1.screen.w ||
          d.p1.camera.z <= 0 ||
          o.push({ it: l, seg: d, depth: d.p1.camera.z });
      }
      o.sort((l, h) => h.depth - l.depth);
      for (let { it: l, seg: h } of o) {
        let f = h.p1.screen.x,
          d = h.p1.screen.y,
          u = h.p1.screen.w;
        if (u <= 0) continue;
        let g = f + u * l.offset,
          y = m(1 - Math.pow(h.p1.camera.z / (w.drawDistance * n), 1.6), 0, 1);
        y <= 0.03 || this.drawSprite(e, l, g, d, u, y);
      }
    }
    drawSprite(e, t, i, s, n, o) {
      let r = n * Ce[t.type];
      if ((e.save(), (e.globalAlpha = o), t.type === "block")) {
        let l = r * 1.6,
          h = r * 0.9;
        ((e.shadowBlur = 22),
          (e.shadowColor = c.warn),
          (e.fillStyle = v("#1a0320", 0.92)),
          (e.strokeStyle = c.warn),
          (e.lineWidth = Math.max(1.5, r * 0.09)),
          e.beginPath(),
          e.rect(i - l / 2, s - h, l, h),
          e.fill(),
          e.stroke(),
          (e.strokeStyle = v(c.neonYellow, 0.9)),
          (e.lineWidth = Math.max(1, r * 0.06)),
          e.beginPath());
        for (let f = 0; f < 4; f++) {
          let d = i - l / 2 + (l / 4) * f;
          (e.moveTo(d, s), e.lineTo(d + l / 6, s - h));
        }
        e.stroke();
      } else if (t.type === "cone")
        ((e.shadowBlur = 18),
          (e.shadowColor = c.neonYellow),
          (e.fillStyle = v("#2a1400", 0.9)),
          (e.strokeStyle = c.neonYellow),
          (e.lineWidth = Math.max(1.2, r * 0.1)),
          e.beginPath(),
          e.moveTo(i, s - r * 1.5),
          e.lineTo(i + r * 0.7, s),
          e.lineTo(i - r * 0.7, s),
          e.closePath(),
          e.fill(),
          e.stroke());
      else if (t.type === "ring") {
        let l = r * 0.9;
        ((e.shadowBlur = 26),
          (e.shadowColor = c.neonGreen),
          (e.strokeStyle = c.neonGreen),
          (e.lineWidth = Math.max(2, r * 0.14)),
          e.beginPath(),
          e.ellipse(i, s - l, l, l * 1.05, 0, 0, Math.PI * 2),
          e.stroke(),
          (e.globalAlpha = o * 0.25),
          (e.fillStyle = c.neonGreen),
          e.fill());
      } else
        ((e.shadowBlur = 20),
          (e.shadowColor = c.neonPurple),
          (e.strokeStyle = c.neonPurple),
          (e.lineWidth = Math.max(1.5, r * 0.1)),
          (e.fillStyle = v("#12002b", 0.9)),
          e.beginPath(),
          e.ellipse(i, s - r * 1.1, r * 0.75, r * 0.34, 0, 0, Math.PI * 2),
          e.fill(),
          e.stroke(),
          (e.globalAlpha = o * 0.6),
          e.beginPath(),
          e.moveTo(i, s - r * 0.9),
          e.lineTo(i, s),
          e.stroke());
      e.restore();
    }
  };
var ie = class {
  constructor() {
    this.reset();
  }
  reset() {
    ((this.z = 0),
      (this.x = 0),
      (this.speed = 0),
      (this.maxSpeed = w.accelFactor * 2),
      (this.tilt = 0),
      (this.nitro = 0),
      (this.drifting = !1),
      (this.offRoad = !1),
      (this.distance = 0),
      (this.lap = 0),
      (this.crashCooldown = 0),
      (this.engineLoad = 0));
  }
  update(e, t, i, s) {
    let n = s.maxSpeed;
    this.maxSpeed = n;
    let o = this.z,
      r = 0.14,
      h = (r + (1 - r) * m(t.throttle, 0, 1)) * w.accelFactor,
      f = t.brake * w.brakeFactor,
      d = w.decelFactor * (this.speed / n);
    ((this.speed += (h - f - d) * e),
      (this.speed = m(this.speed, 0, n)),
      (this.offRoad = Math.abs(this.x) > 1),
      this.offRoad &&
        this.speed > w.offRoadLimit &&
        (this.speed = Math.max(
          w.offRoadLimit,
          this.speed - w.offRoadDecel * e,
        )));
    let u = this.speed * e;
    ((this.z = J(this.z, u, i.length)),
      (this.distance += u),
      this.z < o && this.lap++);
    let g = this.speed / n,
      y = Math.max(g, 0.5),
      S = e * w.steerRate * y;
    this.x += t.steer * S;
    let M = i.curveAt(this.z);
    ((this.x -= S * g * M * w.centrifugal * 0.35), (this.x = m(this.x, -2, 2)));
    let L = t.steer * 0.55 - M * g * 0.12;
    ((this.tilt = H(this.tilt, L, 8, e)),
      (this.engineLoad = H(this.engineLoad, t.throttle, 6, e)));
    let E = t.throttle >= be.nitroThreshold && g > 0.55 ? 1 : 0;
    return (
      (this.nitro = H(this.nitro, E, 5, e)),
      (this.drifting = Math.abs(t.steer) > 0.62 && g > 0.45),
      this.crashCooldown > 0 && (this.crashCooldown -= e),
      { prevZ: o, dz: u, speedPct: g, curve: M }
    );
  }
  crash() {
    ((this.speed *= w.crashSlow), (this.crashCooldown = 0.9), (this.nitro = 0));
  }
  get speedKmh() {
    return Math.round(this.speed / 42);
  }
  get speedPct() {
    return this.speed / this.maxSpeed;
  }
  get halfWidth() {
    return be.halfWidth;
  }
};
var se = class {
  constructor(e) {
    ((this.view = e),
      (this.offset = { stars: 0, far: 0, near: 0, sun: 0 }),
      (this.time = 0),
      this.build());
  }
  build() {
    let e = G(90210),
      t = this.view.width,
      i = this.view.height;
    this.stars = [];
    for (let n = 0; n < 170; n++)
      this.stars.push({
        x: e.range(0, t * 2),
        y: e.range(0, i * 0.40),
        r: e.range(0.7, 2.1),
        a: e.range(0.35, 1.0),
        tw: e.range(0.5, 2.2),
      });
    let s = (n, o, r, l) => {
      let h = G(l),
        f = [],
        d = 0;
      for (; d < t * 2;) {
        let u = h.range(28, 92),
          g = h.range(o, r),
          y = [],
          S = Math.max(1, Math.floor(u / 14)),
          M = Math.max(1, Math.floor(g / 18));
        for (let L = 0; L < S; L++)
          for (let E = 0; E < M; E++)
            h.chance(0.42) &&
              y.push({ x: L * 14 + 5, y: E * 18 + 6, on: h.chance(0.6) });
        (f.push({ x: d, w: u, h: g, windows: y, antenna: h.chance(0.25) }),
          (d += u + h.range(4, 22)));
      }
      return f;
    };
    ((this.cityFar = s(40, i * 0.1, i * 0.24, 4242)),
      (this.cityNear = s(30, i * 0.16, i * 0.36, 1337)));
  }
  update(e, t, i) {
    this.time += e;
    let s = t * i * 26;
    ((this.offset.stars =
      (this.offset.stars + s * e * 0.6) % (this.view.width * 2)),
      (this.offset.sun =
        (this.offset.sun + s * e * 0.8) % (this.view.width * 2)),
      (this.offset.far =
        (this.offset.far + s * e * 1.6) % (this.view.width * 2)),
      (this.offset.near =
        (this.offset.near + s * e * 3.2) % (this.view.width * 2)));
  }
  render(e, t) {
    let { width: i, height: s } = this.view,
      n = t,
      o = e.createLinearGradient(0, 0, 0, n + 40);
    (o.addColorStop(0, c.sky0),
      o.addColorStop(0.55, c.sky1),
      o.addColorStop(1, c.sky2),
      (e.fillStyle = o),
      e.fillRect(0, 0, i, n + 42));
    for (let u of this.stars) {
      let g = (u.x - this.offset.stars + i * 2) % (i * 2);
      if (g > i) continue;
      let y = 0.6 + 0.4 * Math.sin(this.time * u.tw + u.x);
      ((e.globalAlpha = u.a * y),
        (e.fillStyle = "#ffffff"),
        e.fillRect(g, u.y, u.r, u.r));
    }
    e.globalAlpha = 1;
    let r = s * 0.2,
      l = i * 0.5 - ((this.offset.sun % (i * 2)) / (i * 2)) * i * 0.22,
      h = n - r * 0.25,
      f = e.createLinearGradient(0, h - r, 0, h + r);
    (f.addColorStop(0, "#ffe14d"),
      f.addColorStop(0.45, c.neonPink),
      f.addColorStop(1, "#5a0f8f"),
      e.save(),
      e.beginPath(),
      e.arc(l, h, r, 0, Math.PI * 2),
      e.clip(),
      (e.fillStyle = f),
      e.fillRect(l - r, h - r, r * 2, r * 2),
      (e.fillStyle = "rgba(5,0,15,0.55)"));
    for (let u = 0; u < 9; u++) {
      let g = h + r * 0.05 + u * (r * 0.22);
      e.fillRect(l - r, g, r * 2, r * 0.07 + u * 0.9);
    }
    (e.restore(),
      this.drawCity(
        e,
        this.cityFar,
        this.offset.far,
        n,
        "#170a33",
        v(c.neonBlue, 0.55),
        0.55,
      ),
      this.drawCity(
        e,
        this.cityNear,
        this.offset.near,
        n,
        "#0d0424",
        v(c.neonPink, 0.75),
        1,
      ));

      // 地平线：不能画成一条横贯全屏的亮线 —— 那会像水位线，
      // 把两侧的城市剪影从腰上切断，纵深直接归零。
      // 改成扁椭圆的径向光：只在中间亮、两端自然消失。
      e.save();
      e.translate(i * 0.5, n);
      e.scale(1, 0.055);
      let hzR = Math.max(i * 0.55, 220);
      let hzG = e.createRadialGradient(0, 0, 0, 0, 0, hzR);
      (hzG.addColorStop(0, v(c.neonBlue, 0.30)),
        hzG.addColorStop(0.5, v(c.neonBlue, 0.10)),
        hzG.addColorStop(1, 'rgba(0,229,255,0)'),
        (e.fillStyle = hzG),
        e.beginPath(),
        e.arc(0, 0, hzR, 0, Math.PI * 2),
        e.fill(),
        e.restore());

      // 中间一小段更亮的芯，保留「远处有光」的感觉但不横贯
      e.save();
      let coreW = i * 0.30;
      let coreG = e.createLinearGradient(i * 0.5 - coreW, 0, i * 0.5 + coreW, 0);
      (coreG.addColorStop(0, 'rgba(150,240,255,0)'),
        coreG.addColorStop(0.5, 'rgba(190,250,255,0.42)'),
        coreG.addColorStop(1, 'rgba(150,240,255,0)'),
        (e.fillStyle = coreG),
        e.fillRect(i * 0.5 - coreW, n - 0.8, coreW * 2, 1.6),
        e.restore());
    let d = e.createLinearGradient(0, n, 0, s);
    (d.addColorStop(0, "#12002b"),
      d.addColorStop(1, "#05000f"),
      (e.fillStyle = d),
      e.fillRect(0, n, i, s - n));
  }
  drawCity(e, t, i, s, n, o, r) {
    let l = this.view.width;
    (e.save(), (e.globalAlpha = r), (e.fillStyle = n));
    for (let h of t) {
      let f = ((h.x - i + l * 2) % (l * 2)) - l * 0.5;
      if (f > l || f + h.w < 0) continue;
      let d = s - h.h;
      (e.fillRect(f, d, h.w, h.h + 6),
        (e.fillStyle = o),
        e.fillRect(f, d, h.w, 2),
        (e.globalAlpha = r * 0.7));
      for (let u of h.windows) u.on && e.fillRect(f + u.x, d + u.y, 3, 5);
      ((e.globalAlpha = r),
        (e.fillStyle = n),
        h.antenna &&
          (e.fillRect(f + h.w * 0.5 - 1, d - 14, 2, 14),
          (e.fillStyle = o),
          e.fillRect(f + h.w * 0.5 - 2, d - 16, 4, 3),
          (e.fillStyle = n)));
    }
    e.restore();
  }
};
function Je(a, e) {
  return 1 / Math.pow(Math.E, a * a * e);
}
var oe = class {
  constructor(e) {
    ((this.view = e), (this.wavePhase = 0), (this.horizonY = e.height * 0.42));
  }
  render(e, t, i, s = 0) {
    let { width: n, height: o } = this.view,
      r = w.segmentLength,
      l = w.roadWidth,
      h = w.cameraDepth,
      f = w.drawDistance,
      d = t.findSegment(i.z),
      u = (i.z % r) / r,
      g = t.findSegment(i.z),
      S = K(g.p1.world.y, g.p2.world.y, u) + w.cameraHeight,
      M = o,
      L = 0,
      E = -(d.curve * u);
    this.wavePhase += 0.08 + s * 0.16;
    for (let A = 0; A < f; A++) {
      let k = t.segments[(d.index + A) % t.segments.length];
      ((k.looped = k.index < d.index),
        (k.fog = Je(A / f, w.fogDensity)),
        (k.clip = M),
        Se(k.p1, i.x * l - L, S, i.z - (k.looped ? t.length : 0), h, n, o, l),
        Se(
          k.p2,
          i.x * l - L - E,
          S,
          i.z - (k.looped ? t.length : 0),
          h,
          n,
          o,
          l,
        ),
        (L += E),
        (E += k.curve),
        !(
          k.p1.camera.z <= h ||
          k.p2.screen.y >= k.p1.screen.y ||
          k.p2.screen.y >= M
        ) && (this.renderSegment(e, k, A, s), (M = k.p2.screen.y)));
    }
    return ((this.horizonY = M), M);
  }
  renderSegment(e, t, i, s) {
    let { width: n } = this.view,
      o = t.p1.screen,
      r = t.p2.screen,
      l = m(t.fog, 0, 1);
    if (l <= 0.02) return;
    ((e.fillStyle = ve(t.color.grass, 0.35 + l * 0.65)),
      e.fillRect(0, r.y, n, o.y - r.y));
    let h = o.w / Math.max(6, 16),
      f = r.w / Math.max(6, 16),
      d = 1 + s * (0.9 + 0.5 * Math.sin(this.wavePhase - i * 0.25));
    if (
      (this.polygon(
        e,
        o.x - o.w - h * d,
        o.y,
        o.x - o.w,
        o.y,
        r.x - r.w,
        r.y,
        r.x - r.w - f * d,
        r.y,
        t.color.rumble,
        l,
        s,
      ),
      this.polygon(
        e,
        o.x + o.w + h * d,
        o.y,
        o.x + o.w,
        o.y,
        r.x + r.w,
        r.y,
        r.x + r.w + f * d,
        r.y,
        t.color.rumble,
        l,
        s,
      ),
      this.polygon(
        e,
        o.x - o.w,
        o.y,
        o.x + o.w,
        o.y,
        r.x + r.w,
        r.y,
        r.x - r.w,
        r.y,
        t.color.road,
        l,
        0,
      ),
      Math.floor(t.index / 2) % 2 === 0)
    ) {
      let u = (o.w * 2) / w.lanes,
        g = (r.w * 2) / w.lanes,
        y = o.x - o.w + u,
        S = r.x - r.w + g;
      ((e.globalAlpha = l * 0.55), (e.fillStyle = t.color.lane));
      for (let M = 1; M < w.lanes; M++)
        (e.beginPath(),
          e.moveTo(y - u * 0.06, o.y),
          e.lineTo(y + u * 0.06, o.y),
          e.lineTo(S + g * 0.06, r.y),
          e.lineTo(S - g * 0.06, r.y),
          e.closePath(),
          e.fill(),
          (y += u),
          (S += g));
      e.globalAlpha = 1;
    }
    ((t.color.start || t.color.finish) &&
      (e.save(),
      (e.globalAlpha = l),
      (e.shadowBlur = 24),
      (e.shadowColor = t.color.start ? c.neonGreen : c.neonPink),
      (e.fillStyle = t.color.start ? v(c.neonGreen, 0.9) : v(c.neonPink, 0.9)),
      e.beginPath(),
      e.moveTo(o.x - o.w, o.y),
      e.lineTo(o.x + o.w, o.y),
      e.lineTo(r.x + r.w, r.y),
      e.lineTo(r.x - r.w, r.y),
      e.closePath(),
      e.fill(),
      e.restore()),
      l < 1 &&
        ((e.globalAlpha = 1 - l),
        (e.fillStyle = "#0a0018"),
        e.fillRect(0, r.y, n, o.y - r.y),
        (e.globalAlpha = 1)));
  }
  polygon(e, t, i, s, n, o, r, l, h, f, d, u) {
    ((e.globalAlpha = 1),
      (e.fillStyle = ve(f, 0.35 + d * 0.65)),
      e.beginPath(),
      e.moveTo(t, i),
      e.lineTo(s, n),
      e.lineTo(o, r),
      e.lineTo(l, h),
      e.closePath(),
      e.fill(),
      u > 0.05 &&
        (e.save(),
        (e.globalAlpha = d * (0.4 + u * 0.6)),
        (e.shadowBlur = 16 * u),
        (e.shadowColor = f),
        (e.strokeStyle = v(f, 0.95)),
        (e.lineWidth = 1.6),
        e.stroke(),
        e.restore()));
  }
};
// ============================================================================
// 2.5D 赛道渲染（新增，用来替代只有草地 + 路面的 oe）
// ----------------------------------------------------------------------------
// 原来的 oe.renderSegment 只画四样东西：草地色块、两条连续路肩、路面、车道虚线。
// 路旁全是空的，所以画面「空」；所有元素都是纯色填充 + 描边发光，所以画面「平」。
//
// 这里补三件事，投影数学一个字没改（仍然复用 Se、同样的循环与 clip 裁剪），
// 因此命中判定、弯道手感、坡度、难度参数全部不变：
//   1. 路肩改成「一段一块」，不再是两条贯穿全屏的荧光管
//   2. 路面加横向接缝、段间色差、远端融雾
//   3. 路旁景物（霓虹灯柱 / 广告牌 / 反光柱），单独一趟从远到近画，遮挡才正确
// ============================================================================

/** 确定性伪随机：同一段号永远返回同一个值，景物位置才不会每帧乱跳 */
function hash01(i, salt) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

var RoadRenderer2 = class {
  constructor(e) {
    this.view = e
    this.wavePhase = 0
    this.horizonY = e.height * 0.42
  }

  /**
   * 只算投影、不落笔。
   * 拆出来是因为背景层要用的地平线必须与本帧路面一致：原来 render() 末尾才写
   * horizonY，而 engine.render() 是先 bg 后 road，于是背景永远用上一帧的地平线，
   * 镜头一抬一伏，天空与路面的交界就在抖（同帧渲染两次结果都不一样）。
   */
  compute(track, player, drift) {
    const W = this.view.width
    const H = this.view.height
    const segLen = w.segmentLength
    const roadW = w.roadWidth
    const camDepth = w.cameraDepth
    const drawDist = w.drawDistance

    const base = track.findSegment(player.z)
    const pct = (player.z % segLen) / segLen
    const camY = Z(base.p1.world.y, base.p2.world.y, pct) + w.cameraHeight

    let clipY = H
    let x = 0
    let dx = -(base.curve * pct)
    this.wavePhase += 0.08 + (drift || 0) * 0.16

    const visible = []

    for (let n = 0; n < drawDist; n++) {
      const seg = track.segments[(base.index + n) % track.segments.length]
      seg.looped = seg.index < base.index
      seg.fog = Je(n / drawDist, w.fogDensity)
      seg.clip = clipY
      const zOff = player.z - (seg.looped ? track.length : 0)
      Se(seg.p1, player.x * roadW - x, camY, zOff, camDepth, W, H, roadW)
      Se(seg.p2, player.x * roadW - x - dx, camY, zOff, camDepth, W, H, roadW)
      x += dx
      dx += seg.curve
      if (seg.p1.camera.z <= camDepth) continue
      if (seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= clipY) continue
      visible.push(seg)
      clipY = seg.p2.screen.y
    }

    return { visible, clipY, W, H }
  }

  /** 落笔：先路面（近→远逐段裁剪），再车前光池，最后景物（远→近） */
  paint(ctx, frame) {
    const visible = frame.visible
    const W = frame.W
    const H = frame.H

    for (let i = 0; i < visible.length; i++) this.paintGround(ctx, visible[i])

    // —— 车前光池 ——
    // 路面材质再好，没有一盏灯照着也还是平的。
    // 这里一次性铺一层径向光，比逐段算渐变便宜得多。
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const lampX = W * 0.5
    const lampY = H * 0.98
    const pool = ctx.createRadialGradient(lampX, lampY, 8, lampX, lampY, H * 0.92)
    pool.addColorStop(0, 'rgba(96,150,230,0.16)')
    pool.addColorStop(0.42, 'rgba(80,130,215,0.07)')
    pool.addColorStop(1, 'rgba(40,60,140,0)')
    ctx.fillStyle = pool
    ctx.fillRect(0, 0, W, H)
    ctx.restore()

    // 景物单独一趟：从远到近。近处的柱子才会挡住远处的，反之就穿帮。
    for (let i = visible.length - 1; i >= 0; i--) this.paintDecor(ctx, visible[i])

    this.horizonY = frame.clipY
    return frame.clipY
  }

  /** 兼容旧调用点：一次算完并画完 */
  render(ctx, track, player, drift) {
    const frame = this.compute(track, player, drift)
    this.paint(ctx, frame)
    return frame.clipY
  }

  // ---------------------------------------------------------------- 地面
  paintGround(ctx, seg) {
    const W = this.view.width
    const p1 = seg.p1.screen
    const p2 = seg.p2.screen
    const fog = m(seg.fog, 0, 1)
    if (fog <= 0.02) return

    const top = p2.y
    const bot = p1.y
    if (bot <= top) return

    // —— 1. 草地 ——
    // seg.color.grass 是 #08021a，乘法压暗之后就是纯黑，两侧看不出是地面。
    // 直接用一组「随雾衰减」的深紫，远处自己融进天色。
    const band2 = Math.floor(seg.index / w.rumbleLength) % 2
    const gv = 6 + fog * 22 + (band2 ? 4 : 0)
    ctx.fillStyle =
      'rgb(' + Math.round(gv * 1.25) + ',' + Math.round(gv * 0.45) + ',' +
      Math.round(gv * 1.7) + ')'
    ctx.fillRect(0, top, W, bot - top)

    // 不再额外叠一层黑条：色差已经由上面 gv 的 band2 承担，
    // 两层叠在一起会变成密集横纹（远处直接糊成百叶窗）。

    const half1 = p1.w
    const half2 = p2.w
    const shoulder1 = Math.max(1.5, half1 * 0.10)
    const shoulder2 = Math.max(1, half2 * 0.10)
    const rumbleCol = seg.color.rumble

    // —— 2. 路肩：一段一块 ——
    // 原来直接上 neonPink / neonBlue 满饱和度 + 辉光，读起来是两根灯管。
    // 压到 0.2~0.6 亮度，再在外侧补一道细亮边，才是「路肩」。
    // 路面提亮以后，路肩再满亮就会变成两条贯穿全屏的荧光管。
    // 压到 0.10~0.26，霓虹感交给外侧那道细线。
    const rumbleFill = ve(rumbleCol, 0.14 + fog * 0.24)
    ctx.fillStyle = rumbleFill
    ctx.beginPath()
    ctx.moveTo(p1.x - half1 - shoulder1, bot)
    ctx.lineTo(p1.x - half1, bot)
    ctx.lineTo(p2.x - half2, top)
    ctx.lineTo(p2.x - half2 - shoulder2, top)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(p1.x + half1, bot)
    ctx.lineTo(p1.x + half1 + shoulder1, bot)
    ctx.lineTo(p2.x + half2 + shoulder2, top)
    ctx.lineTo(p2.x + half2, top)
    ctx.closePath()
    ctx.fill()

    if (fog > 0.03) {
      ctx.strokeStyle = v(rumbleCol, 0.26 + fog * 0.44)
      ctx.lineWidth = Math.max(1, half1 * 0.006)
      ctx.beginPath()
      ctx.moveTo(p1.x - half1 - shoulder1, bot)
      ctx.lineTo(p2.x - half2 - shoulder2, top)
      ctx.moveTo(p1.x + half1 + shoulder1, bot)
      ctx.lineTo(p2.x + half2 + shoulder2, top)
      ctx.stroke()
    }

    // —— 3. 路面 ——
    ctx.beginPath()
    ctx.moveTo(p1.x - half1, bot)
    ctx.lineTo(p1.x + half1, bot)
    ctx.lineTo(p2.x + half2, top)
    ctx.lineTo(p2.x - half2, top)
    ctx.closePath()
    // 路面用深蓝灰而不是 seg.color.road（#0b0b18）：
    // 后者乘雾之后和草地分不开，整条赛道会糊成一片黑。
    const rv = 8 + fog * 38 + (Math.floor(seg.index / w.rumbleLength) % 2 ? 4 : 0)
    ctx.fillStyle =
      'rgb(' + Math.round(rv * 0.86) + ',' + Math.round(rv * 0.94) + ',' +
      Math.round(rv * 1.52) + ')'
    ctx.fill()

    // —— 4. 横向沥青接缝 ——
    // 伪 3D 的速度感有一半来自「接缝在往后跑」。太淡就等于没有。
    if (fog > 0.05 && seg.index % w.rumbleLength === 0) {
      ctx.strokeStyle = 'rgba(8,6,20,' + (0.28 * fog).toFixed(3) + ')'
      ctx.lineWidth = Math.max(1, half1 * 0.012)
      ctx.beginPath()
      ctx.moveTo(p1.x - half1, bot - 0.5)
      ctx.lineTo(p1.x + half1, bot - 0.5)
      ctx.stroke()
    }

    // —— 4.5 沥青颗粒 ——
    // 路面占画面一半以上，纯色填充会像一块水泥板。
    // 只在近处几段撒点：远处（half1 小）本来就糊，画了既看不见又费性能。
    if (fog > 0.22 && half1 > 45) {
      const dots = 4
      for (let k = 0; k < dots; k++) {
        const tt = hash01(seg.index * 13 + k, 29)
        const uu = hash01(seg.index * 13 + k, 31)
        const px = p1.x - half1 + tt * half1 * 2
        const py = top + uu * (bot - top)
        ctx.fillStyle = 'rgba(190,215,255,' + (0.020 + fog * 0.030).toFixed(3) + ')'
        ctx.fillRect(px, py, Math.max(1, half1 * 0.022), Math.max(1, (bot - top) * 0.30))
      }
    }

    // —— 5. 车道虚线 ——
    if (Math.floor(seg.index / 2) % 2 === 0) {
      const laneW1 = (half1 * 2) / w.lanes
      const laneW2 = (half2 * 2) / w.lanes
      ctx.globalAlpha = fog * 0.34
      ctx.fillStyle = seg.color.lane
      let lx1 = p1.x - half1 + laneW1
      let lx2 = p2.x - half2 + laneW2
      for (let i = 1; i < w.lanes; i++) {
        ctx.beginPath()
        ctx.moveTo(lx1 - laneW1 * 0.026, bot)
        ctx.lineTo(lx1 + laneW1 * 0.026, bot)
        ctx.lineTo(lx2 + laneW2 * 0.026, top)
        ctx.lineTo(lx2 - laneW2 * 0.026, top)
        ctx.closePath()
        ctx.fill()
        lx1 += laneW1
        lx2 += laneW2
      }
      ctx.globalAlpha = 1
    }

    // —— 6. 起终点线 ——
    if (seg.color.start || seg.color.finish) {
      const col = seg.color.start ? c.neonGreen : c.neonPink
      ctx.save()
      ctx.globalAlpha = fog
      ctx.shadowBlur = 24
      ctx.shadowColor = col
      ctx.fillStyle = v(col, 0.85)
      ctx.beginPath()
      ctx.moveTo(p1.x - half1, bot)
      ctx.lineTo(p1.x + half1, bot)
      ctx.lineTo(p2.x + half2, top)
      ctx.lineTo(p2.x - half2, top)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    // —— 7. 远端融雾 ——
    // 不做这一步，赛道尽头是一条被硬生生切断的边，纵深立刻消失。
    if (fog < 1) {
      ctx.globalAlpha = 1 - fog
      ctx.fillStyle = '#0a0018'
      ctx.fillRect(0, top, W, bot - top)
      ctx.globalAlpha = 1
    }
  }

  // ---------------------------------------------------------------- 景物
  paintDecor(ctx, seg) {
    const i = seg.index
    const p1 = seg.p1.screen
    const fog = m(seg.fog, 0, 1)
    if (fog < 0.10) return
    const half = p1.w
    if (half < 1) return

    // 灯柱：每 9 段一根，左右交替，保证两侧都有节奏感
    if (i % 9 === 4) {
      const side = Math.floor(i / 9) % 2 === 0 ? -1 : 1
      this.paintLamp(ctx, p1, half, side, fog)
    }
    // 广告牌：稀疏，一侧一块。半宽超过 240px 说明它已经跑到近景，
    // 这时候广告牌会占掉半个屏幕、还会顶到 HUD 上，直接不画。
    if (i % 61 === 23 && half < 240) {
      const side = hash01(i, 3) > 0.5 ? 1 : -1
      this.paintBoard(ctx, p1, half, side, fog, i)
    }
    // 反光柱：贴着路肩，每 4 段一根，负责「路在往前跑」的节奏
    if (i % 4 === 1) this.paintPylon(ctx, p1, half, fog, i)
  }

  paintLamp(ctx, p, half, side, fog) {
    const baseX = p.x + side * half * 1.34
    const baseY = p.y
    const h = half * 1.12
    if (h < 3) return
    const w0 = Math.max(0.8, half * 0.016)

    // 柱身：上细下粗，近大远小已经由 half 携带
    ctx.beginPath()
    ctx.moveTo(baseX - w0 * 1.6, baseY)
    ctx.lineTo(baseX + w0 * 1.6, baseY)
    ctx.lineTo(baseX + w0 * 0.55, baseY - h)
    ctx.lineTo(baseX - w0 * 0.55, baseY - h)
    ctx.closePath()
    ctx.fillStyle = 'rgba(16,9,32,' + (0.30 + fog * 0.62).toFixed(3) + ')'
    ctx.fill()

    const bulbY = baseY - h
    const r = Math.max(1, half * 0.042)

    // 光晕
    const glow = ctx.createRadialGradient(baseX, bulbY, 0, baseX, bulbY, r * 4.5)
    glow.addColorStop(0, 'rgba(120,240,255,' + (0.34 * fog).toFixed(3) + ')')
    glow.addColorStop(0.45, 'rgba(120,240,255,' + (0.10 * fog).toFixed(3) + ')')
    glow.addColorStop(1, 'rgba(120,240,255,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(baseX, bulbY, r * 4.5, 0, Math.PI * 2)
    ctx.fill()

    // 灯头
    ctx.fillStyle = 'rgba(215,255,255,' + (0.45 + fog * 0.5).toFixed(3) + ')'
    ctx.beginPath()
    ctx.arc(baseX, bulbY, r, 0, Math.PI * 2)
    ctx.fill()

    // 落在草地的光斑：缺了它，灯柱像挂在半空
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = 'rgba(110,230,255,' + (0.09 * fog).toFixed(3) + ')'
    ctx.beginPath()
    ctx.ellipse(baseX, baseY, r * 2.4, r * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  paintBoard(ctx, p, half, side, fog, seed) {
    const baseX = p.x + side * half * 2.0
    const baseY = p.y
    const bh = half * 0.46
    if (bh < 7) return
    const bw = half * 0.52
    const top = baseY - bh * 2.05

    // 立柱
    ctx.fillStyle = 'rgba(14,8,26,' + (0.35 + fog * 0.55).toFixed(3) + ')'
    ctx.fillRect(baseX - bw * 0.05, top + bh, bw * 0.10, bh * 1.05)

    // 版面
    const tones = ['0,229,255', '255,46,166', '255,225,77']
    const tone = tones[Math.floor(hash01(seed, 7) * 3) % 3]
    ctx.fillStyle = 'rgba(8,4,18,' + (0.55 + fog * 0.35).toFixed(3) + ')'
    ctx.fillRect(baseX - bw / 2, top, bw, bh)
    ctx.strokeStyle = 'rgba(' + tone + ',' + (0.26 + fog * 0.52).toFixed(3) + ')'
    ctx.lineWidth = Math.max(1, bw * 0.03)
    ctx.strokeRect(baseX - bw / 2, top, bw, bh)

    // 版面内容：两条亮带，远了自然糊成一块
    if (bw > 14) {
      ctx.fillStyle = 'rgba(' + tone + ',' + (0.14 + fog * 0.30).toFixed(3) + ')'
      ctx.fillRect(baseX - bw * 0.36, top + bh * 0.26, bw * 0.72, bh * 0.15)
      ctx.fillRect(baseX - bw * 0.36, top + bh * 0.57, bw * 0.46, bh * 0.11)
    }
  }

  paintPylon(ctx, p, half, fog, seed) {
    const side = hash01(seed, 11) > 0.5 ? 1 : -1
    const baseX = p.x + side * half * 1.06
    const baseY = p.y
    const h = half * 0.085
    if (h < 1.6) return
    const w0 = Math.max(0.7, half * 0.013)

    ctx.fillStyle = 'rgba(210,226,255,' + (0.10 + fog * 0.34).toFixed(3) + ')'
    ctx.fillRect(baseX - w0 / 2, baseY - h, w0, h)
    // 顶端一抹红：远处就是靠这一点红点读出路肩在往后退
    ctx.fillStyle = 'rgba(255,70,80,' + (0.22 + fog * 0.42).toFixed(3) + ')'
    ctx.fillRect(baseX - w0 / 2, baseY - h, w0, h * 0.3)
  }
};

// ============================================================================
// 玩家车渲染（重写）
// ----------------------------------------------------------------------------
// 原来是一个梯形 + 一个粉色小梯形（当成挡风玻璃），没有任何体积细节，
// 而车是整幅画面的视觉焦点 —— 焦点简陋，整体就「廉价」。
// 这里按后视真车的层级重画：轮胎 → 车身 → 后窗 → 尾灯 → 底裙霓虹，
// 并且保留原来的三个动态特征：速度越快抖动越大、转向时车身侧倾、氮气时尾焰变色。
// 返回值 exhaust / wheels 的坐标契约不变（FX 粒子要靠它喷火星和胎痕）。
// ============================================================================
var re = class {
  constructor(e) {
    ((this.view = e), (this.bob = 0));
  }
  /**
   * 车身起伏相位只能在这里推进。
   * 原来写在 render() 里（this.bob += dt * ...），后果有两个：
   *   · 同一帧渲染两次，车的位置就不一样（render 不是幂等的）；
   *   · 渲染频率和更新频率一旦不等，抖动速度就跟着变。
   * 动画状态的推进属于 update，渲染只负责读。
   */
  update(e, t) {
    let i = t && isFinite(t.speedPct) ? m(t.speedPct, 0, 1) : 0;
    this.bob += e * (6 + i * 22);
  }
  render(e, t, s) {
    const W = this.view.width;
    const H = this.view.height;
    const cx = s === void 0 ? W * 0.5 : s;

    // 车宽按屏幕宽度定；车高取 0.54 倍车宽，是后视压缩后的观感比例
    const l = W * 0.175;
    const h = l * 0.54;
    const baseY = H * 0.86;
    const PI2 = Math.PI * 2;

    const bobY = Math.sin(this.bob) * (1.0 + t.speedPct * 2.2);
    const tilt = m(t.tilt, -0.8, 0.8);
    const spd = m(t.speedPct, 0, 1);

    e.save();
    e.translate(cx, baseY + bobY);
    // 转向：光靠 rotate 像一张纸在转，叠一点斜切才有「车身在扭」的感觉
    e.rotate(tilt * 0.085);
    e.transform(1, 0, tilt * 0.14, 1, 0, 0);

    // —— 1. 车底阴影 ——
    // 没有这层，车就是贴纸贴在路面上，跑起来会「滑」
    e.save();
    e.scale(1, 0.34);
    const sh = e.createRadialGradient(0, h * 1.3, 1, 0, h * 1.3, l * 0.7);
    sh.addColorStop(0, 'rgba(0,0,0,0.66)');
    sh.addColorStop(0.6, 'rgba(0,0,0,0.24)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    e.fillStyle = sh;
    e.beginPath();
    e.arc(0, h * 1.3, l * 0.7, 0, PI2);
    e.fill();
    e.restore();

    // —— 2. 轮胎 ——
    // 只露下半截：露太多像贴了两块黑砖，露太少又不成立
    const tyreW = l * 0.14;
    const tyreH = h * 0.44;
    for (let sx = -1; sx <= 1; sx += 2) {
      const tx = sx * (l * 0.5 - tyreW * 0.18);
      const tg = e.createLinearGradient(tx - tyreW / 2, 0, tx + tyreW / 2, 0);
      tg.addColorStop(0, '#040309');
      tg.addColorStop(0.45, '#161129');
      tg.addColorStop(1, '#040309');
      e.fillStyle = tg;
      e.fillRect(tx - tyreW / 2, h * 0.10, tyreW, tyreH);
      // 胎侧反光：夜色里它是唯一能把轮胎和背景分开的东西
      e.fillStyle = 'rgba(150,195,255,0.10)';
      e.fillRect(tx - tyreW * 0.36, h * 0.14, tyreW * 0.14, tyreH * 0.68);
    }

    // —— 2.5 车头灯（照在路面上）——
    // 必须画在车身之前，否则会盖住车顶；起点也要在车顶之上（-h*0.75），
    // 从车头起画会让整个车厢蒙上一层灰。
    const beam = e.createLinearGradient(0, -h * 0.78, 0, -h * 3.0);
    beam.addColorStop(0, v(c.neonBlue, 0.20));
    beam.addColorStop(0.30, v(c.neonBlue, 0.09));
    beam.addColorStop(1, 'rgba(0,0,0,0)');
    e.globalAlpha = 0.6;
    e.fillStyle = beam;
    e.beginPath();
    e.moveTo(-l * 0.22, -h * 0.75);
    e.lineTo(l * 0.22, -h * 0.75);
    e.lineTo(l * 0.68, -h * 3.0);
    e.lineTo(-l * 0.68, -h * 3.0);
    e.closePath();
    e.fill();
    e.globalAlpha = 1;

    // —— 3. 车身 ——
    const bw = l * 0.47; // 底部半宽
    const sw = l * 0.385; // 肩部半宽
    const tw = l * 0.30; // 车顶半宽
    const bodyPath = () => {
      e.beginPath();
      e.moveTo(-bw, h * 0.30);
      e.lineTo(-sw, -h * 0.24);
      e.lineTo(-tw, -h * 0.70);
      e.lineTo(tw, -h * 0.70);
      e.lineTo(sw, -h * 0.24);
      e.lineTo(bw, h * 0.30);
      e.closePath();
    };
    const bodyG = e.createLinearGradient(0, -h * 0.8, 0, h * 0.34);
    bodyG.addColorStop(0, '#4b3486');
    bodyG.addColorStop(0.30, '#2a1c4d');
    bodyG.addColorStop(0.72, '#150e2a');
    bodyG.addColorStop(1, '#0b0718');
    bodyPath();
    e.fillStyle = bodyG;
    e.fill();

    // 左亮右暗：光从左上打过来。平涂的车看起来是「圆」的最大原因就在这里
    const sheen = e.createLinearGradient(-bw, 0, bw, 0);
    sheen.addColorStop(0, 'rgba(150,190,255,0.18)');
    sheen.addColorStop(0.3, 'rgba(150,190,255,0.04)');
    sheen.addColorStop(0.62, 'rgba(0,0,0,0.14)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.36)');
    bodyPath();
    e.fillStyle = sheen;
    e.fill();

    // 轮廓光：勾一圈环境光，车才从背景里「立」出来
    bodyPath();
    e.strokeStyle = 'rgba(120,200,255,0.42)';
    e.lineWidth = Math.max(1.1, l * 0.011);
    e.stroke();

    // 肩线：一条横向高光，把车身分成上下两段 = 有结构
    e.strokeStyle = 'rgba(180,215,255,0.16)';
    e.lineWidth = Math.max(1, l * 0.008);
    e.beginPath();
    e.moveTo(-sw, -h * 0.24);
    e.lineTo(sw, -h * 0.24);
    e.stroke();

    // —— 4. 后窗 ——
    const gwb = l * 0.255;
    const gwt = l * 0.205;
    const glassPath = () => {
      e.beginPath();
      e.moveTo(-gwb, -h * 0.20);
      e.lineTo(-gwt, -h * 0.62);
      e.lineTo(gwt, -h * 0.62);
      e.lineTo(gwb, -h * 0.20);
      e.closePath();
    };
    const glassG = e.createLinearGradient(0, -h * 0.64, 0, -h * 0.18);
    glassG.addColorStop(0, '#2e5390');
    glassG.addColorStop(0.42, '#14213a');
    glassG.addColorStop(1, '#070a14');
    glassPath();
    e.fillStyle = glassG;
    e.fill();
    // 玻璃上一道斜反光：后窗有反光才像玻璃，否则是一块深色补丁
    glassPath();
    e.strokeStyle = 'rgba(140,205,255,0.22)';
    e.lineWidth = Math.max(1, l * 0.007);
    e.stroke();

    // —— 5. 尾灯 ——
    // 速度低时暗红（示宽灯），高速或氮气时变亮（刹车感）
    const hot = spd > 0.62 || t.nitro > 0.1;
    const tailA = hot ? 0.95 : 0.58;
    e.save();
    e.globalCompositeOperation = 'lighter';
    e.shadowBlur = hot ? 22 : 12;
    e.shadowColor = '#ff2a4a';
    e.fillStyle = 'rgba(255,42,74,' + tailA + ')';
    e.fillRect(-bw * 0.90, h * 0.015, bw * 0.58, h * 0.095);
    e.fillRect(bw * 0.32, h * 0.015, bw * 0.58, h * 0.095);
    e.restore();

    // —— 6. 底裙 + 底部霓虹 ——
    e.fillStyle = 'rgba(5,3,10,0.92)';
    e.fillRect(-bw * 0.97, h * 0.23, bw * 1.94, h * 0.11);
    e.save();
    e.globalCompositeOperation = 'lighter';
    const underGlow = e.createLinearGradient(0, h * 0.26, 0, h * 0.50);
    underGlow.addColorStop(0, 'rgba(0,229,255,0.40)');
    underGlow.addColorStop(0.55, 'rgba(0,229,255,0.12)');
    underGlow.addColorStop(1, 'rgba(0,229,255,0)');
    e.fillStyle = underGlow;
    e.fillRect(-bw * 0.97, h * 0.26, bw * 1.94, h * 0.24);
    e.restore();

    // —— 8. 尾部尾焰（氮气时变色）——
    const flameCol = t.nitro > 0.1 ? c.neonPink : c.neonBlue;
    if (spd > 0.05) {
      e.save();
      e.globalCompositeOperation = 'lighter';
      for (let sx = -1; sx <= 1; sx += 2) {
        const fx = sx * l * 0.22;
        const fg = e.createRadialGradient(fx, h * 0.34, 1, fx, h * 0.34, h * 0.42);
        fg.addColorStop(0, v(flameCol, 0.45 * spd));
        fg.addColorStop(1, 'rgba(0,0,0,0)');
        e.fillStyle = fg;
        e.beginPath();
        e.arc(fx, h * 0.34, h * 0.42, 0, PI2);
        e.fill();
      }
      e.restore();
    }

    e.restore();

    return {
      exhaust: [
        { x: cx - l * 0.22, y: baseY + bobY + h * 0.34 },
        { x: cx + l * 0.22, y: baseY + bobY + h * 0.34 },
      ],
      wheels: [
        { x: cx - l * 0.44, y: baseY + bobY + h * 0.30 },
        { x: cx + l * 0.44, y: baseY + bobY + h * 0.30 },
      ],
    };
  }
};
var Ie = 480,
  ne = class {
    constructor(e) {
      ((this.view = e),
        (this.pool = []),
        (this.active = []),
        (this.rings = []),
        (this.popups = []),
        (this.shakeMag = 0),
        (this.shakeTime = 0),
        (this.flashAlpha = 0),
        (this.flashColor = c.neonBlue),
        (this.perfect = null),
        (this.comboPulse = 0),
        (this.time = 0));
    }
    _obtain() {
      let e = this.pool.pop() || {};
      return (
        (e.x = 0),
        (e.y = 0),
        (e.vx = 0),
        (e.vy = 0),
        (e.life = 0),
        (e.max = 1),
        (e.size = 2),
        (e.color = "#fff"),
        (e.kind = "spark"),
        (e.gravity = 0),
        (e.drag = 0.9),
        (e.rot = 0),
        (e.vrot = 0),
        e
      );
    }
    _recycle(e) {
      this.pool.length < Ie && this.pool.push(e);
    }
    _spawn(e) {
      if (this.active.length >= Ie) {
        let i = 0,
          s = 1 / 0;
        for (let n = 0; n < this.active.length; n++) {
          let o = this.active[n].life / this.active[n].max;
          o < s && ((s = o), (i = n));
        }
        this._recycle(this.active.splice(i, 1)[0]);
      }
      let t = this._obtain();
      return (Object.assign(t, e), (t.max = t.life), this.active.push(t), t);
    }
    emitNitro(e, t, i, s) {
      let n = i > 0.5 ? 3 : 1;
      for (let o = 0; o < n; o++) {
        let r = Math.random() < 0.5 ? c.neonBlue : c.neonPink;
        this._spawn({
          x: e + T(-3, 3),
          y: t + T(-2, 2),
          vx: T(-38, 38),
          vy: T(90, 240) * (0.5 + s),
          life: T(0.28, 0.5),
          size: T(3, 8) * (0.6 + i),
          color: r,
          kind: "flame",
          gravity: -30,
          drag: 0.86,
        });
      }
    }
    emitTire(e, t, i) {
      Math.random() > i * 0.9 ||
        this._spawn({
          x: e + T(-6, 6),
          y: t + T(-3, 3),
          vx: T(-24, 24),
          vy: T(10, 60),
          life: T(0.5, 0.9),
          size: T(6, 14),
          color: Math.random() < 0.3 ? c.neonPurple : "#5a4a7a",
          kind: "smoke",
          gravity: -18,
          drag: 0.93,
        });
    }
    emitSparks(e, t, i = 22, s = c.neonYellow) {
      for (let n = 0; n < i; n++) {
        let o = T(0, Math.PI * 2),
          r = T(80, 420);
        this._spawn({
          x: e,
          y: t,
          vx: Math.cos(o) * r,
          vy: Math.sin(o) * r - 60,
          life: T(0.25, 0.6),
          size: T(2, 5),
          color: Math.random() < 0.4 ? c.warn : s,
          kind: "spark",
          gravity: 520,
          drag: 0.9,
        });
      }
    }
    emitRing(e, t, i = c.neonGreen, s = 220, n = 4) {
      this.rings.push({
        x: e,
        y: t,
        r: 6,
        maxR: s,
        color: i,
        life: 0.6,
        max: 0.6,
        width: n,
      });
    }
    emitPopup(e, t, i, s = c.neonGreen, n = 28) {
      this.popups.push({
        text: e,
        x: t,
        y: i,
        color: s,
        size: n,
        life: 1,
        max: 1,
      });
    }
    emitPerfect(e) {
      ((this.perfect = { life: 0.85, max: 0.85, combo: e, rays: 14 }),
        (this.comboPulse = 1),
        this.emitRing(
          this.view.width * 0.5,
          this.view.height * 0.55,
          c.neonGreen,
          380,
          6,
        ));
    }
    shake(e = 12, t = 0.35) {
      ((this.shakeMag = Math.max(this.shakeMag, e)),
        (this.shakeTime = Math.max(this.shakeTime, t)));
    }
    flash(e = c.warn, t = 0.5) {
      ((this.flashColor = e), (this.flashAlpha = Math.max(this.flashAlpha, t)));
    }
    update(e) {
      this.time += e;
      for (let t = this.active.length - 1; t >= 0; t--) {
        let i = this.active[t];
        if (((i.life -= e), i.life <= 0)) {
          (this._recycle(i), this.active.splice(t, 1));
          continue;
        }
        i.vy += i.gravity * e;
        let s = Math.pow(i.drag, e * 60);
        ((i.vx *= s),
          (i.vy *= s),
          (i.x += i.vx * e),
          (i.y += i.vy * e),
          (i.rot += i.vrot * e));
      }
      for (let t = this.rings.length - 1; t >= 0; t--) {
        let i = this.rings[t];
        ((i.life -= e),
          (i.r = K(i.maxR, 6, m(i.life / i.max, 0, 1))),
          i.life <= 0 && this.rings.splice(t, 1));
      }
      for (let t = this.popups.length - 1; t >= 0; t--) {
        let i = this.popups[t];
        ((i.life -= e),
          (i.y -= 46 * e),
          i.life <= 0 && this.popups.splice(t, 1));
      }
      (this.perfect &&
        ((this.perfect.life -= e),
        this.perfect.life <= 0 && (this.perfect = null)),
        this.shakeTime > 0 &&
          ((this.shakeTime -= e),
          this.shakeTime <= 0 && ((this.shakeTime = 0), (this.shakeMag = 0))),
        (this.flashAlpha = Math.max(0, this.flashAlpha - e * 2.2)),
        (this.comboPulse = Math.max(0, this.comboPulse - e * 2)));
    }
    applyShake(e) {
      if (this.shakeTime <= 0) return;
      let t = this.shakeMag * this.shakeTime;
      e.translate(T(-t, t), T(-t, t));
    }
    renderBack(e) {
      (e.save(), (e.globalCompositeOperation = "lighter"));
      for (let t of this.active)
        (t.kind !== "flame" && t.kind !== "smoke") || this.drawParticle(e, t);
      e.restore();
    }
    renderFront(e) {
      (e.save(), (e.globalCompositeOperation = "lighter"));
      for (let t of this.active)
        t.kind === "flame" || t.kind === "smoke" || this.drawParticle(e, t);
      for (let t of this.rings) {
        let i = m(t.life / t.max, 0, 1);
        ((e.globalAlpha = i * 0.85),
          (e.strokeStyle = t.color),
          (e.lineWidth = t.width * i + 1),
          (e.shadowBlur = 24),
          (e.shadowColor = t.color),
          e.beginPath(),
          e.ellipse(t.x, t.y, t.r, t.r * 0.42, 0, 0, Math.PI * 2),
          e.stroke());
      }
      e.restore();
      for (let t of this.popups) {
        let i = m(t.life / t.max, 0, 1);
        (e.save(),
          (e.globalAlpha = i),
          (e.font = `bold ${t.size}px sans-serif`),
          (e.textAlign = "center"),
          (e.shadowBlur = 18),
          (e.shadowColor = t.color),
          (e.fillStyle = t.color),
          e.fillText(t.text, t.x, t.y),
          e.restore());
      }
      (this.perfect && this.renderPerfect(e),
        this.flashAlpha > 0.01 &&
          (e.save(),
          (e.globalAlpha = this.flashAlpha),
          (e.fillStyle = this.flashColor),
          e.fillRect(0, 0, this.view.width, this.view.height),
          e.restore()));
    }
    drawParticle(e, t) {
      let i = m(t.life / t.max, 0, 1);
      ((e.globalAlpha = t.kind === "smoke" ? i * 0.35 : i * 0.9),
        (e.fillStyle = t.color),
        e.beginPath());
      let s = t.size * (t.kind === "flame" ? i : 1);
      (e.arc(t.x, t.y, Math.max(0.5, s), 0, Math.PI * 2), e.fill());
    }
    renderPerfect(e) {
      let { width: t, height: i } = this.view,
        s = this.perfect,
        n = 1 - s.life / s.max,
        o = 0.6 + Math.sin(Math.min(1, n * 3) * Math.PI * 0.5) * 0.75,
        r = s.life / s.max;
      (e.save(),
        e.translate(t * 0.5, i * 0.42),
        (e.globalAlpha = r * 0.55),
        (e.strokeStyle = c.neonGreen),
        (e.lineWidth = 3),
        (e.shadowBlur = 30),
        (e.shadowColor = c.neonGreen));
      for (let l = 0; l < s.rays; l++) {
        let h = (Math.PI * 2 * l) / s.rays + n,
          f = 90 * o,
          d = f + 160 * (1 - n);
        (e.beginPath(),
          e.moveTo(Math.cos(h) * f, Math.sin(h) * f * 0.55),
          e.lineTo(Math.cos(h) * d, Math.sin(h) * d * 0.55),
          e.stroke());
      }
      (e.scale(o, o),
        (e.textAlign = "center"),
        (e.textBaseline = "middle"),
        (e.font = "bold 76px sans-serif"),
        (e.globalAlpha = r * 0.85),
        (e.fillStyle = c.neonBlue),
        e.fillText("PERFECT", -4, 0),
        (e.fillStyle = c.neonPink),
        e.fillText("PERFECT", 4, 0),
        (e.globalAlpha = r),
        (e.fillStyle = "#ffffff"),
        e.fillText("PERFECT", 0, 0),
        s.combo > 1 &&
          ((e.font = "bold 34px sans-serif"),
          (e.fillStyle = c.neonYellow),
          e.fillText(`COMBO x${s.combo}`, 0, 58)),
        e.restore());
    }
    renderSpeedLines(e, t) {
      if (t < 0.55) return;
      let { width: i, height: s } = this.view,
        n = Math.floor((t - 0.5) * 26);
      (e.save(),
        (e.globalCompositeOperation = "lighter"),
        (e.strokeStyle = v(c.neonBlue, 0.28)),
        (e.lineWidth = 2));
      for (let o = 0; o < n; o++) {
        let r = (o * 97 + Math.floor(this.time * 400)) % 1e3,
          l = (r / 1e3) * s,
          h = 60 + (r % 90),
          f = r % 2 === 0 ? r % (i * 0.35) : i - (r % (i * 0.35));
        ((e.globalAlpha = 0.12 + (t - 0.5) * 0.5),
          e.beginPath(),
          e.moveTo(f, l),
          e.lineTo(f + (f < i * 0.5 ? h : -h), l + 4),
          e.stroke());
      }
      e.restore();
    }
    reset() {
      for (let e of this.active) this._recycle(e);
      ((this.active.length = 0),
        (this.rings.length = 0),
        (this.popups.length = 0),
        (this.perfect = null),
        (this.flashAlpha = 0),
        (this.shakeTime = 0));
    }
  };
function _(a, e, t, i, s, n) {
  let o = Math.min(n, i / 2, s / 2);
  (a.beginPath(),
    a.moveTo(e + o, t),
    a.lineTo(e + i - o, t),
    a.quadraticCurveTo(e + i, t, e + i, t + o),
    a.lineTo(e + i, t + s - o),
    a.quadraticCurveTo(e + i, t + s, e + i - o, t + s),
    a.lineTo(e + o, t + s),
    a.quadraticCurveTo(e, t + s, e, t + s - o),
    a.lineTo(e, t + o),
    a.quadraticCurveTo(e, t, e + o, t),
    a.closePath());
}
function b(
  a,
  e,
  t,
  i,
  {
    size: s = 24,
    color: n = c.text,
    align: o = "left",
    baseline: r = "alphabetic",
    blur: l = 14,
    weight: h = "bold",
    alpha: f = 1,
  } = {},
) {
  (a.save(),
    (a.globalAlpha = f),
    (a.font = `${h} ${s}px sans-serif`),
    (a.textAlign = o),
    (a.textBaseline = r),
    (a.shadowBlur = l),
    (a.shadowColor = n),
    (a.fillStyle = n),
    a.fillText(e, t, i),
    a.restore());
}
function B(
  a,
  e,
  t,
  i,
  s,
  {
    fill: n = "rgba(8,2,24,0.82)",
    stroke: o = c.neonBlue,
    r = 16,
    blur: l = 18,
  } = {},
) {
  (a.save(),
    (a.shadowBlur = l),
    (a.shadowColor = o),
    (a.fillStyle = n),
    _(a, e, t, i, s, r),
    a.fill(),
    (a.strokeStyle = v(o, 0.75)),
    (a.lineWidth = 1.5),
    a.stroke(),
    a.restore());
}
function R(
  a,
  e,
  t,
  { color: i = c.neonPink, active: s = !1, size: n = 26, filled: o = !1 } = {},
) {
  let { x: r, y: l, w: h, h: f } = e;
  return (
    a.save(),
    (a.shadowBlur = s ? 26 : 14),
    (a.shadowColor = i),
    (a.fillStyle = o || s ? v(i, 0.28) : "rgba(10,3,28,0.75)"),
    _(a, r, l, h, f, f * 0.28),
    a.fill(),
    (a.strokeStyle = i),
    (a.lineWidth = 2),
    a.stroke(),
    a.restore(),
    b(a, t, r + h / 2, l + f / 2 + n * 0.35, {
      size: n,
      color: s ? "#ffffff" : i,
      align: "center",
      blur: 10,
    }),
    e
  );
}
function ae(a, e, t) {
  return e >= a.x && e <= a.x + a.w && t >= a.y && t <= a.y + a.h;
}
function De(
  a,
  e,
  t,
  i,
  s,
  { color: n = c.neonGreen, label: o = "", fmt: r = null } = {},
) {
  let { x: l, y: h, w: f, h: d } = e,
    u = m((t - i) / (s - i), 0, 1);
  if (
    (a.save(),
    (a.fillStyle = "rgba(255,255,255,0.12)"),
    _(a, l, h + d * 0.35, f, d * 0.3, d * 0.15),
    a.fill(),
    (a.fillStyle = v(n, 0.55)),
    _(a, l, h + d * 0.35, f * u, d * 0.3, d * 0.15),
    a.fill(),
    (a.shadowBlur = 16),
    (a.shadowColor = n),
    (a.fillStyle = "#ffffff"),
    a.beginPath(),
    a.arc(l + f * u, h + d * 0.5, d * 0.34, 0, Math.PI * 2),
    a.fill(),
    a.restore(),
    o)
  ) {
    b(a, o, l, h + d * 0.28, { size: 18, color: c.textDim, blur: 6 });
    let g = r ? r(t) : String(Math.round(t * 100) / 100);
    b(a, g, l + f, h + d * 0.28, {
      size: 18,
      color: n,
      align: "right",
      blur: 8,
    });
  }
  return e;
}
function Be(a, e, t, i) {
  let s = m((e - a.x) / a.w, 0, 1);
  return t + (i - t) * s;
}
function V(
  a,
  e,
  t,
  i,
  s,
  {
    color: n = c.neonBlue,
    width: o = 10,
    bg: r = "rgba(255,255,255,0.10)",
    label: l = "",
    sub: h = "",
  } = {},
) {
  (a.save(),
    (a.lineWidth = o),
    (a.strokeStyle = r),
    a.beginPath(),
    a.arc(e, t, i, 0, Math.PI * 2),
    a.stroke(),
    (a.shadowBlur = 22),
    (a.shadowColor = n),
    (a.strokeStyle = n),
    (a.lineCap = "round"),
    a.beginPath(),
    a.arc(e, t, i, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * m(s, 0, 1)),
    a.stroke(),
    a.restore(),
    l &&
      b(a, l, e, t + 6, { size: 30, color: "#fff", align: "center", blur: 12 }),
    h &&
      b(a, h, e, t + 30, {
        size: 16,
        color: c.textDim,
        align: "center",
        blur: 4,
      }));
}
var le = class {
  constructor(e) {
    ((this.view = e), (this.comboScale = 1), (this.time = 0));
  }
  /**
   * HUD 自己的帧时钟。界面上的呼吸/脉冲效果必须走这里，不能用 Date.now()：
   * 渲染应当只读状态，用挂钟时间会让同一帧渲染两次结果不同（截图/回放/测试都不可复现），
   * 而且设备时钟一跳（NTP 校时）动画就会闪一下。
   */
  update(e) {
    this.time += e;
  }
  render(e, t) {
    let { width: i, height: s } = this.view,
      n = t.motion,
      o = t.player;
    (this.drawTopLeft(e, t),
      this.drawProgress(e, i * 0.5, 74, t),
      this.drawTopRight(e, t),
      this.drawSpeedometer(e, 150, s - 130, t),
      this.drawPosture(e, i - 150, s - 130, n),
      this.drawBottomHint(e, t),
      t.countdown > 0 && this.drawCountdown(e, t.countdown));
  }
  drawTopLeft(e, t) {
    B(e, 24, 24, 300, 92, { stroke: c.neonBlue, r: 14 });
    let s =
      t.ble.state === "connected" || t.ble.state === "mock"
        ? c.ok
        : t.ble.state === "error"
          ? c.warn
          : c.neonYellow;
    (e.save(),
      (e.shadowBlur = 12),
      (e.shadowColor = s),
      (e.fillStyle = s),
      e.beginPath(),
      e.arc(46, 48, 6, 0, Math.PI * 2),
      e.fill(),
      e.restore());
    let n = t.motion || {},
      o = n.neutral || { roll: 0 },
      r = n.smoothed || { roll: 0 },
      l = Math.round((r.roll || 0) - (o.roll || 0));
    (b(
      e,
      n.connected ? "侧屈 " + (l > 0 ? "+" : "") + l + "°" : "体感待机",
      60,
      54,
      { size: 18, color: c.text, blur: 6 },
    ),
      b(e, `难度 ${t.diff.name}`, 60, 78, {
        size: 18,
        color: c.neonPink,
        blur: 6,
      }));
    let h = Math.max(0, t.timeLeft),
      f = String(Math.floor(h / 60)).padStart(2, "0"),
      d = String(Math.floor(h % 60)).padStart(2, "0");
    (b(e, `${f}:${d}`, 310, 54, {
      size: 26,
      color: h < 10 ? c.warn : c.text,
      align: "right",
      blur: 10,
    }),
      b(e, "剩余时间", 310, 78, {
        size: 16,
        color: c.textDim,
        align: "right",
        blur: 2,
      }));
  }
  drawProgress(e, t, i, s) {
    V(e, t, i, 46, s.progress, {
      color: c.neonGreen,
      width: 9,
      label: `${Math.round(s.progress * 100)}%`,
      sub: `${Math.round(s.calories)} kcal`,
    });
  }
  drawTopRight(e, t) {
    let i = this.view.width;
    if (
      (B(e, i - 324, 24, 300, 92, { stroke: c.neonPink, r: 14 }),
      b(e, String(t.score), i - 44, 60, {
        size: 34,
        color: c.neonPink,
        align: "right",
        blur: 14,
      }),
      b(e, `排名 #${t.rank}`, i - 44, 86, {
        size: 18,
        color: c.textDim,
        align: "right",
        blur: 4,
      }),
      b(e, "SCORE", i - 300, 60, { size: 16, color: c.textDim, blur: 4 }),
      t.combo > 0)
    ) {
      let s = 1 + m(t.comboPulse, 0, 1) * 0.35;
      (e.save(),
        e.translate(i - 162, 140),
        e.scale(s, s),
        b(e, `COMBO x${t.combo}`, 0, 0, {
          size: 30,
          color: c.neonYellow,
          align: "center",
          blur: 18,
        }),
        e.restore());
    }
  }
  drawSpeedometer(e, t, i, s) {
    let o = m(s.player.speedPct, 0, 1);
    (e.save(),
      (e.fillStyle = "rgba(6,1,20,0.7)"),
      e.beginPath(),
      e.arc(t, i, 98, 0, Math.PI * 2),
      e.fill(),
      (e.strokeStyle = "rgba(255,255,255,0.15)"),
      (e.lineWidth = 2));
    for (let f = 0; f <= 10; f++) {
      let d = Math.PI * 0.75 + (Math.PI * 1.5 * f) / 10,
        u = 84 - (f % 5 === 0 ? 14 : 8);
      (e.beginPath(),
        e.moveTo(t + Math.cos(d) * u, i + Math.sin(d) * u),
        e.lineTo(t + Math.cos(d) * 84, i + Math.sin(d) * 84),
        e.stroke());
    }
    let r = o > 0.8 ? c.neonPink : c.neonBlue;
    ((e.shadowBlur = 20),
      (e.shadowColor = r),
      (e.strokeStyle = r),
      (e.lineWidth = 8),
      (e.lineCap = "round"),
      e.beginPath(),
      e.arc(t, i, 78, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * o),
      e.stroke());
    let l = Math.PI * 0.75 + Math.PI * 1.5 * o;
    ((e.strokeStyle = "#fff"),
      (e.lineWidth = 3),
      e.beginPath(),
      e.moveTo(t, i),
      e.lineTo(t + Math.cos(l) * 66, i + Math.sin(l) * 66),
      e.stroke(),
      e.restore(),
      b(e, String(s.player.speedKmh), t, i + 8, {
        size: 34,
        color: "#fff",
        align: "center",
        blur: 12,
      }),
      b(e, "km/h", t, i + 30, {
        size: 15,
        color: c.textDim,
        align: "center",
        blur: 2,
      }));
    let h = 150;
    (e.save(),
      (e.fillStyle = "rgba(255,255,255,0.12)"),
      _(e, t - h / 2, i + 84 + 2, h, 10, 5),
      e.fill(),
      (e.shadowBlur = 14),
      (e.shadowColor = c.neonPink),
      (e.fillStyle = v(c.neonPink, 0.9)),
      _(e, t - h / 2, i + 84 + 2, h * m(s.player.nitro, 0, 1), 10, 5),
      e.fill(),
      e.restore(),
      b(e, "NITRO", t, i + 84 + 32, {
        size: 14,
        color: c.textDim,
        align: "center",
        blur: 2,
      }));
  }
  drawPosture(e, t, i, s) {
    let o = s.params.maxAngle,
      r = s.offset,
      l = m(r.roll / o, -1.4, 1.4) * 84 * 0.8,
      h = m(-r.pitch / o, -1.4, 1.4) * 84 * 0.8;
    (e.save(),
      (e.fillStyle = "rgba(6,1,20,0.7)"),
      e.beginPath(),
      e.arc(t, i, 98, 0, Math.PI * 2),
      e.fill(),
      (e.strokeStyle = v(c.neonPurple, 0.6)),
      (e.lineWidth = 2),
      e.beginPath(),
      e.arc(t, i, 84 * 0.8, 0, Math.PI * 2),
      e.stroke(),
      (e.strokeStyle = "rgba(255,255,255,0.12)"),
      e.beginPath(),
      e.moveTo(t - 84, i),
      e.lineTo(t + 84, i),
      e.moveTo(t, i - 84),
      e.lineTo(t, i + 84),
      e.stroke());
    let f = t + m(s.target.roll / o, -1.4, 1.4) * 84 * 0.8,
      d = i + m(-s.target.pitch / o, -1.4, 1.4) * 84 * 0.8;
    ((e.shadowBlur = 16),
      (e.shadowColor = c.neonBlue),
      (e.strokeStyle = c.neonBlue),
      (e.lineWidth = 2.5),
      e.beginPath(),
      e.arc(f, d, 16 + Math.sin(this.time * 3.846) * 2, 0, Math.PI * 2),
      e.stroke());
    let u = m(s.match, 0, 1),
      g = u > 0.75 ? c.neonGreen : u > 0.45 ? c.neonYellow : c.warn;
    ((e.shadowBlur = 22),
      (e.shadowColor = g),
      (e.fillStyle = g),
      e.beginPath(),
      e.arc(t + l, i + h, 11, 0, Math.PI * 2),
      e.fill(),
      e.restore(),
      b(e, `${Math.round(u * 100)}%`, t, i + 84 + 34, {
        size: 22,
        color: g,
        align: "center",
        blur: 10,
      }),
      b(e, "姿态匹配度", t, i + 84 + 56, {
        size: 14,
        color: c.textDim,
        align: "center",
        blur: 2,
      }),
      s.jitter > 0.55 &&
        b(e, "请保持躯干稳定", t, i - 84 - 22, {
          size: 16,
          color: c.warn,
          align: "center",
          blur: 8,
        }));
  }
  drawBottomHint(e, t) {
    let i = this.view.width,
      s = this.view.height;
    t.hint &&
      b(e, t.hint, i * 0.5, s - 24, {
        size: 18,
        color: c.textDim,
        align: "center",
        blur: 4,
      });
  }
  drawCountdown(e, t) {
    let { width: i, height: s } = this.view,
      n = t > 0 ? String(Math.ceil(t)) : "GO!";
    (e.save(),
      (e.globalAlpha = 0.92),
      b(e, n, i * 0.5, s * 0.45, {
        size: 120,
        color: c.neonGreen,
        align: "center",
        baseline: "middle",
        blur: 30,
      }),
      e.restore());
  }
};
var he = class {
  constructor(e) {
    ((this.view = e), (this.layoutMap = {}));
  }
  /**
   * 难度信息面板与两个步进按钮共用同一套几何。
   * 分开各算一次很容易改歪（历史问题：按钮压在文字上），所以收敛到一处。
   */
  diffRow() {
    let { width: e, height: t } = this.view,
      i = 88,
      s = t * 0.42 - 19
    return {
      panel: { x: e * 0.5 - 310, y: s, w: 620, h: i },
      btnY: s + (i - 52) / 2,
      btnL: e * 0.5 - 300,
      btnR: e * 0.5 + 240,
      titleY: s + 34,
      subY: s + 66
    }
  }
  layout(e, t = {}) {
    let { width: i, height: s } = this.view,
      n = [],
      o = (f, d, u, g, y, S, M) => {
        let L = { x: u, y: g, w: y, h: S };
        return (n.push({ id: f, label: d, rect: L, color: M }), L);
      },
      r = 260,
      l = 68,
      h = i * 0.5 - r / 2;
    if (e === "menu") {
      let f = s * 0.52;
      (o("mock", "模拟模式（触屏驱动）", h, f, r, l, c.neonGreen),
        (f += l + 16),
        o("start", "开始训练", h, f, r, l, c.neonPink),
        (f += l + 16));
      let d = r * 0.5 - 8;
      (        o("board", "排行榜", h - d - 6, f, d, l * 0.8, c.neonPurple),
        o("calibrate", "姿态标定", h + 6, f, d, l * 0.8, c.neonPurple));
      // 难度行的几何由 diffRow() 统一给出。原来是 ±150 / +90，两个步进按钮正好
      // 压在「难度档位…」「障碍密度…」两行文字上，中间只剩约 180px，
      // 两行字都被裁掉两头 —— 现在按钮贴到面板两端，中间留出约 480px。
      const dr = this.diffRow();
      (o("diffDown", "－", dr.btnL, dr.btnY, 60, 52, c.neonBlue),
        o("diffUp", "＋", dr.btnR, dr.btnY, 60, 52, c.neonBlue));
    } else if (e === "ble") {
      let f = s * 0.28,
        d = (t.devices || []).slice(0, 5);
      (d.length ||
        n.push({
          id: "none",
          label: "未发现设备",
          rect: { x: 0, y: 0, w: 0, h: 0 },
          color: c.textDim,
        }),
        d.forEach((g, y) =>
          o(
            "dev:" + g.deviceId,
            `${g.name}  ${g.RSSI || 0}dBm  [${String(g.deviceId).slice(0, 8)}]`,
            i * 0.5 - 260,
            f + y * 62,
            520,
            52,
            c.neonBlue,
          ),
        ));
      let u = s * 0.28 + 310 + 14;
      (o("rescan", "重新搜索", i * 0.5 - 270, u, 170, 54, c.neonGreen),
        o("mock", "用模拟模式", i * 0.5 - 85, u, 170, 54, c.neonYellow),
        o("back", "返回", i * 0.5 + 100, u, 170, 54, c.neonPink),
        o(
          "all",
          t.showAll ? "仅显示 WT 设备" : `显示全部 BLE 设备（${t.total || 0}）`,
          i * 0.5 - 260,
          u + 62,
          520,
          46,
          c.neonPurple,
        ));
    } else
      e === "calibrate"
        ? (o(
            "doCalibrate",
            t.calibrating ? "标定中…" : "开始标定（保持中立位 3 秒）",
            i * 0.5 - 240,
            s * 0.62,
            480,
            62,
            c.neonGreen,
          ),
          o(
            "skip",
            "跳过并返回",
            i * 0.5 - 130,
            s * 0.62 + 76,
            260,
            52,
            c.neonPink,
          ))
        : e === "pause"
          ? (o("resume", "继续训练", h, s * 0.42, r, l, c.neonGreen),
            o("restart", "重新开始", h, s * 0.42 + l + 16, r, l, c.neonBlue),
            o(
              "quit",
              "结束并返回",
              h,
              s * 0.42 + (l + 16) * 2,
              r,
              l,
              c.neonPink,
            ))
          : e === "result"
            ? (o(
                "again",
                "再来一次",
                i * 0.5 - 290,
                s - 110,
                180,
                62,
                c.neonPink,
              ),
              o("board", "排行榜", i * 0.5 - 90, s - 110, 180, 62, c.neonBlue),
              o(
                "menu",
                "返回菜单",
                i * 0.5 + 110,
                s - 110,
                180,
                62,
                c.neonPurple,
              ))
            : e === "leaderboard"
              ? o("back", "返回", i * 0.5 - 130, s - 100, 260, 60, c.neonPink)
              : e === "privacy" &&
                (o(
                  "privacyAgree",
                  "同意并使用蓝牙",
                  i * 0.5 - 270,
                  s * 0.6,
                  260,
                  62,
                  c.neonGreen,
                ),
                o(
                  "privacyReject",
                  "暂不同意",
                  i * 0.5 + 10,
                  s * 0.6,
                  260,
                  62,
                  c.neonPink,
                ),
                o(
                  "privacyOpen",
                  "查看《用户隐私保护指引》",
                  i * 0.5 - 170,
                  s * 0.6 + 82,
                  340,
                  50,
                  c.neonBlue,
                ));
    return ((this.layoutMap[e] = n), n);
  }
  hitTest(e, t, i) {
    let s = this.layoutMap[e] || [];
    for (let n of s) if (ae(n.rect, t, i)) return n.id;
    return null;
  }
  render(e, t, i = {}) {
    let s = this.layout(t, i);
    switch (t) {
      case "menu":
        return this.renderMenu(e, s, i);
      case "ble":
        return this.renderBle(e, s, i);
      case "calibrate":
        return this.renderCalibrate(e, s, i);
      case "pause":
        return this.renderPause(e, s, i);
      case "result":
        return this.renderResult(e, s, i);
      case "leaderboard":
        return this.renderBoard(e, s, i);
      case "privacy":
        return this.renderPrivacy(e, s);
      default:
        return null;
    }
  }
  renderMenu(e, t, i) {
    let { width: s, height: n } = this.view;
    (e.save(),
      b(e, "NEON REHAB RACER", s * 0.5, n * 0.2, {
        size: 62,
        color: c.neonPink,
        align: "center",
        blur: 26,
      }),
      b(e, "体感赛车康复训练 · 身体姿态驱动", s * 0.5, n * 0.2 + 44, {
        size: 22,
        color: c.neonBlue,
        align: "center",
        blur: 12,
      }),
      e.restore());
    let o = U[m(i.difficulty || 2, 1, 5)];
    let dr = this.diffRow();
    (B(e, dr.panel.x, dr.panel.y, dr.panel.w, dr.panel.h, {
      stroke: c.neonPurple,
      r: 18,
    }),
      b(e, `难度档位  ${o.name}`, s * 0.5, dr.titleY, {
        size: 26,
        color: c.neonYellow,
        align: "center",
        blur: 10,
      }),
      b(
        e,
        `障碍密度 ${Math.round(o.density * 100)}% · 速度上限 ${Math.round(o.maxSpeed / 42)}km/h · ${o.sessionSeconds}s`,
        s * 0.5,
        dr.subY,
        { size: 16, color: c.textDim, align: "center", blur: 2 },
      ));
    for (let r of t) R(e, r.rect, r.label, { color: r.color, size: 24 });
    b(
      e,
      "长按右上角圆点 1.2 秒打开治疗师面板 · 返回键在左上角",
      s * 0.5,
      n - 32,
      { size: 16, color: "rgba(234,246,255,0.35)", align: "center", blur: 0 },
    );
  }
  renderBle(e, t, i) {
    let { width: s, height: n } = this.view;
    if (
      (e.save(),
      (e.fillStyle = "rgba(3,0,12,0.86)"),
      e.fillRect(0, 0, s, n),
      e.restore(),
      b(e, "搜索 WT9011 姿态传感器", s * 0.5, n * 0.13, {
        size: 38,
        color: c.neonBlue,
        align: "center",
        blur: 18,
      }),
      b(
        e,
        i.message || "请确保传感器已上电并佩戴于腋下最高点",
        s * 0.5,
        n * 0.13 + 34,
        { size: 18, color: c.textDim, align: "center", blur: 4 },
      ),
      i.hint)
    ) {
      let o = String(i.hint),
        r = 34,
        l = [];
      for (let h = 0; h < o.length; h += r) l.push(o.slice(h, h + r));
      l.slice(0, 3).forEach((h, f) => {
        b(e, h, s * 0.5, n * 0.13 + 64 + f * 22, {
          size: 17,
          color: c.warn,
          align: "center",
          blur: 4,
        });
      });
    }
    b(
      e,
      `共发现 ${i.total || 0} 个设备 · 匹配 WT 设备 ${i.matched || 0} 个`,
      s * 0.5,
      n * 0.13 + 64 + (i.hint ? 66 : 0),
      { size: 16, color: c.neonGreen, align: "center", blur: 4 },
    );
    for (let o of t) {
      if (o.id === "none") {
        b(e, "未发现设备，请点击重新搜索", s * 0.5, n * 0.36, {
          size: 22,
          color: c.neonYellow,
          align: "center",
          blur: 8,
        });
        continue;
      }
      R(e, o.rect, o.label, { color: o.color, size: 20 });
    }
  }
  renderCalibrate(e, t, i) {
    let { width: s, height: n } = this.view;
    (e.save(),
      (e.fillStyle = "rgba(3,0,12,0.86)"),
      e.fillRect(0, 0, s, n),
      e.restore(),
      b(e, "姿态中立位标定", s * 0.5, n * 0.18, {
        size: 40,
        color: c.neonGreen,
        align: "center",
        blur: 18,
      }),
      V(e, s * 0.5, n * 0.4, 70, i.progress || 0, {
        color: c.neonGreen,
        width: 12,
        label: i.calibrating
          ? `${Math.ceil(3 - (i.progress || 0) * 3)}s`
          : "READY",
        sub: i.calibrating ? "请保持躯干放松直立" : "点击下方按钮开始",
      }),
      b(
        e,
        "标定后系统以当前姿态为中立基准，倾斜量以此为 0 点计算",
        s * 0.5,
        n * 0.52,
        { size: 17, color: c.textDim, align: "center", blur: 2 },
      ));
    for (let o of t) R(e, o.rect, o.label, { color: o.color, size: 22 });
  }
  renderPause(e, t, i) {
    let { width: s, height: n } = this.view;
    (e.save(),
      (e.fillStyle = "rgba(3,0,12,0.62)"),
      e.fillRect(0, 0, s, n),
      e.restore(),
      b(e, "训练暂停", s * 0.5, n * 0.3, {
        size: 46,
        color: c.neonBlue,
        align: "center",
        blur: 20,
      }));
    for (let o of t) R(e, o.rect, o.label, { color: o.color, size: 24 });
  }
  renderResult(e, t, i) {
    let { width: s, height: n } = this.view,
      o = i.result || {};
    (e.save(),
      (e.fillStyle = "rgba(3,0,12,0.88)"),
      e.fillRect(0, 0, s, n),
      e.restore(),
      b(e, "训练结算", s * 0.5, 74, {
        size: 42,
        color: c.neonPink,
        align: "center",
        blur: 20,
      }),
      b(e, `${o.levelName || ""} · 用时 ${o.duration || 0}s`, s * 0.5, 106, {
        size: 18,
        color: c.textDim,
        align: "center",
        blur: 2,
      }),
      V(e, s * 0.5 - 330, 240, 78, m((o.accuracy || 0) / 100, 0, 1), {
        color: c.neonGreen,
        width: 12,
        label: `${o.accuracy || 0}%`,
        sub: "躲避成功率",
      }),
      b(e, String(o.score || 0), s * 0.5 - 120, 220, {
        size: 66,
        color: c.neonPink,
        align: "center",
        blur: 22,
      }),
      b(e, `本次排名第 ${o.rank || "-"} 名`, s * 0.5 - 120, 258, {
        size: 20,
        color: c.neonYellow,
        align: "center",
        blur: 8,
      }));
    let r = [
        ["最高 COMBO", o.combo || 0],
        ["PERFECT 次数", o.perfect || 0],
        ["碰撞次数", o.hits || 0],
        ["能量环", o.rings || 0],
        ["里程 (km)", o.distance || 0],
        ["卡路里 (kcal)", o.calories || 0],
        ["稳定时长 (s)", o.stableTime || 0],
      ],
      l = 190,
      h = 74;
    (r.forEach((f, d) => {
      let u = d % 3,
        g = Math.floor(d / 3),
        y = s * 0.5 + 40 + u * (l + 14),
        S = 150 + g * (h + 14);
      (B(e, y, S, l, h, { stroke: c.neonBlue, r: 12, blur: 8 }),
        b(e, String(f[1]), y + l / 2, S + 40, {
          size: 26,
          color: c.neonBlue,
          align: "center",
          blur: 8,
        }),
        b(e, f[0], y + l / 2, S + 62, {
          size: 14,
          color: c.textDim,
          align: "center",
          blur: 2,
        }));
    }),
      // 曲线原来画在 y=350，而统计卡片第 3 行是 326~400，
      // 结果第 7 张卡（稳定时长）整个被曲线面板盖住。统计网格是 3 列 × 3 行，
      // 第 3 行底边到 400，曲线必须从 400 以下开始。
      this.drawCurve(e, s * 0.5 - 320, 414, 640, 116, o.history || []));
    for (let f of t) R(e, f.rect, f.label, { color: f.color, size: 22 });
  }
  drawCurve(e, t, i, s, n, o) {
    if (
      (e.save(),
      (e.fillStyle = "rgba(10,3,30,0.6)"),
      _(e, t, i, s, n, 12),
      e.fill(),
      (e.strokeStyle = "rgba(0,229,255,0.25)"),
      (e.lineWidth = 1.5),
      e.stroke(),
      o.length < 2)
    ) {
      (b(e, "得分曲线（数据不足）", t + s / 2, i + n / 2, {
        size: 16,
        color: c.textDim,
        align: "center",
        blur: 2,
      }),
        e.restore());
      return;
    }
    let r =
      Math.max.apply(
        null,
        o.map((l) => l.score),
      ) || 1;
    ((e.strokeStyle = c.neonGreen),
      (e.lineWidth = 2.5),
      (e.shadowBlur = 12),
      (e.shadowColor = c.neonGreen),
      e.beginPath(),
      o.forEach((l, h) => {
        let f = t + 12 + (s - 24) * (h / (o.length - 1)),
          d = i + n - 14 - (n - 28) * (l.score / r);
        h === 0 ? e.moveTo(f, d) : e.lineTo(f, d);
      }),
      e.stroke(),
      e.restore(),
      b(e, "得分曲线", t + 12, i + 22, {
        size: 15,
        color: c.textDim,
        blur: 2,
      }));
  }
  renderPrivacy(e, t) {
    let { width: i, height: s } = this.view;
    (e.save(),
      (e.fillStyle = "rgba(2,0,10,0.86)"),
      e.fillRect(0, 0, i, s),
      e.restore());
    let n = 760,
      o = 360,
      r = (i - n) / 2,
      l = s * 0.22;
    (B(e, r, l, n, o, {
      stroke: c.neonGreen,
      fill: "rgba(8,2,24,0.96)",
      r: 18,
      blur: 26,
    }),
      b(e, "隐私授权", r + 32, l + 54, {
        size: 32,
        color: c.neonGreen,
        blur: 16,
      }),
      b(e, "PRIVACY AUTHORIZATION", r + n - 32, l + 54, {
        size: 16,
        color: c.textDim,
        align: "right",
        blur: 4,
      }),
      [
        "为连接 WT9011 姿态传感器并驱动体感赛车，本游戏需要使用：",
        "· 蓝牙（搜索与连接传感器，读取三轴加速度 / 角速度 / 姿态角）",
        "· 设备信息（区分不同传感器设备）",
        "",
        "数据仅在本地用于实时姿态解算与训练评分，不会上传或用于其他用途。",
        "同意后将立即搜索附近的 BLE 设备。",
      ].forEach((f, d) => {
        b(e, f, r + 32, l + 100 + d * 28, {
          size: 18,
          color: d >= 4 ? c.textDim : c.text,
          blur: 2,
        });
      }));
    for (let f of t) R(e, f.rect, f.label, { color: f.color, size: 21 });
    b(
      e,
      "如未在 mp 后台声明隐私接口，仍会返回 errno 1026，需先到后台配置",
      i * 0.5,
      l + o + 30,
      { size: 16, color: c.neonYellow, align: "center", blur: 6 },
    );
  }
  renderBoard(e, t, i) {
    let { width: s, height: n } = this.view;
    (e.save(),
      (e.fillStyle = "rgba(3,0,12,0.9)"),
      e.fillRect(0, 0, s, n),
      e.restore(),
      b(e, "康复训练排行榜", s * 0.5, 76, {
        size: 40,
        color: c.neonYellow,
        align: "center",
        blur: 18,
      }),
      b(
        e,
        "本地成绩 + 在线榜（配置 LEADERBOARD_URL 后自动同步）",
        s * 0.5,
        108,
        { size: 16, color: c.textDim, align: "center", blur: 2 },
      ));
    let o = i.board || [],
      r = 52,
      l = 140;
    o.forEach((h, f) => {
      let d = l + f * r,
        u = h.name === i.me;
      B(e, s * 0.5 - 380, d, 760, r - 8, {
        stroke: u ? c.neonPink : c.neonBlue,
        r: 10,
        blur: u ? 16 : 6,
      });
      let g =
        f === 0
          ? c.neonYellow
          : f === 1
            ? "#dfe9ff"
            : f === 2
              ? "#ffb27a"
              : c.textDim;
      (b(e, `#${f + 1}`, s * 0.5 - 350, d + 30, {
        size: 24,
        color: g,
        blur: 6,
      }),
        b(e, h.name || "匿名", s * 0.5 - 280, d + 30, {
          size: 20,
          color: u ? c.neonPink : c.text,
          blur: 4,
        }),
        b(e, `L${h.level || "-"}`, s * 0.5 - 60, d + 30, {
          size: 18,
          color: c.neonPurple,
          align: "center",
          blur: 4,
        }),
        b(e, String(h.score || 0), s * 0.5 + 350, d + 30, {
          size: 22,
          color: c.neonGreen,
          align: "right",
          blur: 6,
        }));
    });
    for (let h of t) R(e, h.rect, h.label, { color: h.color, size: 22 });
  }
};
var Xe = [
    {
      key: "rollSensitivity",
      label: "左右转向敏感度",
      min: 0.2,
      max: 3,
      fmt: (a) => a.toFixed(2) + "×",
    },
    {
      key: "pitchSensitivity",
      label: "前后油门敏感度",
      min: 0.2,
      max: 3,
      fmt: (a) => a.toFixed(2) + "×",
    },
    {
      key: "deadZone",
      label: "触发死区",
      min: 0,
      max: 10,
      fmt: (a) => a.toFixed(1) + "°",
    },
    {
      key: "maxAngle",
      label: "满舵/满油门触发角",
      min: 8,
      max: 40,
      fmt: (a) => a.toFixed(1) + "°",
    },
    {
      key: "brakeAngle",
      label: "后倾刹车触发角",
      min: 3,
      max: 20,
      fmt: (a) => a.toFixed(1) + "°",
    },
    {
      key: "smoothing",
      label: "滤波平滑系数（防抖）",
      min: 0,
      max: 0.95,
      fmt: (a) => a.toFixed(2),
    },
    {
      key: "assist",
      label: "回正辅助强度",
      min: 0,
      max: 1,
      fmt: (a) => a.toFixed(2),
    },
    {
      key: "sessionSeconds",
      label: "单次训练时长",
      min: 60,
      max: 600,
      step: 30,
      fmt: (a) => Math.round(a) + "s",
    },
    {
      key: "patientWeight",
      label: "患者体重（卡路里估算）",
      min: 30,
      max: 120,
      step: 1,
      fmt: (a) => Math.round(a) + "kg",
    },
  ],
  Qe = [
    { key: "invertRoll", label: "反转左右" },
    { key: "invertPitch", label: "反转前后" },
    { key: "vibration", label: "碰撞震动" },
  ],
  ce = class {
    constructor(e, t, i = {}) {
      ((this.view = e),
        (this.motion = t),
        (this.cb = i),
        (this.visible = !1),
        (this.dragging = null),
        this.layout());
    }
    layout() {
      let { width: e, height: t } = this.view,
        i = Math.min(760, e - 80),
        s = (e - i) / 2,
        n = Math.max(20, (t - 690) / 2);
      this.rect = { x: s, y: n, w: i, h: 690 };
      let o = [],
        r = n + 62;
      for (let u of Xe)
        (o.push({
          type: "slider",
          def: u,
          rect: { x: s + 30, y: r, w: i - 60, h: 38 },
        }),
          (r += 46));
      r += 4;
      let l = (i - 60 - 48) / 5;
      for (let u = 1; u <= 5; u++)
        o.push({
          type: "difficulty",
          value: u,
          rect: { x: s + 30 + (u - 1) * (l + 12), y: r, w: l, h: 44 },
        });
      r += 56;
      let h = (i - 60 - 24) / 3;
      (Qe.forEach((u, g) => {
        o.push({
          type: "toggle",
          def: u,
          rect: { x: s + 30 + g * (h + 12), y: r, w: h, h: 40 },
        });
      }),
        (r += 54));
      let f = (i - 60 - 36) / 4;
      ([
        { id: "recalibrate", label: "重新标定" },
        { id: "reset", label: "恢复默认" },
        { id: "clearBoard", label: "清空榜单" },
        { id: "close", label: "关闭面板" },
      ].forEach((u, g) => {
        o.push({
          type: "action",
          id: u.id,
          label: u.label,
          rect: { x: s + 30 + g * (f + 12), y: r, w: f, h: 44 },
        });
      }),
        (this.rows = o),
        (this.hotZone = { x: e - 74, y: 18, w: 56, h: 56 }));
    }
    open() {
      this.visible = !0;
    }
    close() {
      ((this.visible = !1), (this.dragging = null));
    }
    toggle() {
      this.visible = !this.visible;
    }
    onDown(e, t) {
      if (!this.visible) return !1;
      for (let i of this.rows)
        if (ae(i.rect, e, t)) {
          if (i.type === "slider")
            return ((this.dragging = i), this.applySlider(i, e), !0);
          if (i.type === "difficulty")
            return (
              this.motion.setParams({ difficulty: i.value }),
              this.cb.onDifficulty && this.cb.onDifficulty(i.value),
              !0
            );
          if (i.type === "toggle") {
            let s = {};
            return (
              (s[i.def.key] = !this.motion.params[i.def.key]),
              this.motion.setParams(s),
              !0
            );
          }
          if (i.type === "action") return (this.handleAction(i.id), !0);
        }
      return !1;
    }
    onMove(e, t) {
      return this.dragging ? (this.applySlider(this.dragging, e), !0) : !1;
    }
    onUp() {
      this.dragging = null;
    }
    applySlider(e, t) {
      let i = e.def,
        s = Be(e.rect, t, i.min, i.max);
      (i.step && (s = Math.round(s / i.step) * i.step),
        (s = m(s, i.min, i.max)));
      let n = {};
      ((n[i.key] = s),
        this.motion.setParams(n),
        i.key === "sessionSeconds" &&
          this.cb.onSession &&
          this.cb.onSession(s));
    }
    handleAction(e) {
      e === "reset"
        ? this.motion.resetParams()
        : e === "recalibrate" && this.cb.onCalibrate
          ? this.cb.onCalibrate()
          : e === "clearBoard" && this.cb.onClearBoard
            ? this.cb.onClearBoard()
            : e === "close" && this.close();
    }
    render(e) {
      let { width: t, height: i } = this.view;
      (e.save(),
        (e.fillStyle = "rgba(3,0,12,0.72)"),
        e.fillRect(0, 0, t, i),
        e.restore());
      let s = this.rect;
      (B(e, s.x, s.y, s.w, s.h, {
        stroke: c.neonPurple,
        fill: "rgba(10,2,30,0.94)",
        blur: 26,
      }),
        b(e, "治疗师调参面板", s.x + 30, s.y + 42, {
          size: 28,
          color: c.neonPurple,
          blur: 14,
        }),
        b(e, "THERAPIST CONTROL · 实时生效", s.x + s.w - 30, s.y + 42, {
          size: 16,
          color: c.textDim,
          align: "right",
          blur: 4,
        }));
      for (let r of this.rows)
        if (r.type === "slider")
          De(e, r.rect, this.motion.params[r.def.key], r.def.min, r.def.max, {
            color: c.neonGreen,
            label: r.def.label,
            fmt: r.def.fmt,
          });
        else if (r.type === "difficulty") {
          let l = this.motion.params.difficulty === r.value;
          R(e, r.rect, `L${r.value}`, {
            color: l ? c.neonGreen : c.neonBlue,
            active: l,
            size: 20,
            filled: l,
          });
        } else if (r.type === "toggle") {
          let l = !!this.motion.params[r.def.key];
          R(e, r.rect, r.def.label + (l ? " · ON" : " · OFF"), {
            color: l ? c.neonGreen : c.textDim,
            active: l,
            size: 18,
          });
        } else
          r.type === "action" &&
            R(e, r.rect, r.label, { color: c.neonPink, size: 20 });
      let n = this.motion.offset,
        o = s.y + s.h - 26;
      b(
        e,
        `实时：Roll ${n.roll.toFixed(1)}°  Pitch ${n.pitch.toFixed(1)}°  抖动 ${(this.motion.jitter * 100).toFixed(0)}%  稳定度 ${(this.motion.stability * 100).toFixed(0)}%`,
        s.x + 30,
        o,
        { size: 17, color: c.neonBlue, blur: 6 },
      );
    }
    renderHotZone(e, t) {
      let i = this.hotZone;
      (e.save(),
        (e.globalAlpha = 0.35 + (t ? 0.5 : 0)),
        (e.strokeStyle = c.neonPurple),
        (e.lineWidth = 2),
        e.beginPath(),
        e.arc(i.x + i.w / 2, i.y + i.h / 2, i.w * 0.36, 0, Math.PI * 2),
        e.stroke(),
        e.beginPath(),
        e.arc(i.x + i.w / 2, i.y + i.h / 2, i.w * 0.18, 0, Math.PI * 2),
        e.stroke(),
        e.restore());
    }
  };
var Ae = [
    "康复者A",
    "康复者B",
    "康复者C",
    "NeonRider",
    "MotionX",
    "平衡大师",
    "WT-01",
    "闪电小林",
  ],
  fe = class extends C {
    constructor() {
      (super(),
        this.reset(),
        (this.localBoard = q(D.leaderboard, [])),
        (this.onlineBoard = this.mockOnline()),
        (this.patientName = q(D.patient, { name: "我" }).name));
    }
    reset() {
      ((this.score = 0),
        (this.combo = 0),
        (this.maxCombo = 0),
        (this.perfectCount = 0),
        (this.hitCount = 0),
        (this.ringCount = 0),
        (this.distance = 0),
        (this.elapsed = 0),
        (this.stableTime = 0),
        (this.calories = 0),
        (this.accuracy = 1),
        (this.history = []),
        (this.rank = 1));
    }
    start(e) {
      (this.reset(), (this.diff = e));
    }
    update(e, t) {
      ((this.elapsed += e),
        (this.distance = t.distance),
        (this.score += (t.dz / 1e3) * 1),
        t.stability > 0.7 &&
          ((this.stableTime += e),
          (this.score += (8 * e * (t.stability - 0.7)) / 0.3)));
      let i = 3 + t.speedPct * 3.5;
      this.calories += i * (t.weight || 60) * (e / 3600);
      let s = this.perfectCount + this.hitCount;
      ((this.accuracy = s === 0 ? 1 : m(this.perfectCount / s, 0, 1)),
        this.history.length < Math.floor(this.elapsed) &&
          this.history.push({
            t: Math.round(this.elapsed),
            score: Math.round(this.score),
            stability: t.stability,
          }));
    }
    addPerfect(e, t) {
      (this.perfectCount++,
        (this.combo = t),
        (this.maxCombo = Math.max(this.maxCombo, t)));
      let s = 60 + 90 * m(1 - e / 0.55, 0, 1);
      return ((this.score += s * (1 + Math.min(t, 20) * 0.08)), Math.round(s));
    }
    addRing() {
      return (this.ringCount++, (this.score += 150), 150);
    }
    addHit() {
      return (
        this.hitCount++,
        (this.combo = 0),
        (this.score = Math.max(0, this.score - 200)),
        -200
      );
    }
    breakCombo() {
      this.combo = 0;
    }
    get finalScore() {
      return Math.round(this.score);
    }
    finish(e) {
      let t = {
        name: this.patientName,
        score: this.finalScore,
        level: e.level,
        levelName: e.name,
        combo: this.maxCombo,
        perfect: this.perfectCount,
        hits: this.hitCount,
        rings: this.ringCount,
        accuracy: Math.round(this.accuracy * 100),
        calories: Math.round(this.calories),
        distance: Math.round(this.distance / 1e3),
        stableTime: Math.round(this.stableTime),
        duration: Math.round(this.elapsed),
        date: Date.now(),
        history: this.history.slice(-120),
      };
      return ((t.rank = this.submit(t)), (this.lastResult = t), t);
    }
    submit(e) {
      (this.localBoard.push(e),
        this.localBoard.sort((i, s) => s.score - i.score),
        (this.localBoard = this.localBoard.slice(0, 50)),
        N(D.leaderboard, this.localBoard),
        ye &&
          typeof wx != "undefined" &&
          wx.request &&
          wx.request({
            url: ye,
            method: "POST",
            data: e,
            success: (i) => {
              i &&
                i.data &&
                Array.isArray(i.data.list) &&
                ((this.onlineBoard = i.data.list),
                this.emit("board", this.onlineBoard));
            },
            fail: () => {},
          }));
      let t = this.localBoard.findIndex((i) => i === e) + 1;
      return ((this.rank = t > 0 ? t : this.localBoard.length), this.rank);
    }
    mockOnline() {
      let e = [],
        t = [18200, 15600, 13100, 11200, 9600, 8100, 6900, 5400];
      for (let i = 0; i < t.length; i++)
        e.push({
          name: Ae[i % Ae.length],
          score: t[i],
          level: (i % 5) + 1,
          accuracy: 92 - i * 4,
          date: Date.now() - i * 864e5,
        });
      return e;
    }
    getMergedBoard(e = 10) {
      let t = new Map(),
        i = (s) => {
          let n = `${s.name}_${s.score}`;
          t.has(n) || t.set(n, s);
        };
      return (
        this.localBoard.slice(0, 20).forEach(i),
        this.onlineBoard.forEach(i),
        Array.from(t.values())
          .sort((s, n) => n.score - s.score)
          .slice(0, e)
      );
    }
    estimateRank() {
      let e = this.getMergedBoard(50),
        t = 1;
      for (let i of e) i.score > this.score && t++;
      return t;
    }
    setName(e) {
      ((this.patientName = e || "我"),
        N(D.patient, { name: this.patientName }));
    }
    clearLocal() {
      ((this.localBoard = []), Ee(D.leaderboard));
    }
  };
var de = class extends C {
  constructor() {
    (super(),
      (this.ctx = null),
      (this.master = null),
      (this.enabled = !0),
      (this.musicEnabled = !0),
      (this.ready = !1),
      (this.bgmTimer = null),
      (this.bgmStep = 0),
      (this.sources = {}));
  }
  init() {
    if (typeof wx == "undefined" || !wx.createWebAudioContext) return !1;
    try {
      return (
        (this.ctx = wx.createWebAudioContext()),
        (this.master = this.ctx.createGain()),
        (this.master.gain.value = 0.35),
        this.master.connect(this.ctx.destination),
        (this.ready = !0),
        !0
      );
    } catch (e) {
      return ((this.ready = !1), !1);
    }
  }
  register(e, t) {
    if (!(typeof wx == "undefined" || !wx.createInnerAudioContext))
      try {
        let i = wx.createInnerAudioContext();
        ((i.src = t), (this.sources[e] = i));
      } catch (i) {}
  }
  playFile(e, t) {
    let i = this.sources[e];
    if (i)
      try {
        return (i.stop(), i.play(), !0);
      } catch (s) {}
    return (t && this.play(t), !1);
  }
  tone({
    freq: e = 440,
    to: t = null,
    dur: i = 0.18,
    type: s = "square",
    gain: n = 0.25,
    delay: o = 0,
  }) {
    if (!this.ready || !this.enabled) return;
    let r = this.ctx,
      l = r.currentTime + o,
      h = r.createOscillator(),
      f = r.createGain();
    ((h.type = s),
      h.frequency.setValueAtTime(e, l),
      t !== null &&
        h.frequency.exponentialRampToValueAtTime(Math.max(20, t), l + i),
      f.gain.setValueAtTime(1e-4, l),
      f.gain.exponentialRampToValueAtTime(n, l + 0.012),
      f.gain.exponentialRampToValueAtTime(1e-4, l + i),
      h.connect(f),
      f.connect(this.master),
      h.start(l),
      h.stop(l + i + 0.02));
  }
  noise({ dur: e = 0.3, gain: t = 0.3 }) {
    if (!this.ready || !this.enabled) return;
    let i = this.ctx,
      s = Math.floor(i.sampleRate * e),
      n = i.createBuffer(1, s, i.sampleRate),
      o = n.getChannelData(0);
    for (let h = 0; h < s; h++) o[h] = (Math.random() * 2 - 1) * (1 - h / s);
    let r = i.createBufferSource();
    r.buffer = n;
    let l = i.createGain();
    ((l.gain.value = t), r.connect(l), l.connect(this.master), r.start());
  }
  play(e) {
    switch (e) {
      case "perfect":
        (this.tone({
          freq: 660,
          to: 990,
          dur: 0.12,
          type: "triangle",
          gain: 0.22,
        }),
          this.tone({
            freq: 880,
            to: 1320,
            dur: 0.16,
            type: "triangle",
            gain: 0.2,
            delay: 0.08,
          }),
          this.tone({
            freq: 1320,
            to: 1760,
            dur: 0.22,
            type: "square",
            gain: 0.12,
            delay: 0.16,
          }));
        break;
      case "ring":
        (this.tone({
          freq: 990,
          to: 1480,
          dur: 0.18,
          type: "sine",
          gain: 0.25,
        }),
          this.tone({
            freq: 1480,
            to: 1980,
            dur: 0.2,
            type: "sine",
            gain: 0.16,
            delay: 0.06,
          }));
        break;
      case "crash":
        (this.noise({ dur: 0.42, gain: 0.35 }),
          this.tone({
            freq: 180,
            to: 60,
            dur: 0.35,
            type: "sawtooth",
            gain: 0.22,
          }));
        break;
      case "nitro":
        this.tone({
          freq: 220,
          to: 660,
          dur: 0.35,
          type: "sawtooth",
          gain: 0.14,
        });
        break;
      case "ui":
        this.tone({
          freq: 720,
          to: 900,
          dur: 0.08,
          type: "square",
          gain: 0.16,
        });
        break;
      case "count":
        this.tone({ freq: 520, dur: 0.14, type: "square", gain: 0.2 });
        break;
      case "finish":
        [660, 880, 1100, 1320].forEach((t, i) =>
          this.tone({
            freq: t,
            dur: 0.22,
            type: "triangle",
            gain: 0.2,
            delay: i * 0.12,
          }),
        );
        break;
      default:
        break;
    }
  }
  startBgm() {
    if (!this.ready || !this.musicEnabled || this.bgmTimer) return;
    let e = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33],
      t = [110, 110, 146.83, 146.83, 98, 98, 130.81, 130.81],
      i = 240,
      s = () => {
        let n = this.bgmStep % 16,
          o = e[(n * 3) % e.length];
        (this.tone({ freq: o, dur: 0.16, type: "square", gain: 0.06 }),
          n % 4 === 0 &&
            this.tone({
              freq: t[(n / 4) % t.length],
              dur: 0.3,
              type: "sawtooth",
              gain: 0.09,
            }),
          n % 8 === 4 &&
            this.tone({ freq: 1320, dur: 0.08, type: "triangle", gain: 0.04 }),
          this.bgmStep++);
      };
    (s(), (this.bgmTimer = setInterval(s, i)));
  }
  stopBgm() {
    this.bgmTimer && (clearInterval(this.bgmTimer), (this.bgmTimer = null));
  }
  setEnabled(e) {
    ((this.enabled = e),
      this.master && (this.master.gain.value = e ? 0.35 : 0),
      e || this.stopBgm());
  }
  setMusicEnabled(e) {
    ((this.musicEnabled = e), e ? this.startBgm() : this.stopBgm());
  }
};
var ue = {
    left: ["left", "a", "65", "37"],
    right: ["right", "d", "68", "39"],
    forward: ["up", "w", "87", "38"],
    back: ["down", "s", "83", "40"],
  },
  pe = class extends C {
    constructor() {
      (super(),
        (this.keys = {}),
        (this.touch = { x: 0, y: 0, active: !1 }),
        (this.enabled = !0),
        this.bind());
    }
    bind() {
      typeof wx != "undefined" &&
        (typeof wx.onKeyDown == "function" &&
          wx.onKeyDown((e) => {
            let t = this.normalize(e);
            ((this.keys[t] = !0), this.emit("key", t));
          }),
        typeof wx.onKeyUp == "function" &&
          wx.onKeyUp((e) => {
            this.keys[this.normalize(e)] = !1;
          }));
    }
    normalize(e) {
      let t = (e && (e.key || e.code || e.keyCode)) || "";
      return String(t).toLowerCase();
    }
    isDown(e) {
      return e.some((t) => this.keys[t]);
    }
    get axis() {
      let e = 0,
        t = 0;
      return (
        this.isDown(ue.left) && (e -= 1),
        this.isDown(ue.right) && (e += 1),
        this.isDown(ue.forward) && (t += 1),
        this.isDown(ue.back) && (t -= 1),
        this.touch.active &&
          (Math.abs(this.touch.x) > Math.abs(e) && (e = this.touch.x),
          (t = this.touch.y)),
        { x: e, y: t }
      );
    }
    setTouch(e, t, i) {
      ((this.touch.x = Math.max(-1, Math.min(1, e))),
        (this.touch.y = Math.max(-1, Math.min(1, t))),
        (this.touch.active = i));
    }
    endTouch() {
      this.touch.active = !1;
    }
  };
var ze = 0.17,
  me = class {
    constructor(e) {
      ((this.canvas = e),
        (this.ctx = e.getContext("2d")),
        (this.view = { width: I.designWidth, height: I.designHeight }),
        (this.ble = new Q()),
        (this.motion = new x(this.ble)),
        (this.audio = new de()),
        (this.score = new fe()),
        (this.fx = new ne(this.view)),
        (this.bg = new se(this.view)),
        (this.road = new RoadRenderer2(this.view)),
        (this.car = new re(this.view)),
        (this.hud = new le(this.view)),
        (this.screens = new he(this.view)),
        (this.input = new pe()),
        (this.therapist = new ce(this.view, this.motion, {
          onDifficulty: (t) => this.setDifficulty(t),
          onCalibrate: () => this.startCalibration(),
          onSession: () => {},
          onClearBoard: () => this.score.clearLocal(),
        })),
        (this.state = "menu"),
        // 同 setDifficulty：存储里的难度可能是脏值，先取整兜底再查表，
        // 否则构造函数直接抛错，整个游戏页白屏。
        (this.diff = U[m(Math.round(this.motion.params.difficulty) || 1, 1, 5)]),
        (this.player = new ie()),
        this.buildTrack(),
        (this.countdown = 0),
        (this.comboTimer = 0),
        (this.stableStreak = 0),
        (this.timeLeft = this.motion.params.sessionSeconds),
        (this.hint = ""),
        (this.lastEvents = []),
        (this.calibProgress = 0),
        (this.calibrating = !1),
        (this.hotPressTimer = 0),
        (this.hotPressing = !1),
        (this.pointerId = null),
        (this.showPrivacy = !1),
        (this.privacyResolve = null),
        this.audio.init(),
        this.resize(),
        this.bindEvents());
    }
    resize() {
      let e = this.canvas,
        t = I.designWidth,
        i = I.designHeight;
      if (typeof wx != "undefined" && wx.getSystemInfoSync)
        try {
          let s = wx.getSystemInfoSync(),
            n = Math.min(s.pixelRatio || 1, I.maxDpr);
          ((t = Math.max(s.windowWidth, s.windowHeight)),
            (i = Math.min(s.windowWidth, s.windowHeight)),
            (e.width = Math.round(t * n)),
            (e.height = Math.round(i * n)),
            (this.dpr = n));
        } catch (s) {}
      else ((e.width = t), (e.height = i), (this.dpr = 1));
      ((this.canvasSize = { w: e.width, h: e.height }),
        (this.scale = Math.min(
          e.width / I.designWidth,
          e.height / I.designHeight,
        )),
        (this.offsetX = (e.width - I.designWidth * this.scale) / 2),
        (this.offsetY = (e.height - I.designHeight * this.scale) / 2));
    }
    bindEvents() {
      typeof wx != "undefined" &&
        (wx.onTouchStart &&
          wx.onTouchStart((e) => {
            let t = e.touches && e.touches[0];
            if (!t) return;
            let i = this.toDesign(t.clientX, t.clientY);
            this.onPointerDown(i.x, i.y);
          }),
        wx.onTouchMove &&
          wx.onTouchMove((e) => {
            let t = e.touches && e.touches[0];
            if (!t) return;
            let i = this.toDesign(t.clientX, t.clientY);
            this.onPointerMove(i.x, i.y);
          }),
        wx.onTouchEnd && wx.onTouchEnd(() => this.onPointerUp()),
        this.input.on("key", (e) => this.onKey(e)),
        wx.onNeedPrivacyAuthorization &&
          wx.onNeedPrivacyAuthorization((e) => {
            ((this.privacyResolve = e), (this.showPrivacy = !0));
          }),
        this.ble.on("privacy", () => {
          this.showPrivacy = !0;
        }));
    }
    toDesign(e, t) {
      let i = this.dpr || 1;
      return {
        x: (e * i - this.offsetX) / this.scale,
        y: (t * i - this.offsetY) / this.scale,
      };
    }
    buildTrack() {
      ((this.track = new ee(this.diff)),
        (this.obstacles = new te(this.track, this.diff)),
        this.player.reset(),
        (this.player.maxSpeed = this.diff.maxSpeed));
    }
    setDifficulty(e) {
      // 难度必须是 1~5 的整数。原来直接写 U[m(e, 1, 5)]，有两个崩溃入口：
      //   · 传 NaN：clamp 里 a<e / a>t 都是 false，原样返回 NaN，U[NaN] 是 undefined，
      //     紧接着读 .level 就抛 TypeError；
      //   · 传非整数（2.5）：U[2.5] 同样是 undefined。
      // 难度来自治疗师面板和本地存储，都可能给出非整数/脏值，这里统一取整并兜底当前档位。
      let l = Math.round(e);
      isFinite(l) || (l = (this.diff && this.diff.level) || 1);
      l = m(l, 1, 5);
      ((this.diff = U[l]),
        this.motion.setParams({ difficulty: this.diff.level }),
        this.buildTrack());
    }
    setState(e) {
      ((this.state = e),
        (this.hint = ""),
        e === "play" && this.audio.musicEnabled && this.audio.startBgm(),
        (e === "menu" || e === "result") && this.audio.stopBgm());
    }
    startSession() {
      (this.setDifficulty(this.motion.params.difficulty),
        this.score.start(this.diff),
        this.obstacles.reset(),
        this.player.reset(),
        (this.player.speed = this.diff.maxSpeed * 0.3),
        this.motion.reset(),
        this.fx.reset(),
        (this.countdown = 3.2),
        (this.timeLeft = this.motion.params.sessionSeconds),
        (this.stableStreak = 0),
        (this.comboTimer = 0),
        this.setState("play"),
        (this.hint = this.ble.isMock
          ? "模拟模式：手指拖动模拟躯干位移"
          : "躯干前倾加速 · 左右侧屈转向"));
    }
    finishSession() {
      let e = this.score.finish(this.diff);
      (this.audio.play("finish"),
        this.fx.reset(),
        this.setState("result"),
        (this.result = e));
    }
    startCalibration() {
      (this.setState("calibrate"),
        (this.calibrating = !1),
        (this.calibProgress = 0),
        this.motion.startCalibration());
    }
    onKey(e) {
      if (e === "t") {
        this.therapist.toggle();
        return;
      }
      if (e === "p" || e === "escape") {
        this.state === "play"
          ? this.setState("pause")
          : this.state === "pause" && this.setState("play");
        return;
      }
      if (e === "r" && (this.state === "result" || this.state === "pause")) {
        this.startSession();
        return;
      }
      if (e === "b" && this.state === "menu") {
        (this.setState("ble"), this.ble.startScan());
        return;
      }
      (e === "enter" || e === " ") &&
        (this.state === "menu"
          ? this.startSession()
          : this.state === "result" && this.startSession());
    }
    onPointerDown(e, t) {
      if (this.showPrivacy) {
        let n = this.screens.hitTest("privacy", e, t);
        n && this.onUIAction(n);
        return;
      }
      if (this.therapist.visible) {
        if (this.therapist.onDown(e, t)) return;
        this.therapist.close();
        return;
      }
      let i = this.therapist.hotZone;
      if (
        this.state === "menu" &&
        e >= i.x &&
        e <= i.x + i.w &&
        t >= i.y &&
        t <= i.y + i.h
      ) {
        ((this.hotPressing = !0), (this.hotPressTimer = 0));
        return;
      }
      if (this.state === "play") {
        if (this.ble.isMock) {
          let n = (e / this.view.width) * 2 - 1,
            o = 1 - (t / this.view.height) * 2;
          this.input.setTouch(m(n * 1.6, -1, 1), m(o * 1.2 - 0.2, -1, 1), !0);
        }
        return;
      }
      let s = this.screens.hitTest(this.state, e, t);
      s && this.onUIAction(s);
    }
    onPointerMove(e, t) {
      if (this.therapist.visible) {
        this.therapist.onMove(e, t);
        return;
      }
      if (this.state === "play" && this.ble.isMock) {
        let i = (e / this.view.width) * 2 - 1,
          s = 1 - (t / this.view.height) * 2;
        this.input.setTouch(m(i * 1.6, -1, 1), m(s * 1.2 - 0.2, -1, 1), !0);
      }
    }
    onPointerUp() {
      (this.input.endTouch(), this.therapist.onUp(), (this.hotPressing = !1));
    }
    onUIAction(e) {
      if ((this.audio.play("ui"), e === "start" || e === "again")) {
        this.startSession();
        return;
      }
      if (e === "mock") {
        (this.ble.enableMock("Debug 模拟模式：键盘/触摸驱动"),
          this.setState("menu"));
        return;
      }
      if (e === "ble") {
        (this.setState("ble"), this.ble.startScan());
        return;
      }
      if (e === "rescan") {
        this.ble.startScan();
        return;
      }
      if (e === "all") {
        this.ble.showAll = !this.ble.showAll;
        return;
      }
      if (e === "privacyAgree") {
        this.agreePrivacy();
        return;
      }
      if (e === "privacyReject") {
        this.rejectPrivacy();
        return;
      }
      if (e === "privacyOpen") {
        typeof wx != "undefined" &&
          wx.openPrivacyContract &&
          wx.openPrivacyContract({ fail: () => {} });
        return;
      }
      if (e === "back" || e === "menu" || e === "quit" || e === "skip") {
        this.setState("menu");
        return;
      }
      if (e === "board") {
        this.setState("leaderboard");
        return;
      }
      if (e === "calibrate") {
        this.startCalibration();
        return;
      }
      if (e === "doCalibrate") {
        this.beginCalibrate();
        return;
      }
      if (e === "resume") {
        this.setState("play");
        return;
      }
      if (e === "restart") {
        this.startSession();
        return;
      }
      if (e === "diffUp") {
        this.setDifficulty(this.diff.level + 1);
        return;
      }
      if (e === "diffDown") {
        this.setDifficulty(this.diff.level - 1);
        return;
      }
      if (e.startsWith("dev:")) {
        let t = e.slice(4);
        this.ble.connect(t);
        return;
      }
    }
    beginCalibrate() {
      ((this.calibrating = !0),
        (this.calibProgress = 0),
        this.motion.startCalibration(),
        this.audio.play("count"));
    }
    agreePrivacy() {
      this.showPrivacy = !1;
      let e = this.privacyResolve;
      this.privacyResolve = null;
      let t = () => {
        (this.state !== "ble" && this.setState("ble"),
          (this.ble.hint = ""),
          this.ble.startScan());
      };
      if (e) {
        (e({ event: "agree", buttonId: "privacy-agree" }), setTimeout(t, 80));
        return;
      }
      typeof wx != "undefined" && wx.requirePrivacyAuthorize
        ? wx.requirePrivacyAuthorize({
            success: t,
            fail: () => {
              this.ble.hint =
                "你拒绝了隐私授权，蓝牙不可用；可在小游戏右上角「···」→ 设置中重新开启，或使用模拟模式训练。";
            },
          })
        : t();
    }
    rejectPrivacy() {
      ((this.showPrivacy = !1),
        this.privacyResolve &&
          (this.privacyResolve({ event: "disagree" }),
          (this.privacyResolve = null)),
        (this.ble.hint =
          "未同意隐私协议，无法使用蓝牙；可点击「用模拟模式」继续训练。"));
    }
    update(e) {
      if (
        ((e = Math.min(e, 1 / 20)),
        (this.dt = e),
        this.hotPressing &&
          ((this.hotPressTimer += e),
          this.hotPressTimer >= 1.2 &&
            ((this.hotPressing = !1), this.therapist.open())),
        this.ble.isMock)
      ) {
        let i = this.input.axis;
        this.ble.setMockInput(i.x, i.y);
      }
      (this.ble.tickMock(e),
        this.motion.update(e),
        this.state === "calibrate"
          ? this.updateCalibrate(e)
          : this.state === "play" && this.updatePlay(e),
        this.fx.update(e),
        this.car.update(e, this.player),
        this.hud.update(e));
      let t = this.track ? this.track.curveAt(this.player.z) : 0;
      this.bg.update(e, t, this.player.speedPct);
    }
    updateCalibrate(e) {
      this.calibrating &&
        ((this.calibProgress += e / 3),
        this.calibProgress >= 1 &&
          ((this.calibProgress = 1),
          (this.calibrating = !1),
          this.motion.finishCalibration(),
          this.audio.play("perfect"),
          (this.hint = "标定完成，中立位已记录")));
    }
    updatePlay(e) {
      let t = this.player,
        i = this.track;
      if (this.countdown > 0) {
        let g = Math.ceil(this.countdown);
        ((this.countdown -= e),
          Math.ceil(this.countdown) !== g && this.audio.play("count"),
          t.update(e, { steer: 0, throttle: 0.12, brake: 0 }, i, this.diff),
          this.score.update(e, {
            distance: t.distance,
            dz: 0,
            stability: this.motion.stability,
            speedPct: t.speedPct,
            weight: this.motion.params.patientWeight,
          }));
        return;
      }
      let s = i.lookAheadCurve(t.z, 14),
        n = this.motion.params.maxAngle,
        o = m(s * 3.2, -n, n),
        r = t.speedPct < 0.35 ? n * 0.45 : 0;
      this.motion.setTarget(o, r);
      let l = this.motion.control,
        h = t.z,
        f = t.update(e, l, i, this.diff);
      this.obstacles.update(e, t.z);
      let d = this.obstacles.checkPass(h, t.z, t.x, t.halfWidth);
      for (let g of d) this.handleEvent(g);
      (t.offRoad
        ? (this.score.breakCombo(),
          this.fx.shake(3, 0.1),
          this.emitTireSmoke(0.5),
          (this.hint = "请回到赛道中央（躯干回中立位）"))
        : this.hint === "请回到赛道中央（躯干回中立位）" && (this.hint = ""),
        ((this.motion.isTilting && t.drifting) || !1) && this.emitTireSmoke(1),
        this.emitNitro(),
        this.motion.stability > 0.8 && t.speedPct > 0.3
          ? ((this.stableStreak += e),
            this.stableStreak >= 2.5 &&
              ((this.stableStreak = 0),
              this.score.combo++,
              (this.score.maxCombo = Math.max(
                this.score.maxCombo,
                this.score.combo,
              )),
              this.fx.emitPopup(
                "STABLE +",
                this.view.width * 0.5,
                this.view.height * 0.62,
                c.neonBlue,
                26,
              )))
          : (this.stableStreak = Math.max(0, this.stableStreak - e * 0.5)),
        this.score.update(e, {
          distance: t.distance,
          dz: f.dz,
          stability: this.motion.stability,
          speedPct: t.speedPct,
          weight: this.motion.params.patientWeight,
        }),
        (this.timeLeft =
          this.motion.params.sessionSeconds - this.score.elapsed),
        this.timeLeft <= 0 && this.finishSession());
    }
    handleEvent(e) {
      let t = this.view;
      switch (e.type) {
        case "hit": {
          if (
            (this.player.crash(),
            this.score.addHit(),
            this.fx.shake(16, 0.45),
            this.fx.flash(c.warn, 0.45),
            this.fx.emitSparks(t.width * 0.5, t.height * 0.78, 34),
            this.audio.play("crash"),
            this.motion.params.vibration &&
              typeof wx != "undefined" &&
              wx.vibrateShort)
          )
            try {
              wx.vibrateShort({ type: "heavy" });
            } catch (i) {}
          this.fx.emitPopup("-200", t.width * 0.5, t.height * 0.72, c.warn, 30);
          break;
        }
        case "perfect": {
          this.score.combo++;
          let i = this.score.addPerfect(e.gap, this.score.combo);
          (this.fx.emitPerfect(this.score.combo),
            this.fx.flash(c.neonGreen, 0.18),
            this.audio.play("perfect"),
            this.fx.emitPopup(
              `+${i} PERFECT`,
              t.width * 0.5,
              t.height * 0.66,
              c.neonGreen,
              30,
            ),
            (this.comboTimer = 3.5));
          break;
        }
        case "ring": {
          (this.score.addRing(),
            (this.player.speed = Math.min(
              this.player.maxSpeed,
              this.player.speed * 1.08 + 400,
            )),
            this.fx.emitRing(
              t.width * 0.5,
              t.height * 0.7,
              c.neonGreen,
              300,
              5,
            ),
            this.fx.flash(c.neonGreen, 0.12),
            this.audio.play("ring"),
            this.fx.emitPopup(
              "+150 BOOST",
              t.width * 0.5,
              t.height * 0.68,
              c.neonGreen,
              28,
            ));
          break;
        }
        default:
          break;
      }
    }
    emitNitro() {
      let { width: e, height: t } = this.view,
        i = e * ze,
        s = i * 0.52,
        n = t * 0.845 + s * 0.3,
        o = this.player.nitro,
        r = this.player.speedPct;
      if (o > 0.05 || r > 0.5) {
        let l = o > 0.05 ? 2 : 1;
        for (let h = 0; h < l; h++)
          (this.fx.emitNitro(e * 0.5 - i * 0.26, n, o, r),
            this.fx.emitNitro(e * 0.5 + i * 0.26, n, o, r));
        o > 0.6 && Math.random() < 0.05 && this.audio.play("nitro");
      }
    }
    emitTireSmoke(e) {
      let { width: t, height: i } = this.view,
        s = t * ze,
        n = s * 0.52,
        o = i * 0.845 + n * 0.42;
      (this.fx.emitTire(t * 0.5 - s * 0.44, o, e),
        this.fx.emitTire(t * 0.5 + s * 0.44, o, e));
    }
    render() {
      let e = this.ctx,
        { width: t, height: i } = this.canvasSize;
      (e.setTransform(1, 0, 0, 1, 0, 0),
        (e.fillStyle = "#05000f"),
        e.fillRect(0, 0, t, i),
        e.setTransform(
          this.scale,
          0,
          0,
          this.scale,
          this.offsetX,
          this.offsetY,
        ),
        e.save(),
        this.fx.applyShake(e));
      let s = this.view.width,
        n = this.view.height;
      let r = this.motion.isTilting && this.player.drifting ? 1 : 0;
      // 顺序是「算投影 → 画背景 → 画路面」，不能倒过来：
      // 背景要用的地平线来自本帧投影，取上一帧会让天空与路面交界抖动。
      let frame = this.road.compute(
        this.track,
        { x: this.player.x, z: this.player.z },
        r,
      );
      this.bg.render(e, frame.clipY || this.road.horizonY || n * 0.42);
      (this.road.paint(e, frame),
        this.obstacles.render(e, this.track, { z: this.player.z }, this.view),
        this.state !== "menu" &&
          this.state !== "leaderboard" &&
          (this.fx.renderBack(e),
          this.car.render(e, this.player, s * 0.5)),
        this.fx.renderFront(e),
        this.fx.renderSpeedLines(e, this.player.speedPct),
        e.restore(),
        (this.state === "play" || this.state === "pause") &&
          this.hud.render(e, {
            player: this.player,
            motion: this.motion,
            score: this.score.finalScore,
            ble: this.ble,
            diff: this.diff,
            timeLeft: this.timeLeft,
            progress: m(
              this.score.elapsed / this.motion.params.sessionSeconds,
              0,
              1,
            ),
            combo: this.score.combo,
            comboPulse: this.fx.comboPulse,
            rank: this.score.estimateRank(),
            calories: this.score.calories,
            hint: this.hint,
            countdown: this.countdown > 0 ? this.countdown : 0,
          }),
        this.state === "menu"
          ? (this.screens.render(e, "menu", {
              difficulty: this.motion.params.difficulty,
              bleStatus: this.ble.statusText,
            }),
            this.therapist.renderHotZone(e, this.hotPressing))
          : this.state === "ble"
            ? this.screens.render(e, "ble", {
                devices: this.ble.displayDevices,
                total: this.ble.allDevices.length,
                matched: this.ble.devices.length,
                showAll: this.ble.showAll,
                message: this.ble.statusText,
                hint: this.ble.hint,
              })
            : this.state === "calibrate"
              ? this.screens.render(e, "calibrate", {
                  calibrating: this.calibrating,
                  progress: this.calibProgress,
                })
              : this.state === "pause"
                ? this.screens.render(e, "pause", {})
                : this.state === "result"
                  ? this.screens.render(e, "result", {
                      result: this.result || {},
                    })
                  : this.state === "leaderboard" &&
                    this.screens.render(e, "leaderboard", {
                      board: this.score.getMergedBoard(10),
                      me: this.score.patientName,
                    }),
        this.showPrivacy
          ? this.screens.render(e, "privacy", {})
          : this.therapist.visible && this.therapist.render(e));
    }
  };
