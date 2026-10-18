# Read WitMotion WT9011DCL data from Bluetooth SPP serial port
# Protocol: frame header 0x5A, then type byte 0x51(accel)/0x52(gyro)/0x53(angle)/0x54(mag)

param(
    [string]$PortName = "COM3",
    [int]$DurationSec = 8
)

# Try opening the serial port
try {
    $port = New-Object System.IO.Ports.SerialPort $PortName, 9600, ([System.IO.Ports.Parity]::None), 8, ([System.IO.Ports.StopBits]::One)
    $port.ReadTimeout = 1000
    $port.WriteTimeout = 1000
    $port.Open()
    Write-Host "Opened $PortName at 9600 baud. Reading for $DurationSec seconds..."
} catch {
    Write-Host "Failed to open ${PortName}: $_"
    exit 1
}

$buffer = New-Object byte[] 256
$startTime = Get-Date
$frameCount = 0

Write-Host "`n--- Parsed frames (latest 15) ---"

while (((Get-Date) - $startTime).TotalSeconds -lt $DurationSec) {
    try {
        # Look for frame header 0x5A
        $b = $port.ReadByte()
        if ($b -ne 0x5A) { continue }

        $type = $port.ReadByte()
        $data = New-Object byte[] 8
        $read = $port.Read($data, 0, 8)
        if ($read -lt 8) { continue }

        # Helper: combine two bytes to signed int16
        function To-Int16([byte]$lo, [byte]$hi) {
            $v = $lo -bor ($hi -shl 8)
            if ($v -ge 0x8000) { $v = $v - 0x10000 }
            return [int16]$v
        }

        $ax = To-Int16 $data[0] $data[1]
        $ay = To-Int16 $data[2] $data[3]
        $az = To-Int16 $data[4] $data[5]
        $sum = $data[6]
        $tail = $data[7]

        switch ($type) {
            0x51 {
                $axG = [math]::Round($ax * 16.0 / 32768.0, 3)
                $ayG = [math]::Round($ay * 16.0 / 32768.0, 3)
                $azG = [math]::Round($az * 16.0 / 32768.0, 3)
                Write-Host ("[ACC]  Ax={0,7} g  Ay={1,7} g  Az={2,7} g" -f $axG, $ayG, $azG)
                $script:lastAcc = "Ax=$axG Ay=$ayG Az=$azG"
            }
            0x52 {
                $wx = [math]::Round($ax * 2000.0 / 32768.0, 2)
                $wy = [math]::Round($ay * 2000.0 / 32768.0, 2)
                $wz = [math]::Round($az * 2000.0 / 32768.0, 2)
                Write-Host ("[GYRO] Wx={0,7} d/s  Wy={1,7} d/s  Wz={2,7} d/s" -f $wx, $wy, $wz)
                $script:lastGyro = "Wx=$wx Wy=$wy Wz=$wz"
            }
            0x53 {
                $roll  = [math]::Round($ax * 180.0 / 32768.0, 2)
                $pitch = [math]::Round($ay * 180.0 / 32768.0, 2)
                $yaw   = [math]::Round($az * 180.0 / 32768.0, 2)
                Write-Host ("[ANG]  R={0,7} deg  P={1,7} deg  Y={2,7} deg" -f $roll, $pitch, $yaw)
                $script:lastAng = "Roll=$roll Pitch=$pitch Yaw=$yaw"
            }
            0x54 {
                $mx = $ax; $my = $ay; $mz = $az
                Write-Host ("[MAG]  Mx=$mx My=$my Mz=$mz")
            }
            default {
                # Unknown frame type, skip
            }
        }
        $frameCount++
    } catch [System.TimeoutException] {
        # No data yet, keep waiting
    } catch {
        Write-Host "Read error: $_"
        break
    }
}

$port.Close()
Write-Host "`n=== Done. Total frames parsed: $frameCount ==="
Write-Host ("Latest Acc:  " + $script:lastAcc)
Write-Host ("Latest Gyro: " + $script:lastGyro)
Write-Host ("Latest Ang:  " + $script:lastAng)
