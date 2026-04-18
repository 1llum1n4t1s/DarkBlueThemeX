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
$Green    = [System.Drawing.Color]::FromArgb(0, 186, 124)

$W = 1280; $H = 800
$basePath = "C:\Users\szk\Work\DarkBlueThemeX\webstore-screenshots"

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

# ══════════════════════════════════════════════════════════════════
# Screenshot 01 - Hero (Before / After)
# ══════════════════════════════════════════════════════════════════
& {
    $bmp = New-Object System.Drawing.Bitmap($W, $H)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint  = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear($MainBG)

    # ── Title ──
    $fontTitle = New-Object System.Drawing.Font("Segoe UI", 44, [System.Drawing.FontStyle]::Bold)
    $brushW    = New-Object System.Drawing.SolidBrush($TextW)
    Draw-CenteredText $g "帰ってきたDarkBlueテーマ" $fontTitle $brushW 40 $W

    # ── Subtitle ──
    $fontSub   = New-Object System.Drawing.Font("Segoe UI", 22)
    $brushSub  = New-Object System.Drawing.SolidBrush($SubText)
    Draw-CenteredText $g "X の黒テーマを DarkBlue に変換" $fontSub $brushSub 110 $W

    # ── Before / After mockups ──
    $mockW = 420; $mockH = 460
    $gap = 80
    $totalW = $mockW * 2 + $gap
    $startX = ($W - $totalW) / 2
    $mockY = 180

    # Before rect (black)
    $brushBlack = New-Object System.Drawing.SolidBrush($Black)
    $pBefore = New-RoundedRect $startX $mockY $mockW $mockH 16
    $g.FillPath($brushBlack, $pBefore)

    # Before border
    $penBorder = New-Object System.Drawing.Pen($Border, 2)
    $g.DrawPath($penBorder, $pBefore)

    # Before label
    $fontLabel = New-Object System.Drawing.Font("Segoe UI", 28, [System.Drawing.FontStyle]::Bold)
    $sfC = New-Object System.Drawing.StringFormat
    $sfC.Alignment = [System.Drawing.StringAlignment]::Center
    $sfC.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rectBefore = New-Object System.Drawing.RectangleF($startX, $mockY, $mockW, ($mockH - 50))
    $g.DrawString("黒テーマ", $fontLabel, $brushW, $rectBefore, $sfC)

    $fontSmall = New-Object System.Drawing.Font("Segoe UI", 18)
    $rectBeforeSm = New-Object System.Drawing.RectangleF($startX, ($mockY + 60), $mockW, ($mockH - 50))
    $g.DrawString("Before", $fontSmall, $brushSub, $rectBeforeSm, $sfC)

    # Arrow
    $arrowX = $startX + $mockW + ($gap / 2)
    $arrowY = $mockY + ($mockH / 2)
    $fontArrow = New-Object System.Drawing.Font("Segoe UI", 48, [System.Drawing.FontStyle]::Bold)
    $brushAccent = New-Object System.Drawing.SolidBrush($Accent)
    $sfArrow = New-Object System.Drawing.StringFormat
    $sfArrow.Alignment = [System.Drawing.StringAlignment]::Center
    $sfArrow.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rectArrow = New-Object System.Drawing.RectangleF(($arrowX - 40), ($arrowY - 40), 80, 80)
    $g.DrawString([char]0x2192, $fontArrow, $brushAccent, $rectArrow, $sfArrow)

    # After rect (DarkBlue)
    $afterX = $startX + $mockW + $gap
    $pAfter = New-RoundedRect $afterX $mockY $mockW $mockH 16
    $brushMainBG = New-Object System.Drawing.SolidBrush($MainBG)
    $g.FillPath($brushMainBG, $pAfter)
    $g.DrawPath($penBorder, $pAfter)

    # Inner card in After
    $cardMargin = 30
    $cardW = $mockW - $cardMargin * 2
    $cardH = 180
    $cardX = $afterX + $cardMargin
    $cardY = $mockY + 60
    $pCard = New-RoundedRect $cardX $cardY $cardW $cardH 12
    $brushCard = New-Object System.Drawing.SolidBrush($CardBG)
    $g.FillPath($brushCard, $pCard)

    # Some faux lines inside the card
    $lineBrush = New-Object System.Drawing.SolidBrush($SubText)
    $lineH = 10
    for ($i = 0; $i -lt 4; $i++) {
        $lw = @(280, 220, 260, 140)[$i]
        $ly = $cardY + 25 + ($i * 35)
        $lx = $cardX + 20
        $pLine = New-RoundedRect $lx $ly $lw $lineH 5
        $g.FillPath($lineBrush, $pLine)
        $pLine.Dispose()
    }

    # After label
    $rectAfter = New-Object System.Drawing.RectangleF($afterX, ($mockY + $mockH - 140), $mockW, 60)
    $g.DrawString("DarkBlue", $fontLabel, $brushW, $rectAfter, $sfC)
    $rectAfterSm = New-Object System.Drawing.RectangleF($afterX, ($mockY + $mockH - 80), $mockW, 40)
    $g.DrawString("After", $fontSmall, $brushSub, $rectAfterSm, $sfC)

    # ── Bottom label ──
    $fontBottom = New-Object System.Drawing.Font("Segoe UI", 16)
    $moonEmoji = [char]::ConvertFromUtf32(0x1F319)
    Draw-CenteredText $g ($moonEmoji + " 帰ってきたDarkBlueテーマ(X)") $fontBottom $brushSub 740 $W

    # ── Save & cleanup ──
    $outFile = "$basePath\screenshot-01-hero.png"
    $bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)

    $fontTitle.Dispose(); $fontSub.Dispose(); $fontLabel.Dispose()
    $fontSmall.Dispose(); $fontArrow.Dispose(); $fontBottom.Dispose()
    $brushW.Dispose(); $brushSub.Dispose(); $brushBlack.Dispose()
    $brushAccent.Dispose(); $brushMainBG.Dispose(); $brushCard.Dispose()
    $lineBrush.Dispose(); $penBorder.Dispose()
    $sfC.Dispose(); $sfArrow.Dispose()
    $pBefore.Dispose(); $pAfter.Dispose(); $pCard.Dispose()
    $g.Dispose(); $bmp.Dispose()
    Write-Host "Created $outFile"
}

