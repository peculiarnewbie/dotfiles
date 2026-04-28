while ($true) {
    Write-Host "Running: komorebic cycle-workspace next"
    & komorebic cycle-workspace next
    $val = Get-Random -Minimum 30 -Maximum 200
    Start-Sleep -Seconds $val
}
