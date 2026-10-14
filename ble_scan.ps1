# BLE scanner using Windows.Devices.Bluetooth.Advertisement
# Uses a synchronized collection to share results across runspaces

Add-Type -AssemblyName System.Runtime.WindowsRuntime

# Load WinRT types
[Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher, Windows.Devices.Bluetooth, ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisement, Windows.Devices.Bluetooth, ContentType=WindowsRuntime] | Out-Null

# Thread-safe list
$found = [System.Collections.ArrayList]::Synchronized((New-Object System.Collections.ArrayList))

$watcher = New-Object Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher
$watcher.ScanningMode = [Windows.Devices.Bluetooth.Advertisement.BluetoothLEScanningMode]::Active

$handler = {
    param($sender, $args)
    $adv = $args.Advertisement
    $addr = $args.BluetoothAddress.ToString('X12')
    $name = $adv.LocalName
    $rssi = $args.RawSignalStrengthInDBm
    $emitData = $adv.DataSections | ForEach-Object {
        "Type=0x$($_.DataType.ToString('X2')) Len=$($_.Data.Length) " + ([BitConverter]::ToString($_.Data.ToArray()) -replace '-',' ')
    }
    $record = [PSCustomObject]@{
        Address = $addr
        Name    = $name
        RSSI    = $rssi
        Raw     = ($emitData -join ' | ')
    }
    [void]$found.Add($record)
}

$token = $watcher.Add_Received($handler)

Write-Host "Scanning BLE advertisements for 15 seconds..."
$watcher.Start()
Start-Sleep -Seconds 15
$watcher.Stop()
$watcher.Remove_Received($token)

# Deduplicate by address
$unique = $found | Group-Object Address | ForEach-Object {
    $latest = $_.Group | Sort-Object RSSI -Descending | Select-Object -First 1
    $latest
}

Write-Host "`n=== Found $($unique.Count) unique BLE devices ==="
$unique | Sort-Object RSSI -Descending | Format-Table Address, Name, RSSI -AutoSize

Write-Host "`n=== Detail (look for WIT/WT devices) ==="
$unique | Where-Object { $_.Name -match 'WT|Wit|wit|9011|IMU|accel' -or $_.Raw -match 'FFE0|FFF0|FFE5|180F' } | Format-List
