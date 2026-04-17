Add-Type -AssemblyName System.Drawing

# ── DarkBlue palette ──────────────────────────────────────────────
$MainBG   = [System.Drawing.Color]::FromArgb(21, 32, 43)    # #15202B
$CardBG   = [System.Drawing.Color]::FromArgb(25, 39, 52)    # #192734
$HoverBG  = [System.Drawing.Color]::FromArgb(34, 48, 60)    # #22303C
$Border   = [System.Drawing.Color]::FromArgb(56, 68, 77)    # #38444D
$TextW    = [System.Drawing.Color]::White
$SubText  = [System.Drawing.Color]::FromArgb(136, 153, 166) # #8899A6
$Accent   = [System.Drawing.Color]::FromArgb(29, 155, 240)  # #1D9BF0
$Black    = [System.Drawing.Color]::Black

$basePath = "C:\Users\szk\Work\DarkBlueThemeX\webstore-images"

if (-not (Test-Path $basePath)) {
    New-Item -ItemType Directory -Path $basePath -Force | Out-Null
}

# ── Helper: rounded-rect GraphicsPath ─────────────────────────────
function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    if ($d -gt $h) { $d = $h }
    if ($d -gt $w) { $d = $w }
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

# ── Helper: draw centred text ─────────────────────────────────────
function Draw-CenteredText($g, [string]$text, $font, $brush, [float]$y, [float]$areaW) {
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Near
    $fh = [float]($font.GetHeight($g) + 10)
    $rect = New-Object System.Drawing.RectangleF([float]0, [float]$y, [float]$areaW, $fh)
    $g.DrawString($text, $font, $brush, $rect, $sf)
    $sf.Dispose()
}

# ── Helper: draw crescent moon + stars ────────────────────────────
function Draw-Moon($g, [float]$cx, [float]$cy, [float]$moonR, $accentColor, $bgColor) {
    # Outer moon circle (accent blue)
    $moonBrush = New-Object System.Drawing.SolidBrush($accentColor)
    $g.FillEllipse($moonBrush, [float]($cx - $moonR), [float]($cy - $moonR), [float]($moonR * 2), [float]($moonR * 2))

    # Cutout circle (background-colored) to create crescent shape
    $cutBrush = New-Object System.Drawing.SolidBrush($bgColor)
    $cutOffsetX = $moonR * 0.40
    $cutOffsetY = -$moonR * 0.33
    $cutR = $moonR * 0.82
    $cutCx = $cx + $cutOffsetX
    $cutCy = $cy + $cutOffsetY
    $g.FillEllipse($cutBrush, [float]($cutCx - $cutR), [float]($cutCy - $cutR), [float]($cutR * 2), [float]($cutR * 2))

    $moonBrush.Dispose()
    $cutBrush.Dispose()
}

function Draw-Stars($g, [float]$cx, [float]$cy, [float]$moonR) {
    $stars = @(
        @{ dx =  0.85; dy = -0.55; r = 0.045; a = 220 },
        @{ dx =  1.05; dy = -0.15; r = 0.035; a = 160 },
        @{ dx =  0.70; dy = -0.80; r = 0.025; a = 120 },
        @{ dx =  0.55; dy = -0.50; r = 0.040; a = 190 },
        @{ dx =  0.95; dy = -0.70; r = 0.030; a = 140 }
    )
    foreach ($s in $stars) {
        $sx = $cx + $s.dx * $moonR
        $sy = $cy + $s.dy * $moonR
        $sr = [math]::Max($s.r * $moonR, 1.5)
        $starBrush = New-Object System.Drawing.SolidBrush(
            [System.Drawing.Color]::FromArgb($s.a, 255, 255, 255)
        )
        $g.FillEllipse($starBrush, [float]($sx - $sr), [float]($sy - $sr), [float]($sr * 2), [float]($sr * 2))
        $starBrush.Dispose()
    }
}

# ══════════════════════════════════════════════════════════════════
# Small Tile (440 x 280)
# ══════════════════════════════════════════════════════════════════
& {
    $tW = 440; $tH = 280
    $bmp = New-Object System.Drawing.Bitmap($tW, $tH)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint  = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear($MainBG)

    # Moon
    $moonCx = $tW / 2; $moonCy = 95; $moonR = 50
    Draw-Moon $g $moonCx $moonCy $moonR $Accent $MainBG
    Draw-Stars $g $moonCx $moonCy $moonR

    # App name
    $fontName = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
    $brushW   = New-Object System.Drawing.SolidBrush($TextW)
    Draw-CenteredText $g "帰ってきたDarkBlueテーマ(X)" $fontName $brushW 175 $tW

    # Subtle tagline
    $fontTag = New-Object System.Drawing.Font("Segoe UI", 11)
    $brushSub = New-Object System.Drawing.SolidBrush($SubText)
    Draw-CenteredText $g "X の黒テーマを DarkBlue に" $fontTag $brushSub 215 $tW

    # ── Save & cleanup ──
    $outFile = "$basePath\small-tile-440x280.png"
    $bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)

    $fontName.Dispose(); $fontTag.Dispose()
    $brushW.Dispose(); $brushSub.Dispose()
    $g.Dispose(); $bmp.Dispose()
    Write-Host "Created $outFile"
}

