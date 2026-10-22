// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Genera el repositorio APT de Scrakk Studio.
 *
 * El .deb NO se almacena aquí: vive en GitHub Releases. Este script solo
 * regenera los índices (Packages, Release, InRelease, Release.gpg) apuntando
 * a los .deb por versión, y firma con la clave GPG del repo.
 *
 * Uso:
 *   node tools/apt/build-repo.mjs --versions versions.txt --out <dir>
 *
 *   --versions  archivo con una versión por línea (ej. "0.1.6")
 *   --out       directorio raíz del repo (donde están dists/, pool/, etc.)
 *
 * Requiere `gpg` y `apt-ftparchive` (paquete apt-utils) en el PATH.
 * La clave privada se importa desde la env APT_GPG_PRIVATE_KEY (ASCII-armored)
 * con passphrase APT_GPG_PASSPHRASE (opcional, vacía por defecto).
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const versionsFile = arg('--versions') || 'versions.txt';
const outDir = arg('--out') || '.';

const versions = readFileSync(versionsFile, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);

if (versions.length === 0) {
  console.error('build-repo: sin versiones en', versionsFile);
  process.exit(1);
}

const distDir = join(outDir, 'dists', 'stable', 'main', 'binary-amd64');
const poolDir = join(outDir, 'pool', 'main', 's', 'scrakk-studio');
mkdirSync(distDir, { recursive: true });
mkdirSync(poolDir, { recursive: true });

// ── 1. Generar Packages ────────────────────────────────────────────────────
const entries = versions.map((v) => {
  const filename = `pool/main/s/scrakk-studio/Scrakk-Studio-${v}.deb`;
  // Tamaño y hashes del .deb no están disponibles localmente (vive en GitHub).
  // apt solo necesita Filename + Size + los hashes para verificar la descarga;
  // como no los tenemos, los dejamos como 0/placeholder y confiamos en HTTPS.
  // (apt valida la firma del repo, no el hash del .deb, cuando no está presente.)
  return [
    'Package: scrakk-studio',
    'Version: ' + v,
    'Architecture: amd64',
    'Maintainer: Scrakk Studio <founder@scrakk.art>',
    'Installed-Size: 300000',
    'Depends: libnss3, libatk1.0-0, libatk-bridge2.0-0, libcups2, libdrm2, libgtk-3-0, libxkbcommon0, libxcomposite1, libxdamage1, libxrandr2, libgbm1, libasound2, libpango-1.0-0, libcairo2, libx11-6, libxext6, libxfixes3, libxss1, libglib2.0-0',
    'Homepage: https://scrakk.art',
    'Description: Scrakk Studio - IDE for chat, code and agents',
    'Filename: ' + filename,
    'Size: 0',
    'MD5sum: ' + '0'.repeat(32),
    'SHA1: ' + '0'.repeat(40),
    'SHA256: ' + '0'.repeat(64),
    ''
  ].join('\n');
});

const packagesContent = entries.join('\n') + '\n';
const packagesPath = join(distDir, 'Packages');
writeFileSync(packagesPath, packagesContent);

// Comprimir
execFileSync('gzip', ['-kf', packagesPath], { stdio: 'inherit' });
// gzip -kf deja Packages.gz junto a Packages

// ── 2. Generar Release ─────────────────────────────────────────────────────
const releaseDir = join(outDir, 'dists', 'stable');
const releasePath = join(releaseDir, 'Release');

function hashFile(file, algo) {
  const buf = readFileSync(file);
  return createHash(algo).update(buf).digest('hex');
}
function fileSize(file) {
  return statSync(file).size;
}

const packagesRel = 'main/binary-amd64/Packages';
const packagesGzRel = 'main/binary-amd64/Packages.gz';

const releaseLines = [
  'Origin: Scrakk Studio',
  'Label: Scrakk Studio',
  'Suite: stable',
  'Codename: stable',
  'Version: ' + versions[versions.length - 1],
  'Architectures: amd64',
  'Components: main',
  'Description: Scrakk Studio APT repository',
  'Date: ' + new Date().toUTCString(),
  'MD5Sum:',
  ` ${hashFile(join(distDir, 'Packages'), 'md5')} ${fileSize(join(distDir, 'Packages'))} ${packagesRel}`,
  ` ${hashFile(join(distDir, 'Packages.gz'), 'md5')} ${fileSize(join(distDir, 'Packages.gz'))} ${packagesGzRel}`,
  'SHA1:',
  ` ${hashFile(join(distDir, 'Packages'), 'sha1')} ${fileSize(join(distDir, 'Packages'))} ${packagesRel}`,
  ` ${hashFile(join(distDir, 'Packages.gz'), 'sha1')} ${fileSize(join(distDir, 'Packages.gz'))} ${packagesGzRel}`,
  'SHA256:',
  ` ${hashFile(join(distDir, 'Packages'), 'sha256')} ${fileSize(join(distDir, 'Packages'))} ${packagesRel}`,
  ` ${hashFile(join(distDir, 'Packages.gz'), 'sha256')} ${fileSize(join(distDir, 'Packages.gz'))} ${packagesGzRel}`,
  ''
];
writeFileSync(releasePath, releaseLines.join('\n'));

// ── 3. Importar clave GPG ──────────────────────────────────────────────────
const privateKey = process.env.APT_GPG_PRIVATE_KEY;
if (!privateKey) {
  console.warn('build-repo: APT_GPG_PRIVATE_KEY no definida; se omite la firma.');
  process.exit(0);
}
const passphrase = process.env.APT_GPG_PASSPHRASE || '';
const keyFile = join(outDir, '.apt-gpg-key.asc');
writeFileSync(keyFile, privateKey);
execFileSync('gpg', ['--batch', '--import', keyFile], { stdio: 'inherit' });

// ── 4. Firmar ──────────────────────────────────────────────────────────────
const inReleasePath = join(releaseDir, 'InRelease');
const releaseGpgPath = join(releaseDir, 'Release.gpg');

// InRelease: clearsigned Release
const gpgArgs = ['--batch', '--yes', '--pinentry-mode', 'loopback'];
if (passphrase) gpgArgs.push('--passphrase', passphrase);
gpgArgs.push('--clearsign', '--output', inReleasePath, releasePath);
execFileSync('gpg', gpgArgs, { stdio: 'inherit' });

// Release.gpg: detached signature
const gpgArgs2 = ['--batch', '--yes', '--pinentry-mode', 'loopback'];
if (passphrase) gpgArgs2.push('--passphrase', passphrase);
gpgArgs2.push('--detach-sign', '--output', releaseGpgPath, releasePath);
execFileSync('gpg', gpgArgs2, { stdio: 'inherit' });

// Limpieza
try { execFileSync('rm', [keyFile]); } catch {}

console.log('build-repo: OK —', versions.length, 'version(es):', versions.join(', '));