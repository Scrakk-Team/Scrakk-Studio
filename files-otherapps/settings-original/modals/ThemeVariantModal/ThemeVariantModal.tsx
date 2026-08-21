/**
 * Modal de variantes de un pack de themes (ej. One Dark Pro Flat / Darker / Mix).
 * UI inspirada en Modal base (DeleteModal) + grid de theme cards de Appearance.
 */
import { useMemo, useState } from 'react';
import Modal from '../../../Modal/Modal';
import { Search } from '../../../Icons';
import type { RegisteredTheme } from '../../../../services/extensions';
import './ThemeVariantModal.css';

export interface ThemeVariantModalProps {
  isOpen: boolean;
  /** Título del pack (familyLabel) */
  familyLabel: string;
  author?: string;
  variants: RegisteredTheme[];
  currentThemeId: string | null;
  onSelect: (themeId: string) => void;
  onClose: () => void;
}

function getThemeColors(theme: RegisteredTheme) {
  const colors = theme.definition.colors as Record<string, string | undefined>;
  return {
    primary: colors.accent || colors.treeColor || '#7020F3',
    secondary: colors.surfaceColor || colors.surface || '#1a1a1a',
    tertiary: colors.bgColor || colors.bg || colors.editorBg || '#000000',
  };
}

function ThemeVariantModal({
  isOpen,
  familyLabel,
  author,
  variants,
  currentThemeId,
  onSelect,
  onClose,
}: ThemeVariantModalProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...variants].sort((a, b) => a.label.localeCompare(b.label));
    if (!q) return list;
    return list.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q)
    );
  }, [variants, query]);

  const dark = filtered.filter((t) => t.type === 'dark');
  const light = filtered.filter((t) => t.type === 'light');

  const handlePick = (id: string) => {
    onSelect(id);
    onClose();
  };

  const renderGrid = (list: RegisteredTheme[]) => (
    <div className="theme-variant-grid">
      {list.map((theme) => {
        const colors = getThemeColors(theme);
        const active = currentThemeId === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            className={`theme-card theme-variant-card ${active ? 'active' : ''}`}
            onClick={() => handlePick(theme.id)}
          >
            <span className="theme-card-name">{theme.label}</span>
            <div className="theme-card-preview">
              <div
                className="theme-preview-color theme-preview-primary"
                style={{ backgroundColor: colors.primary }}
              />
              <div
                className="theme-preview-color theme-preview-secondary"
                style={{ backgroundColor: colors.secondary }}
              />
              <div
                className="theme-preview-color theme-preview-tertiary"
                style={{ backgroundColor: colors.tertiary }}
              />
            </div>
            <span className="theme-variant-type">
              {theme.type === 'light' ? 'Claro' : 'Oscuro'}
              {active ? ' · activo' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Variantes · ${familyLabel}`}
      footer={
        <>
          <span className="theme-variant-footer-meta">
            {variants.length} variante{variants.length === 1 ? '' : 's'}
            {author ? ` · ${author}` : ''}
          </span>
          <button type="button" className="modal-btn modal-btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </>
      }
    >
      <div className="theme-variant-modal-body">
        <p className="theme-variant-desc">
          Este pack incluye varias versiones del tema. Elegí la que quieras aplicar.
        </p>

        <div className="theme-search-box theme-variant-search">
          <Search size={12} />
          <input
            type="text"
            placeholder="Buscar variante..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {filtered.length === 0 ? (
          <div className="theme-variant-empty">No hay variantes que coincidan.</div>
        ) : (
          <>
            {dark.length > 0 && (
              <div className="theme-group">
                <div className="theme-group-label">Oscuros</div>
                {renderGrid(dark)}
              </div>
            )}
            {light.length > 0 && (
              <div className="theme-group">
                <div className="theme-group-label">Claros</div>
                {renderGrid(light)}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export default ThemeVariantModal;
