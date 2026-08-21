import { useState, useEffect, useMemo } from 'react';
import './SectionStyles.css';
import { toolSettingsService } from '../../../services/ai/toolSettings';
import { modeRegistry } from '../../../services/ai/policy';
import { registry as toolRegistry } from '../../../services/ai/tools/registry';
import { ExtensionRegistry } from '../../../services/extensions/core/registry';
import type { ToolMeta } from '../../../services/ai/tools/types';
import type { RegisteredExtension } from '../../../services/extensions';

interface ToolRow {
  name: string;
  meta: ToolMeta;
  enabled: boolean;
  extensionId?: string;
  extension?: RegisteredExtension;
}

const CONTEXT_DEGRADATION_THRESHOLD = 45;

function ToolsSection() {
  const [tools, setTools] = useState<ToolRow[]>(
    toolSettingsService.getAllTools().map((t) => ({
      ...t,
      extension: t.extensionId ? ExtensionRegistry.getExtension(t.extensionId) : undefined,
    })),
  );
  const [approvalMode, setApprovalMode] = useState(toolSettingsService.getApprovalMode());
  const [modes, setModes] = useState(modeRegistry.getAll());
  const [search, setSearch] = useState('');

  useEffect(() => {
    const refreshTools = () => {
      const next = toolSettingsService.getAllTools().map((t) => ({
        ...t,
        extension: t.extensionId ? ExtensionRegistry.getExtension(t.extensionId) : undefined,
      }));
      setTools(next);
    };
    const refreshAll = () => {
      refreshTools();
      setApprovalMode(toolSettingsService.getApprovalMode());
    };

    window.addEventListener('tool-settings-changed', refreshAll);
    window.addEventListener('tool-settings-session-changed', refreshTools);
    const unsubToolRegistry = toolRegistry.subscribe(refreshTools);
    const unsubExtensionRegistry = ExtensionRegistry.subscribe(refreshTools);
    const unsubModeRegistry = modeRegistry.subscribe(() => setModes(modeRegistry.getAll()));

    return () => {
      window.removeEventListener('tool-settings-changed', refreshAll);
      window.removeEventListener('tool-settings-session-changed', refreshTools);
      unsubToolRegistry();
      unsubExtensionRegistry();
      unsubModeRegistry();
    };
  }, []);

  // Filter by search (label, name, description, extension displayName).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((tool) => {
      const extName = tool.extension?.manifest.displayName ?? tool.extension?.manifest.name ?? '';
      return (
        tool.name.toLowerCase().includes(q) ||
        (tool.meta.label ?? '').toLowerCase().includes(q) ||
        (tool.meta.description ?? '').toLowerCase().includes(q) ||
        extName.toLowerCase().includes(q)
      );
    });
  }, [tools, search]);

  // Split: built-in (no extensionId) vs extension-contributed.
  const builtInTools = useMemo(() => filtered.filter((t) => !t.extensionId), [filtered]);
  const extensionTools = useMemo(() => filtered.filter((t) => !!t.extensionId), [filtered]);

  // Group built-in tools by category.
  const groupedByCategory = useMemo(() => {
    const cats = toolSettingsService.getCategoryOrder();
    const map: Record<string, ToolRow[]> = {};
    for (const cat of cats) map[cat.key] = [];
    for (const tool of builtInTools) {
      const cat = tool.meta.category || 'utility';
      if (map[cat]) map[cat].push(tool);
      else map[cat] = [tool];
    }
    return cats.filter((c) => map[c.key]?.length > 0).map((c) => ({ ...c, items: map[c.key] }));
  }, [builtInTools]);

  // Group extension tools by parent extension so they read as "what each
  // extension contributes" rather than as a flat list.
  const extensionToolsByExt = useMemo(() => {
    const map = new Map<string, { extension: RegisteredExtension | undefined; items: ToolRow[] }>();
    for (const tool of extensionTools) {
      const key = tool.extensionId ?? 'unknown';
      if (!map.has(key)) {
        map.set(key, { extension: tool.extension, items: [] });
      }
      map.get(key)!.items.push(tool);
    }
    return Array.from(map.entries()).map(([id, value]) => ({
      id,
      extension: value.extension,
      items: value.items,
    }));
  }, [extensionTools]);

  const handleToggle = (name: string, enabled: boolean) => {
    toolSettingsService.setGloballyEnabled(name, enabled);
  };

  const handleModeChange = (mode: string) => {
    toolSettingsService.setApprovalMode(mode);
    setApprovalMode(mode);
  };

  const totalTools = tools.length;
  const showContextWarning = totalTools > CONTEXT_DEGRADATION_THRESHOLD;

  return (
    <div className="editor-section">
      {/* Approval Mode — unified list (no separation) */}
      <div className="editor-block">
        <div className="editor-block-header">
          <h3 className="editor-block-title">Approval Mode</h3>
          <p className="editor-block-desc">Controla cómo la IA maneja operaciones peligrosas o de mutación</p>
        </div>
        <div className="settings-list settings-list-unified">
          {modes.map((mode) => (
            <div
              key={mode.id}
              className={`settings-item settings-item-selectable${approvalMode === mode.id ? ' settings-item-selected' : ''}`}
              onClick={() => handleModeChange(mode.id)}
              style={{ cursor: 'pointer' }}
            >
              <div className="settings-item-content">
                <span className="settings-item-label">{mode.label}</span>
                <span className="settings-item-desc">{mode.description ?? `Mode: ${mode.id}`}</span>
              </div>
              <div className={`settings-engine-check${approvalMode === mode.id ? ' checked' : ''}`}>
                {approvalMode === mode.id && (
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                  </svg>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tools block — search + lists + warning */}
      <div className="editor-block">
        <div className="editor-block-header">
          <h3 className="editor-block-title">Tools</h3>
          <p className="editor-block-desc">Habilita o deshabilita las herramientas que la IA puede usar</p>
        </div>

        {/* Search */}
        <div className="settings-search-box">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            className="settings-search-input"
            placeholder="Buscar por nombre, descripción, o extensión..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="settings-search-clear"
              onClick={() => setSearch('')}
              title="Limpiar búsqueda"
            >
              ×
            </button>
          )}
          <span className="settings-search-count">
            {filtered.length}/{totalTools}
          </span>
        </div>

        {/* Context degradation warning */}
        {showContextWarning && (
          <div className="settings-warning-banner" role="alert">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM7 4h2v5H7V4zm0 6h2v2H7v-2z" />
            </svg>
            <span>
              <strong>{totalTools} tools activas.</strong> Con tantos tools habilitados el
              contexto de la IA se puede degradar y el modelo puede no seguir instrucciones de la
              mejor forma. El impacto depende del modelo: los modelos grandes (Claude Sonnet 4+,
              GPT-5, Gemini 2.5 Pro) lo toleran mejor; los chicos (GPT-OSS 20B, Haiku, etc.) pueden
              confundirse. Deshabilitá los que no uses.
            </span>
          </div>
        )}

        {/* Built-in tools — grouped by category, but rendered as a single
            unified list (no visual separation between categories) */}
        {groupedByCategory.length > 0 && (
          <div className="settings-list settings-list-unified">
            {groupedByCategory.flatMap((cat) =>
              cat.items.map((tool) => (
                <ToolRowView
                  key={tool.name}
                  tool={tool}
                  onToggle={handleToggle}
                  categoryLabel={cat.label}
                />
              )),
            )}
          </div>
        )}

        {/* Empty state for built-in search */}
        {groupedByCategory.length === 0 && extensionToolsByExt.length === 0 && (
          <div className="settings-empty-results">
            No hay tools que coincidan con "{search}".
          </div>
        )}

        {/* Extension-contributed tools — grouped by parent extension */}
        {extensionToolsByExt.length > 0 && (
          <div className="settings-extensions-section">
            <div className="settings-extensions-section-header">
              <h4 className="settings-extensions-section-title">
                Tools añadidos por extensiones
              </h4>
              <span className="settings-extensions-section-count">
                {extensionToolsByExt.reduce((acc, e) => acc + e.items.length, 0)}
              </span>
            </div>
            <div className="settings-list settings-list-unified">
              {extensionToolsByExt.flatMap((group) => [
                <div
                  key={`${group.id}-header`}
                  className="settings-item settings-item-header"
                >
                  <div className="settings-item-content">
                    <span className="settings-item-label">
                      {group.extension?.manifest.displayName ?? group.extension?.manifest.name ?? group.id}
                    </span>
                    <span className="settings-item-desc">
                      {group.extension?.manifest.author
                        ? `Por ${group.extension.manifest.author} · v${group.extension?.manifest.version ?? '?'}`
                        : 'Extensión sin manifiesto'}
                    </span>
                  </div>
                </div>,
                ...group.items.map((tool) => (
                  <ToolRowView
                    key={tool.name}
                    tool={tool}
                    onToggle={handleToggle}
                    extensionLabel={group.extension?.manifest.displayName ?? group.extension?.manifest.name}
                  />
                )),
              ])}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolRowView({
  tool,
  onToggle,
  categoryLabel,
  extensionLabel,
}: {
  tool: ToolRow;
  onToggle: (name: string, enabled: boolean) => void;
  categoryLabel?: string;
  extensionLabel?: string;
}) {
  return (
    <div
      className={`settings-item settings-item-checkbox${tool.enabled ? ' settings-item-selected' : ''}`}
    >
      <label
        className="settings-item-checkbox-control"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={tool.enabled}
          onChange={(e) => onToggle(tool.name, e.target.checked)}
        />
        <span className="settings-item-checkbox-box">
          {tool.enabled && (
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
            </svg>
          )}
        </span>
      </label>
      <div className="settings-item-content">
        <span className="settings-item-label">
          {tool.meta.label || tool.name}
          {categoryLabel && (
            <span className="settings-item-cat-badge">{categoryLabel}</span>
          )}
          {extensionLabel && (
            <span className="settings-item-extension-badge">· {extensionLabel}</span>
          )}
        </span>
        <span className="settings-item-desc">{tool.meta.description}</span>
      </div>
    </div>
  );
}

export default ToolsSection;
