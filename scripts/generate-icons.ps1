Add-Type -AssemblyName System.Drawing

function New-Icon($size, $outPath) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # Scale factor
    $s = $size / 512.0

    # Background - fill with dark blue
    $bgColor = [System.Drawing.Color]::FromArgb(21, 32, 43)  # #15202B
    $g.Clear($bgColor)

    # Draw rounded rectangle background with gradient
    $bgTop = [System.Drawing.Color]::FromArgb(25, 39, 52)    # #192734
    $bgBottom = [System.Drawing.Color]::FromArgb(21, 32, 43)  # #15202B
    $bgRect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $bgRect, $bgTop, $bgBottom,
        [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
    )
    $radius = [math]::Max([int](108 * $s), 1)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
    $path.AddArc(0, $size - $d, $d, $d, 90, 90)
    $path.CloseFigure()

    # Clip to rounded rect and fill gradient
    $g.SetClip($path)
    $g.FillRectangle($bgBrush, $bgRect)

    # Moon (crescent) - outer circle in accent blue
    $moonColor = [System.Drawing.Color]::FromArgb(29, 155, 240)  # #1D9BF0
    $moonBrush = New-Object System.Drawing.SolidBrush($moonColor)
    $cx = 240 * $s; $cy = 220 * $s; $r = 120 * $s
    $g.FillEllipse($moonBrush, [float]($cx - $r), [float]($cy - $r), [float]($r * 2), [float]($r * 2))

    # Cutout circle (background color to create crescent shape)
    $cutColor = [System.Drawing.Color]::FromArgb(21, 32, 43)
    $cutBrush = New-Object System.Drawing.SolidBrush($cutColor)
    $cx2 = 290 * $s; $cy2 = 180 * $s; $r2 = 100 * $s
    $g.FillEllipse($cutBrush, [float]($cx2 - $r2), [float]($cy2 - $r2), [float]($r2 * 2), [float]($r2 * 2))

    # Stars - varying opacity and size
    $stars = @(
        @{ x = 340; y = 140; r = 5;   a = 200 },
        @{ x = 380; y = 200; r = 3.5; a = 150 },
        @{ x = 360; y = 100; r = 2.5; a = 100 },
        @{ x = 310; y = 120; r = 4;   a = 180 }
    )
    foreach ($star in $stars) {
        $starBrush = New-Object System.Drawing.SolidBrush(
            [System.Drawing.Color]::FromArgb($star.a, 255, 255, 255)
        )
        $sx = $star.x * $s; $sy = $star.y * $s; $sr = [math]::Max($star.r * $s, 0.5)
        $g.FillEllipse($starBrush, [float]($sx - $sr), [float]($sy - $sr), [float]($sr * 2), [float]($sr * 2))
        $starBrush.Dispose()
    }

    # "DIM" text - only render if size is large enough to be readable
    if ($size -ge 48) {
        $fontSize = [math]::Max(50 * $s, 6)
        $font = New-Object System.Drawing.Font("Arial", $fontSize, [System.Drawing.FontStyle]::Bold)
        $textBrush = New-Object System.Drawing.SolidBrush(
            [System.Drawing.Color]::FromArgb(178, 255, 255, 255)  # ~0.7 opacity
        )
        $textFormat = New-Object System.Drawing.StringFormat
        $textFormat.Alignment = [System.Drawing.StringAlignment]::Center
        $textFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

        $textY = 420 * $s
        $textRect = New-Object System.Drawing.RectangleF(0, ($textY - $fontSize), $size, ($fontSize * 2))
        $g.DrawString("DIM", $font, $textBrush, $textRect, $textFormat)

        $font.Dispose()
        $textBrush.Dispose()
        $textFormat.Dispose()
    }

    # Cleanup and save
    $bgBrush.Dispose()
    $moonBrush.Dispose()
    $cutBrush.Dispose()
    $path.Dispose()
    $g.Dispose()
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created $outPath ($size x $size)"
}

# scripts/ から見て ../icons に出力（プロジェクトルート/icons/）
$basePath = Join-Path $PSScriptRoot "..\icons" | Resolve-Path

# Ensure directory exists
if (-not (Test-Path $basePath)) {
    New-Item -ItemType Directory -Path $basePath -Force | Out-Null
}

New-Icon 16  (Join-Path $basePath "icon16.png")
New-Icon 48  (Join-Path $basePath "icon48.png")
New-Icon 128 (Join-Path $basePath "icon128.png")

Write-Host ""
Write-Host "All icons generated!" -ForegroundColor Green
