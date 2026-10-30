# 帰ってきたDarkBlueテーマ(X) 拡張機能パッケージ生成スクリプト (Windows PowerShell版)
# 使い方: pwsh -NoProfile -File zip.ps1 [-Target chrome|firefox|both]
# Firefox 版は manifest.firefox.json を manifest.json として同梱する。
param(
    [ValidateSet("chrome", "firefox", "both")]
    [string]$Target = "both"
)

$ErrorActionPreference = "Stop"
$scriptDir = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\', '/')
$boundary = $scriptDir + [IO.Path]::DirectorySeparatorChar

# 入出力をリポジトリ内に限定し、既存の親を含めリンクを経由しない。
function Assert-SafePath {
    param([string]$Path)
    if (-not [IO.Path]::IsPathRooted($Path)) { throw "絶対パスが必要です: $Path" }
    $fullPath = [IO.Path]::GetFullPath($Path)
    if (-not $fullPath.StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase)) {
        throw "リポジトリ外のパスです: $fullPath"
    }
    $part = $fullPath
    while ($part) {
        $item = Get-Item -LiteralPath $part -Force -ErrorAction SilentlyContinue
        if ($null -ne $item) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "リンクを含むパスです: $part"
            }
        }
        $part = Split-Path $part -Parent
    }
    return $fullPath
}

function Build-Package {
    param([string]$Variant, [string]$ManifestSource, [string]$OutputName)

    Write-Host "`n==== $Variant 版をビルド中 ====" -ForegroundColor Cyan
    $manifest = Assert-SafePath (Join-Path $scriptDir $ManifestSource)
    $output = Assert-SafePath (Join-Path $scriptDir $OutputName)
    if ((Test-Path -LiteralPath $output) -and (Get-Item -LiteralPath $output -Force).PSIsContainer) {
        throw "出力先がディレクトリです: $output"
    }
    $tempZip = Assert-SafePath (Join-Path $scriptDir (".$OutputName." + [guid]::NewGuid().ToString('N') + '.tmp.zip'))
    Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
    try {
        # Create は既存ファイルを上書きせず、ランダム名が衝突した場合は失敗する。
        $archive = [System.IO.Compression.ZipFile]::Open($tempZip, 'Create')
        try {
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $manifest, 'manifest.json', 'Optimal') | Out-Null
            foreach ($directory in @('icons', 'src')) {
                $root = Assert-SafePath (Join-Path $scriptDir $directory)
                $files = Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction Stop
                foreach ($file in $files) {
                    $relative = $file.FullName.Substring($scriptDir.Length).TrimStart('\', '/')
                    # 除外対象の親ディレクトリにあるファイルも含めない。
                    $excluded = @($relative -split '[\\/]' | Where-Object { $_ -like '*.DS_Store' -or $_ -like '*.swp' -or $_ -like '*~' }).Count -gt 0
                    if ($excluded) { continue }
                    $source = Assert-SafePath $file.FullName
                    $entry = $relative.Replace('\', '/')
                    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $source, $entry, 'Optimal') | Out-Null
                }
            }
        } finally {
            $archive.Dispose()
        }
        # 出力直前に再検証し、完成した ZIP のみ所定の名前へ移動する。
        $null = Assert-SafePath $tempZip
        $null = Assert-SafePath $output
        Move-Item -LiteralPath $tempZip -Destination $output -Force -ErrorAction Stop
    } catch {
        if (Test-Path -LiteralPath $tempZip) { Write-Warning "未完成の一時 ZIP を保持しました: $tempZip" }
        throw
    }
    $sizeKB = [math]::Round((Get-Item -LiteralPath $output).Length / 1KB, 2)
    Write-Host "$Variant 版 作成成功: $OutputName ($sizeKB KB)" -ForegroundColor Green
}

if ($Target -eq 'chrome' -or $Target -eq 'both') {
    Build-Package -Variant 'chrome' -ManifestSource 'manifest.json' -OutputName 'DarkBlueThemeX-chrome.zip'
}
if ($Target -eq 'firefox' -or $Target -eq 'both') {
    Build-Package -Variant 'firefox' -ManifestSource 'manifest.firefox.json' -OutputName 'DarkBlueThemeX-firefox.xpi'
}
Write-Host "`nパッケージング完了" -ForegroundColor Green
