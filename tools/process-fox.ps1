Add-Type -AssemblyName System.Drawing

$src = "E:\demo - 副本\pkgWire\assets\wire\fox-sprite-raw.png"
$out = "E:\demo - 副本\pkgWire\assets\wire\fox-walk.png"

# 加载原图（虽然扩展名是png，实际是jpeg，System.Drawing能识别）
$img = [System.Drawing.Image]::FromFile($src)
$W = $img.Width
$H = $img.Height
Write-Host "source: ${W}x${H}"

# 创建bitmap并去白背景
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($img, 0, 0, $W, $H)
$g.Dispose()

# 去白背景
for ($y = 0; $y -lt $H; $y++) {
    for ($x = 0; $x -lt $W; $x++) {
        $p = $bmp.GetPixel($x, $y)
        if ($p.R -gt 235 -and $p.G -gt 235 -and $p.B -gt 235) {
            $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 255, 255, 255))
        }
    }
}
Write-Host "bg removed"

# 裁5帧
$fw = [Math]::Floor($W / 5)
$frames = @()
for ($f = 0; $f -lt 5; $f++) {
    $sx = $f * $fw
    $minX = $fw; $minY = $H; $maxX = 0; $maxY = 0
    for ($y = 0; $y -lt $H; $y++) {
        for ($x = 0; $x -lt $fw; $x++) {
            $p = $bmp.GetPixel($sx + $x, $y)
            if ($p.A -gt 10) {
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    $frames += @{ sx = $sx + $minX; y = $minY; w = $maxX - $minX; h = $maxY - $minY }
    Write-Host "frame ${f}: x=$($sx+$minX) y=$minY w=$($maxX-$minX) h=$($maxY-$minY)"
}

$maxH = ($frames | ForEach-Object { $_.h } | Measure-Object -Maximum).Maximum
$maxW = ($frames | ForEach-Object { $_.w } | Measure-Object -Maximum).Maximum
Write-Host "frame size: ${maxW}x${maxH}"

# 输出sprite sheet
$sheet = New-Object System.Drawing.Bitmap($maxW * 5, $maxH)
$sg = [System.Drawing.Graphics]::FromImage($sheet)
$sg.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))

for ($i = 0; $i -lt 5; $i++) {
    $fr = $frames[$i]
    $fx = $i * $maxW + [Math]::Floor(($maxW - $fr.w) / 2)
    $fy = $maxH - $fr.h
    $srcRect = New-Object System.Drawing.Rectangle($fr.sx, $fr.y, $fr.w, $fr.h)
    $dstRect = New-Object System.Drawing.Rectangle($fx, $fy, $fr.w, $fr.h)
    $sg.DrawImage($bmp, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
}
$sg.Dispose()

$sheet.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose()
$bmp.Dispose()
$img.Dispose()
Write-Host "saved: $out"
