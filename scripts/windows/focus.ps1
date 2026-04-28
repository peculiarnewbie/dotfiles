param(
  [string]$Target = $args[0]
)

# default if no arg passed
if (-not $Target) {
  Write-Host "please specify target process"
  exit 1
}

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class Win32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@

# high-level: find processes, pick a windowed one, restore and focus
$procs = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.Name -like "*$Target*" }

if ($procs.Count -eq 0) {
  Write-Host "No windowed process found matching: $Target"
  exit 1
}

$proc = $procs[0]
[Win32]::ShowWindowAsync($proc.MainWindowHandle, 9) | Out-Null  # SW_RESTORE
[Win32]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Write-Host "Focused: $($proc.ProcessName) (PID $($proc.Id))"
