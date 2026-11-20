import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const outDir = path.join(rootDir, 'dist-yandex');
const zipPath = path.join(rootDir, 'aether-rift-yandex.zip');

if (!fs.existsSync(distDir)) {
  console.error('dist/ folder not found. Run npm run build first.');
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const SKIP_FILES = new Set(['sw.js', 'manifest.webmanifest']);
let fileCount = 0;

function copyFiltered(src, dst) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP_FILES.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dstPath, { recursive: true });
      copyFiltered(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
      fileCount++;
    }
  }
}

copyFiltered(distDir, outDir);

const htmlPath = path.join(outDir, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
html = html
  .replace(/\s*<link[^>]*manifest\.webmanifest[^>]*>/gi, '')
  .replace(/\s*<script[^>]*telegram-web-app\.js[^>]*><\/script>/gi, '')
  .replace(/\s*<script[^>]*adsgram\.ai[^>]*><\/script>/gi, '');

if (!html.includes('/sdk.js')) {
  html = html.replace('<title>', '<script src="/sdk.js"></script>\n    <title>');
}
fs.writeFileSync(htmlPath, html, 'utf8');

if (fs.existsSync(zipPath)) {
  fs.rmSync(zipPath, { force: true });
}

if (process.platform === 'win32') {
  const psScript = `
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$src = (Resolve-Path '${outDir.replace(/'/g, "''")}').Path
$dst = '${zipPath.replace(/'/g, "''")}'
$zip = [System.IO.Compression.ZipFile]::Open($dst, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -Path $src -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($src.Length + 1).Replace('\\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  $zip.Dispose()
}
`.trim();
  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
  execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, { stdio: 'inherit' });
} else {
  execSync(`cd "${outDir}" && zip -rq "${zipPath}" .`, { stdio: 'inherit' });
}

const sizeKb = (fs.statSync(zipPath).size / 1024).toFixed(1);
console.log(`Yandex Games bundle built: ${fileCount} files -> ${zipPath} (${sizeKb} KB)`);