# ══════════════════════════════════════════════════════════════════
# Screenshot 02 - Toggle Demo
# ══════════════════════════════════════════════════════════════════
& {
    $bmp = New-Object System.Drawing.Bitmap($W, $H)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint  = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear($MainBG)

    $brushW   = New-Object System.Drawing.SolidBrush($TextW)
    $brushSub = New-Object System.Drawing.SolidBrush($SubText)
    $brushAcc = New-Object System.Drawing.SolidBrush($Accent)
    $brushCard = New-Object System.Drawing.SolidBrush($CardBG)
    $brushGreen = New-Object System.Drawing.SolidBrush($Green)

    # ── Title ──
    $fontTitle = New-Object System.Drawing.Font("Segoe UI", 40, [System.Drawing.FontStyle]::Bold)
    Draw-CenteredText $g "ワンタッチ切り替え" $fontTitle $brushW 50 $W

    # ── Popup mockup ──
    $popW = 380; $popH = 400
    $popX = ($W - $popW) / 2
    $popY = 160
    $pPop = New-RoundedRect $popX $popY $popW $popH 20
    $g.FillPath($brushCard, $pPop)

    # Popup border
    $penBorder = New-Object System.Drawing.Pen($Border, 2)
    $g.DrawPath($penBorder, $pPop)

    # Popup title inside
    $fontPopTitle = New-Object System.Drawing.Font("Segoe UI", 18, [System.Drawing.FontStyle]::Bold)
    $sfC = New-Object System.Drawing.StringFormat
    $sfC.Alignment = [System.Drawing.StringAlignment]::Center
    $sfC.LineAlignment = [System.Drawing.StringAlignment]::Near
    $rectPopTitle = New-Object System.Drawing.RectangleF($popX, ($popY + 30), $popW, 40)
    $g.DrawString("帰ってきたDarkBlueテーマ", $fontPopTitle, $brushW, $rectPopTitle, $sfC)

    # Divider line
    $penDiv = New-Object System.Drawing.Pen($Border, 1)
    $g.DrawLine($penDiv, ($popX + 20), ($popY + 80), ($popX + $popW - 20), ($popY + 80))

    # Toggle label
    $fontToggle = New-Object System.Drawing.Font("Segoe UI", 16)
    $rectTogLabel = New-Object System.Drawing.RectangleF(($popX + 30), ($popY + 110), 200, 30)
    $sfL = New-Object System.Drawing.StringFormat
    $sfL.Alignment = [System.Drawing.StringAlignment]::Near
    $sfL.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("DarkBlue テーマ", $fontToggle, $brushW, $rectTogLabel, $sfL)

    # Toggle switch (ON state)
    $toggleW = 56; $toggleH = 30
    $toggleX = $popX + $popW - 30 - $toggleW
    $toggleY = $popY + 112
    $pToggle = New-RoundedRect $toggleX $toggleY $toggleW $toggleH 15
    $g.FillPath($brushAcc, $pToggle)
    # White knob (right side = ON)
    $knobR = 12
    $knobX = $toggleX + $toggleW - $knobR - 5
    $knobY = $toggleY + ($toggleH / 2)
    $g.FillEllipse($brushW, [float]($knobX - $knobR), [float]($knobY - $knobR), [float]($knobR * 2), [float]($knobR * 2))

    # Status section
    # Green dot
    $dotR = 6
    $dotX = $popX + 50
    $dotY = $popY + 190
    $g.FillEllipse($brushGreen, [float]($dotX - $dotR), [float]($dotY - $dotR), [float]($dotR * 2), [float]($dotR * 2))

    # Status text
    $fontStatus = New-Object System.Drawing.Font("Segoe UI", 15)
    $rectStatus = New-Object System.Drawing.RectangleF(($dotX + 16), ($dotY - 12), 280, 30)
    $g.DrawString("DarkBlue テーマ適用中", $fontStatus, $brushGreen, $rectStatus, $sfL)

    # Crescent moon decorative element inside popup
    $moonBrush = New-Object System.Drawing.SolidBrush($Accent)
    $moonCx = $popX + $popW / 2; $moonCy = $popY + 300; $moonR = 35
    $g.FillEllipse($moonBrush, [float]($moonCx - $moonR), [float]($moonCy - $moonR), [float]($moonR * 2), [float]($moonR * 2))
    $cutBrush = New-Object System.Drawing.SolidBrush($CardBG)
    $cutCx = $moonCx + 18; $cutCy = $moonCy - 14; $cutR = 28
    $g.FillEllipse($cutBrush, [float]($cutCx - $cutR), [float]($cutCy - $cutR), [float]($cutR * 2), [float]($cutR * 2))

    # Stars inside popup
    $starBrush1 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 255, 255, 255))
    $starBrush2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(120, 255, 255, 255))
    $g.FillEllipse($starBrush1, [float]($moonCx + 40), [float]($moonCy - 30), 6, 6)
    $g.FillEllipse($starBrush2, [float]($moonCx + 50), [float]($moonCy - 10), 4, 4)
    $g.FillEllipse($starBrush1, [float]($moonCx + 30), [float]($moonCy - 45), 5, 5)

    # ── Below popup text ──
    $fontBelow = New-Object System.Drawing.Font("Segoe UI", 20)
    Draw-CenteredText $g "デフォルトON・いつでもOFF" $fontBelow $brushSub 610 $W

    # ── Save & cleanup ──
    $outFile = "$basePath\screenshot-02-toggle.png"
    $bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)

    $fontTitle.Dispose(); $fontPopTitle.Dispose(); $fontToggle.Dispose()
    $fontStatus.Dispose(); $fontBelow.Dispose()
    $brushW.Dispose(); $brushSub.Dispose(); $brushAcc.Dispose()
    $brushCard.Dispose(); $brushGreen.Dispose(); $moonBrush.Dispose()
    $cutBrush.Dispose(); $starBrush1.Dispose(); $starBrush2.Dispose()
    $penBorder.Dispose(); $penDiv.Dispose()
    $sfC.Dispose(); $sfL.Dispose()
    $pPop.Dispose(); $pToggle.Dispose()
    $g.Dispose(); $bmp.Dispose()
    Write-Host "Created $outFile"
}

