param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [Parameter(Mandatory = $true)]
    [int]$X,

    [Parameter(Mandatory = $true)]
    [int]$Y,

    [Parameter(Mandatory = $true)]
    [string]$Label,

    [int]$LabelX = 40,
    [int]$LabelY = 80,
    [int]$Step = 1
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = [System.IO.Path]::GetDirectoryName($resolvedOutput)
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

$source = [System.Drawing.Image]::FromFile($resolvedInput)
$bitmap = $null
$graphics = $null
$overlay = $null
$ringPen = $null
$arrowPen = $null
$circleBrush = $null
$labelBrush = $null
$textBrush = $null
$numberFont = $null
$labelFont = $null

try {
    $bitmap = New-Object System.Drawing.Bitmap($source.Width, $source.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.DrawImageUnscaled($source, 0, 0)

    $overlay = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, 0, 0, 0))
    $graphics.FillRectangle($overlay, 0, 0, $source.Width, $source.Height)

    $ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 255, 239, 186), 8)
    $arrowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 255, 209, 77), 8)
    $arrowPen.CustomEndCap = New-Object System.Drawing.Drawing2D.AdjustableArrowCap(8, 10)
    $circleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 240, 78, 35))
    $labelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 7, 19, 15))
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 243, 208))
    $numberFont = New-Object System.Drawing.Font('Segoe UI', 25, [System.Drawing.FontStyle]::Bold)
    $labelFont = New-Object System.Drawing.Font('Segoe UI', 22, [System.Drawing.FontStyle]::Bold)

    $radius = 38
    $graphics.FillEllipse($circleBrush, $X - $radius, $Y - $radius, $radius * 2, $radius * 2)
    $graphics.DrawEllipse($ringPen, $X - $radius, $Y - $radius, $radius * 2, $radius * 2)

    $number = [string]$Step
    $numberSize = $graphics.MeasureString($number, $numberFont)
    $graphics.DrawString($number, $numberFont, $textBrush, $X - ($numberSize.Width / 2), $Y - ($numberSize.Height / 2))

    $labelSize = $graphics.MeasureString($Label, $labelFont)
    $padding = 22
    $labelRect = [System.Drawing.RectangleF]::new(
        [single]$LabelX,
        [single]$LabelY,
        [single]($labelSize.Width + ($padding * 2)),
        [single]($labelSize.Height + ($padding * 2))
    )
    $graphics.FillRectangle($labelBrush, $labelRect)
    $graphics.DrawRectangle($ringPen, $labelRect.X, $labelRect.Y, $labelRect.Width, $labelRect.Height)
    $graphics.DrawString($Label, $labelFont, $textBrush, $LabelX + $padding, $LabelY + $padding)

    $startX = if ($X -lt $labelRect.X) { $labelRect.X } elseif ($X -gt $labelRect.Right) { $labelRect.Right } else { $labelRect.X + ($labelRect.Width / 2) }
    $startY = if ($Y -lt $labelRect.Y) { $labelRect.Y } elseif ($Y -gt $labelRect.Bottom) { $labelRect.Bottom } else { $labelRect.Y + ($labelRect.Height / 2) }
    $graphics.DrawLine($arrowPen, $startX, $startY, $X, $Y)

    $bitmap.Save($resolvedOutput, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output $resolvedOutput
}
finally {
    if ($graphics) { $graphics.Dispose() }
    if ($overlay) { $overlay.Dispose() }
    if ($ringPen) { $ringPen.Dispose() }
    if ($arrowPen) { $arrowPen.Dispose() }
    if ($circleBrush) { $circleBrush.Dispose() }
    if ($labelBrush) { $labelBrush.Dispose() }
    if ($textBrush) { $textBrush.Dispose() }
    if ($numberFont) { $numberFont.Dispose() }
    if ($labelFont) { $labelFont.Dispose() }
    if ($bitmap) { $bitmap.Dispose() }
    $source.Dispose()
}
