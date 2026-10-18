// utils/voiceMap.js —— 语音包映射表（单一数据源）
// 格式：'播报文案': '音频文件名'（音频放在 audio/ 目录，mp3 或 wav 均可）
// tools/gen_voice.ps1 会读取本文件批量合成音频，新增文案后重新运行脚本即可
// 未收录的文案（含数字的动态播报）会继续尝试走插件合成，插件不可用则静默
const VOICE_FILES = {
  // 首页
  '欢迎使用运动康复助手，请先连接蓝牙传感器': 'welcome',
  '正在打开功能页': 'open_page',
  '设备已连接，可查看传感器数据': 'wit_linked',

  // 传感器（外接设备）
  '请确认传感器已开机，蓝灯快闪后点击扫描设备': 'wit_entry',
  '开始扫描蓝牙设备，请稍候': 'ble_scanning',
  '蓝牙不可用，请确认手机蓝牙已开启': 'ble_unavailable',
  '正在连接设备，请稍候': 'ble_connecting',
  '蓝牙连接成功，正在接收传感器数据': 'ble_connected',
  '蓝牙连接失败，请确认传感器已开机并靠近手机': 'ble_connect_fail',
  '数据通道订阅失败，请重新连接': 'ble_subscribe_fail',
  '蓝牙连接已断开，请重新连接': 'ble_disconnected',
  '已断开蓝牙连接': 'ble_manual_disconnect',

  // 传感器读数
  '传感器电量已读取，请查看屏幕': 'battery_read',
  '传感器温度已读取，请查看屏幕': 'temp_read',

  // 零点标定
  '请先连接传感器': 'need_connect',

  // 我的
  '语音播报已开启': 'speech_on',
  '语音播报测试，能听到说明配置正常': 'speech_test'
}

module.exports = { VOICE_FILES }
