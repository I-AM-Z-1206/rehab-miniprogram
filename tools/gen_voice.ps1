# tools/gen_voice.ps1 —— 用 Windows 自带语音合成批量生成小程序语音包
# 用法：在项目根目录打开 PowerShell，执行  .\tools\gen_voice.ps1
# 输出：audio/*.mp3（检测到 ffmpeg 时）或 audio/*.wav（speaker.js 两种都支持）
# 数据源：utils/voiceMap.js —— 新增/修改播报文案后，重跑本脚本即可
# 说明：本方案不依赖任何小程序插件，规避「插件申请失败 89260」问题

param(
  [int]$Rate = 0 # 语速：-10（最慢）~ 10（最快）
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$mapFile = Join-Path $root 'utils\voiceMap.js'
$outDir = Join-Path $root 'audio'

if (-not (Test-Path $mapFile)) {
  Write-Error "找不到映射表：$mapFile"
  exit 1
}
if (-not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

# 解析 '文案': '文件名'
$content = Get-Content $mapFile -Raw -Encoding UTF8
$items = @()
foreach ($m in [regex]::Matches($content, "^\s*'([^']+)'\s*:\s*'([^']+)'\s*,?\s*$", 'Multiline')) {
  $items += [pscustomobject]@{
    Text = $m.Groups[1].Value
    Name = $m.Groups[2].Value
  }
}
Write-Host "共解析到 $($items.Count) 条播报文案" -ForegroundColor Cyan

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$zh = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'zh-*' } | Select-Object -First 1
if ($zh) {
  Write-Host "使用中文语音：$($zh.VoiceInfo.Name)" -ForegroundColor Cyan
  $synth.SelectVoice($zh.VoiceInfo.Name)
} else {
  Write-Warning '系统未安装中文语音，将使用默认语音（可能读不出中文，可在 Windows 设置 → 时间和语言 → 语音 中添加中文语音包）'
}
$synth.Rate = $Rate
$synth.Volume = 100

# 压缩方案：优先 ffmpeg，其次 python + lameenc（体积约为 wav 的 1/10）
$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
$python = Get-Command python -ErrorAction SilentlyContinue
$wav2mp3 = Join-Path $PSScriptRoot 'wav2mp3.py'
if ($ffmpeg) {
  Write-Host '检测到 ffmpeg，将转为 mp3' -ForegroundColor Cyan
} elseif ($python -and (Test-Path $wav2mp3)) {
  Write-Host '检测到 python，将用 tools/wav2mp3.py 转为 mp3（需 pip install lameenc）' -ForegroundColor Cyan
} else {
  Write-Warning '未检测到 ffmpeg/python，将保留 wav（体积较大，speaker.js 也支持 .wav）'
}

$ok = 0
foreach ($it in $items) {
  $wav = Join-Path $outDir ($it.Name + '.wav')
  $mp3 = Join-Path $outDir ($it.Name + '.mp3')
  try {
    $synth.SetOutputToWaveFile($wav)
    $synth.Speak($it.Text)
    if ($ffmpeg) {
      & ffmpeg -y -loglevel error -i $wav -codec:a libmp3lame -b:a 32k -ac 1 -ar 22050 $mp3
      if ($LASTEXITCODE -eq 0) { Remove-Item $wav -Force }
    }
    $ok++
    Write-Host "  [OK] $($it.Name)  <-  $($it.Text)"
  } catch {
    Write-Warning "  [FAIL] $($it.Name)：$($_.Exception.Message)"
  }
}
$synth.Dispose()

if (-not $ffmpeg -and $python -and (Test-Path $wav2mp3)) {
  Write-Host '开始压缩为 mp3 ...' -ForegroundColor Cyan
  & python $wav2mp3
}

$files = Get-ChildItem $outDir -File -ErrorAction SilentlyContinue
$total = ($files | Measure-Object -Property Length -Sum).Sum
Write-Host "完成：$ok / $($items.Count)，输出目录：$outDir，总大小 $([math]::Round($total / 1MB, 2)) MB" -ForegroundColor Green
Write-Host '提示：音频会被打进小程序包，若超过 2MB 主包限制，请把 audio 目录配置成分包。' -ForegroundColor Yellow
