
function Get-ScoopExeNoCurrent {
    param(
        [Parameter(Mandatory)]
        [string]$AppName,

        [Parameter(Mandatory)]
        [string]$ExeName
    )

    $appDir = Join-Path $env:USERPROFILE "scoop\apps\$AppName"
    $resolved = Get-ChildItem -Path $appDir -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne 'current' } |
        Sort-Object LastWriteTime -Descending |
        ForEach-Object { Join-Path $_.FullName $ExeName } |
        Where-Object { Test-Path $_ } |
        Select-Object -First 1

    return $resolved
}

$script:StarshipExe = Get-ScoopExeNoCurrent -AppName 'starship' -ExeName 'starship.exe'
$script:ZoxideExe = Get-ScoopExeNoCurrent -AppName 'zoxide' -ExeName 'zoxide.exe'
$script:OpencodeExe = Get-ScoopExeNoCurrent -AppName 'opencode' -ExeName 'opencode.exe'
$script:GitExe = Get-ScoopExeNoCurrent -AppName 'git' -ExeName 'cmd\git.exe'
$script:RgExe = Get-ScoopExeNoCurrent -AppName 'ripgrep' -ExeName 'rg.exe'

if ($script:GitExe) {
    $gitRoot = Split-Path (Split-Path $script:GitExe -Parent) -Parent
    $gitUsrBin = Join-Path $gitRoot 'usr\bin'
    if ((Test-Path $gitUsrBin) -and (($env:PATH -split ';') -notcontains $gitUsrBin)) {
        $env:PATH = "$gitUsrBin;$env:PATH"
    }
}

if ($script:StarshipExe) {
    function global:starship {
        & $script:StarshipExe @Args
    }
}

if ($script:ZoxideExe) {
    function global:zoxide {
        & $script:ZoxideExe @Args
    }
}

if ($script:OpencodeExe) {
    function global:opencode {
        & $script:OpencodeExe @Args
    }
}

if ($script:GitExe) {
    function global:git {
        & $script:GitExe @Args
    }
}

if ($script:RgExe) {
    function global:rg {
        & $script:RgExe @Args
    }
}
