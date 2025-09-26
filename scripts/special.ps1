param([string]$target)

function Set-SharedVar {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$Value,
    [string]$DotFile = (Join-Path $PSScriptRoot '.lastFocused')
  )
  $dir = Split-Path -Parent $DotFile
  if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  Set-Content -Path $DotFile -Value $Value -Encoding UTF8 -NoNewline
}

function Get-SharedVar {
  [CmdletBinding()]
  param(
    [string]$DotFile = (Join-Path $PSScriptRoot '.lastFocused')
  )
  if (-not (Test-Path $DotFile)) { return $null }
  Get-Content -Path $DotFile -Raw
}

$monitors = komorebic state | ConvertFrom-Json | Select-Object -ExpandProperty monitors
$elements = $monitors | Select-Object -ExpandProperty elements
$monitor1 = $elements | Select-Object -First 1
$lastFocusedFile = Join-Path $PSScriptRoot '.lastFocused'
$lastFocused = Get-SharedVar 
$focused = $monitor1 | Select-Object -ExpandProperty workspaces | Select-Object -ExpandProperty focused | ForEach-Object {[int]$_ + 1}
if($focused -ne $target){
	if($focused -in 1,2,3){
		Set-SharedVar -Value $focused
	}
	komorebic focus-named-workspace $target
} else {
	komorebic focus-named-workspace $lastFocused
}

