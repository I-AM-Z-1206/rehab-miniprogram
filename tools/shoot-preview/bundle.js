(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // utils/zero.js
  var require_zero = __commonJS({
    "utils/zero.js"(exports, module) {
      var KEY = "wt_zero_v1";
      var DEF = { roll: 0, pitch: 0, set: false };
      var state = null;
      function wrap180(v) {
        let x = v % 360;
        if (x > 180) x -= 360;
        if (x < -180) x += 360;
        return x;
      }
      function round2(v) {
        return Math.round(v * 100) / 100;
      }
      function syncApp(s) {
        const app = typeof getApp === "function" ? getApp() : null;
        if (app) {
          app.globalData = app.globalData || {};
          app.globalData.zero = s;
        }
      }
      function persist(s) {
        try {
          wx.setStorageSync(KEY, s);
        } catch (e) {
        }
      }
      function load() {
        if (state) return state;
        let s = null;
        try {
          s = wx.getStorageSync(KEY);
        } catch (e) {
        }
        if (s && typeof s.roll === "number" && typeof s.pitch === "number") {
          state = { roll: wrap180(s.roll), pitch: wrap180(s.pitch), set: !!s.set };
        } else {
          state = { roll: DEF.roll, pitch: DEF.pitch, set: DEF.set };
        }
        syncApp(state);
        return state;
      }
      function get() {
        const s = load();
        return { roll: s.roll, pitch: s.pitch, set: s.set };
      }
      function set(roll, pitch) {
        state = {
          roll: round2(wrap180(Number(roll) || 0)),
          pitch: round2(wrap180(Number(pitch) || 0)),
          set: true
        };
        persist(state);
        syncApp(state);
        return get();
      }
      function reset() {
        state = { roll: 0, pitch: 0, set: false };
        persist(state);
        syncApp(state);
        return get();
      }
      function setFromAngles(rawRoll, rawPitch) {
        return set(-(Number(rawRoll) || 0), -(Number(rawPitch) || 0));
      }
      function setFromSamples(samples) {
        if (!samples || !samples.length) return null;
        let sr = 0;
        let sp = 0;
        let n = 0;
        samples.forEach((s) => {
          if (!s) return;
          if (typeof s.roll === "number") sr += s.roll;
          if (typeof s.pitch === "number") sp += s.pitch;
          n++;
        });
        if (!n) return null;
        return set(-sr / n, -sp / n);
      }
      function apply(d) {
        if (!d) return d;
        if (typeof d.roll !== "number" && typeof d.pitch !== "number") return d;
        const z = load();
        const out = Object.assign({}, d);
        if (typeof d.roll === "number") {
          out.rawRoll = d.rawRoll === void 0 ? d.roll : d.rawRoll;
          out.roll = wrap180(d.roll + z.roll);
        }
        if (typeof d.pitch === "number") {
          out.rawPitch = d.rawPitch === void 0 ? d.pitch : d.rawPitch;
          out.pitch = wrap180(d.pitch + z.pitch);
        }
        return out;
      }
      module.exports = {
        get,
        set,
        reset,
        setFromAngles,
        setFromSamples,
        apply,
        wrap180
      };
    }
  });

  // utils/witble.js
  var require_witble = __commonJS({
    "utils/witble.js"(exports, module) {
      var NUS_NOTIFY = "6e400003";
      var NUS_WRITE = "6e400002";
      var OUTPUT_RATE_CODES = { 0.2: 1, 0.5: 2, 1: 3, 2: 4, 5: 5, 10: 6, 20: 7, 50: 8, 100: 9, 200: 10 };
      function nearestOutputRate(hz2) {
        const list = [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200];
        const v = Number(hz2) || 100;
        let best = list[0];
        let diff = Infinity;
        for (let i = 0; i < list.length; i++) {
          const d = Math.abs(list[i] - v);
          if (d < diff) {
            diff = d;
            best = list[i];
          }
        }
        return best;
      }
      var zero = require_zero();
      function s16(lo, hi) {
        let v = hi << 8 | lo;
        if (v >= 32768) v -= 65536;
        return v;
      }
      var WitBle = class {
        constructor() {
          this.devices = [];
          this.connectedId = "";
          this.services = [];
          this.notifyChar = null;
          this.writeChar = null;
          this.fallbackChar = null;
          this.notifyScore = 0;
          this.writeScore = 0;
          this.buf = [];
          this.handlers = {};
          this.outputRateHz = 0;
        }
        log(msg) {
          if (this.handlers.onLog) this.handlers.onLog(msg);
        }
        // ---------- 扫描 ----------
        startScan(onDevices, onFail) {
          const that = this;
          this.devices = [];
          wx.openBluetoothAdapter({
            success() {
              wx.onBluetoothDeviceFound(function(res) {
                const map = {};
                that.devices.forEach((d) => {
                  map[d.deviceId] = d;
                });
                (res.devices || []).forEach((d) => {
                  if (!d.deviceId) return;
                  const name = d.name || d.localName || "";
                  if (!name) return;
                  if (!/^[\x20-\x7e\u4e00-\u9fa5]{1,20}$/.test(name) || /[+/=]/.test(name)) return;
                  const prev = map[d.deviceId];
                  if (prev) {
                    prev.rssi = d.rssi !== 0 ? d.rssi : prev.rssi;
                    if (name) prev.name = name;
                  } else {
                    map[d.deviceId] = { deviceId: d.deviceId, name, rssi: d.rssi || 0 };
                  }
                });
                const list = Object.keys(map).map((k) => map[k]);
                list.sort((a, b) => {
                  const wa = /WT|Wit/i.test(a.name) ? 0 : 1;
                  const wb = /WT|Wit/i.test(b.name) ? 0 : 1;
                  if (wa !== wb) return wa - wb;
                  return b.rssi - a.rssi;
                });
                that.devices = list.slice(0, 20);
                if (onDevices) onDevices(that.devices);
              });
              wx.startBluetoothDevicesDiscovery({
                allowDuplicatesKey: true,
                powerLevel: "high",
                success() {
                  that.log("\u5F00\u59CB\u626B\u63CF\u84DD\u7259\u8BBE\u5907");
                },
                fail: (err) => {
                  if (onFail) onFail(err);
                }
              });
            },
            fail: (err) => {
              if (onFail) onFail(err);
            }
          });
        }
        stopScan() {
          wx.stopBluetoothDevicesDiscovery({ complete: () => {
          } });
          try {
            wx.offBluetoothDeviceFound();
          } catch (e) {
          }
        }
        // ---------- 连接 ----------
        connect(deviceId, handlers) {
          this.handlers = handlers || {};
          const that = this;
          wx.createBLEConnection({
            deviceId,
            timeout: 6e3,
            success() {
              that.connectedId = deviceId;
              that.afterConnected();
            },
            fail: (err) => {
              if (handlers.onError) handlers.onError("\u8FDE\u63A5\u5931\u8D25\uFF1A" + (err.errMsg || ""));
            }
          });
        }
        afterConnected() {
          const that = this;
          wx.onBLEConnectionStateChange(function(res) {
            if (res.deviceId === that.connectedId && !res.connected) {
              that.disconnect(true);
              if (that.handlers.onDisconnected) that.handlers.onDisconnected();
            }
          });
          wx.onBLECharacteristicValueChange(function(res) {
            that.feed(new Uint8Array(res.value));
          });
          wx.setBLEMTU({ deviceId: this.connectedId, mtu: 185, complete: () => {
          } });
          this.discoverServices(3);
        }
        discoverServices(retry) {
          const that = this;
          setTimeout(() => {
            wx.getBLEDeviceServices({
              deviceId: that.connectedId,
              success: (res) => {
                const list = (res.services || []).map((s) => s.uuid);
                if (!list.length && retry > 0) {
                  that.log("\u670D\u52A1\u5217\u8868\u4E3A\u7A7A\uFF0C\u91CD\u8BD5(" + retry + ")");
                  that.discoverServices(retry - 1);
                  return;
                }
                that.services = list;
                that.probeNextService();
              },
              fail: () => {
                if (retry > 0) {
                  that.discoverServices(retry - 1);
                  return;
                }
                if (that.handlers.onError) that.handlers.onError("\u83B7\u53D6\u670D\u52A1\u5931\u8D25");
              }
            });
          }, 1e3);
        }
        probeNextService() {
          const that = this;
          if (!this.services.length) {
            if (!this.notifyChar && this.fallbackChar) this.notifyChar = this.fallbackChar;
            if (!this.notifyChar) {
              if (that.handlers.onError) that.handlers.onError("\u672A\u627E\u5230\u53EF\u8BA2\u9605\u7684\u6570\u636E\u7279\u5F81\u503C");
              return;
            }
            this.subscribe();
            return;
          }
          const serviceId = this.services.shift();
          wx.getBLEDeviceCharacteristics({
            deviceId: this.connectedId,
            serviceId,
            success: (res) => {
              (res.characteristics || []).forEach((c) => {
                const uuid = (c.uuid || "").toLowerCase();
                const props = c.properties || c.props || {};
                const canNotify = props.notify || props.indicate;
                const canWrite = props.write || props.writeNoResponse || props.writeDefault;
                if (canNotify) {
                  const score = uuid.indexOf(NUS_NOTIFY) !== -1 ? 3 : uuid.indexOf("ffe") !== -1 || uuid.indexOf("fff") !== -1 ? 2 : 1;
                  if (!that.notifyChar || score > that.notifyScore) {
                    that.notifyChar = { serviceId, charId: c.uuid };
                    that.notifyScore = score;
                  }
                }
                if (canWrite) {
                  const score = uuid.indexOf(NUS_WRITE) !== -1 ? 3 : uuid.indexOf("ffe") !== -1 || uuid.indexOf("fff") !== -1 ? 2 : 1;
                  if (!that.writeChar || score > that.writeScore) {
                    that.writeChar = { serviceId, charId: c.uuid };
                    that.writeScore = score;
                  }
                }
                if (!that.fallbackChar && serviceId.toLowerCase().indexOf("ffe") !== -1) {
                  that.fallbackChar = { serviceId, charId: c.uuid };
                }
              });
            },
            complete: () => that.probeNextService()
          });
        }
        subscribe() {
          const that = this;
          const nc = this.notifyChar;
          wx.notifyBLECharacteristicValueChange({
            deviceId: this.connectedId,
            serviceId: nc.serviceId,
            characteristicId: nc.charId,
            state: true,
            success: () => {
              that.log("\u8BA2\u9605\u6210\u529F\uFF1A" + nc.charId.slice(0, 8));
              if (that.handlers.onReady) that.handlers.onReady();
            },
            fail: (err) => {
              if (that.handlers.onError) that.handlers.onError("\u8BA2\u9605\u5931\u8D25\uFF1A" + (err.errMsg || ""));
            }
          });
        }
        // ---------- 协议解析 ----------
        feed(bytes) {
          let buf = this.buf.concat(Array.prototype.slice.call(bytes));
          while (true) {
            while (buf.length && buf[0] !== 85) buf.shift();
            if (buf.length < 2) break;
            const flag = buf[1];
            if (flag === 97) {
              if (buf.length < 20) break;
              this.parseCombo(buf.slice(0, 20));
              buf = buf.slice(20);
              continue;
            }
            if (flag === 113) {
              if (buf.length < 20) break;
              this.parseReg(buf.slice(0, 20));
              buf = buf.slice(20);
              continue;
            }
            if (flag >= 80 && flag <= 90) {
              if (buf.length < 11) break;
              const pkt = buf.slice(0, 11);
              let sum = 0;
              for (let i = 0; i < 10; i++) sum += pkt[i];
              if ((sum & 255) === pkt[10]) {
                this.parseLegacy(flag, pkt);
                buf = buf.slice(11);
              } else {
                buf.shift();
              }
              continue;
            }
            buf.shift();
          }
          this.buf = buf;
        }
        emit(d) {
          const frame = zero.apply(d);
          if (this.handlers.onData) this.handlers.onData(frame);
        }
        parseCombo(f) {
          this.emit({
            ax: s16(f[2], f[3]) / 32768 * 16,
            ay: s16(f[4], f[5]) / 32768 * 16,
            az: s16(f[6], f[7]) / 32768 * 16,
            wx: s16(f[8], f[9]) / 32768 * 2e3,
            wy: s16(f[10], f[11]) / 32768 * 2e3,
            wz: s16(f[12], f[13]) / 32768 * 2e3,
            roll: s16(f[14], f[15]) / 32768 * 180,
            pitch: s16(f[16], f[17]) / 32768 * 180,
            yaw: s16(f[18], f[19]) / 32768 * 180
          });
        }
        parseReg(f) {
          const startReg = f[2];
          const reg = (idx) => s16(f[4 + idx * 2], f[5 + idx * 2]);
          const vals = [];
          for (let i = 0; i < 8; i++) vals.push(reg(i));
          this.emit({ regStart: startReg, reg: vals });
        }
        // ---------- 写指令（读电量 / 读温度等） ----------
        write(bytes) {
          const wc = this.writeChar || this.notifyChar;
          if (!wc || !this.connectedId) {
            this.log("\u65E0\u5199\u5165\u901A\u9053\uFF0C\u6307\u4EE4\u672A\u53D1\u9001");
            return false;
          }
          wx.writeBLECharacteristicValue({
            deviceId: this.connectedId,
            serviceId: wc.serviceId,
            characteristicId: wc.charId,
            value: new Uint8Array(bytes).buffer,
            success: () => this.log("\u5DF2\u53D1\u9001\u6307\u4EE4"),
            fail: (err) => this.log("\u6307\u4EE4\u53D1\u9001\u5931\u8D25\uFF1A" + (err.errMsg || ""))
          });
          return true;
        }
        // ---------- 输出频率（寄存器 0x03） ----------
        // WT9011DCL / JY901 只支持离散档位：0.2 / 0.5 / 1 / 2 / 5 / 10 / 20 / 50 / 100 / 200 Hz。
        // 想让游戏拿到 ≥60Hz 的数据，就设到 100Hz，再由引擎按固定 60Hz 采样消费。
        setOutputRate(hz2) {
          const rate = nearestOutputRate(hz2);
          if (!this.connectedId) {
            this.log("\u672A\u8FDE\u63A5\u4F20\u611F\u5668\uFF0C\u8DF3\u8FC7\u8F93\u51FA\u9891\u7387\u8BBE\u7F6E");
            return null;
          }
          const code = OUTPUT_RATE_CODES[rate];
          const unlock = [255, 170, 105, 136, 181];
          const cmd = [255, 170, 3, code, 0];
          const save = [255, 170, 0, 0, 0];
          this.write(unlock);
          setTimeout(() => this.write(cmd), 120);
          setTimeout(() => this.write(save), 260);
          this.outputRateHz = rate;
          this.log("\u5DF2\u8BF7\u6C42\u8F93\u51FA\u9891\u7387 " + rate + "Hz\uFF08\u5BC4\u5B58\u5668 0x03=0x0" + code.toString(16) + "\uFF09");
          return rate;
        }
        parseLegacy(flag, f) {
          const v = [s16(f[2], f[3]), s16(f[4], f[5]), s16(f[6], f[7])];
          if (flag === 81) {
            this.emit({ ax: v[0] / 32768 * 16, ay: v[1] / 32768 * 16, az: v[2] / 32768 * 16 });
          } else if (flag === 82) {
            this.emit({ wx: v[0] / 32768 * 2e3, wy: v[1] / 32768 * 2e3, wz: v[2] / 32768 * 2e3 });
          } else if (flag === 83) {
            this.emit({ roll: v[0] / 32768 * 180, pitch: v[1] / 32768 * 180, yaw: v[2] / 32768 * 180 });
          }
        }
        // ---------- 断开 ----------
        disconnect(silent) {
          this.stopScan();
          try {
            wx.offBLECharacteristicValueChange();
          } catch (e) {
          }
          try {
            wx.offBLEConnectionStateChange();
          } catch (e) {
          }
          if (this.connectedId) {
            wx.closeBLEConnection({ deviceId: this.connectedId, complete: () => {
            } });
            this.connectedId = "";
          }
          this.buf = [];
          this.services = [];
          this.notifyChar = null;
          this.writeChar = null;
          this.fallbackChar = null;
          this.notifyScore = 0;
          this.writeScore = 0;
          if (!silent) this.log("\u5DF2\u65AD\u5F00\u8FDE\u63A5");
        }
      };
      function getShared() {
        const app = typeof getApp === "function" ? getApp() : null;
        if (!app) return new WitBle();
        app.globalData = app.globalData || {};
        if (!app.globalData.witBle) app.globalData.witBle = new WitBle();
        return app.globalData.witBle;
      }
      function detach(ble) {
        if (!ble) return;
        ble.handlers = {};
      }
      module.exports = WitBle;
      module.exports.getShared = getShared;
      module.exports.detach = detach;
    }
  });

  // utils/voiceMap.js
  var require_voiceMap = __commonJS({
    "utils/voiceMap.js"(exports, module) {
      var VOICE_FILES = {
        // 首页
        "\u6B22\u8FCE\u4F7F\u7528\u8FD0\u52A8\u5EB7\u590D\u52A9\u624B\uFF0C\u8BF7\u5148\u8FDE\u63A5\u84DD\u7259\u4F20\u611F\u5668": "welcome",
        "\u6B63\u5728\u6253\u5F00\u529F\u80FD\u9875": "open_page",
        "\u8BBE\u5907\u5DF2\u8FDE\u63A5\uFF0C\u53EF\u67E5\u770B\u4F20\u611F\u5668\u6570\u636E": "wit_linked",
        // 传感器（外接设备）
        "\u8BF7\u786E\u8BA4\u4F20\u611F\u5668\u5DF2\u5F00\u673A\uFF0C\u84DD\u706F\u5FEB\u95EA\u540E\u70B9\u51FB\u626B\u63CF\u8BBE\u5907": "wit_entry",
        "\u5F00\u59CB\u626B\u63CF\u84DD\u7259\u8BBE\u5907\uFF0C\u8BF7\u7A0D\u5019": "ble_scanning",
        "\u84DD\u7259\u4E0D\u53EF\u7528\uFF0C\u8BF7\u786E\u8BA4\u624B\u673A\u84DD\u7259\u5DF2\u5F00\u542F": "ble_unavailable",
        "\u6B63\u5728\u8FDE\u63A5\u8BBE\u5907\uFF0C\u8BF7\u7A0D\u5019": "ble_connecting",
        "\u84DD\u7259\u8FDE\u63A5\u6210\u529F\uFF0C\u6B63\u5728\u63A5\u6536\u4F20\u611F\u5668\u6570\u636E": "ble_connected",
        "\u84DD\u7259\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u786E\u8BA4\u4F20\u611F\u5668\u5DF2\u5F00\u673A\u5E76\u9760\u8FD1\u624B\u673A": "ble_connect_fail",
        "\u6570\u636E\u901A\u9053\u8BA2\u9605\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5": "ble_subscribe_fail",
        "\u84DD\u7259\u8FDE\u63A5\u5DF2\u65AD\u5F00\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5": "ble_disconnected",
        "\u5DF2\u65AD\u5F00\u84DD\u7259\u8FDE\u63A5": "ble_manual_disconnect",
        // 传感器读数
        "\u4F20\u611F\u5668\u7535\u91CF\u5DF2\u8BFB\u53D6\uFF0C\u8BF7\u67E5\u770B\u5C4F\u5E55": "battery_read",
        "\u4F20\u611F\u5668\u6E29\u5EA6\u5DF2\u8BFB\u53D6\uFF0C\u8BF7\u67E5\u770B\u5C4F\u5E55": "temp_read",
        // 零点标定
        "\u8BF7\u5148\u8FDE\u63A5\u4F20\u611F\u5668": "need_connect",
        // 我的
        "\u8BED\u97F3\u64AD\u62A5\u5DF2\u5F00\u542F": "speech_on",
        "\u8BED\u97F3\u64AD\u62A5\u6D4B\u8BD5\uFF0C\u80FD\u542C\u5230\u8BF4\u660E\u914D\u7F6E\u6B63\u5E38": "speech_test"
      };
      module.exports = { VOICE_FILES };
    }
  });

  // utils/speaker.js
  var require_speaker = __commonJS({
    "utils/speaker.js"(exports, module) {
      var { VOICE_FILES } = require_voiceMap();
      var KEY_SPEECH = "speech_enabled";
      var MAX_LEN = 50;
      var REPEAT_GUARD = 3e3;
      var AUDIO_DIR = "/audio/";
      var AUDIO_EXTS = [".mp3", ".wav"];
      var plugin = null;
      var pluginLoaded = false;
      var unavailable = false;
      var tipped = false;
      var audio = null;
      var lastText = "";
      var lastAt = 0;
      var audioOptionSet = false;
      function tipOnce(msg) {
        if (tipped) return;
        tipped = true;
        wx.showToast({ title: msg || "\u8BED\u97F3\u64AD\u62A5\u4E0D\u53EF\u7528", icon: "none", duration: 2500 });
      }
      function getPlugin() {
        if (!pluginLoaded) {
          pluginLoaded = true;
          try {
            plugin = requirePlugin("WechatSI");
          } catch (e) {
            plugin = null;
            unavailable = true;
          }
        }
        return plugin;
      }
      function isEnabled() {
        try {
          const val = wx.getStorageSync(KEY_SPEECH);
          return val === void 0 || val === null || val === "" ? true : !!val;
        } catch (e) {
          return true;
        }
      }
      function setEnabled(on) {
        try {
          wx.setStorageSync(KEY_SPEECH, !!on);
        } catch (e) {
        }
      }
      function stop() {
        if (!audio) return;
        try {
          audio.pause();
          audio.destroy();
        } catch (e) {
        }
        audio = null;
      }
      function release(ctx) {
        if (audio === ctx) audio = null;
        try {
          ctx.destroy();
        } catch (e) {
        }
      }
      function safePlay(ctx) {
        try {
          ctx.play();
        } catch (e) {
        }
      }
      function playUrl(url, fallbackText) {
        stop();
        if (!audioOptionSet) {
          audioOptionSet = true;
          try {
            wx.setInnerAudioOption({ obeyMuteSwitch: false });
          } catch (e) {
          }
        }
        const ctx = wx.createInnerAudioContext();
        audio = ctx;
        ctx.onCanplay(() => {
          if (audio === ctx) safePlay(ctx);
        });
        ctx.onEnded(() => release(ctx));
        ctx.onError(() => {
          release(ctx);
          if (fallbackText) speakByPlugin(fallbackText);
        });
        ctx.src = url;
      }
      function playLocal(file, fallbackText) {
        stop();
        let extIndex = 0;
        const tryNext = () => {
          if (extIndex >= AUDIO_EXTS.length) {
            tipOnce("\u672A\u627E\u5230\u8BED\u97F3\u5305\uFF0C\u8BF7\u5148\u751F\u6210 audio \u76EE\u5F55\u4E0B\u7684\u97F3\u9891");
            if (fallbackText) speakByPlugin(fallbackText);
            return;
          }
          const url = AUDIO_DIR + file + AUDIO_EXTS[extIndex];
          extIndex += 1;
          if (!audioOptionSet) {
            audioOptionSet = true;
            try {
              wx.setInnerAudioOption({ obeyMuteSwitch: false });
            } catch (e) {
            }
          }
          const ctx = wx.createInnerAudioContext();
          audio = ctx;
          ctx.onCanplay(() => {
            if (audio === ctx) safePlay(ctx);
          });
          ctx.onEnded(() => release(ctx));
          ctx.onError(() => {
            release(ctx);
            tryNext();
          });
          ctx.src = url;
        };
        tryNext();
      }
      function speakByPlugin(text) {
        const p = getPlugin();
        if (!p || typeof p.textToSpeech !== "function") {
          tipOnce(unavailable ? "\u672A\u63A5\u5165\u540C\u58F0\u4F20\u8BD1\u63D2\u4EF6\uFF0C\u4E14\u65E0\u672C\u5730\u8BED\u97F3\u5305" : "\u8BED\u97F3\u64AD\u62A5\u4E0D\u53EF\u7528");
          return;
        }
        const content = String(text || "").trim();
        if (!content) return;
        p.textToSpeech({
          lang: "zh_CN",
          tts: true,
          content: content.slice(0, MAX_LEN),
          success: (res) => {
            if (res && res.retcode === 0 && res.filename) {
              playUrl(res.filename);
            } else {
              console.warn("[speaker] \u5408\u6210\u5931\u8D25", res);
              tipOnce("\u8BED\u97F3\u5408\u6210\u5931\u8D25");
            }
          },
          fail: (err) => {
            console.warn("[speaker] \u5408\u6210\u5931\u8D25", err);
            tipOnce("\u8BED\u97F3\u5408\u6210\u5931\u8D25");
          }
        });
      }
      function speak(text) {
        const content = String(text || "").trim();
        if (!content) return;
        if (!isEnabled()) return;
        const now = Date.now();
        if (content === lastText && now - lastAt < REPEAT_GUARD) return;
        lastText = content;
        lastAt = now;
        const file = VOICE_FILES[content];
        if (file) {
          playLocal(file, content);
          return;
        }
        speakByPlugin(content);
      }
      module.exports = { speak, stop, isEnabled, setEnabled, KEY_SPEECH };
    }
  });

  // utils/game/config.js
  var require_config = __commonJS({
    "utils/game/config.js"(exports, module) {
      var STORAGE_KEY = "shoot_cfg_v2";
      var SAVE_DELAY = 300;
      var SCHEMA = {
        // ---------- 计时与计分 ----------
        gameDuration: { group: "\u8BA1\u65F6\u4E0E\u8BA1\u5206", label: "\u6E38\u620F\u65F6\u957F", unit: "\u79D2", type: "num", min: 0, max: 300, step: 5, def: 60, tip: "0 \u8868\u793A\u4E0D\u9650\u65F6" },
        baseScorePerSecond: { group: "\u8BA1\u65F6\u4E0E\u8BA1\u5206", label: "\u6BCF\u79D2\u57FA\u7840\u5206", unit: "\u5206", type: "num", min: 0, max: 10, step: 0.5, def: 1, tip: "\u6BCF\u79D2\u7ED3\u7B97\u4E00\u6B21\uFF0C\u4EC5\u5728\u4FDD\u6301\u8303\u56F4\u5185\u7D2F\u52A0" },
        tickMs: { group: "\u8BA1\u65F6\u4E0E\u8BA1\u5206", label: "\u5224\u5B9A\u523B\u5EA6", unit: "ms", type: "num", min: 100, max: 500, step: 100, def: 100, hidden: true, tip: "0.1s = 100ms" },
        baseTickMs: { group: "\u8BA1\u65F6\u4E0E\u8BA1\u5206", label: "\u8BA1\u5206\u523B\u5EA6", unit: "ms", type: "num", min: 1e3, max: 1e3, step: 1e3, def: 1e3, hidden: true },
        // ---------- 子弹 ----------
        fireRate: { group: "\u5B50\u5F39\u53D1\u5C04", label: "\u53D1\u5C04\u9891\u7387", unit: "\u53D1/\u79D2", type: "num", min: 0.5, max: 12, step: 0.5, def: 3 },
        bulletSpeed: { group: "\u5B50\u5F39\u53D1\u5C04", label: "\u5B50\u5F39\u901F\u5EA6", unit: "px/s", type: "num", min: 300, max: 1400, step: 20, def: 760, hidden: true },
        spreadDeg: { group: "\u5B50\u5F39\u53D1\u5C04", label: "\u6563\u5C04\u89D2", unit: "\xB0", type: "num", min: 0, max: 10, step: 0.5, def: 0, hidden: true },
        // ---------- 判定 ----------
        hitRange: { group: "\u51FB\u4E2D\u5224\u5B9A", label: "\u51FB\u4E2D\u5224\u5B9A\u534A\u5F84", unit: "px", type: "num", min: 8, max: 200, step: 2, def: 60, tip: "\u51FB\u4E2D\u8303\u56F4=\u4EE5\u602A\u517D\u5706\u5FC3\u4E3A\u539F\u70B9\u7684\u5BB9\u9519\u534A\u5F84\uFF0C\u6E38\u620F\u8FDB\u884C\u4E2D\u53EF\u5B9E\u65F6\u4FEE\u6539" },
        comboWindowMs: { group: "\u51FB\u4E2D\u5224\u5B9A", label: "\u8FDE\u51FB\u7A97\u53E3", unit: "ms", type: "num", min: 100, max: 1e3, step: 50, def: 100, tip: "\u9ED8\u8BA4 100ms\uFF080.1 \u79D2\u523B\u5EA6\u5185\u8FDE\u7EED\u51FB\u4E2D\uFF09" },
        comboStep: { group: "\u51FB\u4E2D\u5224\u5B9A", label: "\u6BCF\u7EA7\u8FDE\u51FB\u52A0\u6210", unit: "", type: "num", min: 0, max: 1, step: 0.05, def: 0.15, hidden: true },
        comboMaxMul: { group: "\u51FB\u4E2D\u5224\u5B9A", label: "\u8FDE\u51FB\u52A0\u6210\u4E0A\u9650", unit: "\u500D", type: "num", min: 1, max: 6, step: 0.5, def: 3, hidden: true },
        // ---------- 得分浮动区间 ----------
        scoreMin: { group: "\u5F97\u5206\u6D6E\u52A8", label: "\u5355\u6B21\u5F97\u5206\u4E0B\u9650", unit: "\u5206", type: "num", min: 0, max: 99, step: 1, def: 1 },
        scoreMax: { group: "\u5F97\u5206\u6D6E\u52A8", label: "\u5355\u6B21\u5F97\u5206\u4E0A\u9650", unit: "\u5206", type: "num", min: 0, max: 99, step: 1, def: 3 },
        // ---------- 保持范围（体感，静态保持） ----------
        // 按实机佩戴方向，左右移动读取 Pitch 轴（实测该轴对应左右方向）；Roll 仅缓存。
        // 游戏小人按“镜像”方式跟随（见 pose.js），因此不再提供左右轴切换 / 反向开关。
        keepRangeDeg: { group: "\u4FDD\u6301\u8303\u56F4", label: "\u5141\u8BB8\u504F\u79BB\u89D2\u5EA6", unit: "\xB1\xB0", type: "num", min: 1, max: 60, step: 1, def: 6, tip: "\u9759\u6001\u4FDD\u6301\uFF1A\u8EAB\u4F53\u504F\u79BB\u8D85\u8FC7\u8BE5\u89D2\u5EA6\u5373\u63D0\u793A\u56DE\u5230\u4E2D\u95F4\uFF0C\u5E76\u6682\u505C\u57FA\u7840\u5206\uFF08\u5B50\u5F39\u4ECD\u4F1A\u53D1\u5C04\uFF09" },
        maxLeanDeg: { group: "\u4FDD\u6301\u8303\u56F4", label: "\u6EE1\u91CF\u7A0B\u503E\u659C\u89D2", unit: "\xB0", type: "num", min: 8, max: 60, step: 1, def: 20, tip: "\u8D8A\u5C0F\u8D8A\u7075\u654F\uFF1A\u503E\u659C\u5230\u8BE5\u89D2\u5EA6\u65F6\u51C6\u661F\u5230\u8FBE\u5C4F\u5E55\u8FB9\u7F18" },
        deadzoneDeg: { group: "\u4FDD\u6301\u8303\u56F4", label: "\u4E2D\u5FC3\u6B7B\u533A", unit: "\xB0", type: "num", min: 0, max: 10, step: 0.5, def: 1, hidden: true },
        // smooth 是“跟手度”（0.5…1，越大越跟手）；默认 0.6，低于 0.5 会明显拖影，故不开放
        smooth: { group: "\u4FDD\u6301\u8303\u56F4", label: "\u59FF\u6001\u8DDF\u624B\u5EA6", type: "num", min: 0.5, max: 1, step: 0.05, def: 0.6, tip: "\u8D8A\u5927\u8D8A\u8DDF\u624B\u3001\u5EF6\u8FDF\u8D8A\u4F4E\uFF1B0.5 \u4EE5\u4E0B\u4F1A\u660E\u663E\u62D6\u5F71\uFF0C\u6545\u4E0D\u5F00\u653E" },
        // ---------- 目标（固定小怪兽） ----------
        targetRadius: { group: "\u76EE\u6807", label: "\u602A\u517D\u5927\u5C0F", unit: "px", type: "num", min: 12, max: 48, step: 2, def: 22, hidden: true },
        // ---------- 难度 ----------
        difficulty: { group: "\u96BE\u5EA6", label: "\u96BE\u5EA6\u6863\u4F4D", type: "enum", def: "normal", options: ["easy", "normal", "hard", "expert"] },
        // ---------- 显示 / 音频 ----------
        showHitArea: { group: "\u663E\u793A", label: "\u663E\u793A\u5224\u5B9A\u5708", type: "bool", def: false },
        sfxOn: { group: "\u97F3\u9891", label: "\u97F3\u6548", type: "bool", def: true },
        bgmOn: { group: "\u97F3\u9891", label: "\u80CC\u666F\u97F3\u4E50", type: "bool", def: true }
      };
      var DIFFICULTIES = {
        easy: {
          label: "\u7B80\u5355",
          scoreMul: 0.8,
          fireRate: 2,
          hitRange: 88,
          scoreMin: 1,
          scoreMax: 2,
          keepRangeDeg: 10,
          maxLeanDeg: 24,
          comboStep: 0.1,
          comboMaxMul: 2,
          targetRadius: 26
        },
        normal: {
          label: "\u6807\u51C6",
          scoreMul: 1,
          fireRate: 3,
          hitRange: 60,
          scoreMin: 1,
          scoreMax: 3,
          keepRangeDeg: 6,
          maxLeanDeg: 20,
          comboStep: 0.15,
          comboMaxMul: 3,
          targetRadius: 22
        },
        hard: {
          label: "\u56F0\u96BE",
          scoreMul: 1.5,
          fireRate: 4,
          hitRange: 44,
          scoreMin: 2,
          scoreMax: 5,
          keepRangeDeg: 4,
          maxLeanDeg: 18,
          comboStep: 0.2,
          comboMaxMul: 4,
          targetRadius: 20
        },
        expert: {
          label: "\u6781\u9650",
          scoreMul: 2,
          fireRate: 5,
          hitRange: 32,
          scoreMin: 3,
          scoreMax: 8,
          keepRangeDeg: 2,
          maxLeanDeg: 16,
          comboStep: 0.25,
          comboMaxMul: 5,
          targetRadius: 18
        }
      };
      var PANEL_GROUPS = ["\u8BA1\u65F6\u4E0E\u8BA1\u5206", "\u5B50\u5F39\u53D1\u5C04", "\u51FB\u4E2D\u5224\u5B9A", "\u5F97\u5206\u6D6E\u52A8", "\u4FDD\u6301\u8303\u56F4", "\u76EE\u6807", "\u96BE\u5EA6", "\u663E\u793A", "\u97F3\u9891"];
      function isNum(v) {
        return typeof v === "number" && isFinite(v);
      }
      function clampNum(value, meta) {
        let v = Number(value);
        if (!isFinite(v)) v = meta.def;
        if (isNum(meta.min) && v < meta.min) v = meta.min;
        if (isNum(meta.max) && v > meta.max) v = meta.max;
        if (meta.step) v = Math.round(v / meta.step) * meta.step;
        return Math.round(v * 100) / 100;
      }
      function coerce(key, value) {
        const meta = SCHEMA[key];
        if (!meta) return void 0;
        if (meta.type === "bool") {
          if (typeof value === "boolean") return value;
          if (value === "true" || value === 1 || value === "1") return true;
          if (value === "false" || value === 0 || value === "0") return false;
          return meta.def;
        }
        if (meta.type === "enum") {
          const opts = meta.options || Object.keys(DIFFICULTIES);
          return opts.indexOf(value) >= 0 ? value : meta.def;
        }
        return clampNum(value, meta);
      }
      function defaults() {
        const d = {};
        Object.keys(SCHEMA).forEach((k) => {
          d[k] = SCHEMA[k].def;
        });
        return d;
      }
      var DEFAULT_CONFIG = defaults();
      var ConfigStore = class {
        constructor(options) {
          const opt = options || {};
          this.key = opt.storageKey || STORAGE_KEY;
          this.persistEnabled = opt.persist !== false;
          this.state = defaults();
          this.listeners = [];
          this.saveTimer = null;
          if (this.persistEnabled) this.load();
        }
        // ---------- 读写 ----------
        get(key) {
          if (key === void 0) return this.state;
          const v = this.state[key];
          return v === void 0 ? SCHEMA[key] ? SCHEMA[key].def : void 0 : v;
        }
        all() {
          return Object.assign({}, this.state);
        }
        /** 批量修改（治疗师面板 / 远程 API 都走这里），返回真正变化的键 */
        patch(partial, source) {
          if (!partial) return [];
          const changed = [];
          Object.keys(partial).forEach((k) => {
            if (!SCHEMA[k]) return;
            const next = coerce(k, partial[k]);
            if (next === void 0) return;
            if (this.state[k] !== next) {
              this.state[k] = next;
              changed.push(k);
            }
          });
          if (!changed.length) return changed;
          this.fixScoreRange(changed);
          this.scheduleSave();
          this.emit(changed, source || "patch");
          return changed;
        }
        set(key, value, source) {
          const p = {};
          p[key] = value;
          const changed = this.patch(p, source || "set:" + key);
          return changed.length ? this.state[key] : this.get(key);
        }
        fixScoreRange(changed) {
          if (changed.indexOf("scoreMin") >= 0 && this.state.scoreMin > this.state.scoreMax) {
            this.state.scoreMax = this.state.scoreMin;
          }
          if (changed.indexOf("scoreMax") >= 0 && this.state.scoreMax < this.state.scoreMin) {
            this.state.scoreMin = this.state.scoreMax;
          }
        }
        /** 得分浮动区间 [min, max]（已保证 min <= max） */
        getScoreRange() {
          const a = this.state.scoreMin;
          const b = this.state.scoreMax;
          return a <= b ? [a, b] : [b, a];
        }
        // ---------- 难度 ----------
        listDifficulty() {
          return Object.keys(DIFFICULTIES).map((k) => ({
            key: k,
            label: DIFFICULTIES[k].label,
            scoreMul: DIFFICULTIES[k].scoreMul
          }));
        }
        getDifficulty() {
          return DIFFICULTIES[this.state.difficulty] || DIFFICULTIES.normal;
        }
        getScoreMul() {
          return this.getDifficulty().scoreMul;
        }
        /** 套用难度预设（可只改难度不改参数：immediate=false 只记档位） */
        applyDifficulty(level, applyPreset) {
          const preset = DIFFICULTIES[level];
          if (!preset) return [];
          const p = { difficulty: level };
          if (applyPreset !== false) {
            Object.keys(preset).forEach((k) => {
              if (k === "label") return;
              if (SCHEMA[k]) p[k] = preset[k];
            });
          }
          return this.patch(p, "difficulty:" + level);
        }
        // ---------- 订阅 ----------
        subscribe(fn) {
          if (typeof fn !== "function") return () => {
          };
          this.listeners.push(fn);
          const that = this;
          return function off() {
            const i = that.listeners.indexOf(fn);
            if (i >= 0) that.listeners.splice(i, 1);
          };
        }
        emit(changed, source) {
          const payload = { config: this.all(), changed, source };
          this.listeners.slice().forEach((fn) => {
            try {
              fn(payload);
            } catch (e) {
              console.error("[game.config] listener error", e);
            }
          });
        }
        // ---------- 持久化 ----------
        load() {
          let saved = null;
          try {
            saved = wx.getStorageSync(this.key);
          } catch (e) {
          }
          if (saved && typeof saved === "object") {
            Object.keys(SCHEMA).forEach((k) => {
              if (saved[k] !== void 0) this.state[k] = coerce(k, saved[k]);
            });
            this.fixScoreRange(["scoreMin", "scoreMax"]);
          }
          return this.state;
        }
        scheduleSave() {
          if (!this.persistEnabled) return;
          if (this.saveTimer) return;
          const that = this;
          this.saveTimer = setTimeout(function() {
            that.saveTimer = null;
            that.save();
          }, SAVE_DELAY);
        }
        save() {
          if (!this.persistEnabled) return;
          try {
            wx.setStorageSync(this.key, this.state);
          } catch (e) {
          }
        }
        /** 恢复出厂参数 */
        reset() {
          const changed = [];
          Object.keys(DEFAULT_CONFIG).forEach((k) => {
            if (this.state[k] !== DEFAULT_CONFIG[k]) {
              this.state[k] = DEFAULT_CONFIG[k];
              changed.push(k);
            }
          });
          this.save();
          if (changed.length) this.emit(changed, "reset");
          return changed;
        }
      };
      var sharedStore = null;
      function getStore() {
        if (!sharedStore) sharedStore = new ConfigStore();
        return sharedStore;
      }
      module.exports = {
        ConfigStore,
        getStore,
        SCHEMA,
        DEFAULT_CONFIG,
        DIFFICULTIES,
        PANEL_GROUPS,
        STORAGE_KEY,
        coerce
      };
    }
  });

  // utils/game/score.js
  var require_score = __commonJS({
    "utils/game/score.js"(exports, module) {
      var ScoreManager = class {
        /**
         * @param {ConfigStore} cfg 配置中心（运行时读取，随时改随时生效）
         * @param {Object} options { rng: ()=>number }
         */
        constructor(cfg, options) {
          const opt = options || {};
          this.cfg = cfg;
          this.rng = typeof opt.rng === "function" ? opt.rng : Math.random;
          this.reset();
        }
        reset() {
          this.score = 0;
          this.baseScore = 0;
          this.hits = 0;
          this.shots = 0;
          this.combo = 0;
          this.maxCombo = 0;
          this.tick = 0;
          this.lastHitTick = -99999;
          this.elapsedSec = 0;
          this.inZoneSec = 0;
          this.hitTicks = 0;
          this.comboEvents = 0;
          this.baseCarry = 0;
        }
        // ---------- 刻度换算 ----------
        comboWindowTicks() {
          const tick = Math.max(1, Number(this.cfg.get("tickMs")) || 100);
          const win = Math.max(tick, Number(this.cfg.get("comboWindowMs")) || 100);
          return Math.max(1, Math.round(win / tick));
        }
        /** 得分浮动区间内取一个整数（含端点） */
        rollBase() {
          const range = this.cfg.getScoreRange();
          const lo = Math.round(range[0]);
          const hi = Math.round(range[1]);
          if (hi <= lo) return lo;
          return lo + Math.floor(this.rng() * (hi - lo + 1));
        }
        // ---------- 0.1s 刻度：击中累计 + 连击 ----------
        /**
         * @param {number} tickIndex 刻度序号（0,1,2...）
         * @param {Array}  hits      本刻度内发生的命中（[{x,y,targetId}]），可为空
         * @returns {Array} 事件列表，交给引擎配音效 / 飘字
         */
        onTick(tickIndex, hits) {
          this.tick = tickIndex;
          const list = hits && hits.length ? hits : [];
          const events = [];
          if (list.length) {
            this.hitTicks += 1;
            const windowTicks = this.comboWindowTicks();
            for (let i = 0; i < list.length; i++) {
              const h = list[i];
              const continuous = tickIndex - this.lastHitTick <= windowTicks;
              this.combo = continuous ? this.combo + 1 : 1;
              this.lastHitTick = tickIndex;
              if (this.combo > this.maxCombo) this.maxCombo = this.combo;
              const base = this.rollBase();
              const step = Number(this.cfg.get("comboStep")) || 0;
              const cap = Number(this.cfg.get("comboMaxMul")) || 1;
              const mul = Math.min(1 + (this.combo - 1) * step, cap);
              const gain = Math.max(0, Math.round(base * this.cfg.getScoreMul() * mul));
              this.score += gain;
              this.hits += 1;
              if (this.combo >= 2) this.comboEvents += 1;
              events.push({
                type: "hit",
                x: h.x,
                y: h.y,
                gain,
                base,
                mul: Math.round(mul * 100) / 100,
                combo: this.combo,
                score: this.score
              });
            }
            if (events.length > 1) {
              events[events.length - 1].multi = events.length;
            }
            return events;
          }
          if (this.combo > 0 && tickIndex - this.lastHitTick > this.comboWindowTicks()) {
            const broken = this.combo;
            this.combo = 0;
            events.push({ type: "comboEnd", combo: broken });
          }
          return events;
        }
        // ---------- 1.0s 基础刻度 ----------
        /**
         * @param {boolean} inZone 本秒是否保持在允许范围内
         * @returns {Object} { type:'second', elapsed, inZone, gain }
         */
        onSecond(inZone) {
          this.elapsedSec += 1;
          let gain = 0;
          if (inZone) {
            this.inZoneSec += 1;
            const per = Number(this.cfg.get("baseScorePerSecond")) || 0;
            this.baseCarry += per;
            gain = Math.floor(this.baseCarry + 1e-9);
            this.baseCarry = Math.max(0, this.baseCarry - gain);
            this.baseScore += gain;
            this.score += gain;
          }
          return { type: "second", elapsed: this.elapsedSec, inZone: !!inZone, gain };
        }
        // ---------- 统计 ----------
        stats() {
          const total = Math.max(1, this.elapsedSec);
          return {
            score: Math.round(this.score),
            baseScore: Math.round(this.baseScore),
            hits: this.hits,
            shots: this.shots,
            combo: this.combo,
            maxCombo: this.maxCombo,
            elapsedSec: this.elapsedSec,
            inZoneSec: this.inZoneSec,
            zoneRate: Math.round(this.inZoneSec / total * 100),
            accuracy: this.shots > 0 ? Math.round(this.hits / this.shots * 100) : 0,
            comboEvents: this.comboEvents
          };
        }
      };
      module.exports = { ScoreManager };
    }
  });

  // utils/game/bullet.js
  var require_bullet = __commonJS({
    "utils/game/bullet.js"(exports, module) {
      var BulletSystem = class {
        constructor(cfg, options) {
          const opt = options || {};
          this.cfg = cfg;
          this.width = opt.width || 375;
          this.height = opt.height || 600;
          this.list = [];
          this.pool = [];
          this.max = opt.max || 160;
          this.seq = 0;
        }
        resize(width, height) {
          this.width = width;
          this.height = height;
        }
        /** 开火：从 (x, y) 向上发射一颗子弹 */
        fire(x, y, extra) {
          const speed = Number(this.cfg.get("bulletSpeed")) || 760;
          const spread = (Number(this.cfg.get("spreadDeg")) || 0) * Math.PI / 180;
          const angle = -Math.PI / 2 + (Math.random() * 2 - 1) * spread;
          const bullet = this.pool.pop() || {};
          bullet.id = ++this.seq;
          bullet.x = x;
          bullet.y = y;
          bullet.px = x;
          bullet.py = y;
          bullet.vx = Math.cos(angle) * speed;
          bullet.vy = Math.sin(angle) * speed;
          bullet.r = 3.4;
          bullet.life = 0;
          bullet.alive = true;
          if (extra && extra.color) bullet.color = extra.color;
          this.list.push(bullet);
          if (this.list.length > this.max) this.recycle(0);
          return bullet;
        }
        recycle(index) {
          const b = this.list[index];
          if (!b) return;
          this.list.splice(index, 1);
          b.alive = false;
          if (this.pool.length < 120) this.pool.push(b);
        }
        update(dt) {
          const w = this.width;
          const h = this.height;
          for (let i = this.list.length - 1; i >= 0; i--) {
            const b = this.list[i];
            b.px = b.x;
            b.py = b.y;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life += dt;
            if (b.y < -24 || b.x < -24 || b.x > w + 24 || b.y > h + 24) {
              this.recycle(i);
            }
          }
        }
        /** 命中后移除 */
        kill(bullet) {
          const i = this.list.indexOf(bullet);
          if (i >= 0) this.recycle(i);
        }
        clear() {
          while (this.list.length) this.recycle(this.list.length - 1);
        }
        get count() {
          return this.list.length;
        }
      };
      module.exports = { BulletSystem };
    }
  });

  // utils/game/hit.js
  var require_hit = __commonJS({
    "utils/game/hit.js"(exports, module) {
      var MIN_RANGE = 8;
      var MAX_RANGE = 200;
      function dist2(ax, ay, bx, by) {
        const dx = ax - bx;
        const dy = ay - by;
        return dx * dx + dy * dy;
      }
      var HitDetector = class {
        constructor(cfg) {
          this.cfg = cfg;
          this.lastHits = 0;
        }
        /** 当前判定半径（px） */
        getRange() {
          return Number(this.cfg.get("hitRange")) || 0;
        }
        /** 实时调整判定范围：返回收敛后的值 */
        setRange(range) {
          let r = Number(range);
          if (!isFinite(r)) r = this.getRange();
          r = Math.max(MIN_RANGE, Math.min(MAX_RANGE, r));
          this.cfg.set("hitRange", r, "api:setHitArea");
          return this.cfg.get("hitRange");
        }
        /** 圆-圆：点是否落在判定范围内 */
        test(x, y, target) {
          const r = this.getRange();
          const tr = target.radius || 0;
          const radius = Math.max(r, tr);
          return dist2(x, y, target.x, target.y) <= radius * radius;
        }
        /**
         * 线段-圆扫掠：子弹从 (x0,y0) 走到 (x1,y1)，是否穿过判定圈
         * @returns {Object|null} 命中时返回 { x, y, distance }
         */
        sweep(x0, y0, x1, y1, target) {
          const r = Math.max(this.getRange(), target.radius || 0);
          const dx = x1 - x0;
          const dy = y1 - y0;
          const len2 = dx * dx + dy * dy;
          let t = 0;
          if (len2 > 1e-6) {
            t = ((target.x - x0) * dx + (target.y - y0) * dy) / len2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
          }
          const cx = x0 + dx * t;
          const cy = y0 + dy * t;
          const d2 = dist2(cx, cy, target.x, target.y);
          if (d2 > r * r) return null;
          return { x: cx, y: cy, distance: Math.sqrt(d2) };
        }
        /**
         * 批量结算：一次遍历，每颗子弹只消耗一次，每个目标同一帧只记一次
         * @param {Array} bullets BulletSystem.list
         * @param {Array} targets 目标数组
         * @param {Function} onHit (bullet, target, point) => void
         */
        resolve(bullets, targets, onHit) {
          let count = 0;
          for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            if (!b || !b.alive) continue;
            for (let j = 0; j < targets.length; j++) {
              const t = targets[j];
              if (!t || t.dead || t.hitThisFrame) continue;
              const hit = this.sweep(b.px, b.py, b.x, b.y, t);
              if (!hit) continue;
              t.hitThisFrame = true;
              count += 1;
              if (typeof onHit === "function") onHit(b, t, hit);
              break;
            }
          }
          this.lastHits = count;
          return count;
        }
      };
      module.exports = { HitDetector, MIN_RANGE, MAX_RANGE };
    }
  });

  // utils/game/pose.js
  var require_pose = __commonJS({
    "utils/game/pose.js"(exports, module) {
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      var MIRROR_SIGN = -1;
      var PoseTracker = class {
        constructor(cfg) {
          this.cfg = cfg;
          this.roll = 0;
          this.pitch = 0;
          this.angle = 0;
          this.bodyAngle = 0;
          this.norm = 0;
          this.x01 = 0.5;
          this.inZone = true;
          this.dir = "center";
          this.stale = true;
          this.hasSignal = false;
          this.lastSignalAt = 0;
          this.simAngle = 0;
          this.age = 0;
          this.rateHz = 0;
          this._rateAt = 0;
          this._rateCount = 0;
        }
        /** 传感器数据帧：{ roll, pitch } —— 只要带 roll/pitch 的帧就刷新信号时间 */
        feed(frame) {
          if (!frame) return;
          if (typeof frame.roll === "number") this.roll = frame.roll;
          if (typeof frame.pitch === "number") this.pitch = frame.pitch;
          if (typeof frame.roll === "number" || typeof frame.pitch === "number") {
            this.hasSignal = true;
            this.lastSignalAt = Date.now();
            this.stale = false;
            const now = this.lastSignalAt;
            if (!this._rateAt) {
              this._rateAt = now;
              this._rateCount = 0;
            }
            this._rateCount += 1;
            const span = now - this._rateAt;
            if (span >= 1e3) {
              this.rateHz = Math.round(this._rateCount * 1e3 / span);
              this._rateAt = now;
              this._rateCount = 0;
            }
          }
        }
        /** 触屏模拟（未连接传感器 / 没有真机时用来演示） */
        setSimAngle(deg) {
          this.simAngle = deg;
        }
        isSimulating() {
          return this.stale || !this.hasSignal;
        }
        /** 左右移动读取的原始角度：按实机佩戴方向，Pitch 对应左右 */
        rawAngle() {
          return this.pitch;
        }
        /** 每帧更新（now 为引擎时间戳，dt 用于做帧率无关的平滑） */
        update(now, dt) {
          const age = now - this.lastSignalAt;
          if (this.hasSignal && age > 1200) this.stale = true;
          this.age = age;
          const cfg = this.cfg;
          const raw = this.rawAngle();
          const target = this.stale ? this.simAngle : MIRROR_SIGN * raw;
          const targetBody = this.stale ? this.simAngle : raw;
          const smoothCfg = Number(cfg.get("smooth"));
          const base = clamp(isFinite(smoothCfg) ? Math.max(0.5, smoothCfg) : 0.6, 0.05, 1);
          const step = clamp(Number(dt) || 1 / 60, 1e-3, 0.1);
          const alpha = 1 - Math.pow(1 - base, step * 60);
          this.angle += (target - this.angle) * alpha;
          this.bodyAngle += (targetBody - this.bodyAngle) * alpha;
          const dead = Number(cfg.get("deadzoneDeg")) || 0;
          let v = this.angle;
          if (Math.abs(v) < dead) v = 0;
          let bodyV = this.bodyAngle;
          if (Math.abs(bodyV) < dead) bodyV = 0;
          const maxLean = Math.max(5, Number(cfg.get("maxLeanDeg")) || 20);
          const keep = Math.max(1, Number(cfg.get("keepRangeDeg")) || 6);
          this.norm = clamp(v / maxLean, -1, 1);
          this.x01 = (this.norm + 1) / 2;
          this.inZone = Math.abs(bodyV) <= keep + 1e-3;
          const thr = 2;
          if (bodyV < -thr) this.dir = "left";
          else if (bodyV > thr) this.dir = "right";
          else this.dir = "center";
          return this;
        }
        /** 当前患者身体偏离角度（°），用于 HUD / 页面显示 */
        getAngle() {
          return Math.round(this.bodyAngle * 10) / 10;
        }
        /** 保持范围内还剩多少余量（0…1），用于画进度条 */
        zoneRatio() {
          const keep = Math.max(1, Number(this.cfg.get("keepRangeDeg")) || 6);
          return clamp(1 - Math.abs(this.bodyAngle) / keep, 0, 1);
        }
        reset() {
          this.angle = 0;
          this.bodyAngle = 0;
          this.norm = 0;
          this.x01 = 0.5;
          this.inZone = true;
          this.dir = "center";
        }
      };
      module.exports = { PoseTracker };
    }
  });

  // utils/game/sprites.js
  var require_sprites = __commonJS({
    "utils/game/sprites.js"(exports, module) {
      var BASE = "/assets/games/shoot/";
      var ASSETS = {
        bg: "bg.png",
        // 星空背景（256×256，平铺）
        ship: "ship.png",
        // 玩家飞船（99×75）
        laser: "laser.png",
        // 子弹（9×37）
        star: "star.png",
        // 粒子（25×24）
        monsterBody: "monster_body.png",
        // 怪兽身体（141×194）
        monsterEye: "monster_eye.png",
        // 眼睛（64×69）
        mouthIdle: "mouth_idle.png",
        // 平静（张嘴笑）
        mouthSad: "mouth_sad.png",
        // 悲伤（撇嘴）
        browSmug: "brow_smug.png"
        // 得意时的眉毛
      };
      function readAsDataUri(src) {
        try {
          const fs = wx.getFileSystemManager();
          const b64 = fs.readFileSync(src.replace(/^\//, ""), "base64");
          return "data:image/png;base64," + b64;
        } catch (e) {
          return "";
        }
      }
      function loadOne(canvas, src) {
        return new Promise((resolve) => {
          if (!canvas || typeof canvas.createImage !== "function") {
            resolve(null);
            return;
          }
          let img = null;
          try {
            img = canvas.createImage();
          } catch (e) {
            resolve(null);
            return;
          }
          let settled = false;
          const finish = (val) => {
            if (settled) return;
            settled = true;
            resolve(val);
          };
          img.onload = () => finish(img);
          img.onerror = () => {
            const uri = readAsDataUri(src);
            if (!uri) {
              finish(null);
              return;
            }
            let img2 = null;
            try {
              img2 = canvas.createImage();
            } catch (e) {
              finish(null);
              return;
            }
            img2.onload = () => finish(img2);
            img2.onerror = () => finish(null);
            img2.src = uri;
          };
          img.src = src;
          setTimeout(() => {
            if (settled) return;
            if (img && img.width > 0) finish(img);
            else finish(null);
          }, 5e3);
        });
      }
      var SpriteBank = class {
        constructor(canvas) {
          this.canvas = canvas;
          this.map = {};
          this.count = 0;
          this.total = Object.keys(ASSETS).length;
          this.loading = false;
        }
        /** 异步加载全部贴图，返回成功数量（失败也不抛错） */
        load() {
          if (this.loading) return Promise.resolve(this.count);
          this.loading = true;
          const that = this;
          const tasks = Object.keys(ASSETS).map((key) => loadOne(this.canvas, BASE + ASSETS[key]).then((img) => {
            if (img) {
              that.map[key] = img;
              that.count += 1;
            }
          }));
          return Promise.all(tasks).then(() => {
            that.loading = false;
            return that.count;
          });
        }
        get(key) {
          return this.map[key] || null;
        }
        has(key) {
          return !!this.map[key];
        }
        /** 是否全部就绪（用于决定用贴图还是矢量） */
        isReady() {
          return this.count >= this.total;
        }
      };
      module.exports = { SpriteBank, ASSETS, BASE };
    }
  });

  // utils/game/engine.js
  var require_engine = __commonJS({
    "utils/game/engine.js"(exports, module) {
      var { ScoreManager } = require_score();
      var { BulletSystem } = require_bullet();
      var { HitDetector } = require_hit();
      var { PoseTracker } = require_pose();
      var { SpriteBank } = require_sprites();
      var STATE = {
        READY: "ready",
        RUNNING: "running",
        PAUSED: "paused",
        ENDED: "ended"
      };
      var PAD = 16;
      var GROUND_RATIO = 0.87;
      var PLAYER_H = 76;
      var MONSTER_Y_RATIO = 0.4;
      var SENSOR_HZ = 60;
      var SENSOR_STEP_MS = 1e3 / SENSOR_HZ;
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function roundRect(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
        ctx.lineTo(x + w, y + h - rr);
        ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
        ctx.lineTo(x + rr, y + h);
        ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
        ctx.lineTo(x, y + rr);
        ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
        ctx.closePath();
      }
      var GameEngine = class {
        /**
         * @param {Object} opts
         *   cfg      ConfigStore
         *   canvas   Canvas 2D 节点
         *   ctx      CanvasRenderingContext2D
         *   width/height  逻辑尺寸(CSS px)
         *   dpr      devicePixelRatio
         *   audio    AudioKit（可选）
         *   handlers { onState, onEvent }
         */
        constructor(opts) {
          const o = opts || {};
          this.cfg = o.cfg;
          this.canvas = o.canvas;
          this.ctx = o.ctx;
          this.dpr = o.dpr || 1;
          this.audio = o.audio || null;
          this.handlers = o.handlers || {};
          this.insetTop = 0;
          this.externalOverlay = false;
          this.afterRender = null;
          this.width = o.width || 375;
          this.height = o.height || 600;
          this.score = new ScoreManager(this.cfg);
          this.bullets = new BulletSystem(this.cfg, { width: this.width, height: this.height });
          this.hit = new HitDetector(this.cfg);
          this.pose = new PoseTracker(this.cfg);
          this.sprites = new SpriteBank(this.canvas);
          this.sprites.load().then((loaded) => {
            if (this.destroyed) return;
            if (this.state !== STATE.RUNNING) this.render();
            this._emitState(true);
            if (loaded < this.sprites.total) {
              console.warn("[game] \u90E8\u5206\u8D34\u56FE\u672A\u52A0\u8F7D\uFF0C\u5DF2\u56DE\u9000\u77E2\u91CF\u7ED8\u5236\uFF1A" + loaded + "/" + this.sprites.total);
            }
          });
          this.state = STATE.READY;
          this.monster = null;
          this.particles = [];
          this.floats = [];
          this.stars = [];
          this.hitBucket = [];
          this.seq = 0;
          this.tickIndex = 0;
          this.secIndex = 0;
          this.accTick = 0;
          this.accSec = 0;
          this.poseAcc = 0;
          this.fireAcc = 0;
          this.elapsedMs = 0;
          this.t = 0;
          this.bgScroll = 0;
          this.playerX = this.width / 2;
          this.recoil = 0;
          this.muzzle = 0;
          this.shake = 0;
          this.flash = 0;
          this.rangeFlash = 0;
          this.wasInZone = true;
          this.outSince = 0;
          this.destroyed = false;
          this.stateEmitAt = 0;
          this.lastTs = 0;
          this.rafId = 0;
          this.usingRaf = false;
          this._layout();
          this._makeStars();
          this._resetMonster();
          this._unsub = this.cfg.subscribe((p) => this._onConfig(p));
        }
        // ---------------------------------------------------------------- 尺寸 / 布局
        resize(width, height, dpr) {
          this.width = Math.max(160, width);
          this.height = Math.max(200, height);
          this.dpr = dpr || this.dpr;
          this.bullets.resize(this.width, this.height);
          this._layout();
          this._makeStars();
          this.playerX = clamp(this.playerX, PAD, this.width - PAD);
          if (this.monster) this.monster.x = this.cx;
          if (this.state !== STATE.RUNNING) this.render();
        }
        _layout() {
          this.cx = this.width / 2;
          this.groundY = this.height * GROUND_RATIO;
          this.monsterY = this.height * MONSTER_Y_RATIO;
          this.scale = clamp(this.width / 375, 0.72, 1.6);
        }
        _makeStars() {
          this.stars = [];
          const n = Math.round(this.width * this.height / 9e3);
          for (let i = 0; i < n; i++) {
            this.stars.push({
              x: Math.random() * this.width,
              y: Math.random() * this.height * 0.72,
              r: 0.6 + Math.random() * 1.4,
              a: 0.25 + Math.random() * 0.55,
              p: Math.random() * Math.PI * 2
            });
          }
        }
        _resetMonster() {
          this.monster = {
            id: "monster",
            x: this.cx,
            y: this.monsterY,
            radius: Number(this.cfg.get("targetRadius")) || 22,
            sad: 0,
            smug: false,
            hitThisFrame: false,
            dead: false
          };
        }
        /** 保持范围在屏幕上的半宽(px) */
        keepHalfPx() {
          const keep = Number(this.cfg.get("keepRangeDeg")) || 6;
          const maxLean = Math.max(5, Number(this.cfg.get("maxLeanDeg")) || 20);
          const half = Math.min(1, keep / maxLean) * (this.width / 2 - 10);
          return Math.max(18, half);
        }
        // ---------------------------------------------------------------- 生命周期
        start() {
          if (this.state === STATE.RUNNING) return;
          if (this.state === STATE.ENDED) this._resetRound();
          this.state = STATE.RUNNING;
          this.lastTs = 0;
          this._emitEvent({ type: "start" });
          if (this.audio) {
            this.audio.init();
            this.audio.sfx("ui");
            this.audio.startBgm();
          }
          this._startLoop();
        }
        pause() {
          if (this.state !== STATE.RUNNING) return;
          this.state = STATE.PAUSED;
          this._stopLoop();
          if (this.audio) this.audio.pauseBgm();
          this.render();
          this._emitEvent({ type: "pause" });
          this._emitState(true);
        }
        resume() {
          if (this.state !== STATE.PAUSED) return;
          this.state = STATE.RUNNING;
          this.lastTs = 0;
          if (this.audio) this.audio.startBgm();
          this._startLoop();
          this._emitEvent({ type: "resume" });
        }
        toggle() {
          if (this.state === STATE.RUNNING) this.pause();
          else if (this.state === STATE.PAUSED) this.resume();
          else this.start();
        }
        restart() {
          this._stopLoop();
          this._resetRound();
          this.state = STATE.READY;
          this.render();
          this.start();
        }
        destroy() {
          this.destroyed = true;
          this._stopLoop();
          if (this._unsub) this._unsub();
          this._unsub = null;
          if (this.audio) {
            this.audio.stopBgm();
            this.audio.destroy();
          }
          this.bullets.clear();
          this.particles = [];
          this.floats = [];
        }
        _resetRound() {
          this.score.reset();
          this.bullets.clear();
          this.particles = [];
          this.floats = [];
          this.hitBucket = [];
          this.tickIndex = 0;
          this.secIndex = 0;
          this.accTick = 0;
          this.accSec = 0;
          this.fireAcc = 0;
          this.elapsedMs = 0;
          this.t = 0;
          this.recoil = 0;
          this.muzzle = 0;
          this.shake = 0;
          this.flash = 0;
          this.wasInZone = this.pose.inZone;
          this.pose.reset();
          this.playerX = this.cx;
          this._resetMonster();
          this._emitEvent({ type: "reset" });
        }
        // ---------------------------------------------------------------- 帧循环
        _startLoop() {
          if (this.rafId) return;
          const that = this;
          const step = function() {
            that.rafId = 0;
            if (that.destroyed || that.state !== STATE.RUNNING) return;
            const now = Date.now();
            let dt = that.lastTs ? (now - that.lastTs) / 1e3 : 0.016;
            if (!isFinite(dt) || dt <= 0) dt = 0.016;
            if (dt > 0.12) dt = 0.016;
            that.lastTs = now;
            that.t += dt;
            that.update(dt, now);
            that.render();
            that._emitState(false);
            if (that.state !== STATE.RUNNING) {
              that.rafId = 0;
              return;
            }
            that.rafId = that._raf(step);
          };
          this.lastTs = 0;
          this.rafId = this._raf(step);
        }
        _stopLoop() {
          if (!this.rafId) return;
          if (this.usingRaf && this.canvas && typeof this.canvas.cancelAnimationFrame === "function") {
            try {
              this.canvas.cancelAnimationFrame(this.rafId);
            } catch (e) {
            }
          } else {
            try {
              clearTimeout(this.rafId);
            } catch (e) {
            }
          }
          this.rafId = 0;
        }
        _raf(fn) {
          if (this.canvas && typeof this.canvas.requestAnimationFrame === "function") {
            this.usingRaf = true;
            return this.canvas.requestAnimationFrame(fn);
          }
          this.usingRaf = false;
          return setTimeout(function() {
            fn(Date.now());
          }, 16);
        }
        // ---------------------------------------------------------------- 传感器
        feedSensor(frame) {
          this.pose.feed(frame);
        }
        setSimAngle(deg) {
          this.pose.setSimAngle(deg);
        }
        // ---------------------------------------------------------------- 一帧逻辑
        update(dt, now) {
          const cfg = this.cfg;
          this.poseAcc += dt * 1e3;
          let samples = 0;
          while (this.poseAcc >= SENSOR_STEP_MS && samples < 4) {
            this.poseAcc -= SENSOR_STEP_MS;
            this.pose.update(now - this.poseAcc, SENSOR_STEP_MS / 1e3);
            samples += 1;
          }
          if (!samples) this.pose.update(now, dt);
          this.elapsedMs += dt * 1e3;
          this.bgScroll += dt * 16;
          const targetX = PAD + this.pose.x01 * (this.width - PAD * 2);
          const follow = 1 - Math.exp(-60 * dt);
          this.playerX += (targetX - this.playerX) * follow;
          const m = this.monster;
          m.radius = Number(cfg.get("targetRadius")) || 22;
          m.smug = !this.pose.inZone;
          if (m.sad > 0) m.sad = Math.max(0, m.sad - dt);
          if (this.pose.inZone !== this.wasInZone) {
            this.wasInZone = this.pose.inZone;
            if (this.pose.inZone) {
              this.outSince = 0;
              this._emitEvent({ type: "back", angle: this.pose.getAngle() });
            } else {
              this.outSince = now;
              this._emitEvent({
                type: "out",
                dir: this.pose.dir,
                charDir: this.pose.norm < -0.12 ? "left" : this.pose.norm > 0.12 ? "right" : "center",
                angle: this.pose.getAngle()
              });
              this.fireAcc = 0;
              this.bullets.clear();
              if (this.audio) this.audio.sfx("miss");
              this._vibrate();
            }
          }
          if (!this.pose.inZone && this.outSince && now - this.outSince > 2500) {
            this.outSince = now;
            this._emitEvent({ type: "outHint", dir: this.pose.dir });
          }
          if (this.pose.inZone) {
            const rate = Math.max(0.1, Number(cfg.get("fireRate")) || 1);
            const interval = 1 / rate;
            this.fireAcc += dt;
            let guard = 0;
            while (this.fireAcc >= interval && guard < 24) {
              this.fireAcc -= interval;
              this._fire();
              guard += 1;
            }
          } else {
            this.fireAcc = 0;
          }
          this.bullets.update(dt);
          this._collide();
          const tickMs = Math.max(20, Number(cfg.get("tickMs")) || 100);
          this.accTick += dt * 1e3;
          let tickGuard = 0;
          while (this.accTick >= tickMs && tickGuard < 8) {
            this.accTick -= tickMs;
            this._tick();
            tickGuard += 1;
          }
          const baseMs = Math.max(1, Number(cfg.get("baseTickMs")) || 1e3);
          this.accSec += dt * 1e3;
          let secGuard = 0;
          while (this.accSec >= baseMs && secGuard < 4) {
            this.accSec -= baseMs;
            this._second();
            secGuard += 1;
          }
          this.recoil = Math.max(0, this.recoil - dt * 4);
          this.muzzle = Math.max(0, this.muzzle - dt);
          this.shake = Math.max(0, this.shake - dt * 3.5);
          this.flash = Math.max(0, this.flash - dt * 2);
          this.rangeFlash = Math.max(0, this.rangeFlash - dt);
          this._updateEffects(dt);
          const duration = Number(cfg.get("gameDuration")) || 0;
          if (duration > 0 && this.elapsedMs >= duration * 1e3) {
            this._end();
          }
        }
        _tick() {
          this.tickIndex += 1;
          const events = this.score.onTick(this.tickIndex, this.hitBucket);
          this.hitBucket = [];
          for (let i = 0; i < events.length; i++) {
            const ev = events[i];
            if (ev.type === "hit") {
              this._addFloat(ev.x, ev.y, "+" + ev.gain, ev.combo >= 2 ? "#ffd166" : "#7dffcf", ev.combo >= 2 ? 1.15 : 1);
              if (ev.combo >= 3) this._addFloat(ev.x, ev.y - 16, "COMBO x" + ev.combo, "#ff9f43", 0.9);
              if (this.audio) this.audio.sfx(ev.combo >= 3 ? "combo" : "hit");
              this.flash = Math.min(1, this.flash + 0.35);
              if (ev.combo >= 5) this._vibrate();
              this._emitEvent(ev);
            } else if (ev.type === "comboEnd") {
              this._emitEvent(ev);
            }
          }
        }
        _second() {
          this.secIndex += 1;
          const ev = this.score.onSecond(this.pose.inZone);
          if (ev.gain > 0) {
            this._addFloat(this.playerX, this.groundY - PLAYER_H - 10, "+" + ev.gain, "#9fe8ff", 0.85);
          }
          this._emitEvent(ev);
          this._emitState(true);
        }
        _end() {
          if (this.state === STATE.ENDED) return;
          this.state = STATE.ENDED;
          this._stopLoop();
          const stats = this.score.stats();
          if (this.audio) {
            this.audio.sfx("combo");
            this.audio.stopBgm();
          }
          this._emitEvent({ type: "end", stats });
          this._emitState(true);
          this.render();
        }
        _vibrate() {
          if (typeof wx === "undefined" || !wx.vibrateShort) return;
          try {
            wx.vibrateShort({ type: "light" });
          } catch (e) {
          }
        }
        // ---------------------------------------------------------------- 开火 / 碰撞
        _fire() {
          if (!this.pose.inZone) return false;
          const gunX = this.playerX;
          const gunY = this.gunY();
          this.bullets.fire(gunX, gunY);
          this.score.shots += 1;
          this.recoil = Math.min(1, this.recoil + 0.45);
          this.muzzle = 0.07;
          if (this.audio) this.audio.sfx("shoot");
          return true;
        }
        _collide() {
          const m = this.monster;
          m.hitThisFrame = false;
          const hits = [];
          for (let i = this.bullets.list.length - 1; i >= 0; i--) {
            const b = this.bullets.list[i];
            if (m.hitThisFrame) break;
            const hit = this.hit.sweep(b.px, b.py, b.x, b.y, m);
            if (!hit) continue;
            this.bullets.kill(b);
            m.hitThisFrame = true;
            m.sad = 0.7;
            hits.push({ x: hit.x, y: hit.y, targetId: "monster" });
            this._burst(hit.x, hit.y);
            this.shake = Math.min(1, this.shake + 0.25);
          }
          if (hits.length) {
            this.hitBucket = this.hitBucket.concat(hits);
          }
        }
        // ---------------------------------------------------------------- 特效
        _burst(x, y) {
          const color = "#ff9f6e";
          for (let i = 0; i < 12; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 40 + Math.random() * 150;
            this.particles.push({
              x,
              y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              r: 1 + Math.random() * 2.6,
              life: 0.45 + Math.random() * 0.35,
              max: 0.8,
              color
            });
          }
        }
        _addFloat(x, y, text, color, scale) {
          this.floats.push({ x, y, text, color: color || "#fff", scale: scale || 1, life: 0.9, max: 0.9 });
        }
        _updateEffects(dt) {
          for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 260 * dt;
            p.vx *= 0.98;
            p.life -= dt;
            if (p.life <= 0) this.particles.splice(i, 1);
          }
          for (let i = this.floats.length - 1; i >= 0; i--) {
            const f = this.floats[i];
            f.y -= 34 * dt;
            f.life -= dt;
            if (f.life <= 0) this.floats.splice(i, 1);
          }
        }
        // ---------------------------------------------------------------- 状态外发
        _emitEvent(ev) {
          if (this.handlers.onEvent) {
            try {
              this.handlers.onEvent(ev);
            } catch (e) {
              console.error("[engine] onEvent", e);
            }
          }
        }
        _emitState(force) {
          const now = Date.now();
          if (!force && now - this.stateEmitAt < 66) return;
          this.stateEmitAt = now;
          if (this.handlers.onState) {
            try {
              this.handlers.onState(this.getState());
            } catch (e) {
              console.error("[engine] onState", e);
            }
          }
        }
        getState() {
          const duration = Number(this.cfg.get("gameDuration")) || 0;
          const elapsed = this.elapsedMs / 1e3;
          const st = this.score.stats();
          return {
            state: this.state,
            running: this.state === STATE.RUNNING,
            paused: this.state === STATE.PAUSED,
            ended: this.state === STATE.ENDED,
            score: st.score,
            hits: st.hits,
            shots: st.shots,
            combo: this.score.combo,
            maxCombo: st.maxCombo,
            zoneRate: st.zoneRate,
            elapsed: Math.round(elapsed * 10) / 10,
            timeLeft: duration > 0 ? Math.max(0, Math.round((duration - elapsed) * 10) / 10) : -1,
            duration,
            angle: this.pose.getAngle(),
            inZone: this.pose.inZone,
            dir: this.pose.dir,
            // 屏幕里小人的左右（镜像后的位置），回中提示按它给方向
            charDir: this.pose.norm < -0.12 ? "left" : this.pose.norm > 0.12 ? "right" : "center",
            zoneRatio: Math.round(this.pose.zoneRatio() * 100),
            sensorStale: this.pose.stale,
            sensorHz: this.pose.rateHz || 0,
            samplingHz: SENSOR_HZ,
            fireRate: this.cfg.get("fireRate"),
            hitRange: this.cfg.get("hitRange"),
            comboWindowMs: this.cfg.get("comboWindowMs"),
            difficulty: this.cfg.get("difficulty"),
            bullets: this.bullets.count,
            monsterState: this.monster.smug ? "smug" : this.monster.sad > 0 ? "sad" : "idle"
          };
        }
        // ---------------------------------------------------------------- 配置热更新
        _onConfig(payload) {
          if (!payload) return;
          if (payload.changed.indexOf("hitRange") >= 0) this.rangeFlash = 1.4;
          if (this.audio) this.audio.sync();
          this._emitState(true);
          if (this.state !== STATE.RUNNING) this.render();
        }
        // ---------------------------------------------------------------- 对外参数 API
        setHitArea(range) {
          const v = this.hit.setRange(range);
          this.rangeFlash = 2;
          this._emitState(true);
          return v;
        }
        setFireRate(fps) {
          const v = this.cfg.set("fireRate", fps, "api:setFireRate");
          this.fireAcc = 0;
          return v;
        }
        setDifficulty(level, applyPreset) {
          const changed = this.cfg.applyDifficulty(level, applyPreset !== false);
          const mul = this.cfg.getScoreMul();
          this.rangeFlash = 1.6;
          return { level: this.cfg.get("difficulty"), scoreMul: mul, changed };
        }
        setScoreRange(min, max) {
          this.cfg.patch({ scoreMin: min, scoreMax: max }, "api:setScoreRange");
          return this.cfg.getScoreRange();
        }
        setKeepRange(deg) {
          return this.cfg.set("keepRangeDeg", deg, "api:setKeepRange");
        }
        setMaxLean(deg) {
          return this.cfg.set("maxLeanDeg", deg, "api:setMaxLean");
        }
        // ================================================================ 渲染
        render() {
          const ctx = this.ctx;
          if (!ctx) return;
          const w = this.width;
          const h = this.height;
          ctx.save();
          ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);
          if (this.shake > 0) {
            const s = this.shake * 4;
            ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
          }
          this._drawBackground();
          this._drawKeepZone();
          this._drawAimLine();
          this._drawMonster();
          this._drawPlayer();
          this._drawBullets();
          this._drawParticles();
          this._drawFloats();
          this._drawHud();
          if (this.state !== STATE.RUNNING && !this.externalOverlay) this._drawOverlay();
          ctx.restore();
          if (typeof this.afterRender === "function") {
            ctx.save();
            ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            try {
              this.afterRender();
            } catch (e) {
              console.error("[engine] afterRender", e);
            }
            ctx.restore();
          }
        }
        _drawBackground() {
          const ctx = this.ctx;
          const w = this.width;
          const h = this.height;
          const bg = this.sprites.get("bg");
          if (bg) {
            const tile = Math.max(200, Math.round(w * 0.66));
            const off = this.bgScroll % tile;
            ctx.save();
            for (let y = -tile - off; y < h + tile; y += tile) {
              for (let x = -tile * 0.5; x < w + tile; x += tile) {
                ctx.drawImage(bg, x, y, tile, tile);
              }
            }
            ctx.restore();
            const shade = ctx.createLinearGradient(0, 0, 0, h);
            shade.addColorStop(0, "rgba(6,9,20,0.55)");
            shade.addColorStop(0.5, "rgba(6,9,20,0.20)");
            shade.addColorStop(1, "rgba(6,9,20,0.66)");
            ctx.fillStyle = shade;
            ctx.fillRect(0, 0, w, h);
            const glow2 = ctx.createRadialGradient(this.cx, this.groundY + 30, 8, this.cx, this.groundY + 30, this.width * 0.9);
            glow2.addColorStop(0, "rgba(15,156,140,0.22)");
            glow2.addColorStop(1, "rgba(15,156,140,0)");
            ctx.fillStyle = glow2;
            ctx.fillRect(0, this.groundY - 80, w, h - this.groundY + 80);
            return;
          }
          const g = ctx.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, "#070d1c");
          g.addColorStop(0.5, "#0d1a31");
          g.addColorStop(1, "#122a47");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
          for (let i = 0; i < this.stars.length; i++) {
            const s = this.stars[i];
            const a = s.a * (0.65 + 0.35 * Math.sin(this.t * 1.6 + s.p));
            ctx.globalAlpha = a;
            ctx.fillStyle = "#cfe8ff";
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          const glow = ctx.createRadialGradient(this.cx, this.groundY, 8, this.cx, this.groundY, this.width * 0.85);
          glow.addColorStop(0, "rgba(15,156,140,0.30)");
          glow.addColorStop(1, "rgba(15,156,140,0)");
          ctx.fillStyle = glow;
          ctx.fillRect(0, this.groundY - this.width * 0.5, this.width, this.width * 0.9);
          const floor = ctx.createLinearGradient(0, this.groundY, 0, h);
          floor.addColorStop(0, "rgba(12,32,52,0.92)");
          floor.addColorStop(1, "#050a14");
          ctx.fillStyle = floor;
          ctx.fillRect(0, this.groundY, w, h - this.groundY);
        }
        _drawKeepZone() {
          const ctx = this.ctx;
          const half = this.keepHalfPx();
          const top = 74 * this.scale + (this.insetTop || 0);
          const bottom = this.groundY - 30;
          const inZone = this.pose.inZone;
          const accent = inZone ? "rgba(15,156,140,1)" : "rgba(255,86,86,1)";
          const fill = inZone ? "rgba(15,156,140,0.10)" : "rgba(255,86,86,0.12)";
          ctx.fillStyle = fill;
          ctx.fillRect(this.cx - half, top, half * 2, bottom - top);
          ctx.save();
          ctx.setLineDash([7, 7]);
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = inZone ? "rgba(88,214,199,0.55)" : "rgba(255,120,120,0.7)";
          ctx.beginPath();
          ctx.moveTo(this.cx - half, top);
          ctx.lineTo(this.cx - half, bottom);
          ctx.moveTo(this.cx + half, top);
          ctx.lineTo(this.cx + half, bottom);
          ctx.stroke();
          ctx.restore();
          ctx.save();
          ctx.setLineDash([3, 9]);
          ctx.strokeStyle = "rgba(255,255,255,0.16)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(this.cx, top);
          ctx.lineTo(this.cx, bottom);
          ctx.stroke();
          ctx.restore();
          const fs = Math.round(11 * this.scale);
          ctx.font = fs + "px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillStyle = accent;
          ctx.globalAlpha = 0.95;
          ctx.fillText("\u4FDD \u6301 \u533A  \xB1" + this.cfg.get("keepRangeDeg") + "\xB0", this.cx, top - 6);
          ctx.globalAlpha = 1;
        }
        _drawAimLine() {
          if (this.state !== STATE.RUNNING) return;
          const ctx = this.ctx;
          const x = this.playerX;
          const y = this.gunY();
          ctx.save();
          ctx.setLineDash([2, 8]);
          ctx.lineWidth = 1;
          ctx.strokeStyle = this.pose.inZone ? "rgba(88,214,199,0.35)" : "rgba(255,120,120,0.3)";
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, 74 * this.scale);
          ctx.stroke();
          ctx.restore();
        }
        // ---------------------------------------------------------------- 怪兽
        _drawMonster() {
          const ctx = this.ctx;
          const m = this.monster;
          if (!m) return;
          const showRange = !!this.cfg.get("showHitArea") || this.rangeFlash > 0;
          const range = this.cfg.get("hitRange");
          const s = this.scale;
          const x = m.x;
          const smug = !!m.smug;
          const sad = m.sad > 0;
          const laugh = smug ? Math.abs(Math.sin(this.t * 9)) * 2.6 * s : 0;
          const y = m.y + Math.sin(this.t * 2.2) * 3 * s - laugh;
          const r = m.radius;
          if (showRange) {
            ctx.save();
            ctx.setLineDash([4, 5]);
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = "rgba(255,255,255,0.42)";
            ctx.beginPath();
            ctx.arc(x, y, Math.max(range, r), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
          const haloColor = smug ? "rgba(255,120,110,0.30)" : "rgba(255,209,102,0.26)";
          const halo = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2.2);
          halo.addColorStop(0, haloColor);
          halo.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
          ctx.fill();
          const body = this.sprites.get("monsterBody");
          if (body) {
            const bh = r * 2.62 * (smug ? 1.03 : 1);
            const bw = bh * (141 / 194);
            const bx = x - bw / 2;
            const by = y - bh / 2;
            ctx.drawImage(body, bx, by, bw, bh);
            const eye = this.sprites.get("monsterEye");
            if (eye) {
              const ew = bw * 0.32;
              const eh = ew * (69 / 64);
              ctx.drawImage(eye, x - ew / 2, by + bh * 0.41 - eh / 2, ew, eh);
            }
            const mouthKey = sad && !smug ? "mouthSad" : "mouthIdle";
            const mouth = this.sprites.get(mouthKey);
            if (mouth) {
              const mw = bw * (smug ? 0.42 : mouthKey === "mouthIdle" ? 0.36 : 0.33);
              const mh = mw * (mouth.height / mouth.width);
              ctx.drawImage(mouth, x - mw / 2, by + bh * 0.63, mw, mh);
            }
            if (smug) {
              const brow = this.sprites.get("browSmug");
              if (brow) {
                const brw = bw * 0.3;
                const brh = brw * (brow.height / brow.width);
                ctx.save();
                ctx.translate(x + bw * 0.03, by + bh * 0.22);
                ctx.rotate(-0.16);
                ctx.globalAlpha = 0.95;
                ctx.drawImage(brow, -brw / 2, -brh / 2, brw, brh);
                ctx.restore();
              }
            }
            return;
          }
          const g = ctx.createLinearGradient(x, y - r, x, y + r);
          g.addColorStop(0, "#a78bfa");
          g.addColorStop(1, "#6d5bd0");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffd166";
          ctx.beginPath();
          ctx.moveTo(x - r * 0.7, y - r * 0.85);
          ctx.lineTo(x - r * 0.9, y - r * 1.35);
          ctx.lineTo(x - r * 0.35, y - r * 0.95);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(x + r * 0.7, y - r * 0.85);
          ctx.lineTo(x + r * 0.9, y - r * 1.35);
          ctx.lineTo(x + r * 0.35, y - r * 0.95);
          ctx.closePath();
          ctx.fill();
          this._drawMonsterFace(x, y, r, m);
        }
        _drawMonsterFace(x, y, r, m) {
          const ctx = this.ctx;
          const eyeY = y - r * 0.12;
          const eyeDx = r * 0.38;
          const eyeR = r * 0.14;
          ctx.fillStyle = "#2b2440";
          ctx.strokeStyle = "#2b2440";
          ctx.lineWidth = Math.max(1.4, r * 0.08);
          ctx.lineCap = "round";
          if (m.smug) {
            ctx.beginPath();
            ctx.arc(x - eyeDx, eyeY + eyeR * 0.35, eyeR * 0.95, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x + eyeDx, eyeY + eyeR * 0.35, eyeR * 0.95, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
            ctx.fillStyle = "#2b2440";
            ctx.beginPath();
            ctx.arc(x, y + r * 0.24, r * 0.32, 0, Math.PI);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = "#ff7a8a";
            ctx.beginPath();
            ctx.arc(x, y + r * 0.3, r * 0.19, 0, Math.PI);
            ctx.closePath();
            ctx.fill();
          } else if (m.sad > 0) {
            ctx.beginPath();
            ctx.arc(x - eyeDx, eyeY, eyeR, Math.PI, Math.PI * 2);
            ctx.moveTo(x + eyeDx + eyeR, eyeY);
            ctx.arc(x + eyeDx, eyeY, eyeR, Math.PI, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = "#7cc7ff";
            ctx.beginPath();
            ctx.arc(x - eyeDx + eyeR * 0.4, eyeY + eyeR * 1.2, eyeR * 0.4, 0, Math.PI * 2);
            ctx.arc(x + eyeDx + eyeR * 0.4, eyeY + eyeR * 1.2, eyeR * 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#2b2440";
            ctx.beginPath();
            ctx.arc(x, y + r * 0.62, r * 0.3, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
          } else {
            ctx.fillStyle = "#2b2440";
            ctx.beginPath();
            ctx.arc(x - eyeDx, eyeY, eyeR, 0, Math.PI * 2);
            ctx.arc(x + eyeDx, eyeY, eyeR, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(x - eyeDx + eyeR * 0.35, eyeY - eyeR * 0.35, eyeR * 0.35, 0, Math.PI * 2);
            ctx.arc(x + eyeDx + eyeR * 0.35, eyeY - eyeR * 0.35, eyeR * 0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#2b2440";
            ctx.beginPath();
            ctx.arc(x, y + r * 0.32, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI);
            ctx.stroke();
          }
        }
        /** 子弹出生点（贴图飞船时对准机头，矢量小人时对准枪口） */
        gunY() {
          if (this.sprites.get("ship")) return this.groundY - 50 * this.scale;
          return this.groundY - PLAYER_H + 4;
        }
        _drawPlayer() {
          const ctx = this.ctx;
          const x = this.playerX;
          const gy = this.groundY;
          const tilt = clamp(this.pose.angle / Math.max(6, this.cfg.get("maxLeanDeg")), -1, 1) * 0.22;
          const recoil = this.recoil * 4;
          const s = this.scale;
          const ship = this.sprites.get("ship");
          if (ship) {
            const shipH = 46 * s;
            const shipW = shipH * (99 / 75);
            const cy = gy - 24 * s + recoil;
            const flame = 12 * s + Math.sin(this.t * 26) * 3 * s + this.recoil * 8 * s;
            const fg = ctx.createLinearGradient(x, cy + shipH * 0.3, x, cy + shipH * 0.3 + flame);
            fg.addColorStop(0, "rgba(255,255,255,0.95)");
            fg.addColorStop(0.4, "rgba(120,230,255,0.8)");
            fg.addColorStop(1, "rgba(60,120,255,0)");
            ctx.fillStyle = fg;
            ctx.beginPath();
            ctx.moveTo(x - 7 * s, cy + shipH * 0.26);
            ctx.lineTo(x, cy + shipH * 0.26 + flame);
            ctx.lineTo(x + 7 * s, cy + shipH * 0.26);
            ctx.closePath();
            ctx.fill();
            ctx.save();
            ctx.translate(x, cy);
            ctx.rotate(tilt);
            ctx.drawImage(ship, -shipW / 2, -shipH / 2, shipW, shipH);
            ctx.restore();
            if (this.muzzle > 0) {
              const mm = this.muzzle / 0.07;
              ctx.globalAlpha = mm;
              const mg = ctx.createRadialGradient(x, cy - shipH * 0.5, 1, x, cy - shipH * 0.5, 16 * s);
              mg.addColorStop(0, "rgba(255,255,255,1)");
              mg.addColorStop(0.45, "rgba(120,255,220,0.9)");
              mg.addColorStop(1, "rgba(60,220,180,0)");
              ctx.fillStyle = mg;
              ctx.beginPath();
              ctx.arc(x, cy - shipH * 0.5, 16 * s, 0, Math.PI * 2);
              ctx.fill();
              ctx.globalAlpha = 1;
            }
            return;
          }
          ctx.save();
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.translate(x, gy + 4);
          ctx.scale(1, 0.27);
          ctx.beginPath();
          ctx.arc(0, 0, 26 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.save();
          ctx.translate(x, gy);
          ctx.rotate(tilt);
          const bodyW = 24 * s;
          const bodyH = 34 * s;
          const bodyY = -PLAYER_H * s;
          ctx.strokeStyle = "#2d4a6b";
          ctx.lineWidth = 7 * s;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(-6 * s, bodyY + bodyH - 2 * s);
          ctx.lineTo(-9 * s, -2);
          ctx.moveTo(6 * s, bodyY + bodyH - 2 * s);
          ctx.lineTo(9 * s, -2);
          ctx.stroke();
          const bg = ctx.createLinearGradient(0, bodyY, 0, bodyY + bodyH);
          bg.addColorStop(0, "#4fd1c5");
          bg.addColorStop(1, "#0f9c8c");
          ctx.fillStyle = bg;
          roundRect(ctx, -bodyW / 2, bodyY, bodyW, bodyH, 8 * s);
          ctx.fill();
          ctx.fillStyle = this.pose.inZone ? "#eafff9" : "#ff8a80";
          ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this.t * 4);
          ctx.beginPath();
          ctx.arc(0, bodyY + bodyH * 0.55, 4 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#e8f6ff";
          ctx.beginPath();
          ctx.arc(0, bodyY - 8 * s, 9 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#0f9c8c";
          ctx.beginPath();
          ctx.arc(0, bodyY - 8 * s, 5.4 * s, 0.15 * Math.PI, 0.85 * Math.PI);
          ctx.fill();
          const gunY = bodyY + 4 * s - recoil * 0.75;
          ctx.fillStyle = "#d7e6f5";
          roundRect(ctx, -3.2 * s, gunY - 16 * s, 6.4 * s, 20 * s, 2 * s);
          ctx.fill();
          ctx.fillStyle = "#8fb0cc";
          roundRect(ctx, -7 * s, gunY + 2 * s, 14 * s, 6 * s, 2 * s);
          ctx.fill();
          if (this.muzzle > 0) {
            const mm = this.muzzle / 0.07;
            ctx.globalAlpha = mm;
            const mg = ctx.createRadialGradient(0, gunY - 18 * s, 1, 0, gunY - 18 * s, 14 * s);
            mg.addColorStop(0, "rgba(255,255,255,1)");
            mg.addColorStop(0.4, "rgba(255,214,102,0.9)");
            mg.addColorStop(1, "rgba(255,138,101,0)");
            ctx.fillStyle = mg;
            ctx.beginPath();
            ctx.arc(0, gunY - 18 * s, 14 * s, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          ctx.restore();
        }
        _drawBullets() {
          const ctx = this.ctx;
          const laser = this.sprites.get("laser");
          for (let i = 0; i < this.bullets.list.length; i++) {
            const b = this.bullets.list[i];
            if (laser) {
              const h = 36;
              const w = h * (9 / 37);
              ctx.globalAlpha = 0.96;
              ctx.drawImage(laser, b.x - w / 2, b.y - h / 2, w, h);
              ctx.globalAlpha = 1;
              continue;
            }
            const tx = b.x - b.vx * 0.022;
            const ty = b.y - b.vy * 0.022;
            const g = ctx.createLinearGradient(tx, ty, b.x, b.y);
            g.addColorStop(0, "rgba(120,255,220,0)");
            g.addColorStop(1, "rgba(200,255,245,0.95)");
            ctx.strokeStyle = g;
            ctx.lineWidth = 3.2;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            ctx.fillStyle = "rgba(235,255,250,0.95)";
            ctx.beginPath();
            ctx.arc(b.x, b.y, 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        _drawParticles() {
          const ctx = this.ctx;
          const star = this.sprites.get("star");
          for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            ctx.globalAlpha = Math.max(0, p.life / p.max);
            if (star) {
              const sz = p.r * 4.2;
              ctx.drawImage(star, p.x - sz / 2, p.y - sz / 2, sz, sz);
            } else {
              ctx.fillStyle = p.color;
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.globalAlpha = 1;
        }
        _drawFloats() {
          const ctx = this.ctx;
          for (let i = 0; i < this.floats.length; i++) {
            const f = this.floats[i];
            const a = Math.max(0, f.life / f.max);
            ctx.globalAlpha = a;
            ctx.fillStyle = f.color;
            ctx.font = "bold " + Math.round(16 * this.scale * f.scale) + "px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(f.text, f.x, f.y);
          }
          ctx.globalAlpha = 1;
        }
        _drawHud() {
          const ctx = this.ctx;
          const s = this.scale;
          const st = this.getState();
          const pad = 14 * s;
          const top0 = pad + (this.insetTop || 0);
          const cardW1 = 112 * s;
          const cardW2 = 118 * s;
          const cardH = 76 * s;
          ctx.fillStyle = "rgba(8,16,32,0.55)";
          roundRect(ctx, pad - 8 * s, top0 - 8 * s, cardW1, cardH, 12 * s);
          ctx.fill();
          roundRect(ctx, this.width - pad - cardW2 + 8 * s, top0 - 8 * s, cardW2, cardH, 12 * s);
          ctx.fill();
          ctx.strokeStyle = "rgba(120,180,220,0.18)";
          ctx.lineWidth = 1;
          roundRect(ctx, pad - 8 * s, top0 - 8 * s, cardW1, cardH, 12 * s);
          ctx.stroke();
          roundRect(ctx, this.width - pad - cardW2 + 8 * s, top0 - 8 * s, cardW2, cardH, 12 * s);
          ctx.stroke();
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillStyle = "rgba(160,196,224,0.85)";
          ctx.font = Math.round(11 * s) + "px sans-serif";
          ctx.fillText("\u5F97\u5206", pad, top0 + 2);
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold " + Math.round(34 * s) + "px sans-serif";
          ctx.fillText(String(st.score), pad, top0 + 16 * s);
          ctx.fillStyle = "rgba(140,170,200,0.85)";
          ctx.font = Math.round(11 * s) + "px sans-serif";
          ctx.fillText("\u547D\u4E2D " + st.hits + " \u6B21", pad, top0 + 58 * s);
          ctx.textAlign = "right";
          const dur = st.duration;
          const label = dur > 0 ? "\u5012\u8BA1\u65F6" : "\u5DF2\u7528\u65F6";
          const numText = dur > 0 ? Math.ceil(st.timeLeft) + "s" : Math.floor(st.elapsed) + "s";
          ctx.fillStyle = "rgba(160,196,224,0.85)";
          ctx.font = Math.round(11 * s) + "px sans-serif";
          ctx.fillText(label, this.width - pad, top0 + 2);
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold " + Math.round(36 * s) + "px sans-serif";
          ctx.fillText(numText, this.width - pad, top0 + 15 * s);
          const barW = 92 * s;
          const barX = this.width - pad - barW;
          const barY = top0 + 62 * s;
          const ratio = dur > 0 ? clamp(st.timeLeft / dur, 0, 1) : 0;
          ctx.fillStyle = "rgba(255,255,255,0.16)";
          roundRect(ctx, barX, barY, barW, 6 * s, 3 * s);
          ctx.fill();
          ctx.fillStyle = ratio > 0.25 ? "#4fd1c5" : "#ff8a65";
          roundRect(ctx, barX, barY, Math.max(4, barW * ratio), 6 * s, 3 * s);
          ctx.fill();
          if (st.combo >= 2) {
            const bob = 1 + 0.06 * Math.sin(this.t * 12);
            ctx.save();
            ctx.translate(this.cx, 150 * s);
            ctx.scale(bob, bob);
            ctx.textAlign = "center";
            ctx.fillStyle = "#ffd166";
            ctx.font = "bold " + Math.round(26 * s) + "px sans-serif";
            ctx.fillText("COMBO x" + st.combo, 0, 0);
            ctx.fillStyle = "rgba(255,209,102,0.75)";
            ctx.font = Math.round(11 * s) + "px sans-serif";
            ctx.fillText("\u8FDE\u51FB\u52A0\u6210\u4E2D", 0, 20 * s);
            ctx.restore();
          }
          const zoneOk = st.inZone;
          ctx.textAlign = "left";
          ctx.textBaseline = "bottom";
          const infoY = this.groundY - 6 * s;
          ctx.fillStyle = zoneOk ? "rgba(125,255,207,0.95)" : "rgba(255,138,128,0.95)";
          ctx.font = "bold " + Math.round(13 * s) + "px sans-serif";
          ctx.fillText(
            (st.sensorStale ? "\u6A21\u62DF " : "\u503E\u89D2 ") + (st.angle > 0 ? "+" : "") + st.angle + "\xB0",
            pad,
            infoY
          );
          ctx.fillStyle = "rgba(160,196,224,0.8)";
          ctx.font = Math.round(11 * s) + "px sans-serif";
          ctx.fillText(
            zoneOk ? "\u4FDD\u6301\u5728\u8303\u56F4\u5185 \xB7 \u81EA\u52A8\u5F00\u706B" : "\u8D85\u51FA\u4FDD\u6301\u8303\u56F4 \xB7 \u57FA\u7840\u5206\u6682\u505C",
            pad,
            infoY - 18 * s
          );
          if (!zoneOk && this.state === STATE.RUNNING) {
            const pulse = 0.35 + 0.25 * Math.sin(this.t * 6);
            ctx.globalAlpha = pulse;
            ctx.strokeStyle = "#ff5a5a";
            ctx.lineWidth = 6 * s;
            ctx.strokeRect(0, 0, this.width, this.height);
            ctx.globalAlpha = 1;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#ffb3ad";
            ctx.font = "bold " + Math.round(17 * s) + "px sans-serif";
            const tip = st.charDir === "left" ? "\u8BF7\u5411\u53F3\u504F  \u2192" : st.charDir === "right" ? "\u2190  \u8BF7\u5411\u5DE6\u504F" : "\u8BF7\u56DE\u5230\u4E2D\u95F4";
            ctx.fillText(tip, this.cx, this.groundY - 140 * s);
          }
        }
        _drawOverlay() {
          if (this.externalOverlay) return;
          const ctx = this.ctx;
          const s = this.scale;
          const st = this.getState();
          ctx.fillStyle = "rgba(4,9,18,0.72)";
          ctx.fillRect(0, 0, this.width, this.height);
          const w = this.width * 0.8;
          const hh = st.ended ? 250 * s : 176 * s;
          const x = (this.width - w) / 2;
          const y = (this.height - hh) / 2;
          ctx.fillStyle = "rgba(16,32,52,0.96)";
          roundRect(ctx, x, y, w, hh, 16 * s);
          ctx.fill();
          ctx.strokeStyle = "rgba(79,209,197,0.45)";
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold " + Math.round(21 * s) + "px sans-serif";
          const title = st.ended ? "\u8BAD\u7EC3\u7ED3\u675F" : st.paused ? "\u5DF2\u6682\u505C" : "\u5C04\u51FB\u8BAD\u7EC3";
          ctx.fillText(title, this.cx, y + 22 * s);
          ctx.fillStyle = "rgba(170,200,225,0.85)";
          ctx.font = Math.round(12 * s) + "px sans-serif";
          if (st.ended) {
            const stats = this.score.stats();
            const lines = [
              "\u603B\u5206 " + stats.score + " \u5206",
              "\u547D\u4E2D " + stats.hits + " \u6B21",
              "\u6700\u9AD8\u8FDE\u51FB x" + stats.maxCombo,
              "\u4FDD\u6301\u5728\u8303\u56F4\u5185 " + stats.zoneRate + "% \u7684\u65F6\u95F4"
            ];
            for (let i = 0; i < lines.length; i++) {
              ctx.fillText(lines[i], this.cx, y + 56 * s + i * 22 * s);
            }
          } else if (st.paused) {
            ctx.fillText("\u70B9\u51FB\u300C\u7EE7\u7EED\u300D\u56DE\u5230\u8BAD\u7EC3", this.cx, y + 58 * s);
            ctx.fillText("\u6CBB\u7597\u5E08\u53EF\u5728\u4E0B\u65B9\u9762\u677F\u5B9E\u65F6\u8C03\u6574\u53C2\u6570", this.cx, y + 82 * s);
          } else {
            ctx.fillText("\u4FDD\u6301\u8EAB\u4F53\u5728\u4E2D\u95F4\uFF0C\u5BF9\u51C6\u5C0F\u602A\u517D\u81EA\u52A8\u5F00\u706B", this.cx, y + 54 * s);
            ctx.fillText("\u504F\u79BB\u4FDD\u6301\u8303\u56F4\u4F1A\u505C\u706B\uFF0C\u5916\u661F\u4EBA\u8FD8\u4F1A\u7B11\u4F60", this.cx, y + 76 * s);
            ctx.fillText("\u672A\u8FDE\u63A5\u4F20\u611F\u5668\u65F6\uFF0C\u53EF\u5DE6\u53F3\u62D6\u52A8\u753B\u9762\u6A21\u62DF", this.cx, y + 98 * s);
          }
          ctx.fillStyle = "#0f9c8c";
          roundRect(ctx, this.cx - 62 * s, y + hh - 52 * s, 124 * s, 36 * s, 18 * s);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold " + Math.round(15 * s) + "px sans-serif";
          ctx.textBaseline = "middle";
          const btnText = st.ended ? "\u518D\u6765\u4E00\u5C40" : st.paused ? "\u7EE7\u7EED\u8BAD\u7EC3" : "\u5F00\u59CB\u8BAD\u7EC3";
          ctx.fillText(btnText, this.cx, y + hh - 34 * s);
        }
        /** 覆盖层按钮的命中检测（页面 tap 时调用） */
        isOverlayButtonHit(x, y) {
          if (this.state === STATE.RUNNING) return false;
          const s = this.scale;
          const st = this.getState();
          const hh = st.ended ? 250 * s : 176 * s;
          const cy = (this.height - hh) / 2 + hh - 52 * s;
          return x >= this.cx - 70 * s && x <= this.cx + 70 * s && y >= cy - 6 * s && y <= cy + 42 * s;
        }
      };
      module.exports = { GameEngine, STATE };
    }
  });

  // utils/game/audio.js
  var require_audio = __commonJS({
    "utils/game/audio.js"(exports, module) {
      var PROFILES = {
        // 射击：保持原素材与手感
        shooter: {
          base: "/audio/game/",
          sfx: { shoot: "shoot.mp3", hit: "hit.mp3", combo: "combo.mp3", miss: "miss.mp3", ui: "ui.mp3" },
          pool: { shoot: 3, hit: 3, combo: 2, miss: 2, ui: 2 },
          gap: { default: 45, shoot: 45 },
          bgm: "bgm.mp3"
        },
        // 接水果 / 走钢丝 / 节奏：柔和一套（hit 是"接住"的别名，兼容旧调用点）
        casual: {
          base: "/audio/game/sfx/",
          sfx: {
            catch: "fruit_catch.mp3",
            hit: "fruit_catch.mp3",
            combo: "fruit_combo.mp3",
            miss: "fruit_miss.mp3",
            ui: "fruit_ui.mp3"
          },
          pool: { catch: 4, hit: 4, combo: 2, miss: 2, ui: 2 },
          gap: { default: 40, catch: 40, hit: 40, combo: 120, miss: 120 },
          bgm: "garden_loop.mp3"
        }
      };
      var DEFAULT_PROFILE = "shooter";
      var DEFAULT_SFX_VOLUME = 0.8;
      var DEFAULT_BGM_VOLUME = 0.38;
      function clamp01(v, def) {
        const n = Number(v);
        if (!isFinite(n)) return def;
        return n < 0 ? 0 : n > 1 ? 1 : n;
      }
      var AudioKit = class {
        /**
         * @param {object} cfg 配置 store（提供 sfxOn / bgmOn / sfxVolume / bgmVolume）
         * @param {string} profile 'shooter' | 'casual'
         */
        constructor(cfg, profile) {
          this.cfg = cfg;
          this.profileKey = PROFILES[profile] ? profile : DEFAULT_PROFILE;
          this.profile = PROFILES[this.profileKey];
          this.pools = {};
          this.lastAt = {};
          this.cursor = {};
          this.bgm = null;
          this.bgmPlaying = false;
          this.ready = false;
          this.optionSet = false;
          this.errors = 0;
        }
        // ---------------------------------------------------------------- 开关与音量
        _flag(key, def) {
          const v = this.cfg ? this.cfg.get(key) : void 0;
          return v === void 0 ? def : !!v;
        }
        get sfxOn() {
          return this._flag("sfxOn", true);
        }
        get bgmOn() {
          return this._flag("bgmOn", true);
        }
        sfxVolume() {
          const v = this.cfg ? this.cfg.get("sfxVolume") : void 0;
          return clamp01(v, DEFAULT_SFX_VOLUME);
        }
        bgmVolume() {
          const v = this.cfg ? this.cfg.get("bgmVolume") : void 0;
          return clamp01(v, this.profileKey === "casual" ? 0.26 : DEFAULT_BGM_VOLUME);
        }
        _gap(name) {
          const g = this.profile.gap || {};
          return g[name] !== void 0 ? g[name] : g.default || 45;
        }
        // ---------------------------------------------------------------- 初始化
        /** 页面 onLoad / onReady 调用：提前建立播放器，首次发声零延迟 */
        init() {
          if (this.ready || typeof wx === "undefined") return;
          this.ready = true;
          if (!this.optionSet) {
            this.optionSet = true;
            try {
              wx.setInnerAudioOption({ obeyMuteSwitch: false });
            } catch (e) {
            }
          }
          Object.keys(this.profile.sfx).forEach((name) => {
            const size = this.profile.pool && this.profile.pool[name] || 2;
            const pool = [];
            for (let i = 0; i < size; i++) {
              const ctx = this._create(this.profile.sfx[name]);
              if (ctx) pool.push(ctx);
            }
            this.pools[name] = pool;
            this.cursor[name] = 0;
          });
        }
        _create(file) {
          try {
            const ctx = wx.createInnerAudioContext();
            ctx.src = this.profile.base + file;
            ctx.volume = this.sfxVolume();
            ctx.obeyMuteSwitch = false;
            return ctx;
          } catch (e) {
            this.errors += 1;
            return null;
          }
        }
        // ---------------------------------------------------------------- 音效
        sfx(name) {
          if (!this.ready || typeof wx === "undefined") return;
          if (!this.sfxOn) return;
          const pool = this.pools[name];
          if (!pool || !pool.length) return;
          const now = Date.now();
          const gap = this._gap(name);
          if (this.lastAt[name] && now - this.lastAt[name] < gap) return;
          this.lastAt[name] = now;
          const idx = this.cursor[name] % pool.length;
          this.cursor[name] += 1;
          const ctx = pool[idx];
          if (!ctx) return;
          try {
            ctx.stop();
          } catch (e) {
          }
          try {
            ctx.seek(0);
          } catch (e) {
          }
          try {
            ctx.volume = this.sfxVolume();
            ctx.play();
          } catch (e) {
            this.errors += 1;
            const fresh = this._create(this.profile.sfx[name]);
            if (fresh) pool[idx] = fresh;
          }
        }
        // ---------------------------------------------------------------- 背景音乐
        _ensureBgm() {
          if (this.bgm) return this.bgm;
          if (typeof wx === "undefined" || !this.profile.bgm) return null;
          try {
            const ctx = wx.createInnerAudioContext();
            ctx.src = this.profile.base + this.profile.bgm;
            ctx.loop = true;
            ctx.volume = this.bgmVolume();
            ctx.obeyMuteSwitch = false;
            try {
              ctx.onError(() => {
                this.bgmPlaying = false;
              });
            } catch (e) {
            }
            this.bgm = ctx;
          } catch (e) {
            this.bgm = null;
            this.errors += 1;
          }
          return this.bgm;
        }
        startBgm() {
          if (!this.ready || !this.bgmOn) return;
          const ctx = this._ensureBgm();
          if (!ctx) return;
          try {
            ctx.volume = this.bgmVolume();
            ctx.play();
            this.bgmPlaying = true;
          } catch (e) {
            this.bgmPlaying = false;
          }
        }
        /** 从暂停处继续（onShow 用），与 startBgm 同实现但语义更清楚 */
        resumeBgm() {
          if (!this.bgmOn) return;
          this.startBgm();
        }
        pauseBgm() {
          if (!this.bgm) return;
          try {
            this.bgm.pause();
          } catch (e) {
          }
          this.bgmPlaying = false;
        }
        stopBgm() {
          if (!this.bgm) return;
          try {
            this.bgm.stop();
          } catch (e) {
          }
          this.bgmPlaying = false;
        }
        /** 配置变化时调用：开关关闭立即停；音量变化立即生效 */
        sync() {
          if (this.bgm) {
            if (!this.bgmOn) this.stopBgm();
            else {
              try {
                this.bgm.volume = this.bgmVolume();
              } catch (e) {
              }
            }
          }
          Object.keys(this.pools).forEach((name) => {
            this.pools[name].forEach((ctx) => {
              try {
                ctx.volume = this.sfxVolume();
              } catch (e) {
              }
            });
          });
        }
        destroy() {
          Object.keys(this.pools).forEach((name) => {
            this.pools[name].forEach((ctx) => {
              try {
                ctx.stop();
              } catch (e) {
              }
              try {
                ctx.destroy();
              } catch (e) {
              }
            });
            this.pools[name] = [];
          });
          if (this.bgm) {
            try {
              this.bgm.stop();
            } catch (e) {
            }
            try {
              this.bgm.destroy();
            } catch (e) {
            }
            this.bgm = null;
          }
          this.bgmPlaying = false;
          this.ready = false;
        }
      };
      module.exports = { AudioKit, PROFILES, BASE: PROFILES.shooter.base };
    }
  });

  // utils/game/index.js
  var require_game = __commonJS({
    "utils/game/index.js"(exports, module) {
      var { getStore } = require_config();
      var { GameEngine } = require_engine();
      var { AudioKit } = require_audio();
      var { ScoreManager } = require_score();
      var { BulletSystem } = require_bullet();
      var { HitDetector } = require_hit();
      var { PoseTracker } = require_pose();
      var engine = null;
      function attach(e) {
        engine = e || null;
        return engine;
      }
      function detach(e) {
        if (!e || engine === e) engine = null;
      }
      function getEngine() {
        return engine;
      }
      function cfgStore() {
        return getStore();
      }
      function isMounted() {
        return !!engine;
      }
      function setHitArea(range) {
        if (engine) return engine.setHitArea(range);
        return cfgStore().set("hitRange", range, "api:setHitArea");
      }
      function getHitArea() {
        return cfgStore().get("hitRange");
      }
      function setFireRate(fps) {
        if (engine) return engine.setFireRate(fps);
        return cfgStore().set("fireRate", fps, "api:setFireRate");
      }
      function setDifficulty(level, applyPreset) {
        if (engine) return engine.setDifficulty(level, applyPreset);
        const changed = cfgStore().applyDifficulty(level, applyPreset !== false);
        return { level: cfgStore().get("difficulty"), scoreMul: cfgStore().getScoreMul(), changed };
      }
      function setScoreRange(min, max) {
        if (engine) return engine.setScoreRange(min, max);
        cfgStore().patch({ scoreMin: min, scoreMax: max }, "api:setScoreRange");
        return cfgStore().getScoreRange();
      }
      function setKeepRange(deg) {
        if (engine) return engine.setKeepRange(deg);
        return cfgStore().set("keepRangeDeg", deg, "api:setKeepRange");
      }
      function setMaxLean(deg) {
        if (engine) return engine.setMaxLean(deg);
        return cfgStore().set("maxLeanDeg", deg, "api:setMaxLean");
      }
      function setComboWindow(ms) {
        return cfgStore().set("comboWindowMs", ms, "api:setComboWindow");
      }
      function patch(partial) {
        return cfgStore().patch(partial, "api:patch");
      }
      function getConfig() {
        return cfgStore().all();
      }
      function saveConfig() {
        cfgStore().save();
        return true;
      }
      function resetConfig() {
        return cfgStore().reset();
      }
      function getState() {
        if (engine) return engine.getState();
        return { state: "idle", running: false, score: 0, hits: 0, combo: 0, sensorStale: true };
      }
      function start() {
        if (engine) engine.start();
      }
      function pause() {
        if (engine) engine.pause();
      }
      function resume() {
        if (engine) engine.resume();
      }
      function toggle() {
        if (engine) engine.toggle();
      }
      function restart() {
        if (engine) engine.restart();
      }
      function createEngine(opts) {
        const o = opts || {};
        const cfg = o.cfg || cfgStore();
        const audio = o.audio || new AudioKit(cfg);
        const e = new GameEngine(Object.assign({}, o, { cfg, audio }));
        attach(e);
        return e;
      }
      function mountGlobal() {
        if (typeof getApp !== "function") return false;
        const app = getApp();
        if (!app) return false;
        app.globalData = app.globalData || {};
        app.globalData.gameApi = api;
        return true;
      }
      var api = {
        // 参数（治疗师实时调整）
        setHitArea,
        getHitArea,
        setFireRate,
        setDifficulty,
        setScoreRange,
        setKeepRange,
        setMaxLean,
        setComboWindow,
        patch,
        getConfig,
        saveConfig,
        resetConfig,
        // 运行
        start,
        pause,
        resume,
        toggle,
        restart,
        getState,
        // 引擎
        createEngine,
        attach,
        detach,
        getEngine,
        isMounted,
        mountGlobal,
        // 模块（便于复用 / 单测）
        GameEngine,
        ScoreManager,
        BulletSystem,
        HitDetector,
        PoseTracker,
        AudioKit,
        getStore
      };
      module.exports = api;
    }
  });

  // games/shoot/ui.js
  var require_ui = __commonJS({
    "games/shoot/ui.js"(exports, module) {
      var STATE = { READY: "ready", RUNNING: "running", PAUSED: "paused", ENDED: "ended" };
      var C = {
        scrim: "rgba(4,9,18,0.74)",
        card: "rgba(14,28,46,0.97)",
        cardLine: "rgba(79,209,197,0.42)",
        ink: "#FFFFFF",
        soft: "rgba(186,208,230,0.92)",
        mute: "rgba(150,178,204,0.72)",
        teal: "#17B39B",
        tealDeep: "#0F9C8C",
        amber: "#FFB44D",
        danger: "#FF8A7A",
        ghost: "rgba(255,255,255,0.08)",
        ghostLine: "rgba(255,255,255,0.18)"
      };
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function rr(ctx, x, y, w, h, r) {
        const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.lineTo(x + w - rad, y);
        ctx.arcTo(x + w, y, x + w, y + rad, rad);
        ctx.lineTo(x + w, y + h - rad);
        ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
        ctx.lineTo(x + rad, y + h);
        ctx.arcTo(x, y + h, x, y + h - rad, rad);
        ctx.lineTo(x, y + rad);
        ctx.arcTo(x, y, x + rad, y, rad);
        ctx.closePath();
      }
      var ShootUI = class {
        constructor(opts) {
          const o = opts || {};
          this.ctx = o.ctx;
          this.engine = o.engine;
          this.cfg = o.cfg;
          this.W = 390;
          this.H = 700;
          this.dpr = 2;
          this.s = 1;
          this.insetTop = 0;
          this.insetBottom = 0;
          this.buttons = [];
          this.pressed = {};
        }
        resize(w, h, dpr) {
          this.W = Math.max(160, w);
          this.H = Math.max(200, h);
          this.dpr = dpr || this.dpr;
          this.s = clamp(this.W / 375, 0.88, 1.4);
        }
        setInsets(top, bottom) {
          this.insetTop = top || 0;
          this.insetBottom = bottom || 0;
        }
        // ---------------------------------------------------------------- 基础绘制
        _font(size, weight) {
          return (weight ? weight + " " : "") + Math.round(size) + 'px -apple-system, "PingFang SC", "Helvetica Neue", sans-serif';
        }
        _text(t, x, y, o) {
          const opt = o || {};
          const c = this.ctx;
          c.font = this._font(opt.size || 12, opt.weight);
          c.fillStyle = opt.color || C.ink;
          c.textAlign = opt.align || "left";
          c.textBaseline = opt.baseline || "middle";
          c.fillText(t, x, y);
        }
        _measure(t, size, weight) {
          const c = this.ctx;
          c.font = this._font(size || 12, weight);
          return c.measureText(String(t)).width;
        }
        _dot(x, y, r, color) {
          const c = this.ctx;
          c.beginPath();
          c.arc(x, y, r, 0, Math.PI * 2);
          c.fillStyle = color;
          c.fill();
        }
        _icon(name, cx, cy, size, color) {
          const c = this.ctx;
          const s = size / 2;
          c.save();
          c.translate(cx, cy);
          c.lineWidth = Math.max(1.4, size * 0.12);
          c.lineCap = "round";
          c.lineJoin = "round";
          c.strokeStyle = color;
          c.fillStyle = color;
          if (name === "play") {
            c.beginPath();
            c.moveTo(-s * 0.42, -s * 0.72);
            c.lineTo(s * 0.74, 0);
            c.lineTo(-s * 0.42, s * 0.72);
            c.closePath();
            c.fill();
          } else if (name === "pause") {
            c.beginPath();
            c.moveTo(-s * 0.46, -s * 0.68);
            c.lineTo(-s * 0.46, s * 0.68);
            c.moveTo(s * 0.46, -s * 0.68);
            c.lineTo(s * 0.46, s * 0.68);
            c.stroke();
          } else if (name === "back") {
            c.beginPath();
            c.moveTo(s * 0.3, -s * 0.62);
            c.lineTo(-s * 0.34, 0);
            c.lineTo(s * 0.3, s * 0.62);
            c.stroke();
          } else if (name === "home") {
            c.beginPath();
            c.moveTo(-s * 0.66, -s * 0.06);
            c.lineTo(0, -s * 0.68);
            c.lineTo(s * 0.66, -s * 0.06);
            c.stroke();
            c.beginPath();
            c.moveTo(-s * 0.44, -s * 0.02);
            c.lineTo(-s * 0.44, s * 0.62);
            c.lineTo(s * 0.44, s * 0.62);
            c.lineTo(s * 0.44, -s * 0.02);
            c.stroke();
          } else if (name === "gear") {
            c.beginPath();
            c.arc(0, 0, s * 0.34, 0, Math.PI * 2);
            c.stroke();
            for (let i = 0; i < 8; i++) {
              const a = Math.PI * 2 * i / 8;
              c.beginPath();
              c.moveTo(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5);
              c.lineTo(Math.cos(a) * s * 0.74, Math.sin(a) * s * 0.74);
              c.stroke();
            }
          } else if (name === "refresh") {
            c.beginPath();
            c.arc(0, 0, s * 0.56, Math.PI * 0.35, Math.PI * 1.72);
            c.stroke();
            c.beginPath();
            c.moveTo(s * 0.1, -s * 0.62);
            c.lineTo(s * 0.62, -s * 0.42);
            c.lineTo(s * 0.26, -s * 0.02);
            c.stroke();
          } else if (name === "bt") {
            c.beginPath();
            c.moveTo(-s * 0.36, -s * 0.4);
            c.lineTo(s * 0.36, s * 0.36);
            c.lineTo(0, s * 0.72);
            c.lineTo(0, -s * 0.72);
            c.lineTo(s * 0.36, -s * 0.36);
            c.lineTo(-s * 0.36, s * 0.4);
            c.stroke();
          }
          c.restore();
        }
        _button(id, x, y, w, h, label, o) {
          const opt = o || {};
          const c = this.ctx;
          this.buttons.push({ id, x, y, w, h });
          const hit = this.pressed[id] && Date.now() - this.pressed[id] < 150;
          c.save();
          if (hit) {
            c.translate(x + w / 2, y + h / 2);
            c.scale(0.97, 0.97);
            c.translate(-(x + w / 2), -(y + h / 2));
          }
          rr(c, x, y, w, h, opt.radius === void 0 ? h / 2 : opt.radius);
          if (opt.variant === "primary") {
            const g = c.createLinearGradient(x, y, x, y + h);
            g.addColorStop(0, "#1AB9A2");
            g.addColorStop(1, "#0E8B7C");
            c.fillStyle = g;
            c.fill();
          } else {
            c.fillStyle = opt.variant === "ghost" ? C.ghost : "rgba(255,255,255,0.05)";
            c.fill();
            c.lineWidth = 1;
            c.strokeStyle = C.ghostLine;
            c.stroke();
          }
          const size = opt.size || 14;
          const iconW = opt.icon ? size * 1.1 : 0;
          const gap = opt.icon ? 6 : 0;
          const textW = this._measure(label, size, "600");
          const total = iconW + gap + textW;
          const startX = x + w / 2 - total / 2;
          const midY = y + h / 2;
          const color = opt.variant === "primary" ? "#FFFFFF" : opt.color || C.soft;
          if (opt.icon) this._icon(opt.icon, startX + iconW / 2, midY, iconW, color);
          this._text(label, startX + iconW + gap, midY + 0.5, {
            size,
            weight: "600",
            color,
            align: "left"
          });
          c.restore();
        }
        /** 卡片底板（返回内容区高度） */
        _card(x, y, w, h) {
          const c = this.ctx;
          c.save();
          c.shadowColor = "rgba(0,0,0,0.45)";
          c.shadowBlur = 24;
          c.shadowOffsetY = 10;
          rr(c, x, y, w, h, 20 * this.s);
          c.fillStyle = C.card;
          c.fill();
          c.restore();
          rr(c, x, y, w, h, 20 * this.s);
          c.lineWidth = 1;
          c.strokeStyle = C.cardLine;
          c.stroke();
        }
        // ---------------------------------------------------------------- 主绘制
        render() {
          const st = this.engine ? this.engine.getState() : { state: STATE.READY };
          this.buttons = [];
          if (st.state === STATE.READY) this._drawIntro(st);
          else if (st.state === STATE.PAUSED) this._drawPause(st);
          else if (st.state === STATE.ENDED) this._drawResult(st);
          this._drawSensorChip(st);
          this._drawBar(st);
        }
        /** 左上角状态胶囊：传感器连没连、多少 Hz */
        _drawSensorChip(st) {
          const c = this.ctx;
          const live = st.sensorStale === false;
          const label = live ? "\u4F20\u611F\u5668" + (st.sensorHz ? " " + st.sensorHz + "Hz" : "") : "\u672A\u8FDE\u63A5 \xB7 \u89E6\u5C4F\u6A21\u62DF";
          const size = 9.5;
          const w = this._measure(label, size, "600") + 26;
          const h = 22;
          const x = 14;
          const y = this.insetTop + 92 * this.s;
          rr(c, x, y, w, h, h / 2);
          c.fillStyle = "rgba(6,14,26,0.62)";
          c.fill();
          c.lineWidth = 1;
          c.strokeStyle = live ? "rgba(125,255,207,0.36)" : "rgba(255,209,102,0.36)";
          c.stroke();
          this._dot(x + 9, y + h / 2, 3, live ? "#7DFFCF" : "#FFD166");
          this._text(label, x + 17, y + h / 2 + 0.5, {
            size,
            weight: "600",
            color: live ? "rgba(160,255,220,0.95)" : "rgba(255,214,102,0.95)"
          });
          this.buttons.push({ id: "connect", x, y, w, h });
        }
        /** 底部操作条：返回 / 设置 / 暂停-继续 */
        _drawBar(st) {
          this.barH = 46;
          const y = this.H - this.insetBottom - 14 - this.barH;
          this.barY = y;
          const gap = 8;
          if (st.state === STATE.ENDED) {
            this.barY = -1;
            return;
          }
          const list = [{ id: "back", icon: "back", label: "\u8FD4\u56DE", variant: "ghost" }];
          if (st.state !== STATE.PAUSED) {
            list.push({ id: "settings", icon: "gear", label: "\u8BBE\u7F6E", variant: "ghost" });
          }
          if (st.state === STATE.RUNNING) list.push({ id: "pause", icon: "pause", label: "\u6682\u505C", variant: "primary" });
          const n = list.length;
          const totalW = this.W - 28 - gap * (n - 1);
          const w = totalW / n;
          list.forEach((b, i) => {
            this._button(b.id, 14 + i * (w + gap), y, w, this.barH, b.label, {
              variant: b.variant,
              icon: b.icon,
              size: 12
            });
          });
        }
        // ---------------------------------------------------------------- 开始页
        _drawIntro(st) {
          const c = this.ctx;
          const s = this.s;
          const W = this.W;
          c.fillStyle = C.scrim;
          c.fillRect(0, 0, W, this.H);
          const cardW = W - 32;
          const x = 16;
          const rowH = 24 * s;
          const stepsH = 3 * rowH;
          const chipsH = 2 * 32 + 8;
          const h = 22 + 26 + 18 + 10 + stepsH + 12 + chipsH + 14 + 48 + 20 + 22;
          const top = Math.max(this.insetTop + 24, (this.H - h) / 2 - 10);
          this._card(x, top, cardW, h);
          let y = top + 26;
          this._text("\u5C04\u51FB\u8BAD\u7EC3", W / 2, y, { size: 21, weight: "800", color: C.ink, align: "center" });
          y += 22;
          this._text("\u8EAB\u4F53\u4FDD\u6301\u5728\u4E2D\u95F4\uFF0C\u5BF9\u51C6\u5C0F\u602A\u517D\u81EA\u52A8\u5F00\u706B", W / 2, y, {
            size: 11,
            weight: "500",
            color: C.mute,
            align: "center"
          });
          y += 20;
          const steps = [
            "\u6234\u597D\u4F20\u611F\u5668\uFF0C\u5148\u505A\u4E00\u6B21\u96F6\u70B9\u6807\u5B9A",
            "\u8EAB\u4F53\u4FDD\u6301\u5728\u7EFF\u8272\u300C\u4FDD\u6301\u533A\u300D\u91CC",
            "\u81EA\u52A8\u5F00\u706B\uFF0C\u51FB\u4E2D\u5C0F\u602A\u517D\u7D2F\u8BA1\u5F97\u5206"
          ];
          steps.forEach((t, i) => {
            const sy = y + i * rowH + 6;
            c.beginPath();
            c.arc(x + 24, sy, 8 * s, 0, Math.PI * 2);
            c.fillStyle = "rgba(79,209,197,0.16)";
            c.fill();
            this._text(String(i + 1), x + 24, sy + 0.5, { size: 9, weight: "700", color: "#9DEBFF", align: "center" });
            this._text(t, x + 40, sy + 0.5, { size: 10.5, weight: "500", color: C.soft });
          });
          y += stepsH + 6;
          const diff = this.cfg.getDifficulty ? this.cfg.getDifficulty() : { label: "\u6807\u51C6" };
          const chips = [
            "\u96BE\u5EA6 " + (diff.label || "\u6807\u51C6"),
            "\u4FDD\u6301 \xB1" + (Number(this.cfg.get("keepRangeDeg")) || 6) + "\xB0",
            "\u53D1\u5C04 " + (Number(this.cfg.get("fireRate")) || 3) + " \u53D1/\u79D2",
            "\u65F6\u957F " + (Number(this.cfg.get("gameDuration")) || 60) + " \u79D2"
          ];
          const cellW = (cardW - 40) / 2;
          chips.forEach((t, i) => {
            const cx = x + 20 + i % 2 * cellW;
            const cy = y + Math.floor(i / 2) * 32;
            rr(c, cx, cy, cellW - 8, 26, 13);
            c.fillStyle = "rgba(255,255,255,0.05)";
            c.fill();
            this._text(t, cx + (cellW - 8) / 2, cy + 13.5, {
              size: 9.5,
              weight: "600",
              color: C.soft,
              align: "center"
            });
          });
          y += chipsH + 8;
          this._button("start", x + 20, y, cardW - 40, 48, "\u5F00\u59CB\u8BAD\u7EC3", {
            variant: "primary",
            icon: "play",
            size: 15
          });
          y += 48 + 16;
          this._text("\u8BAD\u7EC3\u53C2\u6570\u5728\u300C\u8BBE\u7F6E\u300D\u91CC\uFF0C\u6CBB\u7597\u5E08\u53EF\u968F\u65F6\u8C03\u6574", W / 2, y + 4, {
            size: 9,
            weight: "500",
            color: "rgba(150,178,204,0.55)",
            align: "center"
          });
          void st;
        }
        // ---------------------------------------------------------------- 暂停
        _drawPause(st) {
          const c = this.ctx;
          c.fillStyle = C.scrim;
          c.fillRect(0, 0, this.W, this.H);
          const cardW = this.W - 48;
          const x = 24;
          const h = 222;
          const top = Math.max(this.insetTop + 24, (this.H - h) / 2 - 8);
          this._card(x, top, cardW, h);
          this._text("\u5DF2\u6682\u505C", this.W / 2, top + 40, { size: 20, weight: "800", color: C.ink, align: "center" });
          this._text("\u8BA1\u65F6\u548C\u8BA1\u5206\u90FD\u505C\u4F4F\u4E86\uFF0C\u7EE7\u7EED\u540E\u63A5\u7740\u6765", this.W / 2, top + 66, {
            size: 10.5,
            weight: "500",
            color: C.mute,
            align: "center"
          });
          this._text("\u4FDD\u6301 " + Math.round(st.zoneRate || 0) + "% \xB7 \u5F97\u5206 " + st.score, this.W / 2, top + 88, {
            size: 11,
            weight: "600",
            color: C.teal,
            align: "center"
          });
          this._button("resume", x + 20, top + 108, cardW - 40, 46, "\u7EE7\u7EED\u8BAD\u7EC3", {
            variant: "primary",
            icon: "play",
            size: 14
          });
          const half = (cardW - 48) / 2;
          this._button("restart", x + 20, top + 166, half, 40, "\u91CD\u6765", { variant: "ghost", icon: "refresh", size: 11 });
          this._button("settings", x + 28 + half, top + 166, half, 40, "\u8C03\u6574\u53C2\u6570", {
            variant: "ghost",
            icon: "gear",
            size: 11
          });
        }
        // ---------------------------------------------------------------- 结算
        _drawResult(st) {
          const c = this.ctx;
          c.fillStyle = C.scrim;
          c.fillRect(0, 0, this.W, this.H);
          const cardW = this.W - 40;
          const x = 20;
          const h = 300;
          const top = Math.max(this.insetTop + 24, (this.H - h) / 2 - 8);
          this._card(x, top, cardW, h);
          this._text("\u8BAD\u7EC3\u7ED3\u675F", this.W / 2, top + 34, { size: 19, weight: "800", color: C.ink, align: "center" });
          const scoreStr = String(st.score || 0);
          const scSize = 40;
          const scoreW = this._measure(scoreStr, scSize, "800");
          this._text(scoreStr, this.W / 2 - 8, top + 84, { size: scSize, weight: "800", color: C.ink, align: "right" });
          this._text("\u5206", this.W / 2 + 2, top + 92, { size: 12, weight: "600", color: C.mute });
          void scoreW;
          this._text("\u547D\u4E2D " + (st.hits || 0) + " \u6B21 \xB7 \u6700\u9AD8\u8FDE\u51FB x" + (st.maxCombo || 0), this.W / 2, top + 116, {
            size: 10.5,
            weight: "500",
            color: C.soft,
            align: "center"
          });
          const tiles = [
            { k: "\u547D\u4E2D", v: st.hits || 0 },
            { k: "\u6700\u9AD8\u8FDE\u51FB", v: "x" + (st.maxCombo || 0) },
            { k: "\u5728\u754C\u7387", v: Math.round(st.zoneRate || 0) + "%" }
          ];
          const gap = 8;
          const tw = (cardW - 40 - gap * 2) / 3;
          tiles.forEach((t, i) => {
            const tx = x + 20 + i * (tw + gap);
            rr(c, tx, top + 134, tw, 46, 10);
            c.fillStyle = "rgba(255,255,255,0.05)";
            c.fill();
            this._text(String(t.v), tx + tw / 2, top + 152, { size: 15, weight: "700", color: C.ink, align: "center" });
            this._text(t.k, tx + tw / 2, top + 170, { size: 8.5, weight: "500", color: C.mute, align: "center" });
          });
          this._button("restart", x + 20, top + 194, cardW - 40, 46, "\u518D\u6765\u4E00\u5C40", {
            variant: "primary",
            icon: "refresh",
            size: 14
          });
          const half = (cardW - 48) / 2;
          this._button("home", x + 20, top + 250, half, 36, "\u8FD4\u56DE\u9996\u9875", { variant: "ghost", icon: "home", size: 11 });
          this._button("settings", x + 28 + half, top + 250, half, 36, "\u8BAD\u7EC3\u8BBE\u7F6E", {
            variant: "ghost",
            icon: "gear",
            size: 11
          });
        }
        // ---------------------------------------------------------------- 交互
        markPress(id) {
          this.pressed[id] = Date.now();
          if (this.engine) this.engine.render();
        }
        hitTest(x, y) {
          for (let i = this.buttons.length - 1; i >= 0; i--) {
            const b = this.buttons[i];
            if (x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 6 && y <= b.y + b.h + 6) {
              return b.id;
            }
          }
          return null;
        }
      };
      module.exports = { ShootUI, STATE };
    }
  });

  // pages/shoot/shoot.js
  var require_shoot = __commonJS({
    "pages/shoot/shoot.js"() {
      var WitBle = require_witble();
      var speaker = require_speaker();
      var game = require_game();
      var { getStore } = require_config();
      var { AudioKit } = require_audio();
      var { ShootUI } = require_ui();
      var SENSOR_HZ = 100;
      var TAP_SLOP = 14;
      Page({
        data: {
          canvasReady: false
        },
        // ---------------------------------------------------------------- 生命周期
        onLoad() {
          this.cfg = getStore();
          this.ble = WitBle.getShared();
          this.game = null;
          this.ui = null;
          this.canvas = null;
          this.rect = null;
          this.retry = 0;
          this.rateApplied = false;
          this.audio = new AudioKit(this.cfg, "shooter");
          game.mountGlobal();
        },
        onReady() {
          this.initCanvas();
        },
        onShow() {
          this.attachBle();
          if (this.ble && this.ble.connectedId) this.applySensorRate();
          if (this.game) this.game.feedSensor(null);
          if (this.audio) this.audio.sync();
          if (this.game) this.game.render();
        },
        onHide() {
          if (this.game && this.game.state === "running") this.game.pause();
          speaker.stop();
          if (this.audio) this.audio.pauseBgm();
        },
        onUnload() {
          speaker.stop();
          if (this.ble) WitBle.detach(this.ble);
          if (this.game) {
            game.detach(this.game);
            this.game.destroy();
            this.game = null;
          }
          if (this.audio) {
            this.audio.destroy();
            this.audio = null;
          }
          this.ui = null;
          this.canvas = null;
        },
        onResize() {
          this.syncCanvasSize();
        },
        // ---------------------------------------------------------------- Canvas
        initCanvas() {
          if (this.game) return;
          const that = this;
          wx.createSelectorQuery().in(this).select("#gameCanvas").fields({ node: true, size: true, rect: true }).exec((res) => {
            const info = res && res[0];
            if (!info || !info.node || !info.width || !info.height) {
              that.retry += 1;
              if (that.retry < 20) setTimeout(() => that.initCanvas(), 100);
              return;
            }
            const canvas = info.node;
            const dpr = that.getDpr();
            that.canvas = canvas;
            that.rect = { left: info.left || 0, top: info.top || 0, width: info.width, height: info.height };
            canvas.width = Math.round(info.width * dpr);
            canvas.height = Math.round(info.height * dpr);
            const ctx = canvas.getContext("2d");
            const engine = game.createEngine({
              canvas,
              ctx,
              width: info.width,
              height: info.height,
              dpr,
              cfg: that.cfg,
              audio: that.audio,
              handlers: { onState: () => {
              }, onEvent: (ev) => that.onEngineEvent(ev) }
            });
            engine.externalOverlay = true;
            engine.insetTop = that.getSafeTop();
            engine.afterRender = () => {
              if (that.ui) that.ui.render();
            };
            that.game = engine;
            that.ui = new ShootUI({ ctx, engine, cfg: that.cfg });
            that.ui.resize(info.width, info.height, dpr);
            that.ui.setInsets(engine.insetTop, that.getSafeBottom());
            that.setData({ canvasReady: true });
            engine.render();
          });
        },
        /** 画布尺寸变了就同步位图并让引擎重排（和接水果一致） */
        syncCanvasSize() {
          if (!this.canvas || !this.game) return;
          const that = this;
          if (this.sizeTimer) clearTimeout(this.sizeTimer);
          this.sizeTimer = setTimeout(() => {
            this.sizeTimer = null;
            wx.createSelectorQuery().in(that).select("#gameCanvas").fields({ size: true, rect: true }).exec((res) => {
              const info = res && res[0];
              if (!info || !info.width || !info.height) return;
              const dpr = that.getDpr();
              that.rect = { left: info.left || 0, top: info.top || 0, width: info.width, height: info.height };
              const w = Math.round(info.width * dpr);
              const h = Math.round(info.height * dpr);
              if (that.canvas.width !== w || that.canvas.height !== h) {
                that.canvas.width = w;
                that.canvas.height = h;
              }
              if (that.ui) {
                that.ui.resize(info.width, info.height, dpr);
                that.ui.setInsets(that.getSafeTop(), that.getSafeBottom());
              }
              if (that.game) {
                that.game.insetTop = that.getSafeTop();
                that.game.resize(info.width, info.height, dpr);
                that.game.render();
              }
            });
          }, 150);
        },
        getDpr() {
          try {
            const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
            return Math.min(info.pixelRatio || 2, 2.5);
          } catch (e) {
            return 2;
          }
        },
        /** 状态栏高度：HUD 不能压到刘海 / 状态栏 */
        getSafeTop() {
          try {
            const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
            const status = info.statusBarHeight || 20;
            return status + 6;
          } catch (e) {
            return 26;
          }
        },
        /** 底部小黑条高度 */
        getSafeBottom() {
          try {
            const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
            const winH = info.windowHeight || info.screenHeight || 0;
            const safeBottom = info.safeArea && info.safeArea.bottom ? info.safeArea.bottom : winH;
            return Math.max(0, Math.min(40, winH - safeBottom));
          } catch (e) {
            return 0;
          }
        },
        // ---------------------------------------------------------------- 传感器
        attachBle() {
          const that = this;
          if (!this.ble) return;
          this.ble.handlers = {
            onData: (d) => {
              if (that.game && d) that.game.feedSensor(d);
            },
            onReady: () => {
              that.applySensorRate();
              if (that.game) that.game.render();
            },
            onDisconnected: () => {
              that.rateApplied = false;
              if (that.game) {
                if (that.game.state === "running") that.game.pause();
                that.game.render();
              }
              wx.showToast({ title: "\u4F20\u611F\u5668\u5DF2\u65AD\u5F00\uFF0C\u8BAD\u7EC3\u5DF2\u6682\u505C", icon: "none" });
            },
            onError: () => {
              that.rateApplied = false;
            },
            onLog: () => {
            }
          };
          if (this.ble.connectedId) this.applySensorRate();
        },
        applySensorRate() {
          if (!this.ble || !this.ble.connectedId || this.rateApplied) return;
          this.rateApplied = true;
          this.ble.setOutputRate(SENSOR_HZ);
        },
        // ---------------------------------------------------------------- 引擎事件
        onEngineEvent(ev) {
          if (!ev) return;
          if (ev.type === "end") {
            speaker.speak("\u8BAD\u7EC3\u7ED3\u675F");
            return;
          }
          if (ev.type === "out") {
            const now = Date.now();
            if (now - (this.lastOutAt || 0) > 3e3) {
              this.lastOutAt = now;
              try {
                wx.vibrateShort({ type: "light" });
              } catch (e) {
              }
            }
          }
        },
        // ---------------------------------------------------------------- 触摸
        onTouchStart(e) {
          const t = e.touches && e.touches[0] || e.changedTouches && e.changedTouches[0];
          if (!t) return;
          const rect = this.rect || { left: 0, top: 0, width: 390, height: 700 };
          this.touchStart = {
            x: typeof t.x === "number" ? t.x : t.clientX - rect.left,
            y: typeof t.y === "number" ? t.y : t.clientY - rect.top,
            at: Date.now()
          };
        },
        onTouchEnd(e) {
          const start = this.touchStart;
          this.touchStart = null;
          if (!start || !this.ui) return;
          const t = e.changedTouches && e.changedTouches[0] || e.touches && e.touches[0];
          if (!t) return;
          const rect = this.rect || { left: 0, top: 0, width: 390, height: 700 };
          const x = typeof t.x === "number" ? t.x : t.clientX - rect.left;
          const y = typeof t.y === "number" ? t.y : t.clientY - rect.top;
          if (Math.abs(x - start.x) + Math.abs(y - start.y) > TAP_SLOP) return;
          const id = this.ui.hitTest(x, y);
          if (!id) return;
          this.dispatch(id);
        },
        onTouchCancel() {
          this.touchStart = null;
        },
        dispatch(id) {
          const engine = this.game;
          if (!engine || !this.ui) return;
          this.ui.markPress(id);
          switch (id) {
            case "start":
            case "resume":
              engine.start();
              if (engine.state === "running" && engine.pose.stale) {
                wx.showToast({ title: "\u672A\u8FDE\u63A5\u4F20\u611F\u5668\uFF0C\u53EF\u7528\u89E6\u5C4F\u6A21\u62DF\u5DE6\u53F3\u503E\u89D2", icon: "none", duration: 2e3 });
              }
              break;
            case "pause":
              engine.pause();
              break;
            case "restart":
              engine.restart();
              break;
            case "settings":
              wx.navigateTo({ url: "/pkgShoot/pages/shoot-settings/shoot-settings" });
              break;
            case "connect":
              wx.navigateTo({ url: "/pages/wit/wit" });
              break;
            case "home":
              wx.switchTab({ url: "/pages/games/games" });
              break;
            case "back": {
              const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
              if (pages && pages.length > 1 && wx.navigateBack) wx.navigateBack();
              else wx.switchTab({ url: "/pages/games/games" });
              break;
            }
            default:
              break;
          }
          engine.render();
        }
      });
    }
  });

  // tools/shoot-preview/main.js
  var params = new URLSearchParams(location.search);
  var screen = (params.get("screen") || "ready").toLowerCase();
  var simAngle = params.get("angle") === null ? null : Number(params.get("angle"));
  var hz = params.get("hz") === null ? 50 : Number(params.get("hz"));
  if (/[?&]bare=1/.test(location.search)) document.body.classList.add("bare");
  var canvasEl = document.getElementById("gameCanvas");
  canvasEl.requestAnimationFrame = (fn) => window.requestAnimationFrame(fn);
  canvasEl.cancelAnimationFrame = (id) => window.cancelAnimationFrame(id);
  function fail(msg, err) {
    const box = document.createElement("pre");
    box.style.cssText = "position:absolute;left:0;right:0;bottom:0;max-height:45%;overflow:auto;margin:0;padding:10px;background:rgba(160,20,20,.92);color:#fff;font:12px/1.5 monospace;z-index:99";
    box.textContent = msg + (err ? "\n\n" + (err.stack || err.message || err) : "");
    document.getElementById("phone").appendChild(box);
    console.error(msg, err);
  }
  function toast(text) {
    const el = document.getElementById("toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 1600);
  }
  var store = {};
  var STATUS = 44;
  window.wx = {
    getStorageSync: (k) => k in store ? store[k] : "",
    setStorageSync: (k, v) => {
      store[k] = v;
    },
    removeStorageSync: (k) => {
      delete store[k];
    },
    getWindowInfo: () => ({
      windowWidth: 390,
      windowHeight: 844,
      pixelRatio: 2,
      statusBarHeight: STATUS,
      screenHeight: 844,
      safeArea: { top: STATUS, bottom: 810, left: 0, right: 390, width: 390, height: 766 }
    }),
    getSystemInfoSync: () => ({
      windowWidth: 390,
      windowHeight: 844,
      pixelRatio: 2,
      statusBarHeight: STATUS,
      platform: "devtools"
    }),
    getMenuButtonBoundingClientRect: () => ({ top: STATUS + 4, bottom: STATUS + 36, left: 300, right: 380, width: 80, height: 32 }),
    createSelectorQuery: () => {
      const q = {
        in() {
          return q;
        },
        select() {
          return q;
        },
        selectAll() {
          return q;
        },
        fields() {
          return q;
        },
        boundingClientRect() {
          return q;
        },
        exec(cb) {
          const r = canvasEl.getBoundingClientRect();
          cb([{ node: canvasEl, width: r.width, height: r.height, left: r.left, top: r.top }]);
        }
      };
      return q;
    },
    createOffscreenCanvas: ({ width, height }) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      return c;
    },
    createImage: () => new Image(),
    createInnerAudioContext: () => ({
      src: "",
      volume: 1,
      loop: false,
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
    getFileSystemManager: () => ({ readFileSync() {
      throw new Error("no fs");
    } }),
    showToast: (o) => toast(o && o.title || ""),
    showModal: (o) => {
      toast("[modal] " + (o && o.title || ""));
      if (o && o.success) setTimeout(() => o.success({ confirm: false, cancel: true }), 0);
    },
    showLoading() {
    },
    hideLoading() {
    },
    navigateTo: (o) => toast("\u2192 " + (o && o.url)),
    redirectTo: (o) => toast("\u2192 " + (o && o.url)),
    navigateBack: () => toast("\u2190 \u8FD4\u56DE"),
    switchTab: (o) => toast("\u2192 " + (o && o.url)),
    vibrateShort() {
    },
    vibrateLong() {
    },
    setNavigationBarColor() {
    },
    setNavigationBarTitle() {
    },
    request() {
    },
    nextTick: (fn) => setTimeout(fn, 0),
    onWindowResize() {
    },
    offWindowResize() {
    },
    onThemeChange() {
    },
    offThemeChange() {
    },
    getAppBaseInfo: () => ({ SDKVersion: "3.0.0" }),
    canIUse: () => true
  };
  window.getApp = () => ({ globalData: {} });
  window.getCurrentPages = () => [{}, {}];
  window.Page = (obj) => {
    window.__page = obj;
  };
  var page = null;
  try {
    require_shoot();
    page = window.__page;
  } catch (e) {
    fail("\u9875\u9762 JS \u52A0\u8F7D\u5931\u8D25", e);
  }
  if (page) {
    page.setData = function(patch, cb) {
      Object.assign(this.data, patch || {});
      if (cb) setTimeout(cb, 0);
    };
  }
  function tap(x, y) {
    if (!page) return;
    page.onTouchStart({ touches: [{ x, y }] });
    page.onTouchEnd({ changedTouches: [{ x, y }] });
  }
  function boot() {
    if (!page) return;
    try {
      page.onLoad();
      page.onReady();
    } catch (e) {
      fail("\u9875\u9762\u751F\u547D\u5468\u671F\u62A5\u9519", e);
      return;
    }
    setTimeout(() => {
      const g = page.game;
      if (!g) {
        fail("\u5F15\u64CE\u6CA1\u6709\u521B\u5EFA\u51FA\u6765\uFF08page.game \u4E3A\u7A7A\uFF09");
        return;
      }
      document.getElementById("boot").style.display = "none";
      if (screen === "running" || screen === "paused" || screen === "ended") {
        page.dispatch("start");
        for (let i = 0; i < 150; i++) {
          page.game.feedSensor({ pitch: 2, roll: 0 });
          page.game.update(1 / 60);
        }
        if (page.game._stopLoop) page.game._stopLoop();
        page.game.render();
      }
      if (screen === "paused") page.dispatch("pause");
      if (screen === "ended") {
        for (let i = 0; i < 180; i++) {
          page.game.feedSensor({ pitch: 2, roll: 0 });
          page.game.update(1 / 60);
        }
        page.game._end();
        page.game.render();
      }
      if (hz > 0) {
        let t = 0;
        setInterval(() => {
          if (!page.game) return;
          t += 1;
          const a = simAngle === null ? Math.sin(t / 22) * 5 : simAngle;
          page.game.feedSensor({ pitch: a, roll: 0 });
        }, Math.max(10, Math.round(1e3 / hz)));
      }
      canvasEl.addEventListener("click", (e) => {
        const r = canvasEl.getBoundingClientRect();
        tap(e.clientX - r.left, e.clientY - r.top);
      });
    }, 120);
    setTimeout(() => {
      const g = page && page.game;
      const r = canvasEl.getBoundingClientRect();
      const d = document.createElement("div");
      d.id = "dbg";
      d.style.display = "none";
      d.textContent = JSON.stringify({
        rect: { w: Math.round(r.width), h: Math.round(r.height) },
        canvas: { w: canvasEl.width, h: canvasEl.height },
        engine: g ? { w: g.width, h: g.height, dpr: g.dpr, scale: Number(g.scale.toFixed(2)), state: g.state, insetTop: g.insetTop } : null,
        buttons: page && page.ui ? page.ui.buttons.map((b) => b.id) : null
      });
      document.body.appendChild(d);
    }, 2200);
  }
  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot);
})();