# ══════════════════════════════════════════════════════════════════
# Large Tile (920 x 680)
# ══════════════════════════════════════════════════════════════════
& {
    $tW = 920; $tH = 680
    $bmp = New-Object System.Drawing.Bitmap($tW, $tH)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint  = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear($MainBG)

    # Larger moon
    $moonCx = $tW / 2; $moonCy = 210; $moonR = 110
    Draw-Moon $g $moonCx $moonCy $moonR $Accent $MainBG
    Draw-Stars $g $moonCx $moonCy $moonR

    # Additional decorative stars further out
    $extraStars = @(
        @{ x = 160; y = 120; r = 4;   a = 100 },
        @{ x = 750; y = 150; r = 3;   a = 80  },
        @{ x = 200; y = 300; r = 2.5; a = 60  },
        @{ x = 720; y = 280; r = 3.5; a = 90  },
        @{ x = 130; y = 230; r = 2;   a = 70  },
        @{ x = 790; y = 220; r = 2;   a = 70  }
    )
    foreach ($es in $extraStars) {
        $esBrush = New-Object System.Drawing.SolidBrush(
            [System.Drawing.Color]::FromArgb($es.a, 255, 255, 255)
        )
        $g.FillEllipse($esBrush, [float]($es.x - $es.r), [float]($es.y - $es.r), [float]($es.r * 2), [float]($es.r * 2))
        $esBrush.Dispose()
    }

    # App name (large)
    $fontName = New-Object System.Drawing.Font("Segoe UI", 34, [System.Drawing.FontStyle]::Bold)
    $brushW   = New-Object System.Drawing.SolidBrush($TextW)
    Draw-CenteredText $g "帰ってきたDarkBlueテーマ(X)" $fontName $brushW 380 $tW

    # Tagline
    $fontTag = New-Object System.Drawing.Font("Segoe UI", 20)
    $brushSub = New-Object System.Drawing.SolidBrush($SubText)
    Draw-CenteredText $g "X の黒テーマを DarkBlue に" $fontTag $brushSub 450 $tW

    # Decorative bottom bar
    $barBrush = New-Object System.Drawing.SolidBrush($Accent)
    $barW = 120; $barH = 4
    $barX = ($tW - $barW) / 2; $barY = 520
    $pBar = New-RoundedRect $barX $barY $barW $barH 2
    $g.FillPath($barBrush, $pBar)

    # ── Save & cleanup ──
    $outFile = "$basePath\large-tile-920x680.png"
    $bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)

    $fontName.Dispose(); $fontTag.Dispose()
    $brushW.Dispose(); $brushSub.Dispose(); $barBrush.Dispose()
    $pBar.Dispose()
    $g.Dispose(); $bmp.Dispose()
    Write-Host "Created $outFile"
}

