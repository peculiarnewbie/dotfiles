# Add scoop paths for SSH sessions.
$env:PATH = "$env:USERPROFILE\scoop\shims;$env:PATH"

function Get-ScoopAppVersionDir {
    param(
        [Parameter(Mandatory)]
        [string]$AppName
    )

    $appDir = Join-Path $env:USERPROFILE "scoop\apps\$AppName"
    return Get-ChildItem -Path $appDir -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne 'current' } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}

# Resolve scoop app version directories and add them to PATH.
$scoopApps = @(
    @{ Name = 'git';      Subdirs = @('cmd', 'usr\bin') }
    @{ Name = 'bun';       Subdirs = @() }
    @{ Name = 'bat';       Subdirs = @() }
    @{ Name = 'lazygit';   Subdirs = @() }
    @{ Name = 'yazi';      Subdirs = @() }
    @{ Name = 'zoxide';    Subdirs = @() }
    @{ Name = 'starship';  Subdirs = @() }
    @{ Name = 'ripgrep';   Subdirs = @() }
    @{ Name = 'eza';       Subdirs = @() }
)

foreach ($app in $scoopApps) {
    $versionDir = Get-ScoopAppVersionDir -AppName $app.Name
    if ($versionDir) {
        if ($app.Subdirs.Count -gt 0) {
            foreach ($sub in $app.Subdirs) {
                $subDir = Join-Path $versionDir $sub
                if (Test-Path $subDir) {
                    $env:PATH = "$subDir;$env:PATH"
                }
            }
        } else {
            $env:PATH = "$versionDir;$env:PATH"
        }
    }
}

# Keep Yazi MIME detection stable across package manager reinstalls.
$fileCmd = Get-Command file -ErrorAction SilentlyContinue
if ($fileCmd) {
    $env:YAZI_FILE_ONE = $fileCmd.Source
} else {
    Remove-Item Env:YAZI_FILE_ONE -ErrorAction SilentlyContinue
}

#oh-my-posh init pwsh --config "$env:POSH_THEMES_PATH/montys.omp.json" | Invoke-Expression

Import-Module PSReadLine
Set-PSReadLineKeyHandler -Chord UpArrow -Function HistorySearchBackward
Set-PSReadLineKeyHandler -Chord DownArrow -Function HistorySearchForward

if (Get-Command eza -ErrorAction SilentlyContinue) {
    Set-Alias ls eza
}
if (Get-Command neovide -ErrorAction SilentlyContinue) {
    Set-Alias n neovide
}

function yy {
    $tmp = [System.IO.Path]::GetTempFileName()
    yazi $args --cwd-file="$tmp"
    $cwd = Get-Content -Path $tmp -Encoding UTF8
    if (-not [String]::IsNullOrEmpty($cwd) -and $cwd -ne $PWD.Path) {
        Set-Location -LiteralPath ([System.IO.Path]::GetFullPath($cwd))
    }
    Remove-Item -Path $tmp
}

if (Get-Command starship -ErrorAction SilentlyContinue) {
    Invoke-Expression (& starship init powershell 2>$null)
}

if (Get-Command zoxide -ErrorAction SilentlyContinue) {
    Invoke-Expression (& zoxide init powershell | Out-String)
}
