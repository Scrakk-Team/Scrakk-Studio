import React, { useState, useEffect, useMemo, useRef, useCallback, type ComponentType } from 'react';
import './SectionStyles.css';
import { ExtensionRegistry, ExtensionLoader } from '../../../services/extensions';
import { Delete } from '../../Icons';
import type { RegisteredExtension, RegisteredPanel } from '../../../services/extensions';
import { getAvailablePacks, registerVscodeIconTheme, getRegisteredThemes, removeVscodeIconTheme, setIconPack, getIconPack } from '../../../services/fileIcons';
import {
  pickVsixFile,
  importVsix,
  getExtensionIconThemeIds,
  clearExtensionIconThemes,
  setExtensionIconThemes,
  registerVscodeColorThemes,
  clearExtensionColorThemes,
  registerVscodeSnippets,
  clearExtensionSnippets,
  getExtensionSnippetCount,
  registerVscodeGrammars,
  unregisterVscodeGrammars,
  getExtensionGrammarCount,
  setVscodeExtensionMeta,
  clearVscodeExtensionMeta,
  getVscodeExtensionMeta,
  metaFromImport,
  bootstrapVsixRuntime,
  launchSmokeTestHost,
  detectSystemNode,
  registerProductIconThemes,
  clearProductIconThemesForExtension,
  type VsixViewContainer,
  type VsixViewDef,
  type VsixFileEntry,
} from '../../../services/compatibility/vscode';

// Summary row for a registered extension. We always have access to the
// RegisteredExtension record, so we can show displayName / author / version
// even for tool-only or theme-only .sef packages (no panel required).
interface ExtensionRow {
  id: string;
  ext: RegisteredExtension;
}

