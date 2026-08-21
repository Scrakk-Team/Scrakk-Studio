// =============================================================================
// src/components/Settings/sections/LspSection.tsx
// Panel de configuración de Language Servers. Sigue el mismo patrón
// modular que las demás sections (editor-block, editor-block-header, etc).
// Treeview interno con search + filter por categoría + never-suggest.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Code,
  Copy,
  Add,
  CloseIcon,
  Checkmark,
  ChevronDown,
} from '../../Icons';
import { useContextMenu } from '../../../hooks/useContextMenu';
import ContextMenu from '../../ContextMenu/ContextMenu';
import { isBinaryInstalled, detectAvailablePackageManagers } from '../../../services/lsp/binaryCheck';
import {
  listLspServers,
  type LspServerInfo,
  type LspCategory,
} from '../../../services/lsp/servers.config';
import {
  getNeverSuggest,
  addToNeverSuggest,
  removeFromNeverSuggest,
  isRecommendationDisabled,
  setRecommendationDisabled,
} from '../../../services/lsp/recommendation';
import { detectOs } from '../../../services/lsp/binaryCheck';
import { installedLspStore } from '../../../services/lsp/installedLspStore';
import { notificationService } from '../../../notifications';
import './SectionStyles.css';

interface ServerState {
  info: LspServerInfo;
  installed: boolean;
  checking: boolean;
}

const CATEGORIES: Array<{ id: LspCategory | 'all'; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'web', label: 'Web' },
  { id: 'systems', label: 'Sistemas' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'scripting', label: 'Scripting' },
  { id: 'functional', label: 'Funcional' },
  { id: 'scientific', label: 'Científico' },
  { id: 'shell', label: 'Shell' },
  { id: 'config', label: 'Config' },
  { id: 'docs', label: 'Docs' },
  { id: 'data', label: 'Datos' },
  { id: 'blockchain', label: 'Blockchain' },
  { id: 'nix', label: 'Nix' },
];

async function copyToClipboard(text: string): Promise<void> {
  const ole = (window as any).ole;
  if (ole?.shell?.clipboardWrite) {
    try { await ole.shell.clipboardWrite(text); return; } catch { /* ignore */ }
  }
  try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
}

interface InstallResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runInstallCommand(command: string): Promise<InstallResult> {
  const ole = (window as any).ole;
  if (ole?.process?.exec) {
    try {
      const result = await ole.process.exec(command);
      // eslint-disable-next-line no-console
      console.log('[LSP Install]', command, result);
      const exitCode = (result && typeof result === 'object' && typeof result.exitCode === 'number')
        ? result.exitCode : 0;
      const stdout = (result && typeof result === 'object' && typeof result.stdout === 'string')
        ? result.stdout : '';
      const stderr = (result && typeof result === 'object' && typeof result.stderr === 'string')
        ? result.stderr : '';
      return { ok: exitCode === 0, exitCode, stdout, stderr };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[LSP Install] failed', e);
      return { ok: false, exitCode: -1, stdout: '', stderr: String((e as Error).message) };
    }
  }
  // Fallback: notify the user
  // eslint-disable-next-line no-alert
  alert(`Could not run installer automatically. Please run in your terminal:\n\n${command}`);
  return { ok: false, exitCode: -1, stdout: '', stderr: 'No OLE process.exec available' };
}

function pickInstallCommands(
  info: LspServerInfo,
  available: Set<string>,
): Array<{ pm: string; cmd: string }> {
  if (!info.packageManagers) return [];
  // Developers-first: package managers que un developer probablemente tiene
  // Y son los más confiables para LSP servers (npm para Node-based, pip
  // para Python, cargo para Rust, go para Go). System PMs (winget, scoop,
  // brew, apt) son fallback porque requieren admin o son más lentos.
  const preferred: Record<string, string[]> = {
    windows: ['npm', 'pnpm', 'yarn', 'pip', 'pipx', 'cargo', 'go', 'rustup', 'dotnet', 'winget', 'scoop', 'chocolatey'],
    mac:     ['npm', 'pnpm', 'yarn', 'pip', 'pipx', 'cargo', 'go', 'rustup', 'brew', 'mas', 'port'],
    linux:   ['npm', 'pnpm', 'yarn', 'pip', 'pipx', 'cargo', 'go', 'rustup', 'nix', 'apt', 'dnf', 'pacman', 'snap', 'flatpak'],
  };
  const os = detectOs();
  const result: Array<{ pm: string; cmd: string }> = [];
  // Primero: PMs preferidos que el user tiene instalados.
  for (const pm of preferred[os] ?? []) {
    if (!available.has(pm)) continue;
    const entry = (info.packageManagers as Record<string, { install: string }>)[pm];
    if (entry) result.push({ pm, cmd: entry.install });
  }
  // Segundo: PMs del server que NO tenemos (mostrar igual para que el user
  // sepa que existen, con copy-paste fácil).
  for (const [pm, entry] of Object.entries(info.packageManagers)) {
    if (result.some((r) => r.pm === pm)) continue;
    result.push({ pm, cmd: (entry as { install: string }).install });
  }
  return result;
}