# ══════════════════════════════════════════════════════════════════
# Screenshot 03 - Color Palette
# ══════════════════════════════════════════════════════════════════
& {
    $bmp = New-Object System.Drawing.Bitmap($W, $H)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint  = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear($MainBG)

    $brushW   = New-Object System.Drawing.SolidBrush($TextW)
    $brushSub = New-Object System.Drawing.SolidBrush($SubText)

    # ── Title ──
    $fontTitle = New-Object System.Drawing.Font("Segoe UI", 40, [System.Drawing.FontStyle]::Bold)
    Draw-CenteredText $g "DarkBlue カラーパレット" $fontTitle $brushW 40 $W

    # ── Swatch definitions ──
    $swatches = @(
        @{ name = "背景";       hex = "#15202B"; color = $MainBG   },
        @{ name = "カード";     hex = "#192734"; color = $CardBG   },
        @{ name = "ホバー";     hex = "#22303C"; color = $HoverBG  },
        @{ name = "ボーダー";   hex = "#38444D"; color = $Border   },
        @{ name = "テキスト";   hex = "#FFFFFF"; color = $TextW    },
        @{ name = "サブテキスト"; hex = "#8899A6"; color = $SubText },
        @{ name = "アクセント"; hex = "#1D9BF0"; color = $Accent   }
    )

    $swatchW = 140; $swatchH = 140
    $gap = 14
    $totalSwW = ($swatchW * 7) + ($gap * 6)
    $startX = ($W - $totalSwW) / 2
    $swatchY = 240

    $fontName = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
    $fontHex  = New-Object System.Drawing.Font("Segoe UI", 13)
    $penBorder = New-Object System.Drawing.Pen($Border, 2)

    $sfC = New-Object System.Drawing.StringFormat
    $sfC.Alignment = [System.Drawing.StringAlignment]::Center
    $sfC.LineAlignment = [System.Drawing.StringAlignment]::Center

    for ($i = 0; $i -lt $swatches.Count; $i++) {
        $sw = $swatches[$i]
        $x = $startX + $i * ($swatchW + $gap)

        # Name label above
        $rectName = New-Object System.Drawing.RectangleF($x, ($swatchY - 45), $swatchW, 35)
        $g.DrawString($sw.name, $fontName, $brushW, $rectName, $sfC)

        # Swatch rounded rect
        $swBrush = New-Object System.Drawing.SolidBrush($sw.color)
        $pSw = New-RoundedRect $x $swatchY $swatchW $swatchH 16
        $g.FillPath($swBrush, $pSw)
        $g.DrawPath($penBorder, $pSw)

        # HEX label below
        $rectHex = New-Object System.Drawing.RectangleF($x, ($swatchY + $swatchH + 12), $swatchW, 30)
        $g.DrawString($sw.hex, $fontHex, $brushSub, $rectHex, $sfC)

        $swBrush.Dispose()
        $pSw.Dispose()
    }

    # ── Decorative subtitle ──
    $fontDeco = New-Object System.Drawing.Font("Segoe UI", 18)
    Draw-CenteredText $g "かつての DarkBlue (Dim) テーマの色をそのまま再現" $fontDeco $brushSub 520 $W

    # ── Save & cleanup ──
    $outFile = "$basePath\screenshot-03-palette.png"
    $bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)

    $fontTitle.Dispose(); $fontName.Dispose(); $fontHex.Dispose(); $fontDeco.Dispose()
    $brushW.Dispose(); $brushSub.Dispose(); $penBorder.Dispose(); $sfC.Dispose()
    $g.Dispose(); $bmp.Dispose()
    Write-Host "Created $outFile"
}

