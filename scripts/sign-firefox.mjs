// 固定済み web-ext の署名経路に、提出される実物の照合だけを挟む。
import { constants } from 'node:fs';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import sign from '../node_modules/web-ext/lib/cmd/sign.js';
import defaultBuilder from '../node_modules/web-ext/lib/cmd/build.js';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const artifactsDir = path.join(sourceRoot, 'web-ext-artifacts');
const apiKey = process.env.WEB_EXT_API_KEY;
const apiSecret = process.env.WEB_EXT_API_SECRET;

async function verifiedBuilder(params, options) {
    // sign が生成した一度限りの buildResult をそのまま返し、再包装しない。
    const buildResult = await defaultBuilder(params, options);
    const verification = spawnSync('python3', [
        path.join(sourceRoot, 'scripts/verify-release-artifact.py'),
        'firefox',
        buildResult.extensionPath,
    ], { cwd: sourceRoot, encoding: 'utf8' });
    if (verification.stdout) process.stdout.write(verification.stdout);
    if (verification.stderr) process.stderr.write(verification.stderr);
    if (verification.error) throw verification.error;
    if (verification.status !== 0) throw new Error('AMO 提出用 XPI の配布物照合に失敗しました');

    const report = JSON.parse(verification.stdout);
    // 一時 XPI は web-ext 終了時に消えるため、同じ bytes の証拠を別名で保持する。
    const evidenceArchive = path.join(artifactsDir, 'unsigned-submission.xpi');
    await copyFile(buildResult.extensionPath, evidenceArchive, constants.COPYFILE_EXCL);
    const evidenceHash = createHash('sha256').update(await readFile(evidenceArchive)).digest('hex');
    if (evidenceHash !== report.archive_sha256) throw new Error('AMO 提出用 XPI と保持コピーの SHA256 が不一致です');
    await writeFile(path.join(artifactsDir, 'unsigned-submission-verification.json'), JSON.stringify({
        ...report,
        evidence_archive: evidenceArchive,
        evidence_sha256: evidenceHash,
    }, null, 2) + '\n', { flag: 'wx' });
    console.log(`AMO 提出前照合済み: ${evidenceArchive} SHA256=${evidenceHash}`);
    return buildResult;
}

try {
    if (!apiKey || !apiSecret) throw new Error('AMO API キーが設定されていません');
    const webextPackage = JSON.parse(await readFile(new URL('../node_modules/web-ext/package.json', import.meta.url), 'utf8'));
    await sign({
        sourceDir: path.join(sourceRoot, 'firefox-build'),
        artifactsDir,
        channel: 'listed',
        amoMetadata: path.join(sourceRoot, '.amo-metadata.json'),
        apiKey,
        apiSecret,
        webextVersion: webextPackage.version,
        // timeout / approvalTimeout は CLI と同じ未指定とし、web-ext の既定値を使う。
    }, { build: verifiedBuilder });
} catch (error) {
    let message = error.message ?? String(error);
    for (const secret of [apiKey, apiSecret]) {
        if (secret) message = message.replaceAll(secret, '[REDACTED]');
    }
    console.error(message);
    process.exitCode = 1;
}