export default function LspSection() {
  // El store local es la fuente de verdad: si el user lo marcó instalado una vez,
  // está instalado. El check de PATH se hace en background como "confirmación"
  // (para mostrar el dot verde más oscuro cuando el binary REALMENTE existe ahora).
  const [servers, setServers] = useState<ServerState[]>(() => {
    const remembered = installedLspStore.list();
    const rememberedSet = new Set(remembered);
    return listLspServers().map((info) => ({
      info,
      installed: rememberedSet.has(info.id),
      checking: true, // seguimos chequeando PATH en background
    }));
  });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<LspCategory | 'all'>('all');
  const [neverList, setNeverList] = useState<string[]>([]);
  const [recsDisabled, setRecsDisabled] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [availablePms, setAvailablePms] = useState<Set<string>>(new Set());
  const { contextMenu, showDropdownMenu, hideContextMenu } = useContextMenu();
  const [openPmMenuFor, setOpenPmMenuFor] = useState<string | null>(null);

  // Confirmación en background contra PATH. NO sobrescribe el store local
  // cuando el binary NO se encuentra (eso pasa a veces en WebView2 aunque esté
  // realmente instalado). Si está, actualizamos el dot verde y listo.
  useEffect(() => {
    let cancelled = false;
    async function confirmAgainstPath() {
      const all = listLspServers();
      const pms = await detectAvailablePackageManagers();
      if (cancelled) return;
      setAvailablePms(new Set(pms));
      // Confirmar cada uno en background. Si el binary existe en PATH, mantenemos
      // el flag installed=true y marcamos checking=false. Si NO existe, mantenemos
      // installed=true (porque el store local lo recuerda) y solo ponemos
      // checking=false. El store manda.
      const confirmed = await Promise.all(
        all.map(async (info) => {
          const onPath = await isBinaryInstalled(info.command);
          const remembered = installedLspStore.isInstalled(info.id);
          return { info, installed: onPath || remembered, checking: false };
        }),
      );
      if (cancelled) return;
      setServers(confirmed);
    }
    void confirmAgainstPath();
    setNeverList(getNeverSuggest());
    setRecsDisabled(isRecommendationDisabled());

    const onChange = (): void => {
      void confirmAgainstPath();
    };
    window.addEventListener('scrakk:lsp-servers-changed', onChange);
    return () => {
      cancelled = true;
      window.removeEventListener('scrakk:lsp-servers-changed', onChange);
    };
  }, []);

  const filtered = useMemo(() => {
    const lower = search.toLowerCase().trim();
    return servers.filter((s) => {
      if (category !== 'all' && s.info.category !== category) return false;
      if (!lower) return true;
      if (s.info.displayName.toLowerCase().includes(lower)) return true;
      if (s.info.id.toLowerCase().includes(lower)) return true;
      if (s.info.command.toLowerCase().includes(lower)) return true;
      if (Object.keys(s.info.extensionToLanguage).some((e) => e.toLowerCase().includes(lower))) return true;
      return false;
    });
  }, [servers, search, category]);

  const stats = useMemo(() => {
    const installed = servers.filter((s) => s.installed).length;
    const missing = servers.length - installed;
    return { installed, missing, total: servers.length };
  }, [servers]);

  function toggleNever(id: string): void {
    if (neverList.includes(id)) {
      removeFromNeverSuggest(id);
      setNeverList(neverList.filter((x) => x !== id));
    } else {
      addToNeverSuggest(id);
      setNeverList([...neverList, id]);
    }
  }

  function toggleRecsDisabled(): void {
    const next = !recsDisabled;
    setRecommendationDisabled(next);
    setRecsDisabled(next);
  }

  async function handleInstall(id: string, command: string): Promise<void> {
    const s = servers.find((x) => x.info.id === id);
    if (!s) return;
    setBusyId(`${id}:${command}`);
    try {
      const result = await runInstallCommand(command);
      if (result.ok) {
        // Persistir en el store local + refrescar estado del server
        installedLspStore.markInstalled(id);
        setServers((prev) => prev.map((x) =>
          x.info.id === id ? { ...x, installed: true } : x,
        ));
        notificationService.add({
          type: 'relevant',
          severity: 'success',
          message: `${s.info.displayName} instalado correctamente`,
          duration: 2500,
        });
      } else {
        notificationService.add({
          type: 'relevant',
          severity: 'error',
          message: `Install de ${s.info.displayName} falló`,
          duration: 4000,
        });
      }
    } finally {
      setBusyId(null);
    }
  }

  function handleUninstall(id: string): void {
    const s = servers.find((x) => x.info.id === id);
    if (!s) return;
    installedLspStore.markUninstalled(id);
    setServers((prev) => prev.map((x) =>
      x.info.id === id ? { ...x, installed: false } : x,
    ));
    notificationService.add({
      type: 'relevant',
      severity: 'info',
      message: `${s.info.displayName} marcado como desinstalado. (Si el binary sigue en tu sistema, reinstalalo para volver a activarlo.)`,
      duration: 3500,
    });
  }

  return (
    <div className="lsp-section">
      {/* ── Header: stats + search + filter + recs toggle ─────────────── */}
      <div className="lsp-block">
        <div className="lsp-block-header">
          <h3 className="lsp-block-title">Language Servers</h3>
          <p className="lsp-block-desc">
            Scrakk puede comunicarse con servidores LSP para darte IntelliSense, go-to-definition, hover y diagnostics.
            Estos binarios los instalás vos con tu package manager preferido.
          </p>
        </div>

        <div className="lsp-stats">
          <div className="lsp-stat-item">
            <span className="lsp-stat-value lsp-stat-ok">{stats.installed}</span>
            <span className="lsp-stat-label">Instalados</span>
          </div>
          <div className="lsp-stat-item">
            <span className="lsp-stat-value lsp-stat-warn">{stats.missing}</span>
            <span className="lsp-stat-label">Pendientes</span>
          </div>
          <div className="lsp-stat-item">
            <span className="lsp-stat-value lsp-stat-mute">{stats.total}</span>
            <span className="lsp-stat-label">Catálogo</span>
          </div>
        </div>

        <div className="lsp-search-box">
          <Search size={14} />
          <input
            type="text"
            placeholder="Buscar por nombre, comando o extensión..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="lsp-filter-row">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`lsp-filter-chip${category === c.id ? ' active' : ''}`}
              onClick={() => setCategory(c.id)}
              type="button"
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="settings-row" style={{ minHeight: 'auto' }}>
          <div className="settings-row-info">
            <span className="settings-row-label">Mostrar recomendaciones de LSP al abrir un archivo</span>
            <span className="settings-row-hint">
              Cuando abras un archivo cuyo lenguaje no tenga LSP activo, Scrakk te sugerirá instalar uno.
            </span>
          </div>
          <div className="settings-row-controls">
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={!recsDisabled}
                onChange={toggleRecsDisabled}
              />
              <span className="settings-toggle-slider" />
            </label>
          </div>
        </div>
      </div>

      {/* ── Server list treeview ──────────────────────────────────────── */}
      <div className="lsp-block">
        <div className="lsp-block-header">
          <h3 className="lsp-block-title">Servidores</h3>
          <p className="lsp-block-desc">
            {filtered.length} de {servers.length} servers. Click en una fila para ver detalles.
          </p>
        </div>

        <div className="lsp-server-list">
          {filtered.length === 0 && (
            <div className="lsp-server-row" style={{ justifyContent: 'center', color: 'var(--text-muted)' }}>
              No hay servers que coincidan con el filtro.
            </div>
          )}
          {filtered.map((s) => {
            const isExpanded = expandedId === s.info.id;
            const isNever = neverList.includes(s.info.id);
            const installs = !s.installed ? pickInstallCommands(s.info, availablePms) : [];
            // Si el user tiene un PM, mostramos el primario como botón grande
            // y los demás como secondary (incluyendo PMs que NO tiene, por
            // si quiere copy-paste). Esto evita el bug de "winget se ejecutó
            // aunque también tengas npm" — el user elige explícitamente.
            const primaryInstall = installs.find((i) => availablePms.has(i.pm)) ?? installs[0] ?? null;
            const secondaryInstalls = installs.filter((i) => i !== primaryInstall);
            const exts = Object.keys(s.info.extensionToLanguage).join(', ');
            return (
              <div key={s.info.id}>
                <div
                  className={`lsp-server-row${isNever ? ' never' : ''}`}
                  onClick={() => setExpandedId(isExpanded ? null : s.info.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div
                    className={`lsp-server-status ${s.installed ? 'installed' : 'missing'}`}
                    title={s.installed ? 'Instalado' : 'No instalado'}
                  />
                  <div className="lsp-server-info">
                    <div className="lsp-server-name">
                      {s.info.displayName}
                      <span className="lsp-badge lsp-badge-category">{s.info.category}</span>
                      {isNever && <span className="lsp-badge lsp-badge-never">never</span>}
                    </div>
                    <div className="lsp-server-exts">
                      {exts || '—'} · <code>{s.info.command}</code>
                    </div>
                  </div>
                  <div className="lsp-server-actions" onClick={(e) => e.stopPropagation()}>
                    {s.installed ? (
                      <>
                        <span
                          className="lsp-badge"
                          style={{
                            background: 'color-mix(in srgb, var(--success-color) 15%, transparent)',
                            color: 'var(--success-color)',
                          }}
                        >
                          <Checkmark size={11} /> Ready
                        </span>
                        <button
                          type="button"
                          className="lsp-action-btn"
                          onClick={() => handleUninstall(s.info.id)}
                          title="Marcar como desinstalado. (Si el binary sigue en tu sistema, podés reinstalarlo desde otro PM.)"
                        >
                          Uninstall
                        </button>
                      </>
                    ) : primaryInstall ? (
                      <>
                        <button
                          type="button"
                          className="lsp-action-btn lsp-action-btn-primary"
                          onClick={() => handleInstall(s.info.id, primaryInstall.cmd)}
                          disabled={busyId?.startsWith(`${s.info.id}:`)}
                          title={
                            availablePms.has(primaryInstall.pm)
                              ? `Install con ${primaryInstall.pm} (instalado en tu sistema)`
                              : `Install con ${primaryInstall.pm} (puede requerir instalación previa)`
                          }
                        >
                          <Add size={11} />
                          {busyId?.startsWith(`${s.info.id}:`) ? 'Running...' : `Install (${primaryInstall.pm})`}
                        </button>
                        {secondaryInstalls.length > 0 && (
                          <button
                            type="button"
                            className="lsp-action-btn"
                            title="Elegí otro package manager"
                            onClick={(e) => {
                              e.stopPropagation();
                              const items = secondaryInstalls.map((i) => ({
                                id: i.pm,
                                label: `${i.pm}${availablePms.has(i.pm) ? ' ✓' : ' (no instalado)'}`,
                                onClick: () => void handleInstall(s.info.id, i.cmd),
                              }));
                              if (openPmMenuFor === s.info.id) {
                                hideContextMenu();
                                setOpenPmMenuFor(null);
                              } else {
                                setOpenPmMenuFor(s.info.id);
                                showDropdownMenu(e, items, 180);
                              }
                            }}
                          >
                            <ChevronDown size={11} />
                          </button>
                        )}
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="lsp-action-btn"
                      onClick={() => toggleNever(s.info.id)}
                      title={isNever ? 'Allow suggestions' : 'Never suggest'}
                    >
                      {isNever ? 'Allow' : 'Never'}
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="lsp-expanded">
                    {s.info.description && (
                      <div>
                        <strong>Description: </strong>
                        {s.info.description}
                      </div>
                    )}
                    {!s.installed && installs.length > 0 && (
                      <>
                        <div>
                          <strong>Install commands (click to run, or copy): </strong>
                        </div>
                        {installs.map((i) => (
                          <div key={i.pm} className="lsp-cmd-box" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              className="lsp-badge lsp-badge-category"
                              style={{ flexShrink: 0 }}
                              title={availablePms.has(i.pm) ? 'PM disponible en tu sistema' : 'PM no detectado (puede requerir install previo)'}
                            >
                              {i.pm}{availablePms.has(i.pm) ? ' ✓' : ' ✗'}
                            </span>
                            <code style={{ flex: 1 }}>{i.cmd}</code>
                            <button
                              type="button"
                              onClick={() => void handleInstall(s.info.id, i.cmd)}
                              disabled={busyId === `${s.info.id}:${i.cmd}`}
                              title={`Correr: ${i.cmd}`}
                              style={{ flexShrink: 0 }}
                            >
                              {busyId === `${s.info.id}:${i.cmd}` ? '...' : 'Run'}
                            </button>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(i.cmd)}
                              title="Copy a clipboard"
                              style={{ flexShrink: 0 }}
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                    {s.info.homepage && (
                      <div>
                        <strong>Homepage: </strong>
                        <a
                          href={s.info.homepage}
                          target="_blank"
                          rel="noreferrer noopener"
                          style={{ color: 'var(--tree-color)', textDecoration: 'none' }}
                        >
                          {s.info.homepage}
                        </a>
                      </div>
                    )}
                    {s.info.packageManagers && (
                      <div>
                        <strong>All package managers: </strong>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                          {Object.entries(s.info.packageManagers).map(([pm, e]) => (
                            <span
                              key={pm}
                              className="lsp-badge lsp-badge-category"
                              title={e.install}
                            >
                              {pm}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="lsp-action-btn"
                        onClick={() => setExpandedId(null)}
                      >
                        <CloseIcon size={11} /> Cerrar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          minWidth={contextMenu.minWidth}
          onClose={() => {
            hideContextMenu();
            setOpenPmMenuFor(null);
          }}
        />
      )}
    </div>
  );
}

// Re-export so the Code icon is tree-shake friendly if someone imports it.
export { Code };
