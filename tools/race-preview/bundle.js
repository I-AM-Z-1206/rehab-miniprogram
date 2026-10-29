(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // pkgRace/race/engine.js
  var require_engine = __commonJS({
    "pkgRace/race/engine.js"(exports, module) {
      var st = Object.defineProperty;
      var Mt = Object.getOwnPropertyDescriptor;
      var kt = Object.getOwnPropertyNames;
      var Pt = Object.prototype.hasOwnProperty;
      var Tt = (t, e) => {
        for (var i in e) st(t, i, { get: e[i], enumerable: true });
      };
      var Ct = (t, e, i, s) => {
        if (e && typeof e == "object" || typeof e == "function") for (let l of kt(e)) !Pt.call(t, l) && l !== i && st(t, l, { get: () => e[l], enumerable: !(s = Mt(e, l)) || s.enumerable });
        return t;
      };
      var Lt = (t) => Ct(st({}, "__esModule", { value: true }), t);
      var yt = {};
      Tt(yt, { GameEngine: () => ne });
      module.exports = Lt(yt);
      var z = { designWidth: 1334, designHeight: 750, maxDpr: 2 };
      var h = { sky0: "#05000f", sky1: "#1b0140", sky2: "#3d0a5c", neonBlue: "#00e5ff", neonPink: "#ff2ea6", neonGreen: "#39ff88", neonPurple: "#9b5cff", neonYellow: "#ffe14d", road: "#0b0b18", roadAlt: "#12122a", grass: "#08021a", grassAlt: "#10032c", lane: "rgba(0,229,255,0.85)", rumble: "#ff2ea6", rumbleAlt: "#00e5ff", text: "#eaf6ff", textDim: "rgba(234,246,255,0.55)", warn: "#ff3b5c", ok: "#39ff88" };
      var w = { segmentLength: 200, rumbleLength: 3, roadWidth: 2200, lanes: 3, cameraHeight: 1150, cameraDepth: 0.72, drawDistance: 200, fogDensity: 4.2, centrifugal: 0.36, accelFactor: 5600, brakeFactor: 11e3, decelFactor: 2400, offRoadDecel: 7e3, offRoadLimit: 4200, steerRate: 2.6, crashSlow: 0.42 };
      var ht = { halfWidth: 0.13, widthAtMaxSpeed: 0.62, nitroThreshold: 0.82 };
      var tt = [null, { level: 1, name: "L1 \u5367\u69BB\u8D77\u6B65", seed: 20250101, maxSpeed: 6200, density: 0.16, curve: 1.6, hill: 0.5, movingRatio: 0, ringRatio: 0.35, sessionSeconds: 120 }, { level: 2, name: "L2 \u5750\u59FF\u5DE1\u822A", seed: 20250102, maxSpeed: 7800, density: 0.24, curve: 2.4, hill: 1, movingRatio: 0.05, ringRatio: 0.3, sessionSeconds: 150 }, { level: 3, name: "L3 \u7AD9\u7ACB\u5E73\u8861", seed: 20250103, maxSpeed: 9400, density: 0.32, curve: 3.2, hill: 1.4, movingRatio: 0.12, ringRatio: 0.26, sessionSeconds: 180 }, { level: 4, name: "L4 \u52A8\u6001\u6297\u6270", seed: 20250104, maxSpeed: 10800, density: 0.4, curve: 4, hill: 1.8, movingRatio: 0.2, ringRatio: 0.22, sessionSeconds: 180 }, { level: 5, name: "L5 \u6781\u9650\u534F\u8C03", seed: 20250105, maxSpeed: 12e3, density: 0.5, curve: 4.8, hill: 2.2, movingRatio: 0.28, ringRatio: 0.18, sessionSeconds: 210 }];
      var ct = { rollSensitivity: 1, pitchSensitivity: 1, deadZone: 3.5, maxAngle: 20, brakeAngle: 8, smoothing: 0.35, assist: 0.18, invertRoll: false, invertPitch: false, difficulty: 2, sessionSeconds: 150, patientWeight: 60, vibration: true };
      var O = { preferredNotifyUUIDs: ["0000ffe4-0000-1000-8000-00805f9b34fb", "0000ffe9-0000-1000-8000-00805f9b34fb", "0000ffe1-0000-1000-8000-00805f9b34fb", "0000fff1-0000-1000-8000-00805f9b34fb"], nameFilter: /wt|wit|901|imu|ble/i, scanTimeoutMs: 25e3, mountPoint: "\u814B\u4E0B\u6700\u9AD8\u70B9", cmdUnlock: [255, 170, 105, 136, 181], cmdSave: [255, 170, 0, 0, 0] };
      var dt = "";
      var W2 = { ACCEL: 81, GYRO: 82, ANGLE: 83, MAG: 84, FULL: 97 };
      function Et(t) {
        return t === W2.FULL ? 20 : t >= 80 && t <= 95 ? 11 : 0;
      }
      function k(t, e) {
        let i = t[e] | t[e + 1] << 8;
        return i & 32768 && (i -= 65536), i;
      }
      function Rt(t) {
        let e = 0;
        for (let i = 0; i < t.length - 1; i++) e += t[i];
        return (e & 255) === t[t.length - 1];
      }
      var It = class {
        constructor() {
          this.buffer = [], this.stats = { frames: 0, dropped: 0 };
        }
        push(t) {
          let e = t instanceof Uint8Array ? t : new Uint8Array(t);
          for (let i = 0; i < e.length; i++) this.buffer.push(e[i] & 255);
          return this.consume();
        }
        consume() {
          let t = [], e = 0;
          for (; e++ < 64; ) {
            let i = this.buffer, s = i.indexOf(85);
            if (s < 0) {
              i.length = 0;
              break;
            }
            if (s > 0 && i.splice(0, s), i.length < 2) break;
            let l = i[1], o = Et(l);
            if (!o) {
              i.shift(), this.stats.dropped++;
              continue;
            }
            if (i.length < o) break;
            let r = i.slice(0, o);
            if (!Rt(r)) {
              i.shift(), this.stats.dropped++;
              continue;
            }
            i.splice(0, o);
            let a = this.decode(l, r);
            a && (t.push(a), this.stats.frames++);
          }
          return t;
        }
        decode(t, e) {
          switch (t) {
            case W2.ACCEL:
              return { kind: "accel", accel: { x: k(e, 2) / 32768 * 16, y: k(e, 4) / 32768 * 16, z: k(e, 6) / 32768 * 16 }, temp: k(e, 8) / 100 };
            case W2.GYRO:
              return { kind: "gyro", gyro: { x: k(e, 2) / 32768 * 2e3, y: k(e, 4) / 32768 * 2e3, z: k(e, 6) / 32768 * 2e3 } };
            case W2.ANGLE:
              return { kind: "angle", angle: { roll: k(e, 2) / 32768 * 180, pitch: k(e, 4) / 32768 * 180, yaw: k(e, 6) / 32768 * 180 } };
            case W2.FULL:
              return { kind: "full", accel: { x: k(e, 2) / 32768 * 16, y: k(e, 4) / 32768 * 16, z: k(e, 6) / 32768 * 16 }, gyro: { x: k(e, 8) / 32768 * 2e3, y: k(e, 10) / 32768 * 2e3, z: k(e, 12) / 32768 * 2e3 }, angle: { roll: k(e, 14) / 32768 * 180, pitch: k(e, 16) / 32768 * 180, yaw: k(e, 18) / 32768 * 180 } };
            default:
              return null;
          }
        }
      };
      var m = (t, e, i) => t < e ? e : t > i ? i : t;
      var zt = (t, e, i) => t + (e - t) * i;
      var Z = (t, e, i) => t + (e - t) * i * i;
      var V = (t, e, i) => t + (e - t) * (-Math.cos(i * Math.PI) / 2 + 0.5);
      var wt = (t, e, i) => {
        let s = t + e;
        for (; s >= i; ) s -= i;
        for (; s < 0; ) s += i;
        return s;
      };
      var T = (t, e) => t + Math.random() * (e - t);
      function P(t, e) {
        let i = t.replace("#", ""), s = parseInt(i.length === 3 ? i.split("").map((l) => l + l).join("") : i, 16);
        return `rgba(${s >> 16 & 255},${s >> 8 & 255},${s & 255},${e})`;
      }
      function Dt(t, e) {
        let i = t.replace("#", ""), s = parseInt(i.length === 3 ? i.split("").map((a) => a + a).join("") : i, 16), l = Math.round((s >> 16 & 255) * e), o = Math.round((s >> 8 & 255) * e), r = Math.round((s & 255) * e);
        return `rgb(${l},${o},${r})`;
      }
      function ft(t, e, i, s, l, o, r, a) {
        t.camera.x = (t.world.x || 0) - e, t.camera.y = (t.world.y || 0) - i, t.camera.z = (t.world.z || 0) - s, t.screen.scale = l / t.camera.z, t.screen.x = Math.round(o / 2 + t.screen.scale * t.camera.x * o / 2), t.screen.y = Math.round(r / 2 - t.screen.scale * t.camera.y * r / 2), t.screen.w = Math.round(t.screen.scale * a * o / 2);
      }
      function Bt(t, e, i, s, l = 1) {
        let o = l / 2, r = t - e * o, a = t + e * o, n = i - s * o, c = i + s * o;
        return !(a < n || r > c);
      }
      var X = (t, e, i, s) => t + (e - t) * (1 - Math.exp(-i * s));
      var At = 50;
      var Gt = class {
        constructor() {
          this.target = { roll: 0, pitch: 0 }, this.current = { roll: 0, pitch: 0 }, this.acc = 0, this.noiseAmp = 0.55, this.spikeChance = 0.01, this.yaw = 0, this.enabled = false;
        }
        enable() {
          this.enabled = true;
        }
        disable() {
          this.enabled = false;
        }
        setInput(t, e) {
          this.target.roll = m(t, -1, 1) * 30, this.target.pitch = m(e, -1, 1) * 30;
        }
        tick(t) {
          if (!this.enabled) return [];
          this.acc += t;
          let e = 1 / At, i = [], s = 0;
          for (; this.acc >= e && s++ < 8; ) {
            this.acc -= e;
            let l = 0.22;
            this.current.roll += (this.target.roll - this.current.roll) * l, this.current.pitch += (this.target.pitch - this.current.pitch) * l;
            let o = Math.random() < this.spikeChance ? Math.random() * 8 - 4 : 0, r = () => (Math.random() * 2 - 1) * this.noiseAmp;
            i.push({ angle: { roll: this.current.roll + r() + o, pitch: this.current.pitch + r(), yaw: this.yaw += (Math.random() - 0.5) * 0.4 }, gyro: { x: (this.target.roll - this.current.roll) * 8, y: (this.target.pitch - this.current.pitch) * 8, z: 0 }, accel: { x: 0, y: 0, z: 1 } });
          }
          return i;
        }
        reset() {
          this.current = { roll: 0, pitch: 0 }, this.target = { roll: 0, pitch: 0 };
        }
      };
      var Q = class {
        constructor() {
          this._handlers = {};
        }
        on(t, e) {
          return this._handlers[t] || (this._handlers[t] = []), this._handlers[t].push(e), () => this.off(t, e);
        }
        off(t, e) {
          let i = this._handlers[t];
          if (!i) return;
          let s = i.indexOf(e);
          s >= 0 && i.splice(s, 1);
        }
        emit(t, e) {
          let i = this._handlers[t];
          if (i) for (let s = 0; s < i.length; s++) i[s](e);
        }
      };
      var F = typeof wx != "undefined";
      var _t = (t) => new Promise((e) => setTimeout(e, t));
      function D(t, e = {}) {
        return new Promise((i, s) => {
          if (!F || typeof t != "function") return s(new Error("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u5FAE\u4FE1 BLE API"));
          t(Object.assign({}, e, { success: i, fail: (l) => s(l || new Error("API \u8C03\u7528\u5931\u8D25")) }));
        });
      }
      var Ht = class extends Q {
        constructor() {
          super(), this.state = "idle", this.devices = [], this.allDevices = [], this.showAll = false, this.lastError = "", this.hint = "", this._foundBound = false, this._scanTimer = null, this._stopTimer = null, this.deviceId = null, this.serviceId = null, this.characteristicId = null, this.parser = new It(), this.mock = new Gt(), this.isMock = false, this.latest = { angle: { roll: 0, pitch: 0, yaw: 0 }, gyro: { x: 0, y: 0, z: 0 }, accel: { x: 0, y: 0, z: 1 } }, this.sampleRate = 0, this._sampleCount = 0, this._rateTs = 0, this._partial = null, this._partialTs = 0;
        }
        _setState(t, e = "") {
          this.state = t, this.emit("state", { state: t, message: e });
        }
        async init() {
          if (!F) return this.enableMock("\u975E\u5FAE\u4FE1\u73AF\u5883\uFF0C\u81EA\u52A8\u8FDB\u5165 Debug \u6A21\u62DF\u6A21\u5F0F"), false;
          if (!await this._ensurePrivacy()) return false;
          try {
            return await D(wx.openBluetoothAdapter, { mode: "central" }), this._adapterBound || (this._adapterBound = true, wx.onBluetoothAdapterStateChange && wx.onBluetoothAdapterStateChange((t) => {
              t.available || (this.lastError = "adapter unavailable", this.hint = "\u7CFB\u7EDF\u84DD\u7259\u4E0D\u53EF\u7528\uFF1A\u8BF7\u6253\u5F00\u624B\u673A\u84DD\u7259\uFF08\u5B89\u5353\u8FD8\u9700\u5F00\u542F\u5B9A\u4F4D/GPS\uFF09\uFF0C\u7136\u540E\u8FD4\u56DE\u91CD\u8BD5", this._setState("error", this.hint)), !t.discovering && this.state === "scanning" && this._setState("idle", "\u641C\u7D22\u5DF2\u505C\u6B62");
            }), wx.onBLEConnectionStateChange && wx.onBLEConnectionStateChange((t) => {
              !t.connected && this.state === "connected" && this._setState("idle", "\u4F20\u611F\u5668\u5DF2\u65AD\u5F00");
            })), this.lastError = "", this.hint = "", this._setState("idle", "\u84DD\u7259\u9002\u914D\u5668\u5C31\u7EEA"), true;
          } catch (t) {
            return this._fail(t), false;
          }
        }
        _ensurePrivacy() {
          return new Promise((t) => {
            if (!F || !wx.getPrivacySetting) return t(true);
            wx.getPrivacySetting({ success: (e) => {
              if (!e.needAuthorization) return t(true);
              this._setState("privacy", "\u9700\u540C\u610F\u9690\u79C1\u534F\u8BAE\u540E\u624D\u80FD\u4F7F\u7528\u84DD\u7259"), this.emit("privacy", e), t(false);
            }, fail: () => t(true) });
          });
        }
        _fail(t) {
          let e = String(t && (t.errMsg || t.errCode || t.message) || t || "\u672A\u77E5\u9519\u8BEF");
          this.lastError = e;
          let i = "\u6392\u67E5\uFF1A\u2460 \u5F00\u53D1\u8005\u5DE5\u5177\u4E0D\u652F\u6301\u84DD\u7259\uFF0C\u5FC5\u987B\u771F\u673A\u8C03\u8BD5\uFF1B\u2461 \u624B\u673A\u9700\u5F00\u542F\u84DD\u7259\uFF0C\u5B89\u5353\u8FD8\u9700\u5F00\u542F\u5B9A\u4F4D/GPS \u5E76\u7ED9\u5FAE\u4FE1\u5B9A\u4F4D\u6743\u9650\uFF1B\u2462 \u4F20\u611F\u5668\u662F\u5426\u4E0A\u7535\u3001\u662F\u5426\u5DF2\u88AB\u5176\u4ED6 App \u8FDE\u63A5\uFF08BLE \u88AB\u8FDE\u63A5\u540E\u4F1A\u505C\u6B62\u5E7F\u64AD\uFF09\uFF1B\u2463 \u5C0F\u7A0B\u5E8F\u540E\u53F0\u662F\u5426\u914D\u7F6E\u4E86\u300A\u7528\u6237\u9690\u79C1\u4FDD\u62A4\u6307\u5F15\u300B\u5E76\u52FE\u9009\u84DD\u7259\u3002";
          return /1026|announce your privacy/i.test(e) ? i = "\u9690\u79C1\u63A5\u53E3\u672A\u58F0\u660E\uFF08errno 1026\uFF09\uFF1A\u8BF7\u5230 mp.weixin.qq.com \u2192\u300C\u8BBE\u7F6E-\u670D\u52A1\u5185\u5BB9\u58F0\u660E-\u7528\u6237\u9690\u79C1\u4FDD\u62A4\u6307\u5F15\u300D\u4E2D\u6DFB\u52A0\u300C\u84DD\u7259\u300D\u5E76\u53D1\u5E03\uFF0C\u7136\u540E\u91CD\u65B0\u7F16\u8BD1\u771F\u673A\u8C03\u8BD5\u3002" : /authorize|auth deny|permission|隐私|privacy/i.test(e) ? i = "\u84DD\u7259\u6743\u9650\u672A\u6388\u6743\uFF1A\u8BF7\u5728\u624B\u673A\u300C\u8BBE\u7F6E-\u5FAE\u4FE1\u300D\u4E2D\u5F00\u542F\u84DD\u7259\u4E0E\u5B9A\u4F4D\u6743\u9650\uFF0C\u5E76\u786E\u8BA4\u5C0F\u7A0B\u5E8F\u540E\u53F0\u5DF2\u914D\u7F6E\u300A\u7528\u6237\u9690\u79C1\u4FDD\u62A4\u6307\u5F15\u300B\u5E76\u52FE\u9009\u300C\u84DD\u7259\u300D\u3002" : /location|定位|gps/i.test(e) ? i = "\u5B89\u5353\u626B\u63CF BLE \u5FC5\u987B\u5F00\u542F\u5B9A\u4F4D\u670D\u52A1\uFF08GPS\uFF09\u5E76\u6388\u4E88\u5FAE\u4FE1\u5B9A\u4F4D\u6743\u9650\uFF0C\u8BF7\u5F00\u542F\u540E\u91CD\u8BD5\u3002" : /not available|unavailable|adapter|state/i.test(e) ? i = "\u7CFB\u7EDF\u84DD\u7259\u672A\u5F00\u542F\u6216\u4E0D\u53EF\u7528\uFF1A\u8BF7\u6253\u5F00\u624B\u673A\u84DD\u7259\u540E\u91CD\u8BD5\uFF08\u5B89\u5353\u540C\u65F6\u9700\u8981\u5F00\u542F\u5B9A\u4F4D\uFF09\u3002" : /already connect|10004|10005|service/i.test(e) && (i = "\u8BE5\u4F20\u611F\u5668\u53EF\u80FD\u5DF2\u88AB\u5176\u4ED6 App \u8FDE\u63A5\uFF0C\u6216\u521A\u65AD\u5F00\u4ECD\u5904\u4E8E\u9501\u5B9A\u72B6\u6001\uFF1A\u8BF7\u5728\u5176\u4ED6 App \u4E2D\u65AD\u5F00\uFF0C\u7B49\u5F85 5 \u79D2\u540E\u91CD\u8FDE\u3002"), this.hint = i, this._setState("error", `\u84DD\u7259\u5F02\u5E38\uFF1A${e}`), i;
        }
        async startScan() {
          if (this.isMock || (this.devices = [], this.allDevices = [], !await this.init())) return false;
          this._bindFound(), this._setState("scanning", "\u6B63\u5728\u641C\u7D22 BLE \u8BBE\u5907\u2026\uFF08\u8BF7\u786E\u4FDD\u4F20\u611F\u5668\u5DF2\u4E0A\u7535\uFF09");
          try {
            await D(wx.startBluetoothDevicesDiscovery, { allowDuplicatesKey: true, interval: 0 });
          } catch (t) {
            return this._fail(t), false;
          }
          return this._scanTimer && clearInterval(this._scanTimer), this._scanTimer = setInterval(() => this._refreshViaGet(), 2500), this._stopTimer && clearTimeout(this._stopTimer), this._stopTimer = setTimeout(() => this.stopScan(), O.scanTimeoutMs), true;
        }
        _bindFound() {
          this._foundBound || !wx.onBluetoothDeviceFound || (this._foundBound = true, wx.onBluetoothDeviceFound((t) => this._mergeDevices(t.devices || [])));
        }
        _mergeDevices(t) {
          for (let e of t) {
            if (!e || !e.deviceId) continue;
            let i = e.name || e.localName || "", s = O.nameFilter.test(i);
            if (this.allDevices.find((o) => o.deviceId === e.deviceId) || this.allDevices.push({ deviceId: e.deviceId, name: i || "(\u672A\u77E5\u540D\u79F0)", RSSI: e.RSSI, match: s }), !s && !e.advertisData || this.devices.find((o) => o.deviceId === e.deviceId)) continue;
            let l = { deviceId: e.deviceId, name: i || "(\u672A\u77E5\u540D\u79F0)", RSSI: e.RSSI };
            this.devices.push(l), this.emit("device", l);
          }
        }
        _refreshViaGet() {
          wx.getBluetoothDevices && wx.getBluetoothDevices({ success: (t) => this._mergeDevices(t.devices || []), fail: () => {
          } });
        }
        stopScan() {
          this._scanTimer && (clearInterval(this._scanTimer), this._scanTimer = null), this._stopTimer && (clearTimeout(this._stopTimer), this._stopTimer = null), F && (this._refreshViaGet(), wx.stopBluetoothDevicesDiscovery({ success: () => {
            this.state === "scanning" && this._setState("idle", `\u641C\u7D22\u7ED3\u675F\uFF0C\u5171\u53D1\u73B0 ${this.allDevices.length} \u4E2A\u8BBE\u5907`);
          }, fail: () => {
          } }));
        }
        get displayDevices() {
          return this.showAll ? this.allDevices : this.devices;
        }
        async connect(t) {
          this.deviceId = t, this._setState("connecting", "\u6B63\u5728\u8FDE\u63A5\u4F20\u611F\u5668\u2026");
          try {
            await D(wx.createBLEConnection, { deviceId: t, timeout: 8e3 });
            let e = null;
            for (let l = 0; l < 3; l++) {
              try {
                if (e = await D(wx.getBLEDeviceServices, { deviceId: t }), e && e.services && e.services.length) break;
                e = null;
              } catch (o) {
                if (l === 2) throw o;
                this._setState("connecting", `\u6B63\u5728\u83B7\u53D6\u670D\u52A1\u2026\uFF08\u91CD\u8BD5 ${l + 1}/2\uFF09`);
              }
              await _t(1200);
            }
            if (!e) throw new Error("\u672A\u53D1\u73B0\u4EFB\u4F55 BLE \u670D\u52A1");
            let i = null, s = [];
            for (let l of e.services || []) {
              let o = await D(wx.getBLEDeviceCharacteristics, { deviceId: t, serviceId: l.uuid });
              for (let r of o.characteristics || []) {
                if (!(r.properties && (r.properties.notify || r.properties.indicate))) continue;
                let a = (r.uuid || "").toLowerCase(), n = O.preferredNotifyUUIDs.indexOf(a) >= 0 ? 2 : 1;
                s.push({ serviceId: l.uuid, characteristicId: r.uuid, score: n });
              }
            }
            if (s.sort((l, o) => o.score - l.score), i = s[0], i || (i = { serviceId: null, characteristicId: O.preferredNotifyUUIDs[0] }, this._setState("connecting", "\u672A\u53D1\u73B0 notify \u7279\u5F81\uFF0C\u4F7F\u7528\u9ED8\u8BA4 UUID \u515C\u5E95")), this.serviceId = i.serviceId, this.characteristicId = i.characteristicId, wx.setBLEMTU) try {
              await D(wx.setBLEMTU, { deviceId: t, mtu: 247 });
            } catch (l) {
            }
            return this._sendWitCommand(O.cmdUnlock).catch(() => {
            }), await D(wx.notifyBLECharacteristicValueChange, { deviceId: t, serviceId: i.serviceId || void 0, characteristicId: i.characteristicId, state: true }), wx.onBLECharacteristicValueChange && wx.onBLECharacteristicValueChange((l) => {
              this._onData(l.value);
            }), this._setState("connected", "WT9011 \u5DF2\u8FDE\u63A5\uFF08\u4F69\u6234\u4F4D\u7F6E\uFF1A" + O.mountPoint + "\uFF09"), true;
          } catch (e) {
            return this._fail(e), false;
          }
        }
        async disconnect() {
          if (this.deviceId && F) try {
            await D(wx.closeBLEConnection, { deviceId: this.deviceId });
          } catch (t) {
          }
          this.deviceId = null, this._setState("idle", "\u5DF2\u65AD\u5F00");
        }
        _sendWitCommand(t) {
          if (!this.deviceId || !this.serviceId) return Promise.resolve(false);
          let e = new Uint8Array(t).buffer;
          return D(wx.writeBLECharacteristicValue, { deviceId: this.deviceId, serviceId: this.serviceId, characteristicId: this.characteristicId, value: e }).then(() => true).catch(() => false);
        }
        _onData(t) {
          let e = this.parser.push(t);
          if (!e.length) return;
          let i = Date.now();
          for (let s of e) s.kind === "full" ? this._commit(s.angle, s.gyro, s.accel) : s.kind === "angle" ? this._commit(s.angle, this._partial ? this._partial.gyro : null, this._partial ? this._partial.accel : null) : (this._partial = this._partial || { ts: i }, this._partial.ts = i, s.kind === "accel" && (this._partial.accel = s.accel), s.kind === "gyro" && (this._partial.gyro = s.gyro));
          this._sampleCount += e.length, this._rateTs || (this._rateTs = i), i - this._rateTs >= 1e3 && (this.sampleRate = Math.round(this._sampleCount * 1e3 / (i - this._rateTs)), this._sampleCount = 0, this._rateTs = i);
        }
        _commit(t, e, i) {
          let s = { angle: t || this.latest.angle, gyro: e || { x: 0, y: 0, z: 0 }, accel: i || { x: 0, y: 0, z: 1 }, ts: Date.now() };
          this.latest = s, this.emit("sample", s);
        }
        enableMock(t = "Debug \u6A21\u62DF\u6A21\u5F0F") {
          this.isMock = true, this.mock.enable(), this._setState("mock", t);
        }
        setMockInput(t, e) {
          this.mock.setInput(t, e);
        }
        tickMock(t) {
          if (!this.isMock) return;
          let e = this.mock.tick(t);
          for (let i of e) this._commit(i.angle, i.gyro, i.accel);
          this.sampleRate = 50;
        }
        injectSample(t) {
          this._commit(t.angle, t.gyro, t.accel);
        }
        get statusText() {
          switch (this.state) {
            case "connected":
              return `\u4F20\u611F\u5668\u5DF2\u8FDE\u63A5 ${this.sampleRate}Hz`;
            case "mock":
              return "Debug \u6A21\u62DF\u6A21\u5F0F\uFF08\u952E\u76D8/\u89E6\u6478\uFF09";
            case "scanning":
              return "\u641C\u7D22\u4E2D\u2026";
            case "connecting":
              return "\u8FDE\u63A5\u4E2D\u2026";
            case "error":
              return "\u84DD\u7259\u5F02\u5E38";
            default:
              return "\u672A\u8FDE\u63A5\u4F20\u611F\u5668";
          }
        }
      };
      var Nt = class {
        constructor(t = 0.02, e = 1.6, i = 0) {
          this.q = t, this.r = e, this.x = i, this.p = 1, this.k = 0;
        }
        filter(t) {
          return this.p += this.q, this.k = this.p / (this.p + this.r), this.x += this.k * (t - this.x), this.p *= 1 - this.k, this.x;
        }
        reset(t = 0) {
          this.x = t, this.p = 1;
        }
      };
      var Ot = class {
        constructor(t = 6) {
          this.size = t, this.buf = [];
        }
        push(t, e = 0.35) {
          this.buf.push(t);
          let i = Math.max(2, Math.round(2 + e * 18));
          for (; this.buf.length > i; ) this.buf.shift();
          let s = 0, l = 0, o = this.buf.length;
          for (let r = 0; r < o; r++) {
            let a = 1 + r / Math.max(1, o - 1) * (1 - e) * 4;
            s += this.buf[r] * a, l += a;
          }
          return s / l;
        }
        reset() {
          this.buf.length = 0;
        }
      };
      var ut = class {
        constructor(t = 0) {
          this.kalman = new Nt(0.3, 1, t), this.wma = new Ot(6), this.value = t;
        }
        update(t, e = 0.35) {
          let i = this.kalman.filter(t);
          return this.value = this.wma.push(i, e), this.value;
        }
        reset(t = 0) {
          this.kalman.reset(t), this.wma.reset(), this.value = t;
        }
      };
      var rt = {};
      var lt = typeof wx != "undefined" && typeof wx.getStorageSync == "function";
      function et(t, e) {
        try {
          let i = lt ? wx.getStorageSync(t) : rt[t];
          if (i === "" || i === void 0 || i === null) return e;
          let s = typeof i == "string" ? JSON.parse(i) : i;
          return s == null ? e : s;
        } catch (i) {
          return e;
        }
      }
      function K(t, e) {
        try {
          let i = JSON.stringify(e);
          return lt ? wx.setStorageSync(t, i) : rt[t] = i, true;
        } catch (i) {
          return false;
        }
      }
      function Ut(t) {
        try {
          lt ? wx.removeStorageSync(t) : delete rt[t];
        } catch (e) {
        }
      }
      var G = { therapist: "nrr_therapist_params_v1", leaderboard: "nrr_leaderboard_v1", patient: "nrr_patient_v1", device: "nrr_last_device_v1" };
      var Wt = class {
        constructor(t) {
          this.ble = t, this.params = Object.assign({}, ct, et(G.therapist, {})), this.rollFilter = new ut(0), this.pitchFilter = new ut(0), this.neutral = { roll: 0, pitch: 0 }, this.calibrating = false, this._calBuf = [], this.raw = { roll: 0, pitch: 0, yaw: 0 }, this.smoothed = { roll: 0, pitch: 0 }, this.vel = { roll: 0, pitch: 0 }, this.jitter = 0, this.control = { steer: 0, throttle: 0, brake: 0 }, this.match = 1, this.stability = 1, this.target = { roll: 0, pitch: 0 }, this._last = { roll: 0, pitch: 0 }, this.connected = false, t && (t.on("sample", (e) => this.onSample(e)), t.on("state", (e) => {
            this.connected = e.state === "connected" || e.state === "mock";
          }));
        }
        onSample(t) {
          !t || !t.angle || (this.raw.roll = t.angle.roll, this.raw.pitch = t.angle.pitch, this.raw.yaw = t.angle.yaw || 0, this.connected = true, this.calibrating && this._calBuf.push({ roll: this.raw.roll, pitch: this.raw.pitch }));
        }
        startCalibration() {
          this.calibrating = true, this._calBuf = [];
        }
        finishCalibration() {
          this.calibrating = false;
          let t = this._calBuf.length;
          if (!t) return false;
          let e = 0, i = 0;
          for (let s of this._calBuf) e += s.roll, i += s.pitch;
          return this.neutral.roll = e / t, this.neutral.pitch = i / t, this.rollFilter.reset(0), this.pitchFilter.reset(0), true;
        }
        setParams(t) {
          Object.assign(this.params, t), K(G.therapist, this.params);
        }
        resetParams() {
          this.params = Object.assign({}, ct), K(G.therapist, this.params);
        }
        setTarget(t, e) {
          this.target.roll = t, this.target.pitch = e;
        }
        update(t) {
          let e = this.params, i = m(e.smoothing, 0, 0.95), s = this.rollFilter.update(this.raw.roll, i), l = this.pitchFilter.update(this.raw.pitch, i);
          this.smoothed.roll = s, this.smoothed.pitch = l;
          let o = s - this._last.roll, r = l - this._last.pitch;
          this.vel.roll = t > 0 ? o / t : 0, this.vel.pitch = t > 0 ? r / t : 0;
          let a = m((Math.abs(this.vel.roll) + Math.abs(this.vel.pitch)) / 90, 0, 1);
          this.jitter = X(this.jitter, a, 6, t), this.stability = m(1 - this.jitter * 1.6, 0, 1), this._last.roll = s, this._last.pitch = l;
          let n = (s - this.neutral.roll) * (e.invertRoll ? -1 : 1), c = (l - this.neutral.pitch) * (e.invertPitch ? -1 : 1), d = (L, E) => {
            let C = Math.sign(L), I = Math.max(0, Math.abs(L) - e.deadZone), Y = Math.max(1, e.maxAngle - e.deadZone);
            return C * m(I / Y, 0, 1) * E;
          }, f = m(d(n, e.rollSensitivity), -1, 1), g = m(d(c, e.pitchSensitivity), -1, 1), y = m(e.assist, 0, 1);
          y > 0 && (f = f * (1 - y * (1 - Math.min(1, Math.abs(f) * 2))), g = g * (1 - y * (1 - Math.min(1, Math.abs(g) * 2))));
          let v = 0, S = 0;
          g > 0 ? v = g : Math.abs(c) > e.brakeAngle && (S = m(-g, 0, 1)), this.control.steer = f, this.control.throttle = v, this.control.brake = S;
          let x = Math.abs(n - this.target.roll), b = Math.abs(c - this.target.pitch), M = Math.max(1, e.maxAngle);
          return this.match = m(1 - (x * 0.6 + b * 0.4) / M, 0, 1), this.control;
        }
        get offset() {
          return { roll: this.smoothed.roll - this.neutral.roll, pitch: this.smoothed.pitch - this.neutral.pitch };
        }
        get isTilting() {
          return Math.abs(this.offset.roll) > this.params.maxAngle * 0.65;
        }
        reset() {
          this.rollFilter.reset(0), this.pitchFilter.reset(0), this.control = { steer: 0, throttle: 0, brake: 0 }, this.jitter = 0, this.stability = 1;
        }
      };
      function Ft(t) {
        let e = t >>> 0;
        return function() {
          e |= 0, e = e + 1831565813 | 0;
          let i = Math.imul(e ^ e >>> 15, 1 | e);
          return i = i + Math.imul(i ^ i >>> 7, 61 | i) ^ i, ((i ^ i >>> 14) >>> 0) / 4294967296;
        };
      }
      function J(t) {
        let e = Ft(t);
        return { next: e, range: (i, s) => i + e() * (s - i), int: (i, s) => Math.floor(i + e() * (s - i + 1)), chance: (i) => e() < i, pick: (i) => i[Math.floor(e() * i.length)] };
      }
      var u = { LENGTH: { NONE: 0, SHORT: 25, MEDIUM: 50, LONG: 100 }, CURVE: { NONE: 0, EASY: 2, MEDIUM: 4, HARD: 6 }, HILL: { NONE: 0, LOW: 20, MEDIUM: 40, HIGH: 60 } };
      var Yt = class {
        constructor(t) {
          this.difficulty = t, this.segments = [], this.build(t), this.length = this.segments.length * w.segmentLength;
        }
        build(t) {
          let e = J(t.seed), i = t.curve / 3, s = t.hill;
          this.segments = [], this.rng = e, this.addStraight(u.LENGTH.SHORT), this.addLowRollingHills(u.LENGTH.SHORT, u.HILL.LOW * s), this.addSCurves(i), this.addCurve(u.LENGTH.MEDIUM, u.CURVE.MEDIUM * i, u.HILL.LOW * s), this.addBumps(u.LENGTH.SHORT), this.addLowRollingHills(u.LENGTH.MEDIUM, u.HILL.MEDIUM * s), this.addCurve(u.LENGTH.LONG * 2, u.CURVE.MEDIUM * i, u.HILL.MEDIUM * s), this.addStraight(u.LENGTH.MEDIUM), this.addHill(u.LENGTH.MEDIUM, u.HILL.HIGH * s), this.addSCurves(i), this.addCurve(u.LENGTH.LONG, -u.CURVE.MEDIUM * i, u.HILL.NONE), this.addHill(u.LENGTH.LONG, u.HILL.HIGH * s), this.addCurve(u.LENGTH.LONG, u.CURVE.MEDIUM * i, -u.HILL.LOW * s), this.addBumps(u.LENGTH.MEDIUM), this.addHill(u.LENGTH.LONG, -u.HILL.MEDIUM * s), this.addStraight(u.LENGTH.MEDIUM), this.addSCurves(i), this.addDownhillToEnd(i, s);
          let l = this.lastY(), o = this.segments.length;
          for (let r = 0; r < o; r++) {
            let a = r / o;
            this.segments[r].p1.world.y -= l * Z(0, 1, a), this.segments[r].p2.world.y -= l * Z(0, 1, a);
          }
          this.segments[2].color.start = true, this.segments[this.segments.length - 3].color.finish = true;
        }
        lastY() {
          return this.segments.length === 0 ? 0 : this.segments[this.segments.length - 1].p2.world.y;
        }
        addSegment(t, e) {
          let i = this.segments.length, s = Math.floor(i / w.rumbleLength) % 2;
          this.segments.push({ index: i, p1: { world: { y: this.lastY(), z: i * w.segmentLength }, camera: {}, screen: {} }, p2: { world: { y: e, z: (i + 1) * w.segmentLength }, camera: {}, screen: {} }, curve: t, color: { road: Math.floor(i / w.rumbleLength) % 2 ? h.road : h.roadAlt, grass: Math.floor(i / w.rumbleLength) % 2 ? h.grass : h.grassAlt, rumble: s ? h.neonPink : h.neonBlue, lane: h.lane, start: false, finish: false }, fog: 0, clip: 0, looped: false, obstacles: [] });
        }
        addRoad(t, e, i, s, l) {
          let o = this.lastY(), r = o + l * w.segmentLength, a = t + e + i;
          for (let n = 0; n < t; n++) this.addSegment(Z(0, s, n / t), V(o, r, n / a));
          for (let n = 0; n < e; n++) this.addSegment(s, V(o, r, (t + n) / a));
          for (let n = 0; n < i; n++) this.addSegment(V(s, 0, n / i), V(o, r, (t + e + n) / a));
        }
        addStraight(t) {
          this.addRoad(t, t, t, 0, 0);
        }
        addCurve(t, e, i) {
          this.addRoad(t, t, t, e, i);
        }
        addHill(t, e) {
          this.addRoad(t, t, t, 0, e);
        }
        addBumps(t) {
          let e = t, i = this.rng;
          for (; e-- > 0; ) this.addRoad(10, 10, 10, 0, u.HILL.LOW * (i.next() > 0.5 ? 1 : -1) * 0.4);
        }
        addLowRollingHills(t, e) {
          this.addRoad(t, t, t, 0, e / 2), this.addRoad(t, t, t, 0, -e), this.addRoad(t, t, t, u.CURVE.EASY, e), this.addRoad(t, t, t, 0, 0), this.addRoad(t, t, t, -u.CURVE.EASY, e / 2), this.addRoad(t, t, t, 0, 0);
        }
        addSCurves(t) {
          this.addRoad(u.LENGTH.MEDIUM, u.LENGTH.MEDIUM, u.LENGTH.MEDIUM, -u.CURVE.EASY * t, u.HILL.NONE), this.addRoad(u.LENGTH.MEDIUM, u.LENGTH.MEDIUM, u.LENGTH.MEDIUM, u.CURVE.MEDIUM * t, u.HILL.MEDIUM), this.addRoad(u.LENGTH.MEDIUM, u.LENGTH.MEDIUM, u.LENGTH.MEDIUM, u.CURVE.EASY * t, -u.HILL.LOW), this.addRoad(u.LENGTH.MEDIUM, u.LENGTH.MEDIUM, u.LENGTH.MEDIUM, -u.CURVE.EASY * t, u.HILL.MEDIUM), this.addRoad(u.LENGTH.MEDIUM, u.LENGTH.MEDIUM, u.LENGTH.MEDIUM, -u.CURVE.MEDIUM * t, -u.HILL.MEDIUM);
        }
        addDownhillToEnd(t, e) {
          this.addRoad(u.LENGTH.LONG, u.LENGTH.LONG, u.LENGTH.LONG, -u.CURVE.EASY * t, -u.HILL.LOW * e), this.addRoad(u.LENGTH.LONG, u.LENGTH.LONG, u.LENGTH.LONG, u.CURVE.EASY * t, u.HILL.LOW * e), this.addStraight(u.LENGTH.MEDIUM);
        }
        findSegment(t) {
          let e = Math.floor(t / w.segmentLength);
          return this.segments[e % this.segments.length];
        }
        segmentAt(t, e) {
          let i = Math.floor(t / w.segmentLength);
          return this.segments[(i + e) % this.segments.length];
        }
        curveAt(t) {
          let e = this.findSegment(t), i = t % w.segmentLength / w.segmentLength, s = this.segments[(e.index + 1) % this.segments.length];
          return e.curve * (1 - i) + s.curve * i;
        }
        lookAheadCurve(t, e = 12) {
          let i = 0;
          for (let s = 0; s < e; s++) {
            let l = this.segmentAt(t, s);
            i += l.curve * (1 - s / e);
          }
          return i / e;
        }
        range(t, e) {
          let i = [];
          for (let s = 0; s < e; s++) i.push(this.segments[(t + s) % this.segments.length]);
          return i;
        }
        wrap(t) {
          return wt(t, 0, this.length);
        }
        get segmentLength() {
          return w.segmentLength;
        }
      };
      var pt = { block: 0.26, cone: 0.16, ring: 0.3, drone: 0.22 };
      var $t = class {
        constructor(t, e) {
          this.track = t, this.difficulty = e, this.items = [], this.passed = 0, this.hits = 0, this.rings = 0, this.generate();
        }
        generate() {
          let t = this.difficulty, e = J(t.seed + 7777), i = this.track.segments, s = 60, l = i.length - 20, o = t.density * 0.05;
          this.items = [];
          let r = -999;
          for (let a = s; a < l; a++) {
            let n = Math.abs(i[a].curve) > 4 ? 0.45 : 1;
            if (a - r < 18 || !e.chance(o * n)) continue;
            r = a;
            let c = e.next(), d = "block";
            c < t.ringRatio ? d = "ring" : c < t.ringRatio + t.movingRatio ? d = "drone" : c < t.ringRatio + t.movingRatio + 0.2 && (d = "cone"), this.items.push({ index: a, z: a * w.segmentLength, offset: e.range(-0.78, 0.78), type: d, w: pt[d] * 0.5, moving: d === "drone", phase: e.range(0, Math.PI * 2), speed: e.range(0.35, 0.75), hit: false, passed: false }), i[a].obstacles.push(this.items[this.items.length - 1]);
          }
        }
        update(t, e) {
          for (let i of this.items) i.moving && (i.phase += t * i.speed, i.offset = m(Math.sin(i.phase) * 0.72, -0.85, 0.85));
        }
        checkPass(t, e, i, s) {
          let l = [], o = this.track.length;
          for (let r of this.items) {
            if (r.passed) {
              e > r.z && (r.passed = false);
              continue;
            }
            if (!(t <= r.z && e >= r.z || e < t && (t <= r.z || e >= r.z))) continue;
            r.passed = true, this.passed++;
            let a = Math.abs(i - r.offset), n = Bt(i, s, r.offset, r.w, 0.85);
            r.type === "ring" ? a < 0.28 ? (this.rings++, l.push({ type: "ring", item: r, gap: a })) : l.push({ type: "miss", item: r, gap: a }) : n ? (r.hit = true, this.hits++, l.push({ type: "hit", item: r, gap: a })) : a < 0.55 ? l.push({ type: "perfect", item: r, gap: a }) : l.push({ type: "pass", item: r, gap: a });
          }
          return l;
        }
        reset() {
          for (let t of this.items) t.passed = false, t.hit = false;
          this.passed = 0, this.hits = 0, this.rings = 0;
        }
        render(t, e, i, s) {
          let l = w.segmentLength, o = [], r = Math.floor(i.z / l);
          for (let a of this.items) {
            let n = a.index - r;
            if (n < 0 && (n += e.segments.length), n > w.drawDistance) continue;
            let c = e.segments[a.index];
            !c || !c.p1.screen.w || c.p1.camera.z <= 0 || o.push({ it: a, seg: c, depth: c.p1.camera.z });
          }
          o.sort((a, n) => n.depth - a.depth);
          for (let { it: a, seg: n } of o) {
            let c = n.p1.screen.x, d = n.p1.screen.y, f = n.p1.screen.w;
            if (f <= 0) continue;
            let g = c + f * a.offset, y = m(1 - Math.pow(n.p1.camera.z / (w.drawDistance * l), 1.6), 0, 1);
            y <= 0.03 || this.drawSprite(t, a, g, d, f, y);
          }
        }
        drawSprite(t, e, i, s, l, o) {
          let r = l * pt[e.type];
          if (t.save(), t.globalAlpha = o, e.type === "block") {
            let a = r * 1.6, n = r * 0.9;
            t.shadowBlur = 22, t.shadowColor = h.warn, t.fillStyle = P("#1a0320", 0.92), t.strokeStyle = h.warn, t.lineWidth = Math.max(1.5, r * 0.09), t.beginPath(), t.rect(i - a / 2, s - n, a, n), t.fill(), t.stroke(), t.strokeStyle = P(h.neonYellow, 0.9), t.lineWidth = Math.max(1, r * 0.06), t.beginPath();
            for (let c = 0; c < 4; c++) {
              let d = i - a / 2 + a / 4 * c;
              t.moveTo(d, s), t.lineTo(d + a / 6, s - n);
            }
            t.stroke();
          } else if (e.type === "cone") t.shadowBlur = 18, t.shadowColor = h.neonYellow, t.fillStyle = P("#2a1400", 0.9), t.strokeStyle = h.neonYellow, t.lineWidth = Math.max(1.2, r * 0.1), t.beginPath(), t.moveTo(i, s - r * 1.5), t.lineTo(i + r * 0.7, s), t.lineTo(i - r * 0.7, s), t.closePath(), t.fill(), t.stroke();
          else if (e.type === "ring") {
            let a = r * 0.9;
            t.shadowBlur = 26, t.shadowColor = h.neonGreen, t.strokeStyle = h.neonGreen, t.lineWidth = Math.max(2, r * 0.14), t.beginPath(), t.ellipse(i, s - a, a, a * 1.05, 0, 0, Math.PI * 2), t.stroke(), t.globalAlpha = o * 0.25, t.fillStyle = h.neonGreen, t.fill();
          } else t.shadowBlur = 20, t.shadowColor = h.neonPurple, t.strokeStyle = h.neonPurple, t.lineWidth = Math.max(1.5, r * 0.1), t.fillStyle = P("#12002b", 0.9), t.beginPath(), t.ellipse(i, s - r * 1.1, r * 0.75, r * 0.34, 0, 0, Math.PI * 2), t.fill(), t.stroke(), t.globalAlpha = o * 0.6, t.beginPath(), t.moveTo(i, s - r * 0.9), t.lineTo(i, s), t.stroke();
          t.restore();
        }
      };
      var qt = class {
        constructor() {
          this.reset();
        }
        reset() {
          this.z = 0, this.x = 0, this.speed = 0, this.maxSpeed = w.accelFactor * 2, this.tilt = 0, this.nitro = 0, this.drifting = false, this.offRoad = false, this.distance = 0, this.lap = 0, this.crashCooldown = 0, this.engineLoad = 0;
        }
        update(t, e, i, s) {
          let l = s.maxSpeed;
          this.maxSpeed = l;
          let o = this.z, r = 0.14, a = (r + (1 - r) * m(e.throttle, 0, 1)) * w.accelFactor, n = e.brake * w.brakeFactor, c = w.decelFactor * (this.speed / l);
          this.speed += (a - n - c) * t, this.speed = m(this.speed, 0, l), this.offRoad = Math.abs(this.x) > 1, this.offRoad && this.speed > w.offRoadLimit && (this.speed = Math.max(w.offRoadLimit, this.speed - w.offRoadDecel * t));
          let d = this.speed * t;
          this.z = wt(this.z, d, i.length), this.distance += d, this.z < o && this.lap++;
          let f = this.speed / l, g = Math.max(f, 0.5), y = t * w.steerRate * g;
          this.x += e.steer * y;
          let v = i.curveAt(this.z);
          this.x -= y * f * v * w.centrifugal * 0.35, this.x = m(this.x, -2, 2);
          let S = e.steer * 0.55 - v * f * 0.12;
          this.tilt = X(this.tilt, S, 8, t), this.engineLoad = X(this.engineLoad, e.throttle, 6, t);
          let x = e.throttle >= ht.nitroThreshold && f > 0.55 ? 1 : 0;
          return this.nitro = X(this.nitro, x, 5, t), this.drifting = Math.abs(e.steer) > 0.62 && f > 0.45, this.crashCooldown > 0 && (this.crashCooldown -= t), { prevZ: o, dz: d, speedPct: f, curve: v };
        }
        crash() {
          this.speed *= w.crashSlow, this.crashCooldown = 0.9, this.nitro = 0;
        }
        get speedKmh() {
          return Math.round(this.speed / 42);
        }
        get speedPct() {
          return this.speed / this.maxSpeed;
        }
        get halfWidth() {
          return ht.halfWidth;
        }
      };
      var Vt = class {
        constructor(t) {
          this.view = t, this.offset = { stars: 0, far: 0, near: 0, sun: 0 }, this.time = 0, this.build();
        }
        build() {
          let t = J(90210), e = this.view.width, i = this.view.height;
          this.stars = [];
          for (let l = 0; l < 170; l++) this.stars.push({ x: t.range(0, e * 2), y: t.range(0, i * 0.4), r: t.range(0.7, 2.1), a: t.range(0.35, 1), tw: t.range(0.5, 2.2) });
          let s = (l, o, r, a) => {
            let n = J(a), c = [], d = 0;
            for (; d < e * 2; ) {
              let f = n.range(28, 92), g = n.range(o, r), y = [], v = Math.max(1, Math.floor(f / 14)), S = Math.max(1, Math.floor(g / 18));
              for (let x = 0; x < v; x++) for (let b = 0; b < S; b++) n.chance(0.42) && y.push({ x: x * 14 + 5, y: b * 18 + 6, on: n.chance(0.6) });
              c.push({ x: d, w: f, h: g, windows: y, antenna: n.chance(0.25) }), d += f + n.range(4, 22);
            }
            return c;
          };
          this.cityFar = s(40, i * 0.1, i * 0.24, 4242), this.cityNear = s(30, i * 0.16, i * 0.36, 1337);
        }
        update(t, e, i) {
          this.time += t;
          let s = e * i * 26;
          this.offset.stars = (this.offset.stars + s * t * 0.6) % (this.view.width * 2), this.offset.sun = (this.offset.sun + s * t * 0.8) % (this.view.width * 2), this.offset.far = (this.offset.far + s * t * 1.6) % (this.view.width * 2), this.offset.near = (this.offset.near + s * t * 3.2) % (this.view.width * 2);
        }
        render(t, e) {
          let { width: i, height: s } = this.view, l = e, o = t.createLinearGradient(0, 0, 0, l + 40);
          o.addColorStop(0, h.sky0), o.addColorStop(0.55, h.sky1), o.addColorStop(1, h.sky2), t.fillStyle = o, t.fillRect(0, 0, i, l + 42);
          for (let S of this.stars) {
            let x = (S.x - this.offset.stars + i * 2) % (i * 2);
            if (x > i) continue;
            let b = 0.6 + 0.4 * Math.sin(this.time * S.tw + S.x);
            t.globalAlpha = S.a * b, t.fillStyle = "#ffffff", t.fillRect(x, S.y, S.r, S.r);
          }
          t.globalAlpha = 1;
          let r = s * 0.2, a = i * 0.5 - this.offset.sun % (i * 2) / (i * 2) * i * 0.22, n = l - r * 0.25, c = t.createLinearGradient(0, n - r, 0, n + r);
          c.addColorStop(0, "#ffe14d"), c.addColorStop(0.45, h.neonPink), c.addColorStop(1, "#5a0f8f"), t.save(), t.beginPath(), t.arc(a, n, r, 0, Math.PI * 2), t.clip(), t.fillStyle = c, t.fillRect(a - r, n - r, r * 2, r * 2), t.fillStyle = "rgba(5,0,15,0.55)";
          for (let S = 0; S < 9; S++) {
            let x = n + r * 0.05 + S * (r * 0.22);
            t.fillRect(a - r, x, r * 2, r * 0.07 + S * 0.9);
          }
          t.restore(), this.drawCity(t, this.cityFar, this.offset.far, l, "#170a33", P(h.neonBlue, 0.55), 0.55), this.drawCity(t, this.cityNear, this.offset.near, l, "#0d0424", P(h.neonPink, 0.75), 1), t.save(), t.translate(i * 0.5, l), t.scale(1, 0.055);
          let d = Math.max(i * 0.55, 220), f = t.createRadialGradient(0, 0, 0, 0, 0, d);
          f.addColorStop(0, P(h.neonBlue, 0.3)), f.addColorStop(0.5, P(h.neonBlue, 0.1)), f.addColorStop(1, "rgba(0,229,255,0)"), t.fillStyle = f, t.beginPath(), t.arc(0, 0, d, 0, Math.PI * 2), t.fill(), t.restore(), t.save();
          let g = i * 0.3, y = t.createLinearGradient(i * 0.5 - g, 0, i * 0.5 + g, 0);
          y.addColorStop(0, "rgba(150,240,255,0)"), y.addColorStop(0.5, "rgba(190,250,255,0.42)"), y.addColorStop(1, "rgba(150,240,255,0)"), t.fillStyle = y, t.fillRect(i * 0.5 - g, l - 0.8, g * 2, 1.6), t.restore();
          let v = t.createLinearGradient(0, l, 0, s);
          v.addColorStop(0, "#12002b"), v.addColorStop(1, "#05000f"), t.fillStyle = v, t.fillRect(0, l, i, s - l);
        }
        drawCity(t, e, i, s, l, o, r) {
          let a = this.view.width;
          t.save(), t.globalAlpha = r, t.fillStyle = l;
          for (let n of e) {
            let c = (n.x - i + a * 2) % (a * 2) - a * 0.5;
            if (c > a || c + n.w < 0) continue;
            let d = s - n.h;
            t.fillRect(c, d, n.w, n.h + 6), t.fillStyle = o, t.fillRect(c, d, n.w, 2), t.globalAlpha = r * 0.7;
            for (let f of n.windows) f.on && t.fillRect(c + f.x, d + f.y, 3, 5);
            t.globalAlpha = r, t.fillStyle = l, n.antenna && (t.fillRect(c + n.w * 0.5 - 1, d - 14, 2, 14), t.fillStyle = o, t.fillRect(c + n.w * 0.5 - 2, d - 16, 4, 3), t.fillStyle = l);
          }
          t.restore();
        }
      };
      function jt(t, e) {
        return 1 / Math.pow(Math.E, t * t * e);
      }
      function U(t, e) {
        let i = Math.sin(t * 12.9898 + e * 78.233) * 43758.5453;
        return i - Math.floor(i);
      }
      var Zt = class {
        constructor(t) {
          this.view = t, this.wavePhase = 0, this.horizonY = t.height * 0.42;
        }
        compute(t, e, i) {
          let s = this.view.width, l = this.view.height, o = w.segmentLength, r = w.roadWidth, a = w.cameraDepth, n = w.drawDistance, c = t.findSegment(e.z), d = e.z % o / o, f = Z(c.p1.world.y, c.p2.world.y, d) + w.cameraHeight, g = l, y = 0, v = -(c.curve * d);
          this.wavePhase += 0.08 + (i || 0) * 0.16;
          let S = [];
          for (let x = 0; x < n; x++) {
            let b = t.segments[(c.index + x) % t.segments.length];
            b.looped = b.index < c.index, b.fog = jt(x / n, w.fogDensity), b.clip = g;
            let M = e.z - (b.looped ? t.length : 0);
            ft(b.p1, e.x * r - y, f, M, a, s, l, r), ft(b.p2, e.x * r - y - v, f, M, a, s, l, r), y += v, v += b.curve, !(b.p1.camera.z <= a) && (b.p2.screen.y >= b.p1.screen.y || b.p2.screen.y >= g || (S.push(b), g = b.p2.screen.y));
          }
          return { visible: S, clipY: g, W: s, H: l };
        }
        paint(t, e) {
          let i = e.visible, s = e.W, l = e.H;
          for (let n = 0; n < i.length; n++) this.paintGround(t, i[n]);
          t.save(), t.globalCompositeOperation = "lighter";
          let o = s * 0.5, r = l * 0.98, a = t.createRadialGradient(o, r, 8, o, r, l * 0.92);
          a.addColorStop(0, "rgba(96,150,230,0.16)"), a.addColorStop(0.42, "rgba(80,130,215,0.07)"), a.addColorStop(1, "rgba(40,60,140,0)"), t.fillStyle = a, t.fillRect(0, 0, s, l), t.restore();
          for (let n = i.length - 1; n >= 0; n--) this.paintDecor(t, i[n]);
          return this.horizonY = e.clipY, e.clipY;
        }
        render(t, e, i, s) {
          let l = this.compute(e, i, s);
          return this.paint(t, l), l.clipY;
        }
        paintGround(t, e) {
          let i = this.view.width, s = e.p1.screen, l = e.p2.screen, o = m(e.fog, 0, 1);
          if (o <= 0.02) return;
          let r = l.y, a = s.y;
          if (a <= r) return;
          let n = Math.floor(e.index / w.rumbleLength) % 2, c = 6 + o * 22 + (n ? 4 : 0);
          t.fillStyle = "rgb(" + Math.round(c * 1.25) + "," + Math.round(c * 0.45) + "," + Math.round(c * 1.7) + ")", t.fillRect(0, r, i, a - r);
          let d = s.w, f = l.w, g = Math.max(1.5, d * 0.1), y = Math.max(1, f * 0.1), v = e.color.rumble, S = Dt(v, 0.14 + o * 0.24);
          t.fillStyle = S, t.beginPath(), t.moveTo(s.x - d - g, a), t.lineTo(s.x - d, a), t.lineTo(l.x - f, r), t.lineTo(l.x - f - y, r), t.closePath(), t.fill(), t.beginPath(), t.moveTo(s.x + d, a), t.lineTo(s.x + d + g, a), t.lineTo(l.x + f + y, r), t.lineTo(l.x + f, r), t.closePath(), t.fill(), o > 0.03 && (t.strokeStyle = P(v, 0.26 + o * 0.44), t.lineWidth = Math.max(1, d * 6e-3), t.beginPath(), t.moveTo(s.x - d - g, a), t.lineTo(l.x - f - y, r), t.moveTo(s.x + d + g, a), t.lineTo(l.x + f + y, r), t.stroke()), t.beginPath(), t.moveTo(s.x - d, a), t.lineTo(s.x + d, a), t.lineTo(l.x + f, r), t.lineTo(l.x - f, r), t.closePath();
          let x = 8 + o * 38 + (Math.floor(e.index / w.rumbleLength) % 2 ? 4 : 0);
          if (t.fillStyle = "rgb(" + Math.round(x * 0.86) + "," + Math.round(x * 0.94) + "," + Math.round(x * 1.52) + ")", t.fill(), o > 0.05 && e.index % w.rumbleLength === 0 && (t.strokeStyle = "rgba(8,6,20," + (0.28 * o).toFixed(3) + ")", t.lineWidth = Math.max(1, d * 0.012), t.beginPath(), t.moveTo(s.x - d, a - 0.5), t.lineTo(s.x + d, a - 0.5), t.stroke()), o > 0.22 && d > 45) for (let M = 0; M < 4; M++) {
            let L = U(e.index * 13 + M, 29), E = U(e.index * 13 + M, 31), C = s.x - d + L * d * 2, I = r + E * (a - r);
            t.fillStyle = "rgba(190,215,255," + (0.02 + o * 0.03).toFixed(3) + ")", t.fillRect(C, I, Math.max(1, d * 0.022), Math.max(1, (a - r) * 0.3));
          }
          if (Math.floor(e.index / 2) % 2 === 0) {
            let b = d * 2 / w.lanes, M = f * 2 / w.lanes;
            t.globalAlpha = o * 0.34, t.fillStyle = e.color.lane;
            let L = s.x - d + b, E = l.x - f + M;
            for (let C = 1; C < w.lanes; C++) t.beginPath(), t.moveTo(L - b * 0.026, a), t.lineTo(L + b * 0.026, a), t.lineTo(E + M * 0.026, r), t.lineTo(E - M * 0.026, r), t.closePath(), t.fill(), L += b, E += M;
            t.globalAlpha = 1;
          }
          if (e.color.start || e.color.finish) {
            let b = e.color.start ? h.neonGreen : h.neonPink;
            t.save(), t.globalAlpha = o, t.shadowBlur = 24, t.shadowColor = b, t.fillStyle = P(b, 0.85), t.beginPath(), t.moveTo(s.x - d, a), t.lineTo(s.x + d, a), t.lineTo(l.x + f, r), t.lineTo(l.x - f, r), t.closePath(), t.fill(), t.restore();
          }
          o < 1 && (t.globalAlpha = 1 - o, t.fillStyle = "#0a0018", t.fillRect(0, r, i, a - r), t.globalAlpha = 1);
        }
        paintDecor(t, e) {
          let i = e.index, s = e.p1.screen, l = m(e.fog, 0, 1);
          if (l < 0.1) return;
          let o = s.w;
          if (!(o < 1)) {
            if (i % 9 === 4) {
              let r = Math.floor(i / 9) % 2 === 0 ? -1 : 1;
              this.paintLamp(t, s, o, r, l);
            }
            if (i % 61 === 23 && o < 240) {
              let r = U(i, 3) > 0.5 ? 1 : -1;
              this.paintBoard(t, s, o, r, l, i);
            }
            i % 4 === 1 && this.paintPylon(t, s, o, l, i);
          }
        }
        paintLamp(t, e, i, s, l) {
          let o = e.x + s * i * 1.34, r = e.y, a = i * 1.12;
          if (a < 3) return;
          let n = Math.max(0.8, i * 0.016);
          t.beginPath(), t.moveTo(o - n * 1.6, r), t.lineTo(o + n * 1.6, r), t.lineTo(o + n * 0.55, r - a), t.lineTo(o - n * 0.55, r - a), t.closePath(), t.fillStyle = "rgba(16,9,32," + (0.3 + l * 0.62).toFixed(3) + ")", t.fill();
          let c = r - a, d = Math.max(1, i * 0.042), f = t.createRadialGradient(o, c, 0, o, c, d * 4.5);
          f.addColorStop(0, "rgba(120,240,255," + (0.34 * l).toFixed(3) + ")"), f.addColorStop(0.45, "rgba(120,240,255," + (0.1 * l).toFixed(3) + ")"), f.addColorStop(1, "rgba(120,240,255,0)"), t.fillStyle = f, t.beginPath(), t.arc(o, c, d * 4.5, 0, Math.PI * 2), t.fill(), t.fillStyle = "rgba(215,255,255," + (0.45 + l * 0.5).toFixed(3) + ")", t.beginPath(), t.arc(o, c, d, 0, Math.PI * 2), t.fill(), t.save(), t.globalCompositeOperation = "lighter", t.fillStyle = "rgba(110,230,255," + (0.09 * l).toFixed(3) + ")", t.beginPath(), t.ellipse(o, r, d * 2.4, d * 0.5, 0, 0, Math.PI * 2), t.fill(), t.restore();
        }
        paintBoard(t, e, i, s, l, o) {
          let r = e.x + s * i * 2, a = e.y, n = i * 0.46;
          if (n < 7) return;
          let c = i * 0.52, d = a - n * 2.05;
          t.fillStyle = "rgba(14,8,26," + (0.35 + l * 0.55).toFixed(3) + ")", t.fillRect(r - c * 0.05, d + n, c * 0.1, n * 1.05);
          let g = ["0,229,255", "255,46,166", "255,225,77"][Math.floor(U(o, 7) * 3) % 3];
          t.fillStyle = "rgba(8,4,18," + (0.55 + l * 0.35).toFixed(3) + ")", t.fillRect(r - c / 2, d, c, n), t.strokeStyle = "rgba(" + g + "," + (0.26 + l * 0.52).toFixed(3) + ")", t.lineWidth = Math.max(1, c * 0.03), t.strokeRect(r - c / 2, d, c, n), c > 14 && (t.fillStyle = "rgba(" + g + "," + (0.14 + l * 0.3).toFixed(3) + ")", t.fillRect(r - c * 0.36, d + n * 0.26, c * 0.72, n * 0.15), t.fillRect(r - c * 0.36, d + n * 0.57, c * 0.46, n * 0.11));
        }
        paintPylon(t, e, i, s, l) {
          let o = U(l, 11) > 0.5 ? 1 : -1, r = e.x + o * i * 1.06, a = e.y, n = i * 0.085;
          if (n < 1.6) return;
          let c = Math.max(0.7, i * 0.013);
          t.fillStyle = "rgba(210,226,255," + (0.1 + s * 0.34).toFixed(3) + ")", t.fillRect(r - c / 2, a - n, c, n), t.fillStyle = "rgba(255,70,80," + (0.22 + s * 0.42).toFixed(3) + ")", t.fillRect(r - c / 2, a - n, c, n * 0.3);
        }
      };
      var Xt = class {
        constructor(t) {
          this.view = t, this.bob = 0;
        }
        update(t, e) {
          let i = e && isFinite(e.speedPct) ? m(e.speedPct, 0, 1) : 0;
          this.bob += t * (6 + i * 22);
        }
        render(t, e, i) {
          let s = this.view.width, l = this.view.height, o = i === void 0 ? s * 0.5 : i, r = s * 0.175, a = r * 0.54, n = l * 0.86, c = Math.PI * 2, d = Math.sin(this.bob) * (1 + e.speedPct * 2.2), f = m(e.tilt, -0.8, 0.8), g = m(e.speedPct, 0, 1);
          t.save(), t.translate(o, n + d), t.rotate(f * 0.085), t.transform(1, 0, f * 0.14, 1, 0, 0), t.save(), t.scale(1, 0.34);
          let y = t.createRadialGradient(0, a * 1.3, 1, 0, a * 1.3, r * 0.7);
          y.addColorStop(0, "rgba(0,0,0,0.66)"), y.addColorStop(0.6, "rgba(0,0,0,0.24)"), y.addColorStop(1, "rgba(0,0,0,0)"), t.fillStyle = y, t.beginPath(), t.arc(0, a * 1.3, r * 0.7, 0, c), t.fill(), t.restore();
          let v = r * 0.14, S = a * 0.44;
          for (let _ = -1; _ <= 1; _ += 2) {
            let B = _ * (r * 0.5 - v * 0.18), A = t.createLinearGradient(B - v / 2, 0, B + v / 2, 0);
            A.addColorStop(0, "#040309"), A.addColorStop(0.45, "#161129"), A.addColorStop(1, "#040309"), t.fillStyle = A, t.fillRect(B - v / 2, a * 0.1, v, S), t.fillStyle = "rgba(150,195,255,0.10)", t.fillRect(B - v * 0.36, a * 0.14, v * 0.14, S * 0.68);
          }
          let x = t.createLinearGradient(0, -a * 0.78, 0, -a * 3);
          x.addColorStop(0, P(h.neonBlue, 0.2)), x.addColorStop(0.3, P(h.neonBlue, 0.09)), x.addColorStop(1, "rgba(0,0,0,0)"), t.globalAlpha = 0.6, t.fillStyle = x, t.beginPath(), t.moveTo(-r * 0.22, -a * 0.75), t.lineTo(r * 0.22, -a * 0.75), t.lineTo(r * 0.68, -a * 3), t.lineTo(-r * 0.68, -a * 3), t.closePath(), t.fill(), t.globalAlpha = 1;
          let b = r * 0.47, M = r * 0.385, L = r * 0.3, E = () => {
            t.beginPath(), t.moveTo(-b, a * 0.3), t.lineTo(-M, -a * 0.24), t.lineTo(-L, -a * 0.7), t.lineTo(L, -a * 0.7), t.lineTo(M, -a * 0.24), t.lineTo(b, a * 0.3), t.closePath();
          }, C = t.createLinearGradient(0, -a * 0.8, 0, a * 0.34);
          C.addColorStop(0, "#4b3486"), C.addColorStop(0.3, "#2a1c4d"), C.addColorStop(0.72, "#150e2a"), C.addColorStop(1, "#0b0718"), E(), t.fillStyle = C, t.fill();
          let I = t.createLinearGradient(-b, 0, b, 0);
          I.addColorStop(0, "rgba(150,190,255,0.18)"), I.addColorStop(0.3, "rgba(150,190,255,0.04)"), I.addColorStop(0.62, "rgba(0,0,0,0.14)"), I.addColorStop(1, "rgba(0,0,0,0.36)"), E(), t.fillStyle = I, t.fill(), E(), t.strokeStyle = "rgba(120,200,255,0.42)", t.lineWidth = Math.max(1.1, r * 0.011), t.stroke(), t.strokeStyle = "rgba(180,215,255,0.16)", t.lineWidth = Math.max(1, r * 8e-3), t.beginPath(), t.moveTo(-M, -a * 0.24), t.lineTo(M, -a * 0.24), t.stroke();
          let Y = r * 0.255, ot = r * 0.205, at = () => {
            t.beginPath(), t.moveTo(-Y, -a * 0.2), t.lineTo(-ot, -a * 0.62), t.lineTo(ot, -a * 0.62), t.lineTo(Y, -a * 0.2), t.closePath();
          }, $ = t.createLinearGradient(0, -a * 0.64, 0, -a * 0.18);
          $.addColorStop(0, "#2e5390"), $.addColorStop(0.42, "#14213a"), $.addColorStop(1, "#070a14"), at(), t.fillStyle = $, t.fill(), at(), t.strokeStyle = "rgba(140,205,255,0.22)", t.lineWidth = Math.max(1, r * 7e-3), t.stroke();
          let nt = g > 0.62 || e.nitro > 0.1, St = nt ? 0.95 : 0.58;
          t.save(), t.globalCompositeOperation = "lighter", t.shadowBlur = nt ? 22 : 12, t.shadowColor = "#ff2a4a", t.fillStyle = "rgba(255,42,74," + St + ")", t.fillRect(-b * 0.9, a * 0.015, b * 0.58, a * 0.095), t.fillRect(b * 0.32, a * 0.015, b * 0.58, a * 0.095), t.restore(), t.fillStyle = "rgba(5,3,10,0.92)", t.fillRect(-b * 0.97, a * 0.23, b * 1.94, a * 0.11), t.save(), t.globalCompositeOperation = "lighter";
          let q = t.createLinearGradient(0, a * 0.26, 0, a * 0.5);
          q.addColorStop(0, "rgba(0,229,255,0.40)"), q.addColorStop(0.55, "rgba(0,229,255,0.12)"), q.addColorStop(1, "rgba(0,229,255,0)"), t.fillStyle = q, t.fillRect(-b * 0.97, a * 0.26, b * 1.94, a * 0.24), t.restore();
          let xt = e.nitro > 0.1 ? h.neonPink : h.neonBlue;
          if (g > 0.05) {
            t.save(), t.globalCompositeOperation = "lighter";
            for (let _ = -1; _ <= 1; _ += 2) {
              let B = _ * r * 0.22, A = t.createRadialGradient(B, a * 0.34, 1, B, a * 0.34, a * 0.42);
              A.addColorStop(0, P(xt, 0.45 * g)), A.addColorStop(1, "rgba(0,0,0,0)"), t.fillStyle = A, t.beginPath(), t.arc(B, a * 0.34, a * 0.42, 0, c), t.fill();
            }
            t.restore();
          }
          return t.restore(), { exhaust: [{ x: o - r * 0.22, y: n + d + a * 0.34 }, { x: o + r * 0.22, y: n + d + a * 0.34 }], wheels: [{ x: o - r * 0.44, y: n + d + a * 0.3 }, { x: o + r * 0.44, y: n + d + a * 0.3 }] };
        }
      };
      var gt = 480;
      var Kt = class {
        constructor(t) {
          this.view = t, this.pool = [], this.active = [], this.rings = [], this.popups = [], this.shakeMag = 0, this.shakeTime = 0, this.flashAlpha = 0, this.flashColor = h.neonBlue, this.perfect = null, this.comboPulse = 0, this.time = 0;
        }
        _obtain() {
          let t = this.pool.pop() || {};
          return t.x = 0, t.y = 0, t.vx = 0, t.vy = 0, t.life = 0, t.max = 1, t.size = 2, t.color = "#fff", t.kind = "spark", t.gravity = 0, t.drag = 0.9, t.rot = 0, t.vrot = 0, t;
        }
        _recycle(t) {
          this.pool.length < gt && this.pool.push(t);
        }
        _spawn(t) {
          if (this.active.length >= gt) {
            let i = 0, s = 1 / 0;
            for (let l = 0; l < this.active.length; l++) {
              let o = this.active[l].life / this.active[l].max;
              o < s && (s = o, i = l);
            }
            this._recycle(this.active.splice(i, 1)[0]);
          }
          let e = this._obtain();
          return Object.assign(e, t), e.max = e.life, this.active.push(e), e;
        }
        emitNitro(t, e, i, s) {
          let l = i > 0.5 ? 3 : 1;
          for (let o = 0; o < l; o++) {
            let r = Math.random() < 0.5 ? h.neonBlue : h.neonPink;
            this._spawn({ x: t + T(-3, 3), y: e + T(-2, 2), vx: T(-38, 38), vy: T(90, 240) * (0.5 + s), life: T(0.28, 0.5), size: T(3, 8) * (0.6 + i), color: r, kind: "flame", gravity: -30, drag: 0.86 });
          }
        }
        emitTire(t, e, i) {
          Math.random() > i * 0.9 || this._spawn({ x: t + T(-6, 6), y: e + T(-3, 3), vx: T(-24, 24), vy: T(10, 60), life: T(0.5, 0.9), size: T(6, 14), color: Math.random() < 0.3 ? h.neonPurple : "#5a4a7a", kind: "smoke", gravity: -18, drag: 0.93 });
        }
        emitSparks(t, e, i = 22, s = h.neonYellow) {
          for (let l = 0; l < i; l++) {
            let o = T(0, Math.PI * 2), r = T(80, 420);
            this._spawn({ x: t, y: e, vx: Math.cos(o) * r, vy: Math.sin(o) * r - 60, life: T(0.25, 0.6), size: T(2, 5), color: Math.random() < 0.4 ? h.warn : s, kind: "spark", gravity: 520, drag: 0.9 });
          }
        }
        emitRing(t, e, i = h.neonGreen, s = 220, l = 4) {
          this.rings.push({ x: t, y: e, r: 6, maxR: s, color: i, life: 0.6, max: 0.6, width: l });
        }
        emitPopup(t, e, i, s = h.neonGreen, l = 28) {
          this.popups.push({ text: t, x: e, y: i, color: s, size: l, life: 1, max: 1 });
        }
        emitPerfect(t) {
          this.perfect = { life: 0.85, max: 0.85, combo: t, rays: 14 }, this.comboPulse = 1, this.emitRing(this.view.width * 0.5, this.view.height * 0.55, h.neonGreen, 380, 6);
        }
        shake(t = 12, e = 0.35) {
          this.shakeMag = Math.max(this.shakeMag, t), this.shakeTime = Math.max(this.shakeTime, e);
        }
        flash(t = h.warn, e = 0.5) {
          this.flashColor = t, this.flashAlpha = Math.max(this.flashAlpha, e);
        }
        update(t) {
          this.time += t;
          for (let e = this.active.length - 1; e >= 0; e--) {
            let i = this.active[e];
            if (i.life -= t, i.life <= 0) {
              this._recycle(i), this.active.splice(e, 1);
              continue;
            }
            i.vy += i.gravity * t;
            let s = Math.pow(i.drag, t * 60);
            i.vx *= s, i.vy *= s, i.x += i.vx * t, i.y += i.vy * t, i.rot += i.vrot * t;
          }
          for (let e = this.rings.length - 1; e >= 0; e--) {
            let i = this.rings[e];
            i.life -= t, i.r = zt(i.maxR, 6, m(i.life / i.max, 0, 1)), i.life <= 0 && this.rings.splice(e, 1);
          }
          for (let e = this.popups.length - 1; e >= 0; e--) {
            let i = this.popups[e];
            i.life -= t, i.y -= 46 * t, i.life <= 0 && this.popups.splice(e, 1);
          }
          this.perfect && (this.perfect.life -= t, this.perfect.life <= 0 && (this.perfect = null)), this.shakeTime > 0 && (this.shakeTime -= t, this.shakeTime <= 0 && (this.shakeTime = 0, this.shakeMag = 0)), this.flashAlpha = Math.max(0, this.flashAlpha - t * 2.2), this.comboPulse = Math.max(0, this.comboPulse - t * 2);
        }
        applyShake(t) {
          if (this.shakeTime <= 0) return;
          let e = this.shakeMag * this.shakeTime;
          t.translate(T(-e, e), T(-e, e));
        }
        renderBack(t) {
          t.save(), t.globalCompositeOperation = "lighter";
          for (let e of this.active) e.kind !== "flame" && e.kind !== "smoke" || this.drawParticle(t, e);
          t.restore();
        }
        renderFront(t) {
          t.save(), t.globalCompositeOperation = "lighter";
          for (let e of this.active) e.kind === "flame" || e.kind === "smoke" || this.drawParticle(t, e);
          for (let e of this.rings) {
            let i = m(e.life / e.max, 0, 1);
            t.globalAlpha = i * 0.85, t.strokeStyle = e.color, t.lineWidth = e.width * i + 1, t.shadowBlur = 24, t.shadowColor = e.color, t.beginPath(), t.ellipse(e.x, e.y, e.r, e.r * 0.42, 0, 0, Math.PI * 2), t.stroke();
          }
          t.restore();
          for (let e of this.popups) {
            let i = m(e.life / e.max, 0, 1);
            t.save(), t.globalAlpha = i, t.font = `bold ${e.size}px sans-serif`, t.textAlign = "center", t.shadowBlur = 18, t.shadowColor = e.color, t.fillStyle = e.color, t.fillText(e.text, e.x, e.y), t.restore();
          }
          this.perfect && this.renderPerfect(t), this.flashAlpha > 0.01 && (t.save(), t.globalAlpha = this.flashAlpha, t.fillStyle = this.flashColor, t.fillRect(0, 0, this.view.width, this.view.height), t.restore());
        }
        drawParticle(t, e) {
          let i = m(e.life / e.max, 0, 1);
          t.globalAlpha = e.kind === "smoke" ? i * 0.35 : i * 0.9, t.fillStyle = e.color, t.beginPath();
          let s = e.size * (e.kind === "flame" ? i : 1);
          t.arc(e.x, e.y, Math.max(0.5, s), 0, Math.PI * 2), t.fill();
        }
        renderPerfect(t) {
          let { width: e, height: i } = this.view, s = this.perfect, l = 1 - s.life / s.max, o = 0.6 + Math.sin(Math.min(1, l * 3) * Math.PI * 0.5) * 0.75, r = s.life / s.max;
          t.save(), t.translate(e * 0.5, i * 0.42), t.globalAlpha = r * 0.55, t.strokeStyle = h.neonGreen, t.lineWidth = 3, t.shadowBlur = 30, t.shadowColor = h.neonGreen;
          for (let a = 0; a < s.rays; a++) {
            let n = Math.PI * 2 * a / s.rays + l, c = 90 * o, d = c + 160 * (1 - l);
            t.beginPath(), t.moveTo(Math.cos(n) * c, Math.sin(n) * c * 0.55), t.lineTo(Math.cos(n) * d, Math.sin(n) * d * 0.55), t.stroke();
          }
          t.scale(o, o), t.textAlign = "center", t.textBaseline = "middle", t.font = "bold 76px sans-serif", t.globalAlpha = r * 0.85, t.fillStyle = h.neonBlue, t.fillText("PERFECT", -4, 0), t.fillStyle = h.neonPink, t.fillText("PERFECT", 4, 0), t.globalAlpha = r, t.fillStyle = "#ffffff", t.fillText("PERFECT", 0, 0), s.combo > 1 && (t.font = "bold 34px sans-serif", t.fillStyle = h.neonYellow, t.fillText(`COMBO x${s.combo}`, 0, 58)), t.restore();
        }
        renderSpeedLines(t, e) {
          if (e < 0.55) return;
          let { width: i, height: s } = this.view, l = Math.floor((e - 0.5) * 26);
          t.save(), t.globalCompositeOperation = "lighter", t.strokeStyle = P(h.neonBlue, 0.28), t.lineWidth = 2;
          for (let o = 0; o < l; o++) {
            let r = (o * 97 + Math.floor(this.time * 400)) % 1e3, a = r / 1e3 * s, n = 60 + r % 90, c = r % 2 === 0 ? r % (i * 0.35) : i - r % (i * 0.35);
            t.globalAlpha = 0.12 + (e - 0.5) * 0.5, t.beginPath(), t.moveTo(c, a), t.lineTo(c + (c < i * 0.5 ? n : -n), a + 4), t.stroke();
          }
          t.restore();
        }
        reset() {
          for (let t of this.active) this._recycle(t);
          this.active.length = 0, this.rings.length = 0, this.popups.length = 0, this.perfect = null, this.flashAlpha = 0, this.shakeTime = 0;
        }
      };
      function N(t, e, i, s, l, o) {
        let r = Math.min(o, s / 2, l / 2);
        t.beginPath(), t.moveTo(e + r, i), t.lineTo(e + s - r, i), t.quadraticCurveTo(e + s, i, e + s, i + r), t.lineTo(e + s, i + l - r), t.quadraticCurveTo(e + s, i + l, e + s - r, i + l), t.lineTo(e + r, i + l), t.quadraticCurveTo(e, i + l, e, i + l - r), t.lineTo(e, i + r), t.quadraticCurveTo(e, i, e + r, i), t.closePath();
      }
      function p(t, e, i, s, { size: l = 24, color: o = h.text, align: r = "left", baseline: a = "alphabetic", blur: n = 14, weight: c = "bold", alpha: d = 1 } = {}) {
        t.save(), t.globalAlpha = d, t.font = `${c} ${l}px sans-serif`, t.textAlign = r, t.textBaseline = a, t.shadowBlur = n, t.shadowColor = o, t.fillStyle = o, t.fillText(e, i, s), t.restore();
      }
      function H2(t, e, i, s, l, { fill: o = "rgba(8,2,24,0.82)", stroke: r = h.neonBlue, r: a = 16, blur: n = 18 } = {}) {
        t.save(), t.shadowBlur = n, t.shadowColor = r, t.fillStyle = o, N(t, e, i, s, l, a), t.fill(), t.strokeStyle = P(r, 0.75), t.lineWidth = 1.5, t.stroke(), t.restore();
      }
      function R(t, e, i, { color: s = h.neonPink, active: l = false, size: o = 26, filled: r = false } = {}) {
        let { x: a, y: n, w: c, h: d } = e;
        return t.save(), t.shadowBlur = l ? 26 : 14, t.shadowColor = s, t.fillStyle = r || l ? P(s, 0.28) : "rgba(10,3,28,0.75)", N(t, a, n, c, d, d * 0.28), t.fill(), t.strokeStyle = s, t.lineWidth = 2, t.stroke(), t.restore(), p(t, i, a + c / 2, n + d / 2 + o * 0.35, { size: o, color: l ? "#ffffff" : s, align: "center", blur: 10 }), e;
      }
      function vt(t, e, i) {
        return e >= t.x && e <= t.x + t.w && i >= t.y && i <= t.y + t.h;
      }
      function Jt(t, e, i, s, l, { color: o = h.neonGreen, label: r = "", fmt: a = null } = {}) {
        let { x: n, y: c, w: d, h: f } = e, g = m((i - s) / (l - s), 0, 1);
        if (t.save(), t.fillStyle = "rgba(255,255,255,0.12)", N(t, n, c + f * 0.35, d, f * 0.3, f * 0.15), t.fill(), t.fillStyle = P(o, 0.55), N(t, n, c + f * 0.35, d * g, f * 0.3, f * 0.15), t.fill(), t.shadowBlur = 16, t.shadowColor = o, t.fillStyle = "#ffffff", t.beginPath(), t.arc(n + d * g, c + f * 0.5, f * 0.34, 0, Math.PI * 2), t.fill(), t.restore(), r) {
          p(t, r, n, c + f * 0.28, { size: 18, color: h.textDim, blur: 6 });
          let y = a ? a(i) : String(Math.round(i * 100) / 100);
          p(t, y, n + d, c + f * 0.28, { size: 18, color: o, align: "right", blur: 8 });
        }
        return e;
      }
      function Qt(t, e, i, s) {
        let l = m((e - t.x) / t.w, 0, 1);
        return i + (s - i) * l;
      }
      function it(t, e, i, s, l, { color: o = h.neonBlue, width: r = 10, bg: a = "rgba(255,255,255,0.10)", label: n = "", sub: c = "" } = {}) {
        t.save(), t.lineWidth = r, t.strokeStyle = a, t.beginPath(), t.arc(e, i, s, 0, Math.PI * 2), t.stroke(), t.shadowBlur = 22, t.shadowColor = o, t.strokeStyle = o, t.lineCap = "round", t.beginPath(), t.arc(e, i, s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * m(l, 0, 1)), t.stroke(), t.restore(), n && p(t, n, e, i + 6, { size: 30, color: "#fff", align: "center", blur: 12 }), c && p(t, c, e, i + 30, { size: 16, color: h.textDim, align: "center", blur: 4 });
      }
      var te = class {
        constructor(t) {
          this.view = t, this.comboScale = 1, this.time = 0;
        }
        update(t) {
          this.time += t;
        }
        render(t, e) {
          let { width: i, height: s } = this.view, l = e.motion, o = e.player;
          this.drawTopLeft(t, e), this.drawProgress(t, i * 0.5, 74, e), this.drawTopRight(t, e), this.drawSpeedometer(t, 150, s - 130, e), this.drawPosture(t, i - 150, s - 130, l), this.drawBottomHint(t, e), e.countdown > 0 && this.drawCountdown(t, e.countdown);
        }
        drawTopLeft(t, e) {
          H2(t, 24, 24, 300, 92, { stroke: h.neonBlue, r: 14 });
          let i = e.ble.state === "connected" || e.ble.state === "mock" ? h.ok : e.ble.state === "error" ? h.warn : h.neonYellow;
          t.save(), t.shadowBlur = 12, t.shadowColor = i, t.fillStyle = i, t.beginPath(), t.arc(46, 48, 6, 0, Math.PI * 2), t.fill(), t.restore();
          let s = e.motion || {}, l = s.neutral || { roll: 0 }, o = s.smoothed || { roll: 0 }, r = Math.round((o.roll || 0) - (l.roll || 0));
          p(t, s.connected ? "\u4FA7\u5C48 " + (r > 0 ? "+" : "") + r + "\xB0" : "\u4F53\u611F\u5F85\u673A", 60, 54, { size: 18, color: h.text, blur: 6 }), p(t, `\u96BE\u5EA6 ${e.diff.name}`, 60, 78, { size: 18, color: h.neonPink, blur: 6 });
          let a = Math.max(0, e.timeLeft), n = String(Math.floor(a / 60)).padStart(2, "0"), c = String(Math.floor(a % 60)).padStart(2, "0");
          p(t, `${n}:${c}`, 310, 54, { size: 26, color: a < 10 ? h.warn : h.text, align: "right", blur: 10 }), p(t, "\u5269\u4F59\u65F6\u95F4", 310, 78, { size: 16, color: h.textDim, align: "right", blur: 2 });
        }
        drawProgress(t, e, i, s) {
          it(t, e, i, 46, s.progress, { color: h.neonGreen, width: 9, label: `${Math.round(s.progress * 100)}%`, sub: `${Math.round(s.calories)} kcal` });
        }
        drawTopRight(t, e) {
          let i = this.view.width;
          if (H2(t, i - 324, 24, 300, 92, { stroke: h.neonPink, r: 14 }), p(t, String(e.score), i - 44, 60, { size: 34, color: h.neonPink, align: "right", blur: 14 }), p(t, `\u6392\u540D #${e.rank}`, i - 44, 86, { size: 18, color: h.textDim, align: "right", blur: 4 }), p(t, "SCORE", i - 300, 60, { size: 16, color: h.textDim, blur: 4 }), e.combo > 0) {
            let s = 1 + m(e.comboPulse, 0, 1) * 0.35;
            t.save(), t.translate(i - 162, 140), t.scale(s, s), p(t, `COMBO x${e.combo}`, 0, 0, { size: 30, color: h.neonYellow, align: "center", blur: 18 }), t.restore();
          }
        }
        drawSpeedometer(t, e, i, s) {
          let l = m(s.player.speedPct, 0, 1);
          t.save(), t.fillStyle = "rgba(6,1,20,0.7)", t.beginPath(), t.arc(e, i, 98, 0, Math.PI * 2), t.fill(), t.strokeStyle = "rgba(255,255,255,0.15)", t.lineWidth = 2;
          for (let n = 0; n <= 10; n++) {
            let c = Math.PI * 0.75 + Math.PI * 1.5 * n / 10, d = 84 - (n % 5 === 0 ? 14 : 8);
            t.beginPath(), t.moveTo(e + Math.cos(c) * d, i + Math.sin(c) * d), t.lineTo(e + Math.cos(c) * 84, i + Math.sin(c) * 84), t.stroke();
          }
          let o = l > 0.8 ? h.neonPink : h.neonBlue;
          t.shadowBlur = 20, t.shadowColor = o, t.strokeStyle = o, t.lineWidth = 8, t.lineCap = "round", t.beginPath(), t.arc(e, i, 78, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * l), t.stroke();
          let r = Math.PI * 0.75 + Math.PI * 1.5 * l;
          t.strokeStyle = "#fff", t.lineWidth = 3, t.beginPath(), t.moveTo(e, i), t.lineTo(e + Math.cos(r) * 66, i + Math.sin(r) * 66), t.stroke(), t.restore(), p(t, String(s.player.speedKmh), e, i + 8, { size: 34, color: "#fff", align: "center", blur: 12 }), p(t, "km/h", e, i + 30, { size: 15, color: h.textDim, align: "center", blur: 2 });
          let a = 150;
          t.save(), t.fillStyle = "rgba(255,255,255,0.12)", N(t, e - a / 2, i + 84 + 2, a, 10, 5), t.fill(), t.shadowBlur = 14, t.shadowColor = h.neonPink, t.fillStyle = P(h.neonPink, 0.9), N(t, e - a / 2, i + 84 + 2, a * m(s.player.nitro, 0, 1), 10, 5), t.fill(), t.restore(), p(t, "NITRO", e, i + 84 + 32, { size: 14, color: h.textDim, align: "center", blur: 2 });
        }
        drawPosture(t, e, i, s) {
          let l = s.params.maxAngle, o = s.offset, r = m(o.roll / l, -1.4, 1.4) * 84 * 0.8, a = m(-o.pitch / l, -1.4, 1.4) * 84 * 0.8;
          t.save(), t.fillStyle = "rgba(6,1,20,0.7)", t.beginPath(), t.arc(e, i, 98, 0, Math.PI * 2), t.fill(), t.strokeStyle = P(h.neonPurple, 0.6), t.lineWidth = 2, t.beginPath(), t.arc(e, i, 84 * 0.8, 0, Math.PI * 2), t.stroke(), t.strokeStyle = "rgba(255,255,255,0.12)", t.beginPath(), t.moveTo(e - 84, i), t.lineTo(e + 84, i), t.moveTo(e, i - 84), t.lineTo(e, i + 84), t.stroke();
          let n = e + m(s.target.roll / l, -1.4, 1.4) * 84 * 0.8, c = i + m(-s.target.pitch / l, -1.4, 1.4) * 84 * 0.8;
          t.shadowBlur = 16, t.shadowColor = h.neonBlue, t.strokeStyle = h.neonBlue, t.lineWidth = 2.5, t.beginPath(), t.arc(n, c, 16 + Math.sin(this.time * 3.846) * 2, 0, Math.PI * 2), t.stroke();
          let d = m(s.match, 0, 1), f = d > 0.75 ? h.neonGreen : d > 0.45 ? h.neonYellow : h.warn;
          t.shadowBlur = 22, t.shadowColor = f, t.fillStyle = f, t.beginPath(), t.arc(e + r, i + a, 11, 0, Math.PI * 2), t.fill(), t.restore(), p(t, `${Math.round(d * 100)}%`, e, i + 84 + 34, { size: 22, color: f, align: "center", blur: 10 }), p(t, "\u59FF\u6001\u5339\u914D\u5EA6", e, i + 84 + 56, { size: 14, color: h.textDim, align: "center", blur: 2 }), s.jitter > 0.55 && p(t, "\u8BF7\u4FDD\u6301\u8EAF\u5E72\u7A33\u5B9A", e, i - 84 - 22, { size: 16, color: h.warn, align: "center", blur: 8 });
        }
        drawBottomHint(t, e) {
          let i = this.view.width, s = this.view.height;
          e.hint && p(t, e.hint, i * 0.5, s - 24, { size: 18, color: h.textDim, align: "center", blur: 4 });
        }
        drawCountdown(t, e) {
          let { width: i, height: s } = this.view, l = e > 0 ? String(Math.ceil(e)) : "GO!";
          t.save(), t.globalAlpha = 0.92, p(t, l, i * 0.5, s * 0.45, { size: 120, color: h.neonGreen, align: "center", baseline: "middle", blur: 30 }), t.restore();
        }
      };
      var ee = class {
        constructor(t) {
          this.view = t, this.layoutMap = {};
        }
        diffRow() {
          let { width: t, height: e } = this.view, i = 88, s = e * 0.42 - 19;
          return { panel: { x: t * 0.5 - 310, y: s, w: 620, h: i }, btnY: s + (i - 52) / 2, btnL: t * 0.5 - 300, btnR: t * 0.5 + 240, titleY: s + 34, subY: s + 66 };
        }
        layout(t, e = {}) {
          let { width: i, height: s } = this.view, l = [], o = (c, d, f, g, y, v, S) => {
            let x = { x: f, y: g, w: y, h: v };
            return l.push({ id: c, label: d, rect: x, color: S }), x;
          }, r = 260, a = 68, n = i * 0.5 - r / 2;
          if (t === "menu") {
            let c = s * 0.52;
            o("mock", "\u6A21\u62DF\u6A21\u5F0F\uFF08\u89E6\u5C4F\u9A71\u52A8\uFF09", n, c, r, a, h.neonGreen), c += a + 16, o("start", "\u5F00\u59CB\u8BAD\u7EC3", n, c, r, a, h.neonPink), c += a + 16;
            let d = r * 0.5 - 8;
            o("board", "\u6392\u884C\u699C", n - d - 6, c, d, a * 0.8, h.neonPurple), o("calibrate", "\u59FF\u6001\u6807\u5B9A", n + 6, c, d, a * 0.8, h.neonPurple);
            let f = this.diffRow();
            o("diffDown", "\uFF0D", f.btnL, f.btnY, 60, 52, h.neonBlue), o("diffUp", "\uFF0B", f.btnR, f.btnY, 60, 52, h.neonBlue);
          } else if (t === "ble") {
            let c = s * 0.28, d = (e.devices || []).slice(0, 5);
            d.length || l.push({ id: "none", label: "\u672A\u53D1\u73B0\u8BBE\u5907", rect: { x: 0, y: 0, w: 0, h: 0 }, color: h.textDim }), d.forEach((g, y) => o("dev:" + g.deviceId, `${g.name}  ${g.RSSI || 0}dBm  [${String(g.deviceId).slice(0, 8)}]`, i * 0.5 - 260, c + y * 62, 520, 52, h.neonBlue));
            let f = s * 0.28 + 310 + 14;
            o("rescan", "\u91CD\u65B0\u641C\u7D22", i * 0.5 - 270, f, 170, 54, h.neonGreen), o("mock", "\u7528\u6A21\u62DF\u6A21\u5F0F", i * 0.5 - 85, f, 170, 54, h.neonYellow), o("back", "\u8FD4\u56DE", i * 0.5 + 100, f, 170, 54, h.neonPink), o("all", e.showAll ? "\u4EC5\u663E\u793A WT \u8BBE\u5907" : `\u663E\u793A\u5168\u90E8 BLE \u8BBE\u5907\uFF08${e.total || 0}\uFF09`, i * 0.5 - 260, f + 62, 520, 46, h.neonPurple);
          } else t === "calibrate" ? (o("doCalibrate", e.calibrating ? "\u6807\u5B9A\u4E2D\u2026" : "\u5F00\u59CB\u6807\u5B9A\uFF08\u4FDD\u6301\u4E2D\u7ACB\u4F4D 3 \u79D2\uFF09", i * 0.5 - 240, s * 0.62, 480, 62, h.neonGreen), o("skip", "\u8DF3\u8FC7\u5E76\u8FD4\u56DE", i * 0.5 - 130, s * 0.62 + 76, 260, 52, h.neonPink)) : t === "pause" ? (o("resume", "\u7EE7\u7EED\u8BAD\u7EC3", n, s * 0.42, r, a, h.neonGreen), o("restart", "\u91CD\u65B0\u5F00\u59CB", n, s * 0.42 + a + 16, r, a, h.neonBlue), o("quit", "\u7ED3\u675F\u5E76\u8FD4\u56DE", n, s * 0.42 + (a + 16) * 2, r, a, h.neonPink)) : t === "result" ? (o("again", "\u518D\u6765\u4E00\u6B21", i * 0.5 - 290, s - 110, 180, 62, h.neonPink), o("board", "\u6392\u884C\u699C", i * 0.5 - 90, s - 110, 180, 62, h.neonBlue), o("menu", "\u8FD4\u56DE\u83DC\u5355", i * 0.5 + 110, s - 110, 180, 62, h.neonPurple)) : t === "leaderboard" ? o("back", "\u8FD4\u56DE", i * 0.5 - 130, s - 100, 260, 60, h.neonPink) : t === "privacy" && (o("privacyAgree", "\u540C\u610F\u5E76\u4F7F\u7528\u84DD\u7259", i * 0.5 - 270, s * 0.6, 260, 62, h.neonGreen), o("privacyReject", "\u6682\u4E0D\u540C\u610F", i * 0.5 + 10, s * 0.6, 260, 62, h.neonPink), o("privacyOpen", "\u67E5\u770B\u300A\u7528\u6237\u9690\u79C1\u4FDD\u62A4\u6307\u5F15\u300B", i * 0.5 - 170, s * 0.6 + 82, 340, 50, h.neonBlue));
          return this.layoutMap[t] = l, l;
        }
        hitTest(t, e, i) {
          let s = this.layoutMap[t] || [];
          for (let l of s) if (vt(l.rect, e, i)) return l.id;
          return null;
        }
        render(t, e, i = {}) {
          let s = this.layout(e, i);
          switch (e) {
            case "menu":
              return this.renderMenu(t, s, i);
            case "ble":
              return this.renderBle(t, s, i);
            case "calibrate":
              return this.renderCalibrate(t, s, i);
            case "pause":
              return this.renderPause(t, s, i);
            case "result":
              return this.renderResult(t, s, i);
            case "leaderboard":
              return this.renderBoard(t, s, i);
            case "privacy":
              return this.renderPrivacy(t, s);
            default:
              return null;
          }
        }
        renderMenu(t, e, i) {
          let { width: s, height: l } = this.view;
          t.save(), p(t, "NEON REHAB RACER", s * 0.5, l * 0.2, { size: 62, color: h.neonPink, align: "center", blur: 26 }), p(t, "\u4F53\u611F\u8D5B\u8F66\u5EB7\u590D\u8BAD\u7EC3 \xB7 \u8EAB\u4F53\u59FF\u6001\u9A71\u52A8", s * 0.5, l * 0.2 + 44, { size: 22, color: h.neonBlue, align: "center", blur: 12 }), t.restore();
          let o = tt[m(i.difficulty || 2, 1, 5)], r = this.diffRow();
          H2(t, r.panel.x, r.panel.y, r.panel.w, r.panel.h, { stroke: h.neonPurple, r: 18 }), p(t, `\u96BE\u5EA6\u6863\u4F4D  ${o.name}`, s * 0.5, r.titleY, { size: 26, color: h.neonYellow, align: "center", blur: 10 }), p(t, `\u969C\u788D\u5BC6\u5EA6 ${Math.round(o.density * 100)}% \xB7 \u901F\u5EA6\u4E0A\u9650 ${Math.round(o.maxSpeed / 42)}km/h \xB7 ${o.sessionSeconds}s`, s * 0.5, r.subY, { size: 16, color: h.textDim, align: "center", blur: 2 });
          for (let a of e) R(t, a.rect, a.label, { color: a.color, size: 24 });
          p(t, "\u957F\u6309\u53F3\u4E0A\u89D2\u5706\u70B9 1.2 \u79D2\u6253\u5F00\u6CBB\u7597\u5E08\u9762\u677F \xB7 \u8FD4\u56DE\u952E\u5728\u5DE6\u4E0A\u89D2", s * 0.5, l - 32, { size: 16, color: "rgba(234,246,255,0.35)", align: "center", blur: 0 });
        }
        renderBle(t, e, i) {
          let { width: s, height: l } = this.view;
          if (t.save(), t.fillStyle = "rgba(3,0,12,0.86)", t.fillRect(0, 0, s, l), t.restore(), p(t, "\u641C\u7D22 WT9011 \u59FF\u6001\u4F20\u611F\u5668", s * 0.5, l * 0.13, { size: 38, color: h.neonBlue, align: "center", blur: 18 }), p(t, i.message || "\u8BF7\u786E\u4FDD\u4F20\u611F\u5668\u5DF2\u4E0A\u7535\u5E76\u4F69\u6234\u4E8E\u814B\u4E0B\u6700\u9AD8\u70B9", s * 0.5, l * 0.13 + 34, { size: 18, color: h.textDim, align: "center", blur: 4 }), i.hint) {
            let o = String(i.hint), r = 34, a = [];
            for (let n = 0; n < o.length; n += r) a.push(o.slice(n, n + r));
            a.slice(0, 3).forEach((n, c) => {
              p(t, n, s * 0.5, l * 0.13 + 64 + c * 22, { size: 17, color: h.warn, align: "center", blur: 4 });
            });
          }
          p(t, `\u5171\u53D1\u73B0 ${i.total || 0} \u4E2A\u8BBE\u5907 \xB7 \u5339\u914D WT \u8BBE\u5907 ${i.matched || 0} \u4E2A`, s * 0.5, l * 0.13 + 64 + (i.hint ? 66 : 0), { size: 16, color: h.neonGreen, align: "center", blur: 4 });
          for (let o of e) {
            if (o.id === "none") {
              p(t, "\u672A\u53D1\u73B0\u8BBE\u5907\uFF0C\u8BF7\u70B9\u51FB\u91CD\u65B0\u641C\u7D22", s * 0.5, l * 0.36, { size: 22, color: h.neonYellow, align: "center", blur: 8 });
              continue;
            }
            R(t, o.rect, o.label, { color: o.color, size: 20 });
          }
        }
        renderCalibrate(t, e, i) {
          let { width: s, height: l } = this.view;
          t.save(), t.fillStyle = "rgba(3,0,12,0.86)", t.fillRect(0, 0, s, l), t.restore(), p(t, "\u59FF\u6001\u4E2D\u7ACB\u4F4D\u6807\u5B9A", s * 0.5, l * 0.18, { size: 40, color: h.neonGreen, align: "center", blur: 18 }), it(t, s * 0.5, l * 0.4, 70, i.progress || 0, { color: h.neonGreen, width: 12, label: i.calibrating ? `${Math.ceil(3 - (i.progress || 0) * 3)}s` : "READY", sub: i.calibrating ? "\u8BF7\u4FDD\u6301\u8EAF\u5E72\u653E\u677E\u76F4\u7ACB" : "\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u5F00\u59CB" }), p(t, "\u6807\u5B9A\u540E\u7CFB\u7EDF\u4EE5\u5F53\u524D\u59FF\u6001\u4E3A\u4E2D\u7ACB\u57FA\u51C6\uFF0C\u503E\u659C\u91CF\u4EE5\u6B64\u4E3A 0 \u70B9\u8BA1\u7B97", s * 0.5, l * 0.52, { size: 17, color: h.textDim, align: "center", blur: 2 });
          for (let o of e) R(t, o.rect, o.label, { color: o.color, size: 22 });
        }
        renderPause(t, e, i) {
          let { width: s, height: l } = this.view;
          t.save(), t.fillStyle = "rgba(3,0,12,0.62)", t.fillRect(0, 0, s, l), t.restore(), p(t, "\u8BAD\u7EC3\u6682\u505C", s * 0.5, l * 0.3, { size: 46, color: h.neonBlue, align: "center", blur: 20 });
          for (let o of e) R(t, o.rect, o.label, { color: o.color, size: 24 });
        }
        renderResult(t, e, i) {
          let { width: s, height: l } = this.view, o = i.result || {};
          t.save(), t.fillStyle = "rgba(3,0,12,0.88)", t.fillRect(0, 0, s, l), t.restore(), p(t, "\u8BAD\u7EC3\u7ED3\u7B97", s * 0.5, 74, { size: 42, color: h.neonPink, align: "center", blur: 20 }), p(t, `${o.levelName || ""} \xB7 \u7528\u65F6 ${o.duration || 0}s`, s * 0.5, 106, { size: 18, color: h.textDim, align: "center", blur: 2 }), it(t, s * 0.5 - 330, 240, 78, m((o.accuracy || 0) / 100, 0, 1), { color: h.neonGreen, width: 12, label: `${o.accuracy || 0}%`, sub: "\u8EB2\u907F\u6210\u529F\u7387" }), p(t, String(o.score || 0), s * 0.5 - 120, 220, { size: 66, color: h.neonPink, align: "center", blur: 22 }), p(t, `\u672C\u6B21\u6392\u540D\u7B2C ${o.rank || "-"} \u540D`, s * 0.5 - 120, 258, { size: 20, color: h.neonYellow, align: "center", blur: 8 });
          let r = [["\u6700\u9AD8 COMBO", o.combo || 0], ["PERFECT \u6B21\u6570", o.perfect || 0], ["\u78B0\u649E\u6B21\u6570", o.hits || 0], ["\u80FD\u91CF\u73AF", o.rings || 0], ["\u91CC\u7A0B (km)", o.distance || 0], ["\u5361\u8DEF\u91CC (kcal)", o.calories || 0], ["\u7A33\u5B9A\u65F6\u957F (s)", o.stableTime || 0]], a = 190, n = 74;
          r.forEach((c, d) => {
            let f = d % 3, g = Math.floor(d / 3), y = s * 0.5 + 40 + f * (a + 14), v = 150 + g * (n + 14);
            H2(t, y, v, a, n, { stroke: h.neonBlue, r: 12, blur: 8 }), p(t, String(c[1]), y + a / 2, v + 40, { size: 26, color: h.neonBlue, align: "center", blur: 8 }), p(t, c[0], y + a / 2, v + 62, { size: 14, color: h.textDim, align: "center", blur: 2 });
          }), this.drawCurve(t, s * 0.5 - 320, 414, 640, 116, o.history || []);
          for (let c of e) R(t, c.rect, c.label, { color: c.color, size: 22 });
        }
        drawCurve(t, e, i, s, l, o) {
          if (t.save(), t.fillStyle = "rgba(10,3,30,0.6)", N(t, e, i, s, l, 12), t.fill(), t.strokeStyle = "rgba(0,229,255,0.25)", t.lineWidth = 1.5, t.stroke(), o.length < 2) {
            p(t, "\u5F97\u5206\u66F2\u7EBF\uFF08\u6570\u636E\u4E0D\u8DB3\uFF09", e + s / 2, i + l / 2, { size: 16, color: h.textDim, align: "center", blur: 2 }), t.restore();
            return;
          }
          let r = Math.max.apply(null, o.map((a) => a.score)) || 1;
          t.strokeStyle = h.neonGreen, t.lineWidth = 2.5, t.shadowBlur = 12, t.shadowColor = h.neonGreen, t.beginPath(), o.forEach((a, n) => {
            let c = e + 12 + (s - 24) * (n / (o.length - 1)), d = i + l - 14 - (l - 28) * (a.score / r);
            n === 0 ? t.moveTo(c, d) : t.lineTo(c, d);
          }), t.stroke(), t.restore(), p(t, "\u5F97\u5206\u66F2\u7EBF", e + 12, i + 22, { size: 15, color: h.textDim, blur: 2 });
        }
        renderPrivacy(t, e) {
          let { width: i, height: s } = this.view;
          t.save(), t.fillStyle = "rgba(2,0,10,0.86)", t.fillRect(0, 0, i, s), t.restore();
          let l = 760, o = 360, r = (i - l) / 2, a = s * 0.22;
          H2(t, r, a, l, o, { stroke: h.neonGreen, fill: "rgba(8,2,24,0.96)", r: 18, blur: 26 }), p(t, "\u9690\u79C1\u6388\u6743", r + 32, a + 54, { size: 32, color: h.neonGreen, blur: 16 }), p(t, "PRIVACY AUTHORIZATION", r + l - 32, a + 54, { size: 16, color: h.textDim, align: "right", blur: 4 }), ["\u4E3A\u8FDE\u63A5 WT9011 \u59FF\u6001\u4F20\u611F\u5668\u5E76\u9A71\u52A8\u4F53\u611F\u8D5B\u8F66\uFF0C\u672C\u6E38\u620F\u9700\u8981\u4F7F\u7528\uFF1A", "\xB7 \u84DD\u7259\uFF08\u641C\u7D22\u4E0E\u8FDE\u63A5\u4F20\u611F\u5668\uFF0C\u8BFB\u53D6\u4E09\u8F74\u52A0\u901F\u5EA6 / \u89D2\u901F\u5EA6 / \u59FF\u6001\u89D2\uFF09", "\xB7 \u8BBE\u5907\u4FE1\u606F\uFF08\u533A\u5206\u4E0D\u540C\u4F20\u611F\u5668\u8BBE\u5907\uFF09", "", "\u6570\u636E\u4EC5\u5728\u672C\u5730\u7528\u4E8E\u5B9E\u65F6\u59FF\u6001\u89E3\u7B97\u4E0E\u8BAD\u7EC3\u8BC4\u5206\uFF0C\u4E0D\u4F1A\u4E0A\u4F20\u6216\u7528\u4E8E\u5176\u4ED6\u7528\u9014\u3002", "\u540C\u610F\u540E\u5C06\u7ACB\u5373\u641C\u7D22\u9644\u8FD1\u7684 BLE \u8BBE\u5907\u3002"].forEach((n, c) => {
            p(t, n, r + 32, a + 100 + c * 28, { size: 18, color: c >= 4 ? h.textDim : h.text, blur: 2 });
          });
          for (let n of e) R(t, n.rect, n.label, { color: n.color, size: 21 });
          p(t, "\u5982\u672A\u5728 mp \u540E\u53F0\u58F0\u660E\u9690\u79C1\u63A5\u53E3\uFF0C\u4ECD\u4F1A\u8FD4\u56DE errno 1026\uFF0C\u9700\u5148\u5230\u540E\u53F0\u914D\u7F6E", i * 0.5, a + o + 30, { size: 16, color: h.neonYellow, align: "center", blur: 6 });
        }
        renderBoard(t, e, i) {
          let { width: s, height: l } = this.view;
          t.save(), t.fillStyle = "rgba(3,0,12,0.9)", t.fillRect(0, 0, s, l), t.restore(), p(t, "\u5EB7\u590D\u8BAD\u7EC3\u6392\u884C\u699C", s * 0.5, 76, { size: 40, color: h.neonYellow, align: "center", blur: 18 }), p(t, "\u672C\u5730\u6210\u7EE9 + \u5728\u7EBF\u699C\uFF08\u914D\u7F6E LEADERBOARD_URL \u540E\u81EA\u52A8\u540C\u6B65\uFF09", s * 0.5, 108, { size: 16, color: h.textDim, align: "center", blur: 2 });
          let o = i.board || [], r = 52, a = 140;
          o.forEach((n, c) => {
            let d = a + c * r, f = n.name === i.me;
            H2(t, s * 0.5 - 380, d, 760, r - 8, { stroke: f ? h.neonPink : h.neonBlue, r: 10, blur: f ? 16 : 6 });
            let g = c === 0 ? h.neonYellow : c === 1 ? "#dfe9ff" : c === 2 ? "#ffb27a" : h.textDim;
            p(t, `#${c + 1}`, s * 0.5 - 350, d + 30, { size: 24, color: g, blur: 6 }), p(t, n.name || "\u533F\u540D", s * 0.5 - 280, d + 30, { size: 20, color: f ? h.neonPink : h.text, blur: 4 }), p(t, `L${n.level || "-"}`, s * 0.5 - 60, d + 30, { size: 18, color: h.neonPurple, align: "center", blur: 4 }), p(t, String(n.score || 0), s * 0.5 + 350, d + 30, { size: 22, color: h.neonGreen, align: "right", blur: 6 });
          });
          for (let n of e) R(t, n.rect, n.label, { color: n.color, size: 22 });
        }
      };
      var ie = [{ key: "rollSensitivity", label: "\u5DE6\u53F3\u8F6C\u5411\u654F\u611F\u5EA6", min: 0.2, max: 3, fmt: (t) => t.toFixed(2) + "\xD7" }, { key: "pitchSensitivity", label: "\u524D\u540E\u6CB9\u95E8\u654F\u611F\u5EA6", min: 0.2, max: 3, fmt: (t) => t.toFixed(2) + "\xD7" }, { key: "deadZone", label: "\u89E6\u53D1\u6B7B\u533A", min: 0, max: 10, fmt: (t) => t.toFixed(1) + "\xB0" }, { key: "maxAngle", label: "\u6EE1\u8235/\u6EE1\u6CB9\u95E8\u89E6\u53D1\u89D2", min: 8, max: 40, fmt: (t) => t.toFixed(1) + "\xB0" }, { key: "brakeAngle", label: "\u540E\u503E\u5239\u8F66\u89E6\u53D1\u89D2", min: 3, max: 20, fmt: (t) => t.toFixed(1) + "\xB0" }, { key: "smoothing", label: "\u6EE4\u6CE2\u5E73\u6ED1\u7CFB\u6570\uFF08\u9632\u6296\uFF09", min: 0, max: 0.95, fmt: (t) => t.toFixed(2) }, { key: "assist", label: "\u56DE\u6B63\u8F85\u52A9\u5F3A\u5EA6", min: 0, max: 1, fmt: (t) => t.toFixed(2) }, { key: "sessionSeconds", label: "\u5355\u6B21\u8BAD\u7EC3\u65F6\u957F", min: 60, max: 600, step: 30, fmt: (t) => Math.round(t) + "s" }, { key: "patientWeight", label: "\u60A3\u8005\u4F53\u91CD\uFF08\u5361\u8DEF\u91CC\u4F30\u7B97\uFF09", min: 30, max: 120, step: 1, fmt: (t) => Math.round(t) + "kg" }];
      var se = [{ key: "invertRoll", label: "\u53CD\u8F6C\u5DE6\u53F3" }, { key: "invertPitch", label: "\u53CD\u8F6C\u524D\u540E" }, { key: "vibration", label: "\u78B0\u649E\u9707\u52A8" }];
      var re = class {
        constructor(t, e, i = {}) {
          this.view = t, this.motion = e, this.cb = i, this.visible = false, this.dragging = null, this.layout();
        }
        layout() {
          let { width: t, height: e } = this.view, i = Math.min(760, t - 80), s = (t - i) / 2, l = Math.max(20, (e - 690) / 2);
          this.rect = { x: s, y: l, w: i, h: 690 };
          let o = [], r = l + 62;
          for (let d of ie) o.push({ type: "slider", def: d, rect: { x: s + 30, y: r, w: i - 60, h: 38 } }), r += 46;
          r += 4;
          let a = (i - 60 - 48) / 5;
          for (let d = 1; d <= 5; d++) o.push({ type: "difficulty", value: d, rect: { x: s + 30 + (d - 1) * (a + 12), y: r, w: a, h: 44 } });
          r += 56;
          let n = (i - 60 - 24) / 3;
          se.forEach((d, f) => {
            o.push({ type: "toggle", def: d, rect: { x: s + 30 + f * (n + 12), y: r, w: n, h: 40 } });
          }), r += 54;
          let c = (i - 60 - 36) / 4;
          [{ id: "recalibrate", label: "\u91CD\u65B0\u6807\u5B9A" }, { id: "reset", label: "\u6062\u590D\u9ED8\u8BA4" }, { id: "clearBoard", label: "\u6E05\u7A7A\u699C\u5355" }, { id: "close", label: "\u5173\u95ED\u9762\u677F" }].forEach((d, f) => {
            o.push({ type: "action", id: d.id, label: d.label, rect: { x: s + 30 + f * (c + 12), y: r, w: c, h: 44 } });
          }), this.rows = o, this.hotZone = { x: t - 74, y: 18, w: 56, h: 56 };
        }
        open() {
          this.visible = true;
        }
        close() {
          this.visible = false, this.dragging = null;
        }
        toggle() {
          this.visible = !this.visible;
        }
        onDown(t, e) {
          if (!this.visible) return false;
          for (let i of this.rows) if (vt(i.rect, t, e)) {
            if (i.type === "slider") return this.dragging = i, this.applySlider(i, t), true;
            if (i.type === "difficulty") return this.motion.setParams({ difficulty: i.value }), this.cb.onDifficulty && this.cb.onDifficulty(i.value), true;
            if (i.type === "toggle") {
              let s = {};
              return s[i.def.key] = !this.motion.params[i.def.key], this.motion.setParams(s), true;
            }
            if (i.type === "action") return this.handleAction(i.id), true;
          }
          return false;
        }
        onMove(t, e) {
          return this.dragging ? (this.applySlider(this.dragging, t), true) : false;
        }
        onUp() {
          this.dragging = null;
        }
        applySlider(t, e) {
          let i = t.def, s = Qt(t.rect, e, i.min, i.max);
          i.step && (s = Math.round(s / i.step) * i.step), s = m(s, i.min, i.max);
          let l = {};
          l[i.key] = s, this.motion.setParams(l), i.key === "sessionSeconds" && this.cb.onSession && this.cb.onSession(s);
        }
        handleAction(t) {
          t === "reset" ? this.motion.resetParams() : t === "recalibrate" && this.cb.onCalibrate ? this.cb.onCalibrate() : t === "clearBoard" && this.cb.onClearBoard ? this.cb.onClearBoard() : t === "close" && this.close();
        }
        render(t) {
          let { width: e, height: i } = this.view;
          t.save(), t.fillStyle = "rgba(3,0,12,0.72)", t.fillRect(0, 0, e, i), t.restore();
          let s = this.rect;
          H2(t, s.x, s.y, s.w, s.h, { stroke: h.neonPurple, fill: "rgba(10,2,30,0.94)", blur: 26 }), p(t, "\u6CBB\u7597\u5E08\u8C03\u53C2\u9762\u677F", s.x + 30, s.y + 42, { size: 28, color: h.neonPurple, blur: 14 }), p(t, "THERAPIST CONTROL \xB7 \u5B9E\u65F6\u751F\u6548", s.x + s.w - 30, s.y + 42, { size: 16, color: h.textDim, align: "right", blur: 4 });
          for (let r of this.rows) if (r.type === "slider") Jt(t, r.rect, this.motion.params[r.def.key], r.def.min, r.def.max, { color: h.neonGreen, label: r.def.label, fmt: r.def.fmt });
          else if (r.type === "difficulty") {
            let a = this.motion.params.difficulty === r.value;
            R(t, r.rect, `L${r.value}`, { color: a ? h.neonGreen : h.neonBlue, active: a, size: 20, filled: a });
          } else if (r.type === "toggle") {
            let a = !!this.motion.params[r.def.key];
            R(t, r.rect, r.def.label + (a ? " \xB7 ON" : " \xB7 OFF"), { color: a ? h.neonGreen : h.textDim, active: a, size: 18 });
          } else r.type === "action" && R(t, r.rect, r.label, { color: h.neonPink, size: 20 });
          let l = this.motion.offset, o = s.y + s.h - 26;
          p(t, `\u5B9E\u65F6\uFF1ARoll ${l.roll.toFixed(1)}\xB0  Pitch ${l.pitch.toFixed(1)}\xB0  \u6296\u52A8 ${(this.motion.jitter * 100).toFixed(0)}%  \u7A33\u5B9A\u5EA6 ${(this.motion.stability * 100).toFixed(0)}%`, s.x + 30, o, { size: 17, color: h.neonBlue, blur: 6 });
        }
        renderHotZone(t, e) {
          let i = this.hotZone;
          t.save(), t.globalAlpha = 0.35 + (e ? 0.5 : 0), t.strokeStyle = h.neonPurple, t.lineWidth = 2, t.beginPath(), t.arc(i.x + i.w / 2, i.y + i.h / 2, i.w * 0.36, 0, Math.PI * 2), t.stroke(), t.beginPath(), t.arc(i.x + i.w / 2, i.y + i.h / 2, i.w * 0.18, 0, Math.PI * 2), t.stroke(), t.restore();
        }
      };
      var mt = ["\u5EB7\u590D\u8005A", "\u5EB7\u590D\u8005B", "\u5EB7\u590D\u8005C", "NeonRider", "MotionX", "\u5E73\u8861\u5927\u5E08", "WT-01", "\u95EA\u7535\u5C0F\u6797"];
      var le = class extends Q {
        constructor() {
          super(), this.reset(), this.localBoard = et(G.leaderboard, []), this.onlineBoard = this.mockOnline(), this.patientName = et(G.patient, { name: "\u6211" }).name;
        }
        reset() {
          this.score = 0, this.combo = 0, this.maxCombo = 0, this.perfectCount = 0, this.hitCount = 0, this.ringCount = 0, this.distance = 0, this.elapsed = 0, this.stableTime = 0, this.calories = 0, this.accuracy = 1, this.history = [], this.rank = 1;
        }
        start(t) {
          this.reset(), this.diff = t;
        }
        update(t, e) {
          this.elapsed += t, this.distance = e.distance, this.score += e.dz / 1e3 * 1, e.stability > 0.7 && (this.stableTime += t, this.score += 8 * t * (e.stability - 0.7) / 0.3);
          let i = 3 + e.speedPct * 3.5;
          this.calories += i * (e.weight || 60) * (t / 3600);
          let s = this.perfectCount + this.hitCount;
          this.accuracy = s === 0 ? 1 : m(this.perfectCount / s, 0, 1), this.history.length < Math.floor(this.elapsed) && this.history.push({ t: Math.round(this.elapsed), score: Math.round(this.score), stability: e.stability });
        }
        addPerfect(t, e) {
          this.perfectCount++, this.combo = e, this.maxCombo = Math.max(this.maxCombo, e);
          let i = 60 + 90 * m(1 - t / 0.55, 0, 1);
          return this.score += i * (1 + Math.min(e, 20) * 0.08), Math.round(i);
        }
        addRing() {
          return this.ringCount++, this.score += 150, 150;
        }
        addHit() {
          return this.hitCount++, this.combo = 0, this.score = Math.max(0, this.score - 200), -200;
        }
        breakCombo() {
          this.combo = 0;
        }
        get finalScore() {
          return Math.round(this.score);
        }
        finish(t) {
          let e = { name: this.patientName, score: this.finalScore, level: t.level, levelName: t.name, combo: this.maxCombo, perfect: this.perfectCount, hits: this.hitCount, rings: this.ringCount, accuracy: Math.round(this.accuracy * 100), calories: Math.round(this.calories), distance: Math.round(this.distance / 1e3), stableTime: Math.round(this.stableTime), duration: Math.round(this.elapsed), date: Date.now(), history: this.history.slice(-120) };
          return e.rank = this.submit(e), this.lastResult = e, e;
        }
        submit(t) {
          this.localBoard.push(t), this.localBoard.sort((i, s) => s.score - i.score), this.localBoard = this.localBoard.slice(0, 50), K(G.leaderboard, this.localBoard), dt && typeof wx != "undefined" && wx.request && wx.request({ url: dt, method: "POST", data: t, success: (i) => {
            i && i.data && Array.isArray(i.data.list) && (this.onlineBoard = i.data.list, this.emit("board", this.onlineBoard));
          }, fail: () => {
          } });
          let e = this.localBoard.findIndex((i) => i === t) + 1;
          return this.rank = e > 0 ? e : this.localBoard.length, this.rank;
        }
        mockOnline() {
          let t = [], e = [18200, 15600, 13100, 11200, 9600, 8100, 6900, 5400];
          for (let i = 0; i < e.length; i++) t.push({ name: mt[i % mt.length], score: e[i], level: i % 5 + 1, accuracy: 92 - i * 4, date: Date.now() - i * 864e5 });
          return t;
        }
        getMergedBoard(t = 10) {
          let e = /* @__PURE__ */ new Map(), i = (s) => {
            let l = `${s.name}_${s.score}`;
            e.has(l) || e.set(l, s);
          };
          return this.localBoard.slice(0, 20).forEach(i), this.onlineBoard.forEach(i), Array.from(e.values()).sort((s, l) => l.score - s.score).slice(0, t);
        }
        estimateRank() {
          let t = this.getMergedBoard(50), e = 1;
          for (let i of t) i.score > this.score && e++;
          return e;
        }
        setName(t) {
          this.patientName = t || "\u6211", K(G.patient, { name: this.patientName });
        }
        clearLocal() {
          this.localBoard = [], Ut(G.leaderboard);
        }
      };
      var oe = class extends Q {
        constructor() {
          super(), this.ctx = null, this.master = null, this.enabled = true, this.musicEnabled = true, this.ready = false, this.bgmTimer = null, this.bgmStep = 0, this.sources = {};
        }
        init() {
          if (typeof wx == "undefined" || !wx.createWebAudioContext) return false;
          try {
            return this.ctx = wx.createWebAudioContext(), this.master = this.ctx.createGain(), this.master.gain.value = 0.35, this.master.connect(this.ctx.destination), this.ready = true, true;
          } catch (t) {
            return this.ready = false, false;
          }
        }
        register(t, e) {
          if (!(typeof wx == "undefined" || !wx.createInnerAudioContext)) try {
            let i = wx.createInnerAudioContext();
            i.src = e, this.sources[t] = i;
          } catch (i) {
          }
        }
        playFile(t, e) {
          let i = this.sources[t];
          if (i) try {
            return i.stop(), i.play(), true;
          } catch (s) {
          }
          return e && this.play(e), false;
        }
        tone({ freq: t = 440, to: e = null, dur: i = 0.18, type: s = "square", gain: l = 0.25, delay: o = 0 }) {
          if (!this.ready || !this.enabled) return;
          let r = this.ctx, a = r.currentTime + o, n = r.createOscillator(), c = r.createGain();
          n.type = s, n.frequency.setValueAtTime(t, a), e !== null && n.frequency.exponentialRampToValueAtTime(Math.max(20, e), a + i), c.gain.setValueAtTime(1e-4, a), c.gain.exponentialRampToValueAtTime(l, a + 0.012), c.gain.exponentialRampToValueAtTime(1e-4, a + i), n.connect(c), c.connect(this.master), n.start(a), n.stop(a + i + 0.02);
        }
        noise({ dur: t = 0.3, gain: e = 0.3 }) {
          if (!this.ready || !this.enabled) return;
          let i = this.ctx, s = Math.floor(i.sampleRate * t), l = i.createBuffer(1, s, i.sampleRate), o = l.getChannelData(0);
          for (let n = 0; n < s; n++) o[n] = (Math.random() * 2 - 1) * (1 - n / s);
          let r = i.createBufferSource();
          r.buffer = l;
          let a = i.createGain();
          a.gain.value = e, r.connect(a), a.connect(this.master), r.start();
        }
        play(t) {
          switch (t) {
            case "perfect":
              this.tone({ freq: 660, to: 990, dur: 0.12, type: "triangle", gain: 0.22 }), this.tone({ freq: 880, to: 1320, dur: 0.16, type: "triangle", gain: 0.2, delay: 0.08 }), this.tone({ freq: 1320, to: 1760, dur: 0.22, type: "square", gain: 0.12, delay: 0.16 });
              break;
            case "ring":
              this.tone({ freq: 990, to: 1480, dur: 0.18, type: "sine", gain: 0.25 }), this.tone({ freq: 1480, to: 1980, dur: 0.2, type: "sine", gain: 0.16, delay: 0.06 });
              break;
            case "crash":
              this.noise({ dur: 0.42, gain: 0.35 }), this.tone({ freq: 180, to: 60, dur: 0.35, type: "sawtooth", gain: 0.22 });
              break;
            case "nitro":
              this.tone({ freq: 220, to: 660, dur: 0.35, type: "sawtooth", gain: 0.14 });
              break;
            case "ui":
              this.tone({ freq: 720, to: 900, dur: 0.08, type: "square", gain: 0.16 });
              break;
            case "count":
              this.tone({ freq: 520, dur: 0.14, type: "square", gain: 0.2 });
              break;
            case "finish":
              [660, 880, 1100, 1320].forEach((e, i) => this.tone({ freq: e, dur: 0.22, type: "triangle", gain: 0.2, delay: i * 0.12 }));
              break;
            default:
              break;
          }
        }
        startBgm() {
          if (!this.ready || !this.musicEnabled || this.bgmTimer) return;
          let t = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33], e = [110, 110, 146.83, 146.83, 98, 98, 130.81, 130.81], i = 240, s = () => {
            let l = this.bgmStep % 16, o = t[l * 3 % t.length];
            this.tone({ freq: o, dur: 0.16, type: "square", gain: 0.06 }), l % 4 === 0 && this.tone({ freq: e[l / 4 % e.length], dur: 0.3, type: "sawtooth", gain: 0.09 }), l % 8 === 4 && this.tone({ freq: 1320, dur: 0.08, type: "triangle", gain: 0.04 }), this.bgmStep++;
          };
          s(), this.bgmTimer = setInterval(s, i);
        }
        stopBgm() {
          this.bgmTimer && (clearInterval(this.bgmTimer), this.bgmTimer = null);
        }
        setEnabled(t) {
          this.enabled = t, this.master && (this.master.gain.value = t ? 0.35 : 0), t || this.stopBgm();
        }
        setMusicEnabled(t) {
          this.musicEnabled = t, t ? this.startBgm() : this.stopBgm();
        }
      };
      var j = { left: ["left", "a", "65", "37"], right: ["right", "d", "68", "39"], forward: ["up", "w", "87", "38"], back: ["down", "s", "83", "40"] };
      var ae = class extends Q {
        constructor() {
          super(), this.keys = {}, this.touch = { x: 0, y: 0, active: false }, this.enabled = true, this.bind();
        }
        bind() {
          typeof wx != "undefined" && (typeof wx.onKeyDown == "function" && wx.onKeyDown((t) => {
            let e = this.normalize(t);
            this.keys[e] = true, this.emit("key", e);
          }), typeof wx.onKeyUp == "function" && wx.onKeyUp((t) => {
            this.keys[this.normalize(t)] = false;
          }));
        }
        normalize(t) {
          let e = t && (t.key || t.code || t.keyCode) || "";
          return String(e).toLowerCase();
        }
        isDown(t) {
          return t.some((e) => this.keys[e]);
        }
        get axis() {
          let t = 0, e = 0;
          return this.isDown(j.left) && (t -= 1), this.isDown(j.right) && (t += 1), this.isDown(j.forward) && (e += 1), this.isDown(j.back) && (e -= 1), this.touch.active && (Math.abs(this.touch.x) > Math.abs(t) && (t = this.touch.x), e = this.touch.y), { x: t, y: e };
        }
        setTouch(t, e, i) {
          this.touch.x = Math.max(-1, Math.min(1, t)), this.touch.y = Math.max(-1, Math.min(1, e)), this.touch.active = i;
        }
        endTouch() {
          this.touch.active = false;
        }
      };
      var bt = 0.17;
      var ne = class {
        constructor(t) {
          this.canvas = t, this.ctx = t.getContext("2d"), this.view = { width: z.designWidth, height: z.designHeight }, this.ble = new Ht(), this.motion = new Wt(this.ble), this.audio = new oe(), this.score = new le(), this.fx = new Kt(this.view), this.bg = new Vt(this.view), this.road = new Zt(this.view), this.car = new Xt(this.view), this.hud = new te(this.view), this.screens = new ee(this.view), this.input = new ae(), this.therapist = new re(this.view, this.motion, { onDifficulty: (e) => this.setDifficulty(e), onCalibrate: () => this.startCalibration(), onSession: () => {
          }, onClearBoard: () => this.score.clearLocal() }), this.state = "menu", this.diff = tt[m(Math.round(this.motion.params.difficulty) || 1, 1, 5)], this.player = new qt(), this.buildTrack(), this.countdown = 0, this.comboTimer = 0, this.stableStreak = 0, this.timeLeft = this.motion.params.sessionSeconds, this.hint = "", this.lastEvents = [], this.calibProgress = 0, this.calibrating = false, this.hotPressTimer = 0, this.hotPressing = false, this.pointerId = null, this.showPrivacy = false, this.privacyResolve = null, this.audio.init(), this.resize(), this.bindEvents();
        }
        resize() {
          let t = this.canvas, e = z.designWidth, i = z.designHeight;
          if (typeof wx != "undefined" && wx.getSystemInfoSync) try {
            let s = wx.getSystemInfoSync(), l = Math.min(s.pixelRatio || 1, z.maxDpr);
            e = Math.max(s.windowWidth, s.windowHeight), i = Math.min(s.windowWidth, s.windowHeight), t.width = Math.round(e * l), t.height = Math.round(i * l), this.dpr = l;
          } catch (s) {
          }
          else t.width = e, t.height = i, this.dpr = 1;
          this.canvasSize = { w: t.width, h: t.height }, this.scale = Math.min(t.width / z.designWidth, t.height / z.designHeight), this.offsetX = (t.width - z.designWidth * this.scale) / 2, this.offsetY = (t.height - z.designHeight * this.scale) / 2;
        }
        bindEvents() {
          typeof wx != "undefined" && (wx.onTouchStart && wx.onTouchStart((t) => {
            let e = t.touches && t.touches[0];
            if (!e) return;
            let i = this.toDesign(e.clientX, e.clientY);
            this.onPointerDown(i.x, i.y);
          }), wx.onTouchMove && wx.onTouchMove((t) => {
            let e = t.touches && t.touches[0];
            if (!e) return;
            let i = this.toDesign(e.clientX, e.clientY);
            this.onPointerMove(i.x, i.y);
          }), wx.onTouchEnd && wx.onTouchEnd(() => this.onPointerUp()), this.input.on("key", (t) => this.onKey(t)), wx.onNeedPrivacyAuthorization && wx.onNeedPrivacyAuthorization((t) => {
            this.privacyResolve = t, this.showPrivacy = true;
          }), this.ble.on("privacy", () => {
            this.showPrivacy = true;
          }));
        }
        toDesign(t, e) {
          let i = this.dpr || 1;
          return { x: (t * i - this.offsetX) / this.scale, y: (e * i - this.offsetY) / this.scale };
        }
        buildTrack() {
          this.track = new Yt(this.diff), this.obstacles = new $t(this.track, this.diff), this.player.reset(), this.player.maxSpeed = this.diff.maxSpeed;
        }
        setDifficulty(t) {
          let e = Math.round(t);
          isFinite(e) || (e = this.diff && this.diff.level || 1), e = m(e, 1, 5), this.diff = tt[e], this.motion.setParams({ difficulty: this.diff.level }), this.buildTrack();
        }
        setState(t) {
          this.state = t, this.hint = "", t === "play" && this.audio.musicEnabled && this.audio.startBgm(), (t === "menu" || t === "result") && this.audio.stopBgm();
        }
        startSession() {
          this.setDifficulty(this.motion.params.difficulty), this.score.start(this.diff), this.obstacles.reset(), this.player.reset(), this.player.speed = this.diff.maxSpeed * 0.3, this.motion.reset(), this.fx.reset(), this.countdown = 3.2, this.timeLeft = this.motion.params.sessionSeconds, this.stableStreak = 0, this.comboTimer = 0, this.setState("play"), this.hint = this.ble.isMock ? "\u6A21\u62DF\u6A21\u5F0F\uFF1A\u624B\u6307\u62D6\u52A8\u6A21\u62DF\u8EAF\u5E72\u4F4D\u79FB" : "\u8EAF\u5E72\u524D\u503E\u52A0\u901F \xB7 \u5DE6\u53F3\u4FA7\u5C48\u8F6C\u5411";
        }
        finishSession() {
          let t = this.score.finish(this.diff);
          this.audio.play("finish"), this.fx.reset(), this.setState("result"), this.result = t;
        }
        startCalibration() {
          this.setState("calibrate"), this.calibrating = false, this.calibProgress = 0, this.motion.startCalibration();
        }
        onKey(t) {
          if (t === "t") {
            this.therapist.toggle();
            return;
          }
          if (t === "p" || t === "escape") {
            this.state === "play" ? this.setState("pause") : this.state === "pause" && this.setState("play");
            return;
          }
          if (t === "r" && (this.state === "result" || this.state === "pause")) {
            this.startSession();
            return;
          }
          if (t === "b" && this.state === "menu") {
            this.setState("ble"), this.ble.startScan();
            return;
          }
          (t === "enter" || t === " ") && (this.state === "menu" ? this.startSession() : this.state === "result" && this.startSession());
        }
        onPointerDown(t, e) {
          if (this.showPrivacy) {
            let l = this.screens.hitTest("privacy", t, e);
            l && this.onUIAction(l);
            return;
          }
          if (this.therapist.visible) {
            if (this.therapist.onDown(t, e)) return;
            this.therapist.close();
            return;
          }
          let i = this.therapist.hotZone;
          if (this.state === "menu" && t >= i.x && t <= i.x + i.w && e >= i.y && e <= i.y + i.h) {
            this.hotPressing = true, this.hotPressTimer = 0;
            return;
          }
          if (this.state === "play") {
            if (this.ble.isMock) {
              let l = t / this.view.width * 2 - 1, o = 1 - e / this.view.height * 2;
              this.input.setTouch(m(l * 1.6, -1, 1), m(o * 1.2 - 0.2, -1, 1), true);
            }
            return;
          }
          let s = this.screens.hitTest(this.state, t, e);
          s && this.onUIAction(s);
        }
        onPointerMove(t, e) {
          if (this.therapist.visible) {
            this.therapist.onMove(t, e);
            return;
          }
          if (this.state === "play" && this.ble.isMock) {
            let i = t / this.view.width * 2 - 1, s = 1 - e / this.view.height * 2;
            this.input.setTouch(m(i * 1.6, -1, 1), m(s * 1.2 - 0.2, -1, 1), true);
          }
        }
        onPointerUp() {
          this.input.endTouch(), this.therapist.onUp(), this.hotPressing = false;
        }
        onUIAction(t) {
          if (this.audio.play("ui"), t === "start" || t === "again") {
            this.startSession();
            return;
          }
          if (t === "mock") {
            this.ble.enableMock("Debug \u6A21\u62DF\u6A21\u5F0F\uFF1A\u952E\u76D8/\u89E6\u6478\u9A71\u52A8"), this.setState("menu");
            return;
          }
          if (t === "ble") {
            this.setState("ble"), this.ble.startScan();
            return;
          }
          if (t === "rescan") {
            this.ble.startScan();
            return;
          }
          if (t === "all") {
            this.ble.showAll = !this.ble.showAll;
            return;
          }
          if (t === "privacyAgree") {
            this.agreePrivacy();
            return;
          }
          if (t === "privacyReject") {
            this.rejectPrivacy();
            return;
          }
          if (t === "privacyOpen") {
            typeof wx != "undefined" && wx.openPrivacyContract && wx.openPrivacyContract({ fail: () => {
            } });
            return;
          }
          if (t === "back" || t === "menu" || t === "quit" || t === "skip") {
            this.setState("menu");
            return;
          }
          if (t === "board") {
            this.setState("leaderboard");
            return;
          }
          if (t === "calibrate") {
            this.startCalibration();
            return;
          }
          if (t === "doCalibrate") {
            this.beginCalibrate();
            return;
          }
          if (t === "resume") {
            this.setState("play");
            return;
          }
          if (t === "restart") {
            this.startSession();
            return;
          }
          if (t === "diffUp") {
            this.setDifficulty(this.diff.level + 1);
            return;
          }
          if (t === "diffDown") {
            this.setDifficulty(this.diff.level - 1);
            return;
          }
          if (t.startsWith("dev:")) {
            let e = t.slice(4);
            this.ble.connect(e);
            return;
          }
        }
        beginCalibrate() {
          this.calibrating = true, this.calibProgress = 0, this.motion.startCalibration(), this.audio.play("count");
        }
        agreePrivacy() {
          this.showPrivacy = false;
          let t = this.privacyResolve;
          this.privacyResolve = null;
          let e = () => {
            this.state !== "ble" && this.setState("ble"), this.ble.hint = "", this.ble.startScan();
          };
          if (t) {
            t({ event: "agree", buttonId: "privacy-agree" }), setTimeout(e, 80);
            return;
          }
          typeof wx != "undefined" && wx.requirePrivacyAuthorize ? wx.requirePrivacyAuthorize({ success: e, fail: () => {
            this.ble.hint = "\u4F60\u62D2\u7EDD\u4E86\u9690\u79C1\u6388\u6743\uFF0C\u84DD\u7259\u4E0D\u53EF\u7528\uFF1B\u53EF\u5728\u5C0F\u6E38\u620F\u53F3\u4E0A\u89D2\u300C\xB7\xB7\xB7\u300D\u2192 \u8BBE\u7F6E\u4E2D\u91CD\u65B0\u5F00\u542F\uFF0C\u6216\u4F7F\u7528\u6A21\u62DF\u6A21\u5F0F\u8BAD\u7EC3\u3002";
          } }) : e();
        }
        rejectPrivacy() {
          this.showPrivacy = false, this.privacyResolve && (this.privacyResolve({ event: "disagree" }), this.privacyResolve = null), this.ble.hint = "\u672A\u540C\u610F\u9690\u79C1\u534F\u8BAE\uFF0C\u65E0\u6CD5\u4F7F\u7528\u84DD\u7259\uFF1B\u53EF\u70B9\u51FB\u300C\u7528\u6A21\u62DF\u6A21\u5F0F\u300D\u7EE7\u7EED\u8BAD\u7EC3\u3002";
        }
        update(t) {
          if (t = Math.min(t, 1 / 20), this.dt = t, this.hotPressing && (this.hotPressTimer += t, this.hotPressTimer >= 1.2 && (this.hotPressing = false, this.therapist.open())), this.ble.isMock) {
            let i = this.input.axis;
            this.ble.setMockInput(i.x, i.y);
          }
          this.ble.tickMock(t), this.motion.update(t), this.state === "calibrate" ? this.updateCalibrate(t) : this.state === "play" && this.updatePlay(t), this.fx.update(t), this.car.update(t, this.player), this.hud.update(t);
          let e = this.track ? this.track.curveAt(this.player.z) : 0;
          this.bg.update(t, e, this.player.speedPct);
        }
        updateCalibrate(t) {
          this.calibrating && (this.calibProgress += t / 3, this.calibProgress >= 1 && (this.calibProgress = 1, this.calibrating = false, this.motion.finishCalibration(), this.audio.play("perfect"), this.hint = "\u6807\u5B9A\u5B8C\u6210\uFF0C\u4E2D\u7ACB\u4F4D\u5DF2\u8BB0\u5F55"));
        }
        updatePlay(t) {
          let e = this.player, i = this.track;
          if (this.countdown > 0) {
            let f = Math.ceil(this.countdown);
            this.countdown -= t, Math.ceil(this.countdown) !== f && this.audio.play("count"), e.update(t, { steer: 0, throttle: 0.12, brake: 0 }, i, this.diff), this.score.update(t, { distance: e.distance, dz: 0, stability: this.motion.stability, speedPct: e.speedPct, weight: this.motion.params.patientWeight });
            return;
          }
          let s = i.lookAheadCurve(e.z, 14), l = this.motion.params.maxAngle, o = m(s * 3.2, -l, l), r = e.speedPct < 0.35 ? l * 0.45 : 0;
          this.motion.setTarget(o, r);
          let a = this.motion.control, n = e.z, c = e.update(t, a, i, this.diff);
          this.obstacles.update(t, e.z);
          let d = this.obstacles.checkPass(n, e.z, e.x, e.halfWidth);
          for (let f of d) this.handleEvent(f);
          e.offRoad ? (this.score.breakCombo(), this.fx.shake(3, 0.1), this.emitTireSmoke(0.5), this.hint = "\u8BF7\u56DE\u5230\u8D5B\u9053\u4E2D\u592E\uFF08\u8EAF\u5E72\u56DE\u4E2D\u7ACB\u4F4D\uFF09") : this.hint === "\u8BF7\u56DE\u5230\u8D5B\u9053\u4E2D\u592E\uFF08\u8EAF\u5E72\u56DE\u4E2D\u7ACB\u4F4D\uFF09" && (this.hint = ""), this.motion.isTilting && e.drifting && this.emitTireSmoke(1), this.emitNitro(), this.motion.stability > 0.8 && e.speedPct > 0.3 ? (this.stableStreak += t, this.stableStreak >= 2.5 && (this.stableStreak = 0, this.score.combo++, this.score.maxCombo = Math.max(this.score.maxCombo, this.score.combo), this.fx.emitPopup("STABLE +", this.view.width * 0.5, this.view.height * 0.62, h.neonBlue, 26))) : this.stableStreak = Math.max(0, this.stableStreak - t * 0.5), this.score.update(t, { distance: e.distance, dz: c.dz, stability: this.motion.stability, speedPct: e.speedPct, weight: this.motion.params.patientWeight }), this.timeLeft = this.motion.params.sessionSeconds - this.score.elapsed, this.timeLeft <= 0 && this.finishSession();
        }
        handleEvent(t) {
          let e = this.view;
          switch (t.type) {
            case "hit": {
              if (this.player.crash(), this.score.addHit(), this.fx.shake(16, 0.45), this.fx.flash(h.warn, 0.45), this.fx.emitSparks(e.width * 0.5, e.height * 0.78, 34), this.audio.play("crash"), this.motion.params.vibration && typeof wx != "undefined" && wx.vibrateShort) try {
                wx.vibrateShort({ type: "heavy" });
              } catch (i) {
              }
              this.fx.emitPopup("-200", e.width * 0.5, e.height * 0.72, h.warn, 30);
              break;
            }
            case "perfect": {
              this.score.combo++;
              let i = this.score.addPerfect(t.gap, this.score.combo);
              this.fx.emitPerfect(this.score.combo), this.fx.flash(h.neonGreen, 0.18), this.audio.play("perfect"), this.fx.emitPopup(`+${i} PERFECT`, e.width * 0.5, e.height * 0.66, h.neonGreen, 30), this.comboTimer = 3.5;
              break;
            }
            case "ring": {
              this.score.addRing(), this.player.speed = Math.min(this.player.maxSpeed, this.player.speed * 1.08 + 400), this.fx.emitRing(e.width * 0.5, e.height * 0.7, h.neonGreen, 300, 5), this.fx.flash(h.neonGreen, 0.12), this.audio.play("ring"), this.fx.emitPopup("+150 BOOST", e.width * 0.5, e.height * 0.68, h.neonGreen, 28);
              break;
            }
            default:
              break;
          }
        }
        emitNitro() {
          let { width: t, height: e } = this.view, i = t * bt, s = i * 0.52, l = e * 0.845 + s * 0.3, o = this.player.nitro, r = this.player.speedPct;
          if (o > 0.05 || r > 0.5) {
            let a = o > 0.05 ? 2 : 1;
            for (let n = 0; n < a; n++) this.fx.emitNitro(t * 0.5 - i * 0.26, l, o, r), this.fx.emitNitro(t * 0.5 + i * 0.26, l, o, r);
            o > 0.6 && Math.random() < 0.05 && this.audio.play("nitro");
          }
        }
        emitTireSmoke(t) {
          let { width: e, height: i } = this.view, s = e * bt, l = s * 0.52, o = i * 0.845 + l * 0.42;
          this.fx.emitTire(e * 0.5 - s * 0.44, o, t), this.fx.emitTire(e * 0.5 + s * 0.44, o, t);
        }
        render() {
          let t = this.ctx, { width: e, height: i } = this.canvasSize;
          t.setTransform(1, 0, 0, 1, 0, 0), t.fillStyle = "#05000f", t.fillRect(0, 0, e, i), t.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY), t.save(), this.fx.applyShake(t);
          let s = this.view.width, l = this.view.height, o = this.motion.isTilting && this.player.drifting ? 1 : 0, r = this.road.compute(this.track, { x: this.player.x, z: this.player.z }, o);
          this.bg.render(t, r.clipY || this.road.horizonY || l * 0.42), this.road.paint(t, r), this.obstacles.render(t, this.track, { z: this.player.z }, this.view), this.state !== "menu" && this.state !== "leaderboard" && (this.fx.renderBack(t), this.car.render(t, this.player, s * 0.5)), this.fx.renderFront(t), this.fx.renderSpeedLines(t, this.player.speedPct), t.restore(), (this.state === "play" || this.state === "pause") && this.hud.render(t, { player: this.player, motion: this.motion, score: this.score.finalScore, ble: this.ble, diff: this.diff, timeLeft: this.timeLeft, progress: m(this.score.elapsed / this.motion.params.sessionSeconds, 0, 1), combo: this.score.combo, comboPulse: this.fx.comboPulse, rank: this.score.estimateRank(), calories: this.score.calories, hint: this.hint, countdown: this.countdown > 0 ? this.countdown : 0 }), this.state === "menu" ? (this.screens.render(t, "menu", { difficulty: this.motion.params.difficulty, bleStatus: this.ble.statusText }), this.therapist.renderHotZone(t, this.hotPressing)) : this.state === "ble" ? this.screens.render(t, "ble", { devices: this.ble.displayDevices, total: this.ble.allDevices.length, matched: this.ble.devices.length, showAll: this.ble.showAll, message: this.ble.statusText, hint: this.ble.hint }) : this.state === "calibrate" ? this.screens.render(t, "calibrate", { calibrating: this.calibrating, progress: this.calibProgress }) : this.state === "pause" ? this.screens.render(t, "pause", {}) : this.state === "result" ? this.screens.render(t, "result", { result: this.result || {} }) : this.state === "leaderboard" && this.screens.render(t, "leaderboard", { board: this.score.getMergedBoard(10), me: this.score.patientName }), this.showPrivacy ? this.screens.render(t, "privacy", {}) : this.therapist.visible && this.therapist.render(t);
        }
      };
    }
  });

  // tools/race-preview/main.js
  var params = new URLSearchParams(location.search);
  var W = Number(params.get("w") || 844);
  var H = Number(params.get("h") || 390);
  var DPR = Number(params.get("dpr") || 2);
  var STATE = (params.get("state") || "play").toLowerCase();
  var LEVEL = Number(params.get("level") || 2);
  var FRAMES = Number(params.get("frames") || 180);
  var ANGLE = Number(params.get("angle") || 0);
  var THROTTLE = Number(params.get("throttle") || 0.7);
  var store = {};
  var listeners = {};
  function fakeAudioParam() {
    return {
      value: 0,
      setValueAtTime() {
      },
      linearRampToValueAtTime() {
      },
      exponentialRampToValueAtTime() {
      },
      setTargetAtTime() {
      },
      setValueCurveAtTime() {
      },
      cancelScheduledValues() {
      }
    };
  }
  function fakeNode() {
    return {
      connect() {
        return this;
      },
      disconnect() {
      },
      start() {
      },
      stop() {
      },
      gain: fakeAudioParam(),
      frequency: fakeAudioParam(),
      type: "sine",
      buffer: null,
      onended: null
    };
  }
  window.wx = {
    getStorageSync: (k) => k in store ? store[k] : "",
    setStorageSync: (k, v) => {
      store[k] = v;
    },
    removeStorageSync: (k) => {
      delete store[k];
    },
    getSystemInfoSync: () => ({ windowWidth: W, windowHeight: H, pixelRatio: DPR, platform: "devtools" }),
    getWindowInfo: () => ({ windowWidth: W, windowHeight: H, pixelRatio: DPR }),
    onTouchStart: (fn) => {
      listeners.touchstart = fn;
    },
    onTouchMove: (fn) => {
      listeners.touchmove = fn;
    },
    onTouchEnd: (fn) => {
      listeners.touchend = fn;
    },
    onKeyDown: () => {
    },
    onKeyUp: () => {
    },
    onWindowResize: () => {
    },
    vibrateShort: () => {
    },
    showToast: () => {
    },
    onNeedPrivacyAuthorization: (fn) => {
      listeners.privacy = fn;
    },
    createInnerAudioContext: () => ({
      play() {
      },
      pause() {
      },
      stop() {
      },
      seek() {
      },
      destroy() {
      },
      onEnded() {
      },
      onError() {
      },
      onPlay() {
      },
      onStop() {
      },
      offEnded() {
      },
      offError() {
      }
    }),
    createWebAudioContext: () => ({
      currentTime: 0,
      sampleRate: 44100,
      state: "running",
      destination: fakeNode(),
      resume() {
      },
      suspend() {
      },
      close() {
      },
      createGain: fakeNode,
      createOscillator: fakeNode,
      createBuffer: () => ({ getChannelData: () => new Float32Array(1024) }),
      createBufferSource: fakeNode,
      createBiquadFilter: fakeNode,
      createDynamicsCompressor: fakeNode
    })
  };
  var canvas = document.getElementById("c");
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.requestAnimationFrame = (fn) => window.requestAnimationFrame(fn);
  canvas.cancelAnimationFrame = (id) => window.cancelAnimationFrame(id);
  function fail(msg, err) {
    const box = document.createElement("pre");
    box.style.cssText = "position:fixed;left:0;right:0;bottom:0;max-height:60%;overflow:auto;margin:0;padding:10px;background:rgba(160,20,20,.94);color:#fff;font:12px/1.5 monospace;z-index:99";
    box.textContent = msg + (err ? "\n\n" + (err.stack || err.message || err) : "");
    document.body.appendChild(box);
    console.error(msg, err);
  }
  var { GameEngine } = require_engine();
  var engine;
  try {
    engine = new GameEngine(canvas);
  } catch (e) {
    fail("\u5F15\u64CE\u521B\u5EFA\u5931\u8D25", e);
    throw e;
  }
  engine.dpr = DPR;
  engine.canvasSize = { w: canvas.width, h: canvas.height };
  engine.scale = Math.min(canvas.width / engine.view.width, canvas.height / engine.view.height);
  engine.offsetX = (canvas.width - engine.view.width * engine.scale) / 2;
  engine.offsetY = (canvas.height - engine.view.height * engine.scale) / 2;
  engine.offsetX = (canvas.width - engine.view.width * engine.scale) / 2;
  window.__engine = engine;
  try {
    engine.ble.state = "connected";
    engine.ble.preferMock = false;
  } catch (e) {
  }
  function feedSensor() {
    try {
      if (engine.ble && engine.ble.injectSample) {
        engine.ble.injectSample({
          angle: { roll: ANGLE, pitch: THROTTLE * 12, yaw: 0 }
        });
      }
    } catch (e) {
    }
  }
  function advance(frames) {
    const dt = 1 / 60;
    for (let i = 0; i < frames; i++) {
      feedSensor();
      engine.update(dt);
    }
  }
  try {
    if (STATE === "play" || STATE === "pause" || STATE === "result") {
      engine.motion.setParams({ difficulty: LEVEL });
      engine.startSession();
      advance(FRAMES);
      if (STATE === "pause") engine.setState("pause");
      if (STATE === "result") {
        engine.countdown = 0;
        for (let i = 0; i < 40; i++) {
          feedSensor();
          engine.update(1 / 60);
        }
        try {
          engine.finishSession();
        } catch (e) {
          fail("\u7ED3\u7B97\u5931\u8D25", e);
        }
      }
    } else if (STATE === "menu") {
      engine.setState("menu");
    }
  } catch (e) {
    fail("\u63A8\u8FDB\u5931\u8D25\uFF08" + STATE + "\uFF09", e);
  }
  try {
    engine.render();
  } catch (e) {
    fail("\u6E32\u67D3\u5931\u8D25", e);
  }
})();
