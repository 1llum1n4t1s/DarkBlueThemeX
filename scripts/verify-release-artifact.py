#!/usr/bin/env python3
"""提出予定の ZIP/XPI を、同じ checkout の配布入力と照合する。"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import zipfile


GECKO_ID = "{6a3c2b7e-9d4f-4a1c-b8e5-2f7d8c9e1a3b}"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def excluded(relative_path):
    # zip.sh の find / zip -x と同じく、該当するディレクトリ配下も除外する。
    return any(part.endswith((".DS_Store", ".swp", "~")) for part in relative_path.parts)


def expected_payload(root, variant):
    manifest_path = root / ("manifest.json" if variant == "chrome" else "manifest.firefox.json")
    expected = {"manifest.json": manifest_path.read_bytes()}
    for directory in ("src", "icons"):
        source = root / directory
        require(source.is_dir(), f"正本ディレクトリがありません: {source}")
        for entry in sorted(source.rglob("*")):
            relative = entry.relative_to(root)
            if excluded(relative):
                continue
            require(not entry.is_symlink(), f"正本にシンボリックリンクがあります: {relative}")
            if entry.is_file():
                expected[relative.as_posix()] = entry.read_bytes()
    return expected


def verify(variant, archive_path):
    root = Path.cwd().resolve()
    primary = json.loads((root / "manifest.json").read_bytes())
    expected = expected_payload(root, variant)
    manifest = json.loads(expected["manifest.json"])
    require(manifest.get("version") == primary.get("version"), "variant と PRIMARY の version が不一致です")
    require(isinstance(primary.get("version"), str) and primary["version"], "PRIMARY の version がありません")
    require(manifest.get("manifest_version") == 3, "Manifest V3 ではありません")
    if variant == "firefox":
        gecko = manifest.get("browser_specific_settings", {}).get("gecko", {})
        require(gecko.get("id") == GECKO_ID, "Firefox Gecko ID が不一致です")

    # 生成 PNG の欠落も、正本側の欠落として見逃さない。
    required_files = set(manifest.get("icons", {}).values())
    action = manifest.get("action", {})
    required_files.update(action.get("default_icon", {}).values())
    if action.get("default_popup"):
        required_files.add(action["default_popup"])
    for content_script in manifest.get("content_scripts", []):
        required_files.update(content_script.get("js", []))
        required_files.update(content_script.get("css", []))
    require(required_files <= expected.keys(), f"manifest が参照する正本ファイルがありません: {sorted(required_files - expected.keys())}")

    archive_path = archive_path.resolve(strict=True)
    payload = {}
    seen = set()
    with zipfile.ZipFile(archive_path) as archive:
        for info in archive.infolist():
            name = info.filename
            normalized = name[:-1] if info.is_dir() else name
            require(info.orig_filename == name, "ZIP エントリ名に NUL があります")
            require("\\" not in name and ":" not in name, f"ZIP エントリのパス形式が不正です: {name!r}")
            require(all(part not in ("", ".", "..") for part in normalized.split("/")), f"ZIP エントリのパスが安全ではありません: {name!r}")
            require(normalized not in seen, f"ZIP エントリが重複しています: {name!r}")
            seen.add(normalized)
            mode = stat.S_IFMT(info.external_attr >> 16)
            require(mode in (0, stat.S_IFREG, stat.S_IFDIR), f"ZIP に通常ファイル以外が含まれています: {name!r}")
            if info.is_dir():
                continue
            require(name in expected, f"予定外のファイルが含まれています: {name!r}")
            require(info.file_size == len(expected[name]), f"ファイルサイズが正本と不一致です: {name!r}")
            actual = archive.read(info)
            require(actual == expected[name], f"ファイル内容が正本と不一致です: {name!r}")
            payload[name] = {"bytes": len(actual), "sha256": hashlib.sha256(actual).hexdigest()}
    require(payload.keys() == expected.keys(), f"配布物のファイルが不足しています: {sorted(expected.keys() - payload.keys())}")

    return {
        "archive": str(archive_path),
        "archive_sha256": hashlib.sha256(archive_path.read_bytes()).hexdigest(),
        "source_root": str(root),
        "source_revision": os.environ.get("GITHUB_SHA"),
        "variant": variant,
        "version": primary["version"],
        "manifest_version": manifest["manifest_version"],
        "signing_state": "unsigned",
        "file_count": len(payload),
        "payload": payload,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("variant", choices=("chrome", "firefox"))
    parser.add_argument("archive", type=Path)
    arguments = parser.parse_args()
    try:
        result = verify(arguments.variant, arguments.archive)
    except (OSError, ValueError, RuntimeError, zipfile.BadZipFile) as error:
        print(f"配布物照合失敗: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