function ExtensionsSection() {
  const [extensions, setExtensions] = useState<ExtensionRow[]>([]);
  const [loadStatus, setLoadStatus] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [importBytes, setImportBytes] = useState<{ current: number; total: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImportVsix = async () => {
    setImportError(null);
    setImportBytes(null);
    setImportProgress('Seleccionando archivo...');
    try {
      const result = await pickVsixFile();
      if (!result) { setImportProgress(null); return; }

      setImportProgress(`Extrayendo ${result.name}...`);
      setImportBytes({ current: 0, total: 1 });
      const imported = await importVsix(
        result.name, result.buffer,
        (msg) => { setImportProgress(msg); },
        (cur, tot) => { setImportBytes({ current: cur, total: tot }); }
      );
      const {
        extensionName,
        extensionId,
        iconThemes,
        colorThemes,
        snippets,
        grammars,
        productIconThemes,
        manifest,
        viewContainers,
        views,
        files,
        fromCache,
        entryAnalysis,
      } = imported;
      setImportBytes(null);

      const hasIconThemes = iconThemes.length > 0;
      const hasColorThemes = (colorThemes?.length ?? 0) > 0;
      const hasSnippets = (snippets?.length ?? 0) > 0;
      const hasGrammars = (grammars?.length ?? 0) > 0;
      const hasProductIcons = (productIconThemes?.length ?? 0) > 0;
      const hasViews = views.length > 0;
      const report = entryAnalysis?.report;

      const hasMain = !!(manifest as { main?: string; browser?: string }).main ||
        !!(manifest as { main?: string; browser?: string }).browser;
      // productIconThemes cuenta: Material Product Icons (PKief) solo aporta eso
      if (
        !hasIconThemes &&
        !hasViews &&
        !hasColorThemes &&
        !hasSnippets &&
        !hasGrammars &&
        !hasProductIcons &&
        !hasMain
      ) {
        const keys = manifest.contributes ? Object.keys(manifest.contributes) : [];
        const declaredThemes = Array.isArray(manifest.contributes?.themes)
          ? manifest.contributes!.themes!.length
          : 0;
        setImportProgress(null);
        setImportError(
          keys.length
            ? `Contributions (${keys.join(', ')}): ` +
                (declaredThemes
                  ? `declara ${declaredThemes} theme(s) pero 0 parseados (¿JSONC/cache?). Reintentá tras actualizar o borrá cache vscode-compat.`
                  : 'detectadas pero vacías / no soportadas tras parse.')
            : 'La extensión no aporta contributions ni main JS. Nada que importar.'
        );
        return;
      }

      const extId = extensionId || manifest.name || `vscode-${Date.now()}`;

      if (hasIconThemes) {
        for (const theme of iconThemes) registerVscodeIconTheme(theme);
        setExtensionIconThemes(extId, iconThemes.map((t) => t.id));
      }
      if (hasColorThemes) {
        registerVscodeColorThemes(extId, colorThemes, {
          packageLabel: extensionName,
        });
      }

      // Product icons (activity bar primary + secondary + horizontal)
      if (hasProductIcons) {
        const applied = registerProductIconThemes(extId, productIconThemes, {
          activateFirst: true,
        });
        console.log('[vsix] product icon themes applied', applied);
      }

      let snippetCount = 0;
      if (hasSnippets) snippetCount = registerVscodeSnippets(extId, snippets);

      let grammarCount = 0;
      if (hasGrammars) grammarCount = registerVscodeGrammars(extId, grammars);

      // Views: experimental iframe only
      if (hasViews) {
        for (const container of viewContainers) {
          const containerViews = views.filter((v) => v.containerId === container.id);
          for (const view of containerViews) {
            const htmlContent = findViewHtml(view, files, extId);
            const iconSvg = resolveVsixIconSvg(container.iconPath, files);
            const ViewComponent = createViewComponent(htmlContent);
            ExtensionRegistry.registerPanel({
              id: view.id,
              label: `${view.name} (exp.)`,
              location: 'sidePanel',
              icon: iconSvg,
              extensionId: extId,
              component: ViewComponent,
              isBuiltin: false,
              priority: 100,
            });
          }
        }
      }

      ExtensionRegistry.registerExtension({
        manifest: {
          name: extId,
          displayName: extensionName,
          version: manifest.version || '0.0.0',
          type:
            hasIconThemes || hasColorThemes || hasSnippets || hasProductIcons
              ? hasViews
                ? 'mixed'
                : 'theme'
              : 'panel',
          description: manifest.description || `Importado de ${result.name}`,
          author: manifest.publisher,
          categories: ['VS Code'],
          contributes: {},
          engines: { scrakk: '>=0.1.0' },
        },
        path: result.name,
        isBuiltin: false,
        enabled: true,
      });

      setVscodeExtensionMeta(
        metaFromImport({
          extensionId: extId,
          displayName: extensionName,
          version: manifest.version || '0.0.0',
          fromCache,
          iconThemes: iconThemes.length,
          colorThemes: colorThemes?.length ?? 0,
          snippets: snippetCount,
          grammars: grammarCount,
          productIconThemes: productIconThemes?.length ?? 0,
          views: views.length,
          entryPath: entryAnalysis?.entryPath ?? null,
          report,
        })
      );

      const bits: string[] = [];
      if (hasIconThemes) bits.push(`${iconThemes.length} file icon themes`);
      if (hasProductIcons) bits.push(`${productIconThemes!.length} product icon themes`);
      if (hasColorThemes) bits.push(`${colorThemes!.length} color themes`);
      if (snippetCount) bits.push(`${snippetCount} snippets (Monaco)`);
      if (grammarCount) bits.push(`${grammarCount} grammars (lang ids)`);
      if (hasViews) bits.push(`${views.length} views exp.`);
      if (report) bits.push(`API ${Math.round((report.coverage || 0) * 100)}%`);
      if (report?.requires?.systemNode) bits.push('usa Node del sistema');
      if (fromCache) bits.push('cache');
      if (hasProductIcons && !hasIconThemes) {
        bits.push('nota: product icons ≠ file icons del explorer');
      }

      // Auto-launch host si hay Node + main (temp en disco; persist = opcional false)
      setImportProgress('Detectando Node y lanzando host...');
      const boot = await bootstrapVsixRuntime(imported, {
        persistToDisk: false,
        autoLaunchHost: true,
        onLog: (m) => {
          console.log('[vsix-host]', m);
          setImportProgress(m);
        },
      });

      setImportProgress(null);
      const hostBit = boot.launched
        ? ' · host Node ACTIVO'
        : boot.reason
          ? ` · host no lanzado (${boot.reason})`
          : '';
      setLoadStatus(`✓ "${extensionName}" importada · ${bits.join(' · ')}${hostBit}`);
    } catch (e: any) {
      setImportProgress(null);
      setImportError(e.message || 'Error al importar la extensión');
    }
  };

  const handleSmokeHost = async () => {
    setImportError(null);
    setImportProgress('Smoke test host...');
    try {
      const node = await detectSystemNode();
      if (!node.ok) {
        setImportProgress(null);
        setImportError(`Node no encontrado: ${node.error}. Instalá Node.js y reiniciá Scrakk.`);
        return;
      }
      const r = await launchSmokeTestHost((m) => {
        console.log('[smoke]', m);
        setImportProgress(m);
      });
      setImportProgress(null);
      if (r.ok) {
        setLoadStatus(
          `✓ Smoke host OK (Node ${r.node.version}). Deberías ver una notificación "Scrakk Smoke: host activo". Path: ${r.path}`
        );
      } else {
        setImportError(`Smoke falló: ${r.reason}`);
      }
    } catch (e: any) {
      setImportProgress(null);
      setImportError(e.message || 'Smoke error');
    }
  };

  useEffect(() => {
    const update = () => {
      const rows = ExtensionRegistry.getAllExtensions()
        .filter(e => !e.isBuiltin)
        .map(e => ({ id: e.manifest.id ?? e.manifest.name ?? 'unknown', ext: e }));
      setExtensions(rows);
    };
    update();
    const unsub = ExtensionRegistry.subscribe(update);
    return unsub;
  }, []);

  // Per-extension contribution counts (rendered in the table).
  const contributionCounts = useMemo(() => {
    const map: Record<
      string,
      {
        themes: number;
        panels: number;
        tools: number;
        commands: number;
        modes: number;
        iconThemes: number;
        snippets: number;
        grammars: number;
        compat?: string;
      }
    > = {};
    for (const ext of ExtensionRegistry.getAllExtensions()) {
      const id = ext.manifest.id ?? ext.manifest.name ?? 'unknown';
      const myPanels = ExtensionRegistry.getAllPanels().filter((p) => p.extensionId === id);
      const myThemes = ExtensionRegistry.getAllThemes().filter((t) => t.extensionId === id);
      const myTools = ExtensionRegistry.getAllTools().filter((t) => t.extensionId === id);
      const myCommands = ExtensionRegistry.getAllCommands().filter((c) => c.extensionId === id);
      const myModes = ExtensionRegistry.getAllRegisteredModes().filter((m) => m.extensionId === id);
      const myIconThemes = getExtensionIconThemeIds(id).length;
      const meta = getVscodeExtensionMeta(id);
      map[id] = {
        themes: myThemes.length,
        panels: myPanels.length,
        tools: myTools.length,
        commands: myCommands.length,
        modes: myModes.length,
        iconThemes: myIconThemes,
        snippets: getExtensionSnippetCount(id) || meta?.snippets || 0,
        grammars: getExtensionGrammarCount(id) || meta?.grammars || 0,
        compat: meta
          ? `${Math.round((meta.compatCoverage || 0) * 100)}%${meta.requiresNode ? ' · Node' : ''}`
          : undefined,
      };
    }
    return map;
  }, [extensions]);

  const totalThemes = ExtensionRegistry.getAllThemes().filter(t => !t.isBuiltin).length;
  const totalPanels = ExtensionRegistry.getAllPanels().filter(p => !p.isBuiltin).length;
  const totalTools = ExtensionRegistry.getAllTools().length;
  const totalCommands = ExtensionRegistry.getAllCommands().length;
  const totalModes = ExtensionRegistry.getAllRegisteredModes().length;

  const handleRemoveExtension = (extensionId: string) => {
    const themeIds = getExtensionIconThemeIds(extensionId);
    for (const id of themeIds) {
      removeVscodeIconTheme(id);
    }
    clearExtensionIconThemes(extensionId);
    clearExtensionColorThemes(extensionId);
    clearExtensionSnippets(extensionId);
    unregisterVscodeGrammars(extensionId);
    clearProductIconThemesForExtension(extensionId);
    clearVscodeExtensionMeta(extensionId);
    for (const pnl of ExtensionRegistry.getPanelsByLocation('sidePanel')) {
      if (pnl.extensionId === extensionId) {
        ExtensionRegistry.removePanel(pnl.id);
      }
    }
    ExtensionLoader.removeExtension(extensionId);
  };

  // Hidden file input ref for the web/dev fallback of "Instalar .sef".
  // When window.ole is unavailable (e.g. vite dev in a plain browser),
  // the button triggers this input instead of the native file picker,
  // and the file content is passed to ExtensionLoader.loadFromSefContent.
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="extensions-section">
      <div className="extensions-block">
        <div className="extensions-block-header">
          <h3 className="extensions-block-title">Extensiones instaladas</h3>
          <p className="extensions-block-desc">
            Gestiona las extensiones y temas que amplían Scrakk. Cada extensión puede aportar paneles, temas, herramientas, comandos o modos.
          </p>
        </div>

        <div className="extensions-stats">
          <div className="extensions-stat-item">
            <span className="extensions-stat-value">{extensions.length}</span>
            <span className="extensions-stat-label">Extensiones</span>
          </div>
          <div className="extensions-stat-item">
            <span className="extensions-stat-value">{totalPanels}</span>
            <span className="extensions-stat-label">Paneles</span>
          </div>
          <div className="extensions-stat-item">
            <span className="extensions-stat-value">{totalThemes}</span>
            <span className="extensions-stat-label">Temas</span>
          </div>
          <div className="extensions-stat-item">
            <span className="extensions-stat-value">{totalTools}</span>
            <span className="extensions-stat-label">Tools</span>
          </div>
          <div className="extensions-stat-item">
            <span className="extensions-stat-value">{totalCommands}</span>
            <span className="extensions-stat-label">Comandos</span>
          </div>
          <div className="extensions-stat-item">
            <span className="extensions-stat-value">{totalModes}</span>
            <span className="extensions-stat-label">Modos</span>
          </div>
        </div>

        <div className="extensions-table-container">
          {extensions.length === 0 ? (
            <div className="extensions-empty">
              No hay extensiones instaladas. Usa los botones de abajo para añadir una.
            </div>
          ) : (
            <table className="extensions-table">
              <thead>
                <tr>
                  <th className="extensions-table-name">Nombre</th>
                  <th className="extensions-table-type">Tipo</th>
                  <th className="extensions-table-author">Creador</th>
                  <th className="extensions-table-version">Versión</th>
                  <th className="extensions-table-contrib">Aporta</th>
                  <th className="extensions-table-actions">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {extensions.map(({ id, ext }) => {
                  const m = ext.manifest;
                  const c = contributionCounts[id] ?? {
                    themes: 0, panels: 0, tools: 0, commands: 0, modes: 0,
                    iconThemes: 0, snippets: 0, grammars: 0,
                  };
                  const contributes: string[] = [];
                  if (c.panels > 0) contributes.push(`${c.panels} panel${c.panels === 1 ? '' : 'es'}`);
                  if (c.themes > 0) contributes.push(`${c.themes} tema${c.themes === 1 ? '' : 's'}`);
                  if (c.tools > 0) contributes.push(`${c.tools} tool${c.tools === 1 ? '' : 's'}`);
                  if (c.commands > 0) contributes.push(`${c.commands} comando${c.commands === 1 ? '' : 's'}`);
                  if (c.modes > 0) contributes.push(`${c.modes} modo${c.modes === 1 ? '' : 's'}`);
                  if (c.iconThemes > 0) contributes.push(`${c.iconThemes} icon theme${c.iconThemes === 1 ? '' : 's'}`);
                  if (c.snippets > 0) contributes.push(`${c.snippets} snippet${c.snippets === 1 ? '' : 's'}`);
                  if (c.grammars > 0) contributes.push(`${c.grammars} grammar${c.grammars === 1 ? '' : 's'}`);
                  if (c.compat) contributes.push(`compat ${c.compat}`);
                  return (
                    <tr key={id}>
                      <td className="extensions-table-name">
                        <div className="extensions-table-name-primary">
                          {m.displayName ?? m.name}
                          {m.categories?.includes('VS Code') && (
                            <span className="extensions-source-badge" title="Importado desde VS Code">VS Code</span>
                          )}
                        </div>
                        {m.description && (
                          <div className="extensions-table-name-secondary">{m.description}</div>
                        )}
                      </td>
                      <td className="extensions-table-type">
                        <span className={`extensions-type-badge extensions-type-${m.type}`}>
                          {m.type}
                        </span>
                      </td>
                      <td className="extensions-table-author">{m.author ?? '—'}</td>
                      <td className="extensions-table-version">{m.version ?? '—'}</td>
                      <td className="extensions-table-contrib">
                        {contributes.length === 0 ? (
                          <span className="extensions-table-contrib-empty">—</span>
                        ) : (
                          contributes.join(', ')
                        )}
                      </td>
                      <td className="extensions-table-actions">
                        <button
                          onClick={() => handleRemoveExtension(id)}
                          title="Eliminar extensión"
                          className="extensions-remove-btn"
                        >
                          <Delete size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="extensions-block">
        <div className="extensions-block-header">
          <h3 className="extensions-block-title">Gestionar extensiones</h3>
          <p className="extensions-block-desc">
            SEF nativo, VSIX (icons/themes/snippets + host Node opcional). Smoke test: host con Node del sistema.
          </p>
        </div>

        <div className="extensions-actions">
          <button
            className="extensions-btn extensions-btn-primary"
            onClick={async () => {
              const ole = (window as any).ole;
              if (!ole?.fs?.openFolder) {
                setLoadStatus('Seleccionar carpeta requiere el entorno nativo (OLE). En web/dev usá "Instalar .sef".');
                return;
              }
              const folderPath = await ole.fs.openFolder();
              if (!folderPath) return;
              setLoadStatus(`Instalando ${folderPath}…`);
              const result = await ExtensionLoader.loadFromPath(folderPath);
              setLoadStatus(
                result.success
                  ? `✓ Extensión "${result.extensionId}" instalada.`
                  : `✗ Error: ${result.error}`
              );
            }}
          >Seleccionar carpeta</button>
          <button
            className="extensions-btn extensions-btn-primary"
            onClick={async () => {
              const ole = (window as any).ole;
              if (ole?.fs?.openFile) {
                // Native: native file picker
                const filePath = await ole.fs.openFile();
                if (!filePath?.endsWith('.sef')) {
                  setLoadStatus('Seleccioná un archivo .sef');
                  return;
                }
                setLoadStatus(`Instalando ${filePath}…`);
                const result = await ExtensionLoader.loadFromPath(filePath);
                setLoadStatus(
                  result.success
                    ? `✓ Extensión "${result.extensionId}" instalada.`
                    : `✗ Error: ${result.error}`
                );
              } else {
                // Web/dev fallback: web file input → read as text → loadFromSefContent
                fileInputRef.current?.click();
              }
            }}
          >Instalar .sef</button>
          <button
            className="extensions-btn extensions-btn-secondary"
            onClick={() => {
              const ole = (window as any).ole;
              if (!ole?.shell?.reveal) {
                setLoadStatus('Abrir carpeta requiere el entorno nativo (OLE).');
                return;
              }
              const appData = (window as any).process?.env?.APPDATA || 'C:\\Users';
              ole.shell.reveal(`${appData}\\Scrakk\\extensions`);
            }}
          >Abrir carpeta</button>
          <button
            className="extensions-btn extensions-btn-primary"
            onClick={handleImportVsix}
            disabled={importProgress !== null}
          >
            {importProgress ? 'Importando...' : 'Importar .vsix'}
          </button>
          <button
            className="extensions-btn extensions-btn-secondary"
            onClick={handleSmokeHost}
            disabled={importProgress !== null}
            title="Lanza fixtures/scrakk-smoke con Node del sistema (notificación si el host funciona)"
          >
            Probar host (smoke)
          </button>
        </div>

        {importProgress && (
          <div className="extensions-load-status">
            <div className="extensions-load-label">{importProgress}</div>
            {importBytes && (
              <div className="extensions-progress-track">
                <div
                  className="extensions-progress-fill"
                  style={{ width: `${Math.min(100, (importBytes.current / importBytes.total) * 100)}%` }}
                />
                <span className="extensions-progress-text">
                  {(importBytes.current / 1024).toFixed(0)} / {(importBytes.total / 1024).toFixed(0)} KB
                </span>
              </div>
            )}
          </div>
        )}

        {importError && (
          <div className="extensions-load-status" style={{ color: 'var(--error-color)' }}>{importError}</div>
        )}

        {/* Hidden file input for the web/dev fallback of "Instalar .sef" (when window.ole is unavailable) */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".sef"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = ''; // allow re-selecting the same file
            if (!file) return;
            setLoadStatus(`Instalando ${file.name} (web)…`);
            try {
              const content = await file.text();
              const result = await ExtensionLoader.loadFromSefContent(content, file.name);
              setLoadStatus(
                result.success
                  ? `✓ Extensión "${result.extensionId}" instalada (web, no se persiste al recargar).`
                  : `✗ Error: ${result.error}`
              );
            } catch (err: any) {
              setLoadStatus(`✗ Error leyendo el archivo: ${err?.message ?? err}`);
            }
          }}
        />

        {loadStatus && <div className="extensions-load-status">{loadStatus}</div>}
      </div>
    </div>
  );
}

const VSCODE_API_MOCK = `
(function() {
  const api = {
    postMessage: function(msg) {
      console.log('[VsCodeView] postMessage:', msg);
      window.parent.postMessage({ type: 'vsix:message', message: msg }, '*');
    },
    setState: function(state) {
      console.log('[VsCodeView] setState:', state);
      try { sessionStorage.setItem('vsix:state', JSON.stringify(state)); } catch {}
    },
    getState: function() {
      try { return JSON.parse(sessionStorage.getItem('vsix:state') || '{}'); } catch { return {}; }
    },
    onDidReceiveMessage: function(cb) {
      console.log('[VsCodeView] onDidReceiveMessage registered');
      window.addEventListener('message', (e) => {
        if (e.data?.type === 'vsix:postMessage') cb(e.data.message);
      });
      return { dispose: function() {} };
    }
  };
  window.acquireVsCodeApi = function() { return api; };
})();
`;

function createViewComponent(html: string): React.ComponentType<{ currentFile?: any; rootPath?: any; panelId?: string }> {
  console.log('[ExtensionsSection] createViewComponent: HTML length', html.length, 'bytes');
  // Siempre injectar mock de acquireVsCodeApi para vistas VS Code
  const srcdoc = `<script>${VSCODE_API_MOCK}</script>\n${html}`;

  const ViewComponent: React.FC<{ currentFile?: any; rootPath?: any; panelId?: string }> = (props) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = useState('100%');

    useEffect(() => {
      const iframe = iframeRef.current;
      if (!iframe) return;

      const handleResize = () => {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (doc?.body) {
            const h = Math.max(doc.body.scrollHeight, doc.documentElement?.scrollHeight || 0);
            if (h > 0) setHeight(h + 'px');
          }
        } catch {}
      };

      iframe.addEventListener('load', handleResize);
      const obs = new ResizeObserver(handleResize);
      obs.observe(iframe);

      return () => { obs.disconnect(); iframe.removeEventListener('load', handleResize); };
    }, []);

    return (
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        sandbox="allow-scripts allow-same-origin"
        style={{
          width: '100%',
          height,
          border: 'none',
          display: 'block',
          background: 'transparent',
        }}
        title={props.panelId}
      />
    );
  };
  ViewComponent.displayName = 'VsCodeView';
  return ViewComponent;
}

function resolveVsixFile(path: string, files: VsixFileEntry[]): VsixFileEntry | undefined {
  const clean = path.replace(/^\.\//, '');
  const cleanUp = clean.replace(/^\.\.\//, '');
  return files.find(f =>
    f.path === path
    || f.path === 'extension/' + path
    || f.path.includes('/' + path)
    || f.path === clean
    || f.path === 'extension/' + clean
    || f.path.includes('/' + clean)
    || (cleanUp !== clean && (
      f.path === cleanUp
      || f.path === 'extension/' + cleanUp
      || f.path.includes('/' + cleanUp)
    ))
  );
}

function extractHtmlStrings(jsContent: string): string[] {
  const results: string[] = [];
  // Buscar template literals con HTML (`...`)
  const templateMatches = jsContent.matchAll(/`[\s\S]*?<!DOCTYPE\s+html[\s\S]*?`/gi);
  for (const m of templateMatches) results.push(m[0]);
  // Buscar cadenas con DOCTYPE
  const stringMatches = jsContent.matchAll(/"(?:\\"|[^"\\])*<!DOCTYPE\s+html(?:\\"|[^"\\])*"/gi);
  for (const m of stringMatches) results.push(m[0]);
  const stringMatches2 = jsContent.matchAll(/'(?:\\'|[^'\\])*<!DOCTYPE\s+html(?:\\'|[^'\\])*'/gi);
  for (const m of stringMatches2) results.push(m[0]);
  return results;
}

function findViewHtml(view: VsixViewDef, files: VsixFileEntry[], extId: string): string {
  const candidates = [
    `media/${view.id}.html`,
    `media/${view.id}/index.html`,
    `views/${view.id}.html`,
    `${view.id}/index.html`,
    `media/${view.name.toLowerCase().replace(/\s+/g, '-')}.html`,
  ];

  let htmlContent: string | null = null;

  // 1. Buscar por candidatos exactos
  for (const candidate of candidates) {
    const found = resolveVsixFile(candidate, files);
    if (found) {
      htmlContent = new TextDecoder().decode(found.data);
      break;
    }
  }

  // 2. Si no, buscar cualquier HTML en el VSIX
  if (!htmlContent) {
    const htmlFiles = files.filter(f => f.path.endsWith('.html'));
    if (htmlFiles.length === 1) {
      htmlContent = new TextDecoder().decode(htmlFiles[0].data);
    } else if (htmlFiles.length > 1) {
      const keywords = (view.id + ' ' + view.name).toLowerCase().split(/[.\s/]+/);
      const scored = htmlFiles.map(f => ({
        file: f,
        score: keywords.reduce((s, k) => s + (f.path.toLowerCase().includes(k) ? 1 : 0), 0)
      })).sort((a, b) => b.score - a.score);
      htmlContent = new TextDecoder().decode(
        scored[0].score > 0 ? scored[0].file.data : htmlFiles.sort((a, b) => a.path.length - b.path.length)[0].data
      );
    }
  }

  // 3. Si no hay HTML, buscar embebido en JS
  if (!htmlContent) {
    const jsFiles = files.filter(f => f.path.endsWith('.js') || f.path.endsWith('.mjs') || f.path.endsWith('.cjs'));
    for (const jsFile of jsFiles) {
      const jsContent = new TextDecoder().decode(jsFile.data);
      const htmlStrings = extractHtmlStrings(jsContent);
      if (htmlStrings.length > 0) {
        htmlContent = htmlStrings.sort((a, b) => b.length - a.length)[0]
          .replace(/^[`"']/, '').replace(/[`"']$/, '')
          .replace(/\\`/g, '`').replace(/\\\$/g, '$')
          .replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        break;
      }
    }
  }

  if (htmlContent) {
    const needsMock = htmlContent.includes('acquireVsCodeApi');
    const mockTag = needsMock ? `<script>${VSCODE_API_MOCK}</script>` : '';
    return mockTag + rewriteHtmlWithBlobs(htmlContent, files, extId);
  }

  return placeholdersvg(view);
}

// Cache blob URLs para archivos extraídos (por extensión)
const vsixBlobUrls = new Map<string, Map<string, string>>();

function createBlobUrl(data: Uint8Array, mime: string): string {
  const blob = new Blob([data], { type: mime });
  return URL.createObjectURL(blob);
}

function rewriteHtmlWithBlobs(html: string, files: VsixFileEntry[], extId: string): string {
  const blobMap = new Map<string, string>();
  if (!vsixBlobUrls.has(extId)) vsixBlobUrls.set(extId, new Map());
  const cache = vsixBlobUrls.get(extId)!;

  const getBlob = (path: string, mime: string): string | null => {
    if (cache.has(path)) return cache.get(path)!;
    const file = resolveVsixFile(path, files);
    if (!file) return null;
    const url = createBlobUrl(file.data, mime);
    cache.set(path, url);
    blobMap.set(path, url);
    return url;
  };

  // Reemplazar <link href="..."> stylesheet con blob URLs
  const linkRe = /<link\s[^>]*?rel=["']stylesheet["'][^>]*?href=["']([^"']+)["'][^>]*\/?>/gi;
  html = html.replace(linkRe, (_match, href) => {
    const url = getBlob(href, 'text/css');
    if (!url) { console.warn('[ExtensionsSection] CSS blob no encontrado:', href); return _match; }
    return `<link rel="stylesheet" href="${url}">`;
  });

  // Reemplazar <script src="..."> con blob URLs (preservando type="module" etc.)
  const scriptRe = /<script\s([^>]*?)(?:src=["']([^"']+)["'])([^>]*?)><\/script>/gi;
  html = html.replace(scriptRe, (_match, before, src, after) => {
    const url = getBlob(src, 'application/javascript');
    if (!url) { console.warn('[ExtensionsSection] JS blob no encontrado:', src); return _match; }
    const attrs = (before + after).trim();
    return `<script ${attrs} src="${url}"></script>`;
  });

  console.log('[ExtensionsSection] Blobs creados:', Object.fromEntries(blobMap));
  return html;
}

function placeholdersvg(view: VsixViewDef): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="dark">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #d4d4d4; background: #1e1e1e; }
    h2 { font-size: 16px; margin: 0 0 8px; display: flex; align-items: center; gap: 8px; }
    h2 small { font-size: 11px; color: #007acc; font-weight: 400; }
    p { font-size: 13px; color: #9d9d9d; line-height: 1.5; }
    code { font-size: 12px; background: #2d2d2d; padding: 2px 6px; border-radius: 3px; }
    .files { margin-top: 16px; font-size: 12px; }
    .files summary { cursor: pointer; color: #007acc; }
    .files li { color: #6a9955; }
  </style>
</head>
<body>
  <h2>${view.name} <small>VS Code</small></h2>
  <p>Vista <code>${view.id}</code> importada de VS Code.</p>
  <p>El contenido se genera dinámicamente mediante un provider JS que requiere el API de VS Code.</p>
  <div class="files">
    <details>
      <summary>Archivos importados</summary>
      <ul id="file-list"></ul>
    </details>
  </div>
  <script>fetch('/api/files')</script>
</body>
</html>`;
}

function resolveVsixIconSvg(iconPath: string, files: VsixFileEntry[]): string {
  console.log('[ExtensionsSection] resolveVsixIconSvg:', iconPath);
  const found = resolveVsixFile(iconPath, files);
  if (found) {
    const str = new TextDecoder().decode(found.data);
    console.log('[ExtensionsSection] Icono encontrado, tipo:', str.trim().startsWith('<svg') ? 'SVG directo' : 'otro formato', str.length, 'bytes');
    if (str.trim().startsWith('<svg')) return str;
    const base64 = btoa(str);
    return `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><image href="data:image/svg+xml;base64,${base64}" width="16" height="16"/></svg>`;
  }
  console.warn('[ExtensionsSection] Icono no encontrado:', iconPath, 'usando default');
  return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>';
}

export default ExtensionsSection;
