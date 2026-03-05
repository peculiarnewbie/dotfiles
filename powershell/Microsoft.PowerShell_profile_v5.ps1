$primaryProfile = Join-Path $HOME 'Documents\PowerShell\Microsoft.PowerShell_profile.ps1'
if (Test-Path $primaryProfile) {
    . $primaryProfile
}
