# 帰ってきたDarkBlueテーマ(X) 拡張機能パッケージ生成スクリプト (Windows PowerShell版)
# 使い方:
#   powershell -ExecutionPolicy Bypass -File zip.ps1                    # Chrome + Firefox 両方
#   powershell -ExecutionPolicy Bypass -File zip.ps1 -Target chrome     # Chrome のみ
#   powershell -ExecutionPolicy Bypass -File zip.ps1 -Target firefox    # Firefox のみ
#
# Firefox 版は manifest.firefox.json を manifest.json として同梱し、xpi 拡張子で出力する。
# DarkBlueThemeX は Firefox 非対応 API (offscreen / tabCapture 等) を使っていないため、
# WebRestrictionRemoval のような __FIREFOX_STRIP_*__ マーカー削除処理は不要。

param(
    [ValidateSet("chrome","firefox","both")]
    [string]$Target = "both"
)

$ErrorActionPreference = "Stop"

Write-Host "拡張機能パッケージを生成中... (Target: $Target)" -ForegroundColor Cyan
Write-Host ""

# スクリプトのディレクトリをカレントディレクトリに設定
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($scriptDir) { Set-Location $scriptDir }

function Build-Package {
    param(
        [string]$Variant,        # "chrome" | "firefox"
        [string]$ManifestSource, # "manifest.json" | "manifest.firefox.json"
        [string]$OutputName      # "DarkBlueThemeX-chrome.zip" | "DarkBlueThemeX-firefox.xpi"
    )

    Write-Host ""
    Write-Host "==== $Variant 版をビルド中 ====" -ForegroundColor Cyan

    if (Test-Path $OutputName) {
        Remove-Item $OutputName -Force
    }

    $tempDir = "temp-build-$Variant"
    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
    New-Item -ItemType Directory -Path $tempDir | Out-Null

    Write-Host "ファイルをコピー中 ($ManifestSource → manifest.json)..." -ForegroundColor Yellow
    # Firefox 版は manifest.firefox.json を manifest.json として配置する。
    # Chrome 版は manifest.json をそのまま使う。
    Copy-Item $ManifestSource -Destination "$tempDir/manifest.json"
    Copy-Item "icons" -Destination $tempDir -Recurse
    Copy-Item "src" -Destination $tempDir -Recurse

    # 不要ファイル除去
    Get-ChildItem -Path $tempDir -Recurse -Include "*.DS_Store","*.swp","*~" | Remove-Item -Force

    Write-Host "アーカイブを作成中..." -ForegroundColor Cyan
    # Windows PowerShell の Compress-Archive と .NET CreateFromDirectory はどちらも Windows 上で
    # パス区切りに `\` (backslash) を使う既知バグがあり、Firefox AMO の web-ext lint や
    # unzip ツールが backslash separator を弾く。
    # 直接 ZipFile.Open + CreateEntryFromFile で書き、エントリ名を明示的に forward slash に
    # 正規化して書き込む。PowerShell 5.1 では型直接参照 (New-Object) が失敗する場合があるので
    # static method 経由でハンドルを取得する。
    Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
    $tempZip = "$OutputName.tmp.zip"
    if (Test-Path $tempZip) { Remove-Item $tempZip -Force }
    $absTempDir = (Resolve-Path $tempDir).Path
    $absTempZip = Join-Path (Get-Location).Path $tempZip
    $archive = [System.IO.Compression.ZipFile]::Open($absTempZip, 'Create')
    try {
        $files = Get-ChildItem -Path $absTempDir -Recurse -File
        foreach ($f in $files) {
            $relative = $f.FullName.Substring($absTempDir.Length).TrimStart('\','/').Replace('\','/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $f.FullName, $relative, 'Optimal') | Out-Null
        }
    } finally {
        $archive.Dispose()
    }
    Move-Item -Path $tempZip -Destination $OutputName -Force

    Remove-Item $tempDir -Recurse -Force

    if (Test-Path $OutputName) {
        $size = (Get-Item $OutputName).Length
        $sizeKB = [math]::Round($size / 1KB, 2)
        Write-Host "$Variant 版 作成成功: $OutputName ($sizeKB KB)" -ForegroundColor Green
    } else {
        Write-Host "$Variant 版 作成に失敗しました" -ForegroundColor Red
        exit 1
    }
}

# 旧名 zip を掃除 (互換維持のため)
if (Test-Path "DarkBlueThemeX.zip") { Remove-Item "DarkBlueThemeX.zip" -Force }

if ($Target -eq "chrome" -or $Target -eq "both") {
    Build-Package -Variant "chrome" -ManifestSource "manifest.json" -OutputName "DarkBlueThemeX-chrome.zip"
}
if ($Target -eq "firefox" -or $Target -eq "both") {
    Build-Package -Variant "firefox" -ManifestSource "manifest.firefox.json" -OutputName "DarkBlueThemeX-firefox.xpi"
}

Write-Host ""
Write-Host "パッケージング完了" -ForegroundColor Green
Write-Host "   Chrome Web Store: https://chrome.google.com/webstore/devconsole" -ForegroundColor Blue
Write-Host "   Firefox AMO:      https://addons.mozilla.org/developers/" -ForegroundColor Blue
