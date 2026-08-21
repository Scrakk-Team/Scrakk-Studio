import { useState, useEffect, useRef, useMemo } from 'react';
import './SectionStyles.css';
import { Search } from '../../Icons';
import GeneratingIndicator from '../../Chat/GeneratingIndicator/GeneratingIndicator';
import { ExtensionService, ExtensionRegistry, DynamicThemeService, type RegisteredTheme } from '../../../services/extensions';
import { getIconPack, setIconPack, getAvailablePacks } from '../../../services/fileIcons';
import { layoutService } from '../../../services/layout';
import { ThemeBuilderTrigger } from '../../ThemeBuilder/ThemeBuilderTrigger';
import { ThemeVariantModal } from '../modals/ThemeVariantModal';
import {
  buildThemeSelectorEntries,
  type ThemeSelectorEntry,
} from '../../../services/compatibility/vscode/contributions/themes/groupThemes';

function AppearanceSection() {
  const [themes, setThemes] = useState<RegisteredTheme[]>([]);
  const [currentThemeId, setCurrentThemeId] = useState<string | null>(null);
  const [themesLoading, setThemesLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [variantModal, setVariantModal] = useState<ThemeSelectorEntry | null>(null);
  const [gradientEnabled, setGradientEnabled] = useState(() => {
    return localStorage.getItem('gradient-enabled') === 'true';
  });
  const [gradientAnimated, setGradientAnimated] = useState(() => {
    return localStorage.getItem('gradient-animated') === 'true';
  });
  const [gradientStyle, setGradientStyle] = useState(() => {
    return localStorage.getItem('gradient-style') || 'diagonal';
  });
  const [dynamicThemeEnabled, setDynamicThemeEnabled] = useState(() => {
    return DynamicThemeService.isEnabled();
  });
  const [iconPackValue, setIconPackValue] = useState<string>(() => getIconPack());
  const [folderIconsValue, setFolderIconsValue] = useState(() => {
    return localStorage.getItem('useFolderIcons') === 'true' ? 'pack' : 'scrakk';
  });
  const [zoomLevel, setZoomLevel] = useState(() => {
    const saved = localStorage.getItem('ui-zoom-level');
    return saved ? parseInt(saved, 10) : 100;
  });
  const [wheelEnabled, setWheelEnabled] = useState(() => {
    return layoutService.getActivityBarWheelEnabled();
  });
  const [redesignMode, setRedesignMode] = useState(() => {
    const saved = localStorage.getItem('redesign-mode');
    if (saved === 'rounded') return 'rounded';
    return 'normal';
  });

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [menuPositions, setMenuPositions] = useState<Record<string, { top: number; left: number; width: number }>>({});
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (openDropdown && dropdownRefs.current[openDropdown] && !dropdownRefs.current[openDropdown]?.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };

    if (openDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdown]);

  const toggleDropdown = (id: string) => {
    if (openDropdown === id) {
      setOpenDropdown(null);
    } else {
      const trigger = triggerRefs.current[id];
      if (trigger) {
        const rect = trigger.getBoundingClientRect();
        setMenuPositions(prev => ({
          ...prev,
          [id]: {
            top: rect.bottom + 4,
            left: rect.left,
            width: rect.width
          }
        }));
      }
      setOpenDropdown(id);
    }
  };

  useEffect(() => {
    if (gradientEnabled) {
      document.body.classList.add('gradient-enabled');
    } else {
      document.body.classList.remove('gradient-enabled');
    }
    
    if (gradientAnimated) {
      document.body.classList.add('gradient-animated');
    } else {
      document.body.classList.remove('gradient-animated');
    }
    
    document.body.setAttribute('data-gradient-style', gradientStyle);
  }, [gradientEnabled, gradientAnimated, gradientStyle]);

  useEffect(() => {
    document.documentElement.setAttribute('data-redesign-mode', redesignMode);
  }, [redesignMode]);

  useEffect(() => {
    // Aplicar zoom a la página web
    document.body.style.zoom = `${zoomLevel}%`;
    document.documentElement.style.setProperty('--ui-zoom', (zoomLevel / 100).toString());
  }, [zoomLevel]);

  // Escuchar reset de zoom desde el shortcut global
  useEffect(() => {
    const handleZoomReset = (e: any) => {
      setZoomLevel(e.detail.level);
    };
    window.addEventListener('zoom-changed', handleZoomReset);
    return () => window.removeEventListener('zoom-changed', handleZoomReset);
  }, []);

  const handleZoomChange = (value: number) => {
    setZoomLevel(value);
    localStorage.setItem('ui-zoom-level', String(value));
    document.documentElement.style.setProperty('--ui-zoom', (value / 100).toString());
  };

  useEffect(() => {
    const loadThemes = () => {
      const allThemes = ExtensionService.getAllThemes();
      setThemes(allThemes);
      setCurrentThemeId(ExtensionService.getCurrentThemeId());
      setThemesLoading(false);
    };
    
    // Small timeout to let the extension system initialize
    const timer = setTimeout(loadThemes, 50);

    const unsubscribe = ExtensionService.subscribe(() => {
      setThemes(ExtensionService.getAllThemes());
      setCurrentThemeId(ExtensionService.getCurrentThemeId());
      setThemesLoading(false);
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  const handleThemeChange = (themeId: string) => {
    ExtensionService.setTheme(themeId);
    setCurrentThemeId(themeId);
  };

  const getThemeAuthor = (theme: RegisteredTheme): string => {
    if (theme.extensionId === 'scrakk-builtin-themes') return 'Scrakk';
    const ext = ExtensionRegistry.getExtension(theme.extensionId);
    return ext?.manifest?.author || '';
  };

  const getThemeColors = (theme: RegisteredTheme) => {
    const colors = theme.definition.colors as any;
    return {
      primary: colors.accent || colors.treeColor || '#7020F3',
      secondary: colors.surfaceColor || colors.surface || '#1a1a1a',
      tertiary: colors.bgColor || colors.bg || colors.editorBg || '#000000'
    };
  };

  const selectorEntries = useMemo(() => {
    const entries = buildThemeSelectorEntries(themes, currentThemeId);
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter((e) => {
      if (e.familyLabel.toLowerCase().includes(q)) return true;
      return e.variants.some(
        (v) =>
          v.label.toLowerCase().includes(q) ||
          v.id.toLowerCase().includes(q)
      );
    });
  }, [themes, currentThemeId, searchQuery]);

  const darkEntries = selectorEntries.filter((e) => e.type === 'dark');
  const lightEntries = selectorEntries.filter((e) => e.type === 'light');

  const handleEntryClick = (entry: ThemeSelectorEntry) => {
    if (entry.isPack) {
      setVariantModal(entry);
      return;
    }
    handleThemeChange(entry.representative.id);
  };

  const renderThemeEntry = (entry: ThemeSelectorEntry) => {
    const theme = entry.representative;
    const colors = getThemeColors(theme);
    const author = getThemeAuthor(theme);
    return (
      <button
        key={entry.key}
        type="button"
        className={`theme-card ${entry.isActive ? 'active' : ''}`}
        onClick={() => handleEntryClick(entry)}
        title={
          entry.isPack
            ? `${entry.familyLabel} · ${entry.variants.length} variantes`
            : theme.label
        }
      >
        <span className="theme-card-name">{entry.familyLabel}</span>
        <div className="theme-card-preview">
          <div className="theme-preview-color theme-preview-primary" style={{ backgroundColor: colors.primary }} />
          <div className="theme-preview-color theme-preview-secondary" style={{ backgroundColor: colors.secondary }} />
          <div className="theme-preview-color theme-preview-tertiary" style={{ backgroundColor: colors.tertiary }} />
        </div>
        {entry.isPack ? (
          <span className="theme-card-author">
            {entry.variants.length} variantes{author ? ` · ${author}` : ''}
          </span>
        ) : (
          author && <span className="theme-card-author">De {author}</span>
        )}
      </button>
    );
  };

  return (
    <div className="appearance-section">
      {/* Theme Selector - Siempre visible */}
      <div className="appearance-block">
        <div className="appearance-block-header">
          <h3 className="appearance-block-title">Tema de color</h3>
          <p className="appearance-block-desc">Personaliza los colores de la interfaz</p>
        </div>
        
        <div className="theme-grid-container">
          {themesLoading ? (
            <div className="themes-loading">
              <GeneratingIndicator />
              <span className="themes-loading-text">Cargando temas...</span>
            </div>
          ) : (
            <>
          <div className="theme-search-box">
            <Search size={12} />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <ThemeBuilderTrigger onStarted={() => {
              window.dispatchEvent(new CustomEvent('close-settings'));
            }} />
          </div>

          {darkEntries.length > 0 && (
            <div className="theme-group">
              <div className="theme-group-label">Oscuros</div>
              <div className="theme-grid">
                {darkEntries.map(renderThemeEntry)}
              </div>
            </div>
          )}

          {lightEntries.length > 0 && (
            <div className="theme-group">
              <div className="theme-group-label">Claros</div>
              <div className="theme-grid">
                {lightEntries.map(renderThemeEntry)}
              </div>
            </div>
          )}
            </>
          )}
        </div>
      </div>

      <ThemeVariantModal
        isOpen={!!variantModal}
        familyLabel={variantModal?.familyLabel || ''}
        author={variantModal ? getThemeAuthor(variantModal.representative) : undefined}
        variants={variantModal?.variants || []}
        currentThemeId={currentThemeId}
        onSelect={handleThemeChange}
        onClose={() => setVariantModal(null)}
      />

      {/* Re diseño completo */}
      <div className="appearance-block">
        <div className="appearance-block-header">
          <h3 className="appearance-block-title">Re diseño completo</h3>
          <p className="appearance-block-desc">Modifica la estructura visual de la interfaz</p>
        </div>
        <div className="theme-grid">
          {[
            { id: 'normal', label: 'Normal', desc: 'Interfaz estándar' },
            { id: 'rounded', label: 'Redondeado', desc: 'Panel lateral con esquinas redondeadas' },
          ].map(mode => (
            <button
              key={mode.id}
              className={`theme-card ${redesignMode === mode.id ? 'active' : ''}`}
              onClick={() => {
                setRedesignMode(mode.id);
                localStorage.setItem('redesign-mode', mode.id);
              }}
              style={{ textAlign: 'center', padding: '12px 8px' }}
            >
              <span className="theme-card-name" style={{ textAlign: 'center', fontSize: '11px' }}>{mode.label}</span>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: '1.3' }}>{mode.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic Theme */}
      <div className="appearance-block">
        <div className="appearance-block-header">
          <h3 className="appearance-block-title">Tema dinámico</h3>
          <p className="appearance-block-desc">Colores sincronizados con la carátula de Spotify</p>
        </div>
        
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Activar tema dinámico</span>
              <span className="settings-item-desc">Extrae colores de la carátula actual de Spotify</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={dynamicThemeEnabled}
                onChange={(e) => {
                  setDynamicThemeEnabled(e.target.checked);
                  DynamicThemeService.setEnabled(e.target.checked);
                }}
              />
              <span className="settings-toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      {/* Icons */}
      <div className="appearance-block">
        <div className="appearance-block-header">
          <h3 className="appearance-block-title">Iconos</h3>
          <p className="appearance-block-desc">Packs de iconos para archivos</p>
        </div>
        
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Pack de iconos</span>
              <span className="settings-item-desc">Estilo de los iconos de archivo</span>
            </div>
            <div className="theme-dropdown" ref={el => dropdownRefs.current['iconPack'] = el}>
              <button 
                ref={el => triggerRefs.current['iconPack'] = el}
                className="settings-select-inline"
                onClick={() => toggleDropdown('iconPack')}
              >
                {getAvailablePacks().find(p => p.id === iconPackValue)?.label || iconPackValue}
              </button>

              {openDropdown === 'iconPack' && menuPositions['iconPack'] && (
                <div 
                  className="context-menu"
                  style={{ 
                    position: 'fixed',
                    top: `${menuPositions['iconPack'].top}px`, 
                    left: `${menuPositions['iconPack'].left}px`, 
                    width: `${menuPositions['iconPack'].width}px`,
                    maxHeight: '300px',
                    overflowY: 'auto'
                  }}
                >
                  {getAvailablePacks().map(option => (
                    <div
                      key={option.id}
                      className={`context-menu-item ${iconPackValue === option.id ? 'context-menu-item-active' : ''}`}
                      onClick={() => {
                        setIconPackValue(option.id);
                        setIconPack(option.id);
                        setOpenDropdown(null);
                      }}
                    >
                      <span className="context-menu-label">{option.label}</span>
                      {iconPackValue === option.id && (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="theme-check-icon">
                          <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                        </svg>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>



          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Iconos de carpetas</span>
              <span className="settings-item-desc">Origen de iconos para carpetas</span>
            </div>
            <div className="theme-dropdown" ref={el => dropdownRefs.current['folderIcons'] = el}>
              <button 
                ref={el => triggerRefs.current['folderIcons'] = el}
                className="settings-select-inline"
                onClick={() => toggleDropdown('folderIcons')}
              >
                {folderIconsValue === 'scrakk' ? 'Scrakk' : 'Pack'}
              </button>

              {openDropdown === 'folderIcons' && menuPositions['folderIcons'] && (
                <div 
                  className="context-menu"
                  style={{ 
                    position: 'fixed',
                    top: `${menuPositions['folderIcons'].top}px`, 
                    left: `${menuPositions['folderIcons'].left}px`, 
                    width: `${menuPositions['folderIcons'].width}px` 
                  }}
                >
                  {[
                    { value: 'scrakk', label: 'Scrakk' },
                    { value: 'pack', label: 'Pack' }
                  ].map(option => (
                    <div
                      key={option.value}
                      className={`context-menu-item ${folderIconsValue === option.value ? 'context-menu-item-active' : ''}`}
                      onClick={() => {
                        setFolderIconsValue(option.value);
                        localStorage.setItem('useFolderIcons', String(option.value === 'pack'));
                        setOpenDropdown(null);
                      }}
                    >
                      <span className="context-menu-label">{option.label}</span>
                      {folderIconsValue === option.value && (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="theme-check-icon">
                          <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                        </svg>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* UI Zoom */}
      <div className="appearance-block">
        <div className="appearance-block-header">
          <h3 className="appearance-block-title">Zoom de interfaz</h3>
          <p className="appearance-block-desc">Ajusta el tamaño de toda la interfaz</p>
        </div>
        
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Nivel de zoom</span>
              <span className="settings-item-desc">
                {zoomLevel}% — {
                  zoomLevel < 75 ? 'Muy pequeño' :
                  zoomLevel < 90 ? 'Pequeño' :
                  zoomLevel < 110 ? 'Normal' :
                  zoomLevel < 125 ? 'Grande' :
                  'Muy grande'
                }
              </span>
            </div>
          </div>
          <div className="settings-item" style={{ paddingTop: '8px', paddingBottom: '8px' }}>
            <div className="editor-slider-container">
              <span className="editor-slider-label">50%</span>
              <input
                type="range"
                min="50"
                max="200"
                step="5"
                value={zoomLevel}
                onChange={(e) => handleZoomChange(parseInt(e.target.value, 10))}
                className="editor-slider"
                style={{
                  background: `linear-gradient(to right, var(--tree-color) ${(zoomLevel - 50) / 1.5}%, var(--hover-bg) ${(zoomLevel - 50) / 1.5}%)`,
                }}
              />
              <span className="editor-slider-label">200%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Effects */}
      <div className="appearance-block">
        <div className="appearance-block-header">
          <h3 className="appearance-block-title">Efectos visuales</h3>
          <p className="appearance-block-desc">Degradados y animaciones</p>
        </div>
        
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Degradados de color</span>
              <span className="settings-item-desc">Fondos con gradientes suaves</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={gradientEnabled}
                onChange={(e) => {
                  setGradientEnabled(e.target.checked);
                  localStorage.setItem('gradient-enabled', String(e.target.checked));
                }}
              />
              <span className="settings-toggle-slider"></span>
            </label>
          </div>

          {gradientEnabled && (
            <>
              <div className="settings-item">
                <div className="settings-item-content">
                  <span className="settings-item-label">Animación</span>
                  <span className="settings-item-desc">Degradados en movimiento</span>
                </div>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={gradientAnimated}
                    onChange={(e) => {
                      setGradientAnimated(e.target.checked);
                      localStorage.setItem('gradient-animated', String(e.target.checked));
                    }}
                  />
                  <span className="settings-toggle-slider"></span>
                </label>
              </div>

              <div className="settings-item">
                <div className="settings-item-content">
                  <span className="settings-item-label">Estilo</span>
                  <span className="settings-item-desc">Dirección del degradado</span>
                </div>
                <div className="theme-dropdown" ref={el => dropdownRefs.current['gradientStyle'] = el}>
                  <button 
                    ref={el => triggerRefs.current['gradientStyle'] = el}
                    className="settings-select-inline"
                    onClick={() => toggleDropdown('gradientStyle')}
                  >
                    {gradientStyle === 'diagonal' && 'Diagonal'}
                    {gradientStyle === 'radial' && 'Radial'}
                    {gradientStyle === 'horizontal' && 'Horizontal'}
                    {gradientStyle === 'vertical' && 'Vertical'}
                    {gradientStyle === 'mesh' && 'Malla'}
                  </button>

                  {openDropdown === 'gradientStyle' && menuPositions['gradientStyle'] && (
                    <div 
                      className="context-menu"
                      style={{ 
                        position: 'fixed',
                        top: `${menuPositions['gradientStyle'].top}px`, 
                        left: `${menuPositions['gradientStyle'].left}px`, 
                        width: `${menuPositions['gradientStyle'].width}px` 
                      }}
                    >
                      {[
                        { value: 'diagonal', label: 'Diagonal' },
                        { value: 'radial', label: 'Radial' },
                        { value: 'horizontal', label: 'Horizontal' },
                        { value: 'vertical', label: 'Vertical' },
                        { value: 'mesh', label: 'Malla' }
                      ].map(option => (
                        <div
                          key={option.value}
                          className={`context-menu-item ${gradientStyle === option.value ? 'context-menu-item-active' : ''}`}
                          onClick={() => {
                            setGradientStyle(option.value);
                            localStorage.setItem('gradient-style', option.value);
                            setOpenDropdown(null);
                          }}
                        >
                          <span className="context-menu-label">{option.label}</span>
                          {gradientStyle === option.value && (
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="theme-check-icon">
                              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                            </svg>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Activity bar con estilo rueda</span>
              <span className="settings-item-desc">Modo experimental con zoom y scroll</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={wheelEnabled}
                onChange={(e) => {
                  setWheelEnabled(e.target.checked);
                  layoutService.setActivityBarWheelEnabled(e.target.checked);
                }}
              />
              <span className="settings-toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AppearanceSection;
