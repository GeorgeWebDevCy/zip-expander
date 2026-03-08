Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class WinApi {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")]
  public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")]
  public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

$exe = Join-Path $PSScriptRoot "..\release\win-unpacked\Zip Expander.exe"
$outPath = Join-Path $PSScriptRoot "..\docs\screenshots\zip-expander-ui.png"

Get-Process -Name "Zip Expander","electron" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$proc = Start-Process -FilePath $exe -PassThru
$windowProc = $null

for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  $windowProc = Get-Process -Name "Zip Expander" -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowHandle -ne 0
  } | Select-Object -First 1
  if ($windowProc) {
    break
  }
}

if (-not $windowProc) {
  throw "Could not find app window to capture screenshot."
}

[WinApi]::SetForegroundWindow([IntPtr]$windowProc.MainWindowHandle) | Out-Null
[WinApi]::ShowWindow([IntPtr]$windowProc.MainWindowHandle, 3) | Out-Null
Start-Sleep -Milliseconds 800

$clientRect = New-Object WinApi+RECT
$ok = [WinApi]::GetClientRect([IntPtr]$windowProc.MainWindowHandle, [ref]$clientRect)
if (-not $ok) {
  throw "GetClientRect failed."
}

$topLeft = New-Object WinApi+POINT
$topLeft.X = $clientRect.Left
$topLeft.Y = $clientRect.Top
[WinApi]::ClientToScreen([IntPtr]$windowProc.MainWindowHandle, [ref]$topLeft) | Out-Null

$bottomRight = New-Object WinApi+POINT
$bottomRight.X = $clientRect.Right
$bottomRight.Y = $clientRect.Bottom
[WinApi]::ClientToScreen([IntPtr]$windowProc.MainWindowHandle, [ref]$bottomRight) | Out-Null

$width = [Math]::Max(1, $bottomRight.X - $topLeft.X)
$height = [Math]::Max(1, $bottomRight.Y - $topLeft.Y)

$bmp = New-Object System.Drawing.Bitmap($width, $height)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($topLeft.X, $topLeft.Y, 0, 0, $bmp.Size)
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$gfx.Dispose()
$bmp.Dispose()

Write-Output "Saved screenshot: $outPath"

Get-Process -Name "Zip Expander","electron" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
