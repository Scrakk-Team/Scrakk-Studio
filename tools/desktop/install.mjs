/**
 * Instala el .desktop de dev en ~/.local/share/applications para que
 * GNOME/KDE/Wayland agrupen la ventana con el logo de la app.
 *
 * Sin esto, en dev el WM_CLASS es del binario `electron` y el dock muestra
 * un icono genérico (en Windows basta setIcon; en Linux no).
 *
 * Uso: npm run desktop:install
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const appsDir = join(os.homedir(), '.local', 'share', 'applications');
const target = join(appsDir, 'scrakk-studio.desktop');

const launcher = join(repoRoot, 'tools', 'desktop', 'scrakk-dev.sh');
const icon = join(repoRoot, 'assets', 'scrakk-studio-b.png');

let template = readFileSync(join(repoRoot, 'assets', 'scrakk-studio.desktop'), 'utf-8');
template = template.replace('__EXEC__', launcher).replace('__ICON__', icon);

mkdirSync(appsDir, { recursive: true });
writeFileSync(target, template);
copyFileSync(join(repoRoot, 'assets', 'scrakk-studio-b.png'), join(appsDir, 'scrakk-studio-b.png'));

try {
  execFileSync('update-desktop-database', [appsDir], { stdio: 'ignore' });
} catch {
  // No está instalado: la mayoría de docks lo detectan solos igual.
}

console.log(`[desktop:install] ${target}`);
