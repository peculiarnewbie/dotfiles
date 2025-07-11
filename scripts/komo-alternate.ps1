$i = 0
while ($true) {
    if ($i % 2 -eq 0) {
        Write-Host "Running: komorebic cycle-workspace next"
        # example next
    } else {
        Write-Host "Running: komorebic cycle-workspace previous"
        # example prev
    }
    $i++
    Start-Sleep -Seconds 180
}