# ══════════════════════════════════════════════════════════════════
# Marquee (1400 x 560)
# ══════════════════════════════════════════════════════════════════
& {
    $tW = 1400; $tH = 560
    $bmp = New-Object System.Drawing.Bitmap($tW, $tH)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint  = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear($MainBG)

    $brushW   = New-Object System.Drawing.SolidBrush($TextW)
    $brushSub = New-Object System.Drawing.SolidBrush($SubText)
    $brushAcc = New-Object System.Drawing.SolidBrush($Accent)
    $brushBlk = New-Object System.Drawing.SolidBrush($Black)
    $brushCard = New-Object System.Drawing.SolidBrush($CardBG)
    $penBorder = New-Object System.Drawing.Pen($Border, 2)

    # ── Left side: Moon + text ──
    $leftCx = 280

    # Moon
    $moonCy = 190; $moonR = 80
    Draw-Moon $g $leftCx $moonCy $moonR $Accent $MainBG
    Draw-Stars $g $leftCx $moonCy $moonR

    # Scattered decorative stars on the left
    $decoStars = @(
        @{ x = 80;  y = 100; r = 3;   a = 90  },
        @{ x = 120; y = 280; r = 2.5; a = 70  },
        @{ x = 450; y = 120; r = 2;   a = 60  },
        @{ x = 480; y = 250; r = 3;   a = 80  }
    )
    foreach ($ds in $decoStars) {
        $dsBrush = New-Object System.Drawing.SolidBrush(
            [System.Drawing.Color]::FromArgb($ds.a, 255, 255, 255)
        )
        $g.FillEllipse($dsBrush, [float]($ds.x - $ds.r), [float]($ds.y - $ds.r), [float]($ds.r * 2), [float]($ds.r * 2))
        $dsBrush.Dispose()
    }

    # App name (left-aligned in left half)
    $fontName = New-Object System.Drawing.Font("Segoe UI", 26, [System.Drawing.FontStyle]::Bold)
    $sfL = New-Object System.Drawing.StringFormat
    $sfL.Alignment = [System.Drawing.StringAlignment]::Center
    $sfL.LineAlignment = [System.Drawing.StringAlignment]::Near
    $rectName = New-Object System.Drawing.RectangleF(40, 320, 540, 50)
    $g.DrawString("帰ってきたDarkBlueテーマ(X)", $fontName, $brushW, $rectName, $sfL)

    # Tagline
    $fontTag = New-Object System.Drawing.Font("Segoe UI", 17)
    $rectTag = New-Object System.Drawing.RectangleF(40, 378, 540, 40)
    $g.DrawString("X の黒テーマを DarkBlue に", $fontTag, $brushSub, $rectTag, $sfL)

    # Accent underline
    $barW = 100; $barH = 4
    $barX = 260 - $barW / 2; $barY = 430
    $pBar = New-RoundedRect $barX $barY $barW $barH 2
    $g.FillPath($brushAcc, $pBar)

    # ── Right side: Before/After comparison ──
    $rightStart = 660
    $mockW = 280; $mockH = 340
    $gap = 56

    # Before rectangle (black)
    $bfX = $rightStart; $bfY = ($tH - $mockH) / 2
    $pBf = New-RoundedRect $bfX $bfY $mockW $mockH 14
    $g.FillPath($brushBlk, $pBf)
    $g.DrawPath($penBorder, $pBf)

    # Before label
    $fontLabel = New-Object System.Drawing.Font("Segoe UI", 20, [System.Drawing.FontStyle]::Bold)
    $fontSmall = New-Object System.Drawing.Font("Segoe UI", 14)
    $sfC = New-Object System.Drawing.StringFormat
    $sfC.Alignment = [System.Drawing.StringAlignment]::Center
    $sfC.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rectBfLabel = New-Object System.Drawing.RectangleF($bfX, $bfY, $mockW, ($mockH - 30))
    $g.DrawString("黒テーマ", $fontLabel, $brushW, $rectBfLabel, $sfC)
    $rectBfSm = New-Object System.Drawing.RectangleF($bfX, ($bfY + 40), $mockW, ($mockH - 30))
    $g.DrawString("Before", $fontSmall, $brushSub, $rectBfSm, $sfC)

    # Arrow between
    $arrowX = $bfX + $mockW + ($gap / 2)
    $arrowY = $tH / 2
    $fontArrow = New-Object System.Drawing.Font("Segoe UI", 40, [System.Drawing.FontStyle]::Bold)
    $sfArr = New-Object System.Drawing.StringFormat
    $sfArr.Alignment = [System.Drawing.StringAlignment]::Center
    $sfArr.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rectArrow = New-Object System.Drawing.RectangleF(($arrowX - 30), ($arrowY - 30), 60, 60)
    $g.DrawString([char]0x2192, $fontArrow, $brushAcc, $rectArrow, $sfArr)

    # After rectangle (DarkBlue)
    $afX = $bfX + $mockW + $gap; $afY = $bfY
    $brushMainBG = New-Object System.Drawing.SolidBrush($MainBG)
    $pAf = New-RoundedRect $afX $afY $mockW $mockH 14
    $g.FillPath($brushMainBG, $pAf)
    $g.DrawPath($penBorder, $pAf)

    # Inner card in After
    $icMargin = 22
    $icW = $mockW - $icMargin * 2
    $icH = 140
    $icX = $afX + $icMargin
    $icY = $afY + 40
    $pIc = New-RoundedRect $icX $icY $icW $icH 10
    $g.FillPath($brushCard, $pIc)

    # Faux content lines in card
    $lineBrush = New-Object System.Drawing.SolidBrush($SubText)
    for ($i = 0; $i -lt 3; $i++) {
        $lw = @(200, 160, 120)[$i]
        $ly = $icY + 20 + ($i * 35)
        $lx = $icX + 16
        $pLine = New-RoundedRect $lx $ly $lw 8 4
        $g.FillPath($lineBrush, $pLine)
        $pLine.Dispose()
    }

    # After label
    $rectAfLabel = New-Object System.Drawing.RectangleF($afX, ($afY + $mockH - 100), $mockW, 50)
    $g.DrawString("DarkBlue", $fontLabel, $brushW, $rectAfLabel, $sfC)
    $rectAfSm = New-Object System.Drawing.RectangleF($afX, ($afY + $mockH - 60), $mockW, 40)
    $g.DrawString("After", $fontSmall, $brushSub, $rectAfSm, $sfC)

    # ── Save & cleanup ──
    $outFile = "$basePath\marquee-1400x560.png"
    $bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)

    $fontName.Dispose(); $fontTag.Dispose(); $fontLabel.Dispose()
    $fontSmall.Dispose(); $fontArrow.Dispose()
    $brushW.Dispose(); $brushSub.Dispose(); $brushAcc.Dispose()
    $brushBlk.Dispose(); $brushCard.Dispose(); $brushMainBG.Dispose()
    $lineBrush.Dispose(); $penBorder.Dispose()
    $sfL.Dispose(); $sfC.Dispose(); $sfArr.Dispose()
    $pBf.Dispose(); $pAf.Dispose(); $pIc.Dispose(); $pBar.Dispose()
    $g.Dispose(); $bmp.Dispose()
    Write-Host "Created $outFile"
}

Write-Host ""
Write-Host "All 3 promotional tiles generated!" -ForegroundColor Green
