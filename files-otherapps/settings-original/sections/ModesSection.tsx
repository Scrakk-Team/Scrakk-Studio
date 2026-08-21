import { useState, useEffect, useMemo } from 'react';
import './SectionStyles.css';
import { modeRegistry } from '../../../services/ai/policy';
import { toolSettingsService } from '../../../services/ai/toolSettings';
import { registry as toolRegistry } from '../../../services/ai/tools/registry';
import type { ModeDefinition, ModeMutationBehavior, ModeShellBehavior } from '../../../services/ai/policy/types';

const DEFAULT_COLOR = '#8b5cf6';

function emptyMode(): ModeDefinition {
  return {
    id: '',
    label: '',
    description: '',
    color: DEFAULT_COLOR,
    prompt: '',
    mutationBehavior: 'auto',
    shellBehavior: 'auto',
  };
}

function ModesSection() {
  const [modes, setModes] = useState<ModeDefinition[]>(() => modeRegistry.getAll());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ModeDefinition>(emptyMode());
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const unsub = modeRegistry.subscribe(() => setModes(modeRegistry.getAll()));
    return unsub;
  }, []);

  const allToolNames = useMemo(() => toolRegistry.getNames(), [modes]);
  const customModes = useMemo(() => modes.filter(m => m.extensionId !== 'scrakk-builtin'), [modes]);

  const startNew = () => {
    const id = `custom-${Date.now()}`;
    setDraft({ ...emptyMode(), id });
    setActiveId(id);
    setIsNew(true);
    setError('');
    setSuccess('');
  };

  const startEdit = (mode: ModeDefinition) => {
    setDraft({ ...mode });
    setActiveId(mode.id);
    setIsNew(false);
    setError('');
    setSuccess('');
  };

  const handleSave = () => {
    setError('');
    setSuccess('');
    const d = draft;
    if (!d.id.trim()) { setError('ID is required'); return; }
    if (!/^[a-z0-9_-]+$/.test(d.id)) { setError('ID must be lowercase letters, digits, _ or -'); return; }
    if (!d.label.trim()) { setError('Label is required'); return; }
    if (!d.prompt.trim()) { setError('Prompt is required'); return; }

    // Validate id uniqueness
    const existing = modeRegistry.get(d.id);
    if (existing && (isNew || existing.extensionId === 'scrakk-builtin')) {
      setError(`Mode id "${d.id}" already exists or is a built-in.`);
      return;
    }

    modeRegistry.saveCustom(d);
    toolSettingsService.setApprovalMode(d.id);
    setSuccess(`Mode "${d.label}" saved.`);
    setIsNew(false);
    setActiveId(d.id);
    setModes(modeRegistry.getAll());
  };

  const handleDelete = (id: string) => {
    modeRegistry.deleteCustom(id);
    if (activeId === id) {
      setActiveId(null);
      setDraft(emptyMode());
      setIsNew(false);
    }
    setSuccess(`Mode deleted.`);
    setModes(modeRegistry.getAll());
  };

  const handleReset = () => {
    if (isNew) { setDraft(emptyMode()); setActiveId(null); setIsNew(false); }
    else if (activeId) {
      const def = modeRegistry.get(activeId);
      if (def) { setDraft({ ...def }); setSuccess('Reverted.'); }
    }
  };

  return (
    <div className="editor-section">
      <div className="editor-block">
          <div className="editor-block-header">
            <h3 className="editor-block-title">Modos personalizados</h3>
            <p className="editor-block-desc">
              Creá modos de aprobación con prompts, comportamiento y filtros de tools personalizados.
              Los modos integrados no se pueden editar.
            </p>
          </div>

        {error && <div className="form-error">{error}</div>}
        {success && <div className="form-success">{success}</div>}

        <div className="settings-list">
          {customModes.length === 0 && !isNew && (
            <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <span className="settings-item-desc">Aún no hay modos personalizados. Hacé clic en "Nuevo modo" para crear uno.</span>
            </div>
          )}

          {customModes.map(mode => (
            <div
              key={mode.id}
              className={`settings-item${activeId === mode.id ? ' settings-item-selected' : ''}`}
              onClick={() => startEdit(mode)}
              style={{ cursor: 'pointer' }}
            >
              <div className="settings-item-content">
                <span className="settings-item-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {mode.color && (
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: mode.color }} />
                  )}
                  {mode.label}
                </span>
                <span className="settings-item-desc">{mode.id} — {mode.description ?? '(sin descripción)'}</span>
              </div>
              <button
                className="settings-btn settings-btn-danger"
                style={{ padding: '4px 10px', fontSize: '10px' }}
                onClick={(e) => { e.stopPropagation(); handleDelete(mode.id); }}
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '12px' }}>
          <button className="settings-btn settings-btn-primary" onClick={startNew}>
            + Nuevo modo
          </button>
        </div>
      </div>

      {(isNew || activeId) && (
        <div className="editor-block">
          <div className="editor-block-header">
            <h3 className="editor-block-title">{isNew ? 'Nuevo modo' : `Editar: ${draft.label}`}</h3>
            <p className="editor-block-desc">Definí label, prompt, comportamiento y visibilidad de tools.</p>
          </div>

          <div className="settings-list">
            <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
              <div className="settings-item-content">
                <span className="settings-item-label">ID</span>
                <span className="settings-item-desc">Identificador único (lowercase, sin espacios)</span>
              </div>
              <div className="theme-search-box" style={{ width: '100%' }}>
                <input
                  type="text"
                  placeholder="mi-modo-devops"
                  value={draft.id}
                  disabled={!isNew}
                  onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                />
              </div>
            </div>

            <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
              <div className="settings-item-content">
                <span className="settings-item-label">Label</span>
                <span className="settings-item-desc">Nombre visible en el selector</span>
              </div>
              <div className="theme-search-box" style={{ width: '100%' }}>
                <input
                  type="text"
                  placeholder="DevOps Mode"
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                />
              </div>
            </div>

            <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
              <div className="settings-item-content">
                <span className="settings-item-label">Color</span>
                <span className="settings-item-desc">Color del badge en el selector</span>
              </div>
              <div className="theme-search-box" style={{ width: '100%' }}>
                <input
                  type="color"
                  value={draft.color ?? DEFAULT_COLOR}
                  onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                />
              </div>
            </div>

            <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
              <div className="settings-item-content">
                <span className="settings-item-label">Descripción</span>
                <span className="settings-item-desc">Tooltip / descripción corta</span>
              </div>
              <div className="theme-search-box" style={{ width: '100%' }}>
                <input
                  type="text"
                  placeholder="Solo lectura, sin shell"
                  value={draft.description ?? ''}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>
            </div>

            <div className="settings-item">
              <div className="settings-item-content">
                <span className="settings-item-label">Mutation behavior</span>
                <span className="settings-item-desc">Qué hacer con tools de escritura</span>
              </div>
              <select
                className="theme-dropdown-trigger theme-dropdown-trigger-small"
                value={draft.mutationBehavior}
                onChange={(e) => setDraft({ ...draft, mutationBehavior: e.target.value as ModeMutationBehavior })}
              >
                <option value="never">never (deny)</option>
                <option value="auto">auto (ask)</option>
                <option value="always">always (allow)</option>
              </select>
            </div>

            <div className="settings-item">
              <div className="settings-item-content">
                <span className="settings-item-label">Shell behavior</span>
                <span className="settings-item-desc">Qué hacer con comandos de shell</span>
              </div>
              <select
                className="theme-dropdown-trigger theme-dropdown-trigger-small"
                value={draft.shellBehavior}
                onChange={(e) => setDraft({ ...draft, shellBehavior: e.target.value as ModeShellBehavior })}
              >
                <option value="never">never (deny)</option>
                <option value="auto">auto (ask)</option>
                <option value="always">always (allow)</option>
              </select>
            </div>

            <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
              <div className="settings-item-content">
                <span className="settings-item-label">Tool filter (exclude)</span>
                <span className="settings-item-desc">
                  Tools que la IA NO verá en este modo. Vacío = todas las habilitadas.
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '180px', overflowY: 'auto', padding: '4px' }}>
                {allToolNames.map(toolName => {
                  const excluded = draft.toolFilter?.exclude?.includes(toolName) ?? false;
                  return (
                    <button
                      key={toolName}
                      className={`settings-btn ${excluded ? 'settings-btn-danger' : 'settings-btn-secondary'}`}
                      style={{ fontSize: '10px', padding: '4px 8px' }}
                      onClick={() => {
                        const current = draft.toolFilter?.exclude ?? [];
                        const next = excluded
                          ? current.filter(t => t !== toolName)
                          : [...current, toolName];
                        setDraft({ ...draft, toolFilter: { ...(draft.toolFilter ?? {}), exclude: next.length > 0 ? next : undefined } });
                      }}
                    >
                      {toolName}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
              <div className="settings-item-content">
                <span className="settings-item-label">Prompt</span>
                <span className="settings-item-desc">Instrucciones que recibe la IA al activar este modo</span>
              </div>
              <textarea
                placeholder="Eres un experto en DevOps. Solo puedes ejecutar comandos k8s/docker..."
                value={draft.prompt}
                onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
                style={{
                  width: '100%', minHeight: '200px', padding: '8px',
                  fontFamily: 'Consolas, monospace', fontSize: '11px',
                  background: 'var(--input-bg, transparent)',
                  color: 'var(--text-color)',
                  border: '1px solid var(--border-color, #444)',
                  borderRadius: '4px',
                  resize: 'vertical',
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
            <button className="settings-btn settings-btn-primary" onClick={handleSave}>
              Guardar
            </button>
            <button className="settings-btn settings-btn-secondary" onClick={handleReset}>
              {isNew ? 'Cancelar' : 'Revertir'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ModesSection;
