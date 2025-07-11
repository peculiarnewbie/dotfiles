$i = 0
while ($true) {
    if ($i % 2 -eq 0) {
        Write-Host "Running: komorebic cycle-workspace next"
        komorebic cycle-workspace next
    } else {
        Write-Host "Running: komorebic cycle-workspace previous"
        komorebic cycle-workspace previous
    }
    $i++
    Start-Sleep -Seconds 180
}
