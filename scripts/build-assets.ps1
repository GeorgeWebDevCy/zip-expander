Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$brandDir = Join-Path $root "assets\brand"
$pngDir = Join-Path $brandDir "png"

New-Item -ItemType Directory -Path $brandDir -Force | Out-Null
New-Item -ItemType Directory -Path $pngDir -Force | Out-Null

function New-BrandBitmap([int]$w, [int]$h) {
  $bmp = [System.Drawing.Bitmap]::new($w, $h)
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $bgRect = [System.Drawing.RectangleF]::new(0, 0, $w, $h)
  $bgBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $bgRect,
    [System.Drawing.Color]::FromArgb(255, 28, 21, 48),
    [System.Drawing.Color]::FromArgb(255, 14, 11, 24),
    55
  )
  $gfx.FillRectangle($bgBrush, $bgRect)

  function Fill-RoundedRect(
    [System.Drawing.Graphics]$graphics,
    [System.Drawing.Brush]$brush,
    [System.Drawing.RectangleF]$rect,
    [single]$radius
  ) {
    $diameter = [Math]::Min($radius * 2, [Math]::Min($rect.Width, $rect.Height))
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
    $path.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
    $path.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    $graphics.FillPath($brush, $path)
    $path.Dispose()
  }

  $panelRect = [System.Drawing.RectangleF]::new($w * 0.20, $h * 0.24, $w * 0.61, $h * 0.52)
  $panelBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 37, 28, 58))
  Fill-RoundedRect -graphics $gfx -brush $panelBrush -rect $panelRect -radius ($w * 0.06)

  $lineBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 48, 37, 74))
  $lineA = [System.Drawing.RectangleF]::new($w * 0.24, $h * 0.30, $w * 0.52, $h * 0.08)
  $lineB = [System.Drawing.RectangleF]::new($w * 0.24, $h * 0.42, $w * 0.42, $h * 0.05)
  $lineC = [System.Drawing.RectangleF]::new($w * 0.24, $h * 0.51, $w * 0.46, $h * 0.05)
  $lineD = [System.Drawing.RectangleF]::new($w * 0.24, $h * 0.60, $w * 0.35, $h * 0.05)
  Fill-RoundedRect -graphics $gfx -brush $lineBrush -rect $lineA -radius ($w * 0.02)
  Fill-RoundedRect -graphics $gfx -brush $lineBrush -rect $lineB -radius ($w * 0.02)
  Fill-RoundedRect -graphics $gfx -brush $lineBrush -rect $lineC -radius ($w * 0.02)
  Fill-RoundedRect -graphics $gfx -brush $lineBrush -rect $lineD -radius ($w * 0.02)

  $accentRect = [System.Drawing.RectangleF]::new($w * 0.61, $h * 0.57, $w * 0.20, $h * 0.20)
  $accentBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $accentRect,
    [System.Drawing.Color]::FromArgb(255, 127, 240, 207),
    [System.Drawing.Color]::FromArgb(255, 58, 184, 145),
    30
  )
  $gfx.FillEllipse($accentBrush, $accentRect)

  $plusPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 14, 58, 45), [Math]::Max(2, $w * 0.028))
  $centerX = $accentRect.X + $accentRect.Width / 2
  $centerY = $accentRect.Y + $accentRect.Height / 2
  $size = $accentRect.Width * 0.22
  $gfx.DrawLine($plusPen, $centerX - $size, $centerY, $centerX + $size, $centerY)
  $gfx.DrawLine($plusPen, $centerX, $centerY - $size, $centerX, $centerY + $size)

  $bgBrush.Dispose()
  $panelBrush.Dispose()
  $lineBrush.Dispose()
  $accentBrush.Dispose()
  $plusPen.Dispose()
  $gfx.Dispose()

  return $bmp
}

function Save-Png([System.Drawing.Bitmap]$bitmap, [string]$targetPath) {
  $bitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
}

$masterBmp = New-BrandBitmap -w 1024 -h 1024
$masterPngPath = Join-Path $pngDir "icon-1024.png"
Save-Png -bitmap $masterBmp -targetPath $masterPngPath

$sizes = @(16, 24, 32, 48, 64, 128, 256, 512)
foreach ($size in $sizes) {
  $scaled = [System.Drawing.Bitmap]::new($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($scaled)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($masterBmp, 0, 0, $size, $size)
  $pngPath = Join-Path $pngDir ("icon-$size.png")
  Save-Png -bitmap $scaled -targetPath $pngPath
  $g.Dispose()
  $scaled.Dispose()
}

$iconPath = Join-Path $brandDir "icon.ico"
$icon = [System.Drawing.Icon]::FromHandle($masterBmp.GetHicon())
$iconStream = [System.IO.FileStream]::new($iconPath, [System.IO.FileMode]::Create)
$icon.Save($iconStream)
$iconStream.Dispose()
$icon.Dispose()

function Save-BmpWithLabel([string]$path, [int]$width, [int]$height, [string]$label) {
  $bmp = New-BrandBitmap -w $width -h $height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $font = [System.Drawing.Font]::new("Segoe UI", [Math]::Max(9, $width * 0.06), [System.Drawing.FontStyle]::Bold)
  $textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(220, 245, 243, 255))
  $g.DrawString($label, $font, $textBrush, 10, $height - ($height * 0.28))
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $textBrush.Dispose()
  $font.Dispose()
  $g.Dispose()
  $bmp.Dispose()
}

Save-BmpWithLabel -path (Join-Path $brandDir "nsis-installer-sidebar.bmp") -width 164 -height 314 -label "Zip Expander"
Save-BmpWithLabel -path (Join-Path $brandDir "nsis-installer-header.bmp") -width 150 -height 57 -label "Zip Expander"
Save-BmpWithLabel -path (Join-Path $brandDir "nsis-uninstaller-sidebar.bmp") -width 164 -height 314 -label "Zip Expander"

$masterBmp.Dispose()

Write-Host "Assets generated in $brandDir"