# ══════════════════════════════════════════════════════════════════
# Screenshot 04 - Features (2x2 grid)
# ══════════════════════════════════════════════════════════════════
& {
    $bmp = New-Object System.Drawing.Bitmap($W, $H)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint  = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear($MainBG)

    $brushW    = New-Object System.Drawing.SolidBrush($TextW)
    $brushSub  = New-Object System.Drawing.SolidBrush($SubText)
    $brushAcc  = New-Object System.Drawing.SolidBrush($Accent)
    $brushCard = New-Object System.Drawing.SolidBrush($CardBG)

    # ── Title ──
    $fontTitle = New-Object System.Drawing.Font("Segoe UI", 40, [System.Drawing.FontStyle]::Bold)
    Draw-CenteredText $g "機能" $fontTitle $brushW 40 $W

    # ── Feature cards ──
    $features = @(
        @{ num = "1"; title = "自動検出";   desc = "黒テーマを自動で検出`nDarkBlueに変換" },
        @{ num = "2"; title = "ワンタッチ"; desc = "ポップアップから`nON/OFF切り替え" },
        @{ num = "3"; title = "安全設計";   desc = "ライトテーマには`n影響なし" },
        @{ num = "4"; title = "SPA対応";    desc = "動的なページ遷移に`n完全対応" }
    )

    $cardW = 520; $cardH = 260
    $gapX = 40; $gapY = 40
    $totalGridW = $cardW * 2 + $gapX
    $totalGridH = $cardH * 2 + $gapY
    $gridStartX = ($W - $totalGridW) / 2
    $gridStartY = 140

    $fontCardTitle = New-Object System.Drawing.Font("Segoe UI", 24, [System.Drawing.FontStyle]::Bold)
    $fontCardDesc  = New-Object System.Drawing.Font("Segoe UI", 17)
    $fontNum       = New-Object System.Drawing.Font("Segoe UI", 22, [System.Drawing.FontStyle]::Bold)
    $penBorder     = New-Object System.Drawing.Pen($Border, 1)

    $sfC = New-Object System.Drawing.StringFormat
    $sfC.Alignment = [System.Drawing.StringAlignment]::Center
    $sfC.LineAlignment = [System.Drawing.StringAlignment]::Center

    $sfL = New-Object System.Drawing.StringFormat
    $sfL.Alignment = [System.Drawing.StringAlignment]::Near
    $sfL.LineAlignment = [System.Drawing.StringAlignment]::Near

    for ($i = 0; $i -lt $features.Count; $i++) {
        $f = $features[$i]
        $col = $i % 2
        $row = [math]::Floor($i / 2)
        $cx = $gridStartX + $col * ($cardW + $gapX)
        $cy = $gridStartY + $row * ($cardH + $gapY)

        # Card background
        $pCard = New-RoundedRect $cx $cy $cardW $cardH 16
        $g.FillPath($brushCard, $pCard)
        $g.DrawPath($penBorder, $pCard)

        # Number circle
        $circR = 26
        $circX = $cx + 35
        $circY = $cy + 40
        $g.FillEllipse($brushAcc, [float]($circX - $circR), [float]($circY - $circR), [float]($circR * 2), [float]($circR * 2))
        $rectNum = New-Object System.Drawing.RectangleF(($circX - $circR), ($circY - $circR), ($circR * 2), ($circR * 2))
        $g.DrawString($f.num, $fontNum, $brushW, $rectNum, $sfC)

        # Card title
        $titleX = $circX + $circR + 16
        $titleY = $circY - 16
        $rectCardTitle = New-Object System.Drawing.RectangleF($titleX, $titleY, ($cardW - ($titleX - $cx) - 20), 40)
        $g.DrawString($f.title, $fontCardTitle, $brushW, $rectCardTitle, $sfL)

        # Card description (multiline)
        $descText = $f.desc -replace '`n', "`n"
        $descY = $cy + 90
        $rectDesc = New-Object System.Drawing.RectangleF(($cx + 35), $descY, ($cardW - 70), ($cardH - 110))
        $g.DrawString($descText, $fontCardDesc, $brushSub, $rectDesc, $sfL)

        $pCard.Dispose()
    }

    # ── Save & cleanup ──
    $outFile = "$basePath\screenshot-04-features.png"
    $bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)

    $fontTitle.Dispose(); $fontCardTitle.Dispose(); $fontCardDesc.Dispose(); $fontNum.Dispose()
    $brushW.Dispose(); $brushSub.Dispose(); $brushAcc.Dispose(); $brushCard.Dispose()
    $penBorder.Dispose(); $sfC.Dispose(); $sfL.Dispose()
    $g.Dispose(); $bmp.Dispose()
    Write-Host "Created $outFile"
}

Write-Host ""
Write-Host "All 4 screenshots generated!" -ForegroundColor Green
