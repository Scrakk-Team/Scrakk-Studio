import { useState, useEffect, useRef } from 'react';
import { layoutService } from '../../../services/layout';
import type { ComponentId, Position } from '../../../services/layout';
import './SectionStyles.css';

const COMPONENT_LABELS: Record<ComponentId, string> = {
  activityBar: 'Barra de actividad',
  statusBar: 'Barra de estado',
  sidePanel: 'Panel lateral',
  terminal: 'Terminal',
  chat: 'Panel de chat',
  panelButtons: 'Botones de paneles',
};

const COMPONENT_HINTS: Record<ComponentId, string> = {
  activityBar: 'Navegación principal con acceso a explorador, búsqueda y extensiones',
  statusBar: 'Información de estado del editor y proyecto',
  sidePanel: 'Panel con explorador de archivos, búsqueda y otras herramientas',
  terminal: 'Terminal integrada para ejecutar comandos',
  chat: 'Panel de chat con IA para asistencia de código',
  panelButtons: 'Botones para alternar paneles',
};

const POSITION_LABELS: Record<Position, string> = {
  top: 'Superior',
  bottom: 'Inferior',
  left: 'Izquierda',
  right: 'Derecha',
};

const COMPONENT_POSITIONS: Record<ComponentId, Position[]> = {
  activityBar: ['left', 'right'],
  statusBar: ['top', 'bottom'],
  sidePanel: ['left', 'right'],
  terminal: ['bottom'],
  chat: ['left', 'right'],
  panelButtons: ['top', 'bottom'],
};

function LayoutSection() {
  const [config, setConfig] = useState(layoutService.getConfig());
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [menuPositions, setMenuPositions] = useState<Record<string, { top: number; left: number; width: number }>>({});
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const unsub = layoutService.subscribe(() => {
      setConfig(layoutService.getConfig());
    });
    return unsub;
  }, []);

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

  const handleToggleComponent = (id: ComponentId) => {
    layoutService.setComponentEnabled(id, !config.components[id].enabled);
  };

  const handlePositionChange = (id: ComponentId, position: Position) => {
    layoutService.setComponentPosition(id, position);
    setOpenDropdown(null);
  };

  const handlePanelButtonsLocation = (location: 'titlebar' | 'statusbar') => {
    layoutService.setPanelButtonsLocation(location);
    setOpenDropdown(null);
  };

  const handleReset = () => {
    layoutService.resetToDefault();
  };

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

  return (
    <div className="layout-section">
      {/* Componentes principales */}
      <div className="layout-block">
        <div className="layout-block-header">
          <h3 className="layout-block-title">Componentes</h3>
          <p className="layout-block-desc">Controla la visibilidad y posición de los componentes principales</p>
        </div>
        
        <div className="settings-list">
        {(Object.keys(COMPONENT_LABELS) as ComponentId[])
          .filter(id => id !== 'panelButtons')
          .map(id => (
          <div key={id} className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">{COMPONENT_LABELS[id]}</span>
              <span className="settings-item-desc">{COMPONENT_HINTS[id]}</span>
            </div>
            <div className="settings-item-controls">
              {COMPONENT_POSITIONS[id].length > 1 && (
                <div className="theme-dropdown" ref={el => dropdownRefs.current[`pos-${id}`] = el}>
                  <button 
                    ref={el => triggerRefs.current[`pos-${id}`] = el}
                    className="settings-select-inline"
                    onClick={() => toggleDropdown(`pos-${id}`)}
                    disabled={!config.components[id].enabled}
                  >
                    <span>{POSITION_LABELS[config.components[id].position]}</span>
                  </button>

                  {openDropdown === `pos-${id}` && menuPositions[`pos-${id}`] && (
                    <div 
                      className="context-menu"
                      style={{ 
                        position: 'fixed',
                        top: `${menuPositions[`pos-${id}`].top}px`, 
                        left: `${menuPositions[`pos-${id}`].left}px`, 
                        width: `${menuPositions[`pos-${id}`].width}px` 
                      }}
                    >
                      {COMPONENT_POSITIONS[id].map(pos => (
                        <div
                          key={pos}
                          className={`context-menu-item ${config.components[id].position === pos ? 'context-menu-item-active' : ''}`}
                          onClick={() => handlePositionChange(id, pos)}
                        >
                          <span className="context-menu-label">{POSITION_LABELS[pos]}</span>
                          {config.components[id].position === pos && (
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="theme-check-icon">
                              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                            </svg>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={config.components[id].enabled}
                  onChange={() => handleToggleComponent(id)}
                />
                <span className="settings-toggle-slider"></span>
              </label>
            </div>
          </div>
        ))}
        </div>
      </div>

      {/* Botones de paneles */}
      <div className="layout-block">
        <div className="layout-block-header">
          <h3 className="layout-block-title">Botones de paneles</h3>
          <p className="layout-block-desc">Controla dónde se muestran los botones para alternar paneles</p>
        </div>
        
        <div className="settings-list">
        <div className="settings-item">
          <div className="settings-item-content">
            <span className="settings-item-label">Ubicación</span>
            <span className="settings-item-desc">Dónde se muestran los botones de paneles</span>
          </div>
          <div className="theme-dropdown" ref={el => dropdownRefs.current['panelButtons'] = el}>
            <button 
              ref={el => triggerRefs.current['panelButtons'] = el}
              className="settings-select-inline"
              onClick={() => toggleDropdown('panelButtons')}
            >
              <span>{config.panelButtonsLocation === 'titlebar' ? 'Barra de título' : 'Barra de estado'}</span>
            </button>

            {openDropdown === 'panelButtons' && menuPositions['panelButtons'] && (
              <div 
                className="context-menu"
                style={{ 
                  position: 'fixed',
                  top: `${menuPositions['panelButtons'].top}px`, 
                  left: `${menuPositions['panelButtons'].left}px`, 
                  width: `${menuPositions['panelButtons'].width}px` 
                }}
              >
                <div
                  className={`context-menu-item ${config.panelButtonsLocation === 'titlebar' ? 'context-menu-item-active' : ''}`}
                  onClick={() => handlePanelButtonsLocation('titlebar')}
                >
                  <span className="context-menu-label">Barra de título</span>
                  {config.panelButtonsLocation === 'titlebar' && (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="theme-check-icon">
                      <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                    </svg>
                  )}
                </div>
                <div
                  className={`context-menu-item ${config.panelButtonsLocation === 'statusbar' ? 'context-menu-item-active' : ''}`}
                  onClick={() => handlePanelButtonsLocation('statusbar')}
                >
                  <span className="context-menu-label">Barra de estado</span>
                  {config.panelButtonsLocation === 'statusbar' && (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="theme-check-icon">
                      <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                    </svg>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {config.panelButtons.map(btn => (
          <div key={btn.id} className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">{btn.label}</span>
              <span className="settings-item-desc">Mostrar u ocultar este botón en la interfaz</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={btn.visible}
                onChange={() => layoutService.setPanelButtonVisible(btn.id, !btn.visible)}
              />
              <span className="settings-toggle-slider"></span>
            </label>
          </div>
        ))}
        </div>
      </div>

      {/* Barra de comandos */}
      <div className="layout-block">
        <div className="layout-block-header">
          <h3 className="layout-block-title">Barra de comandos</h3>
          <p className="layout-block-desc">Controla la ubicación de la barra de búsqueda y comandos</p>
        </div>
        
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Ubicación</span>
              <span className="settings-item-desc">Dónde se muestra la barra de comandos principal</span>
            </div>
            <div className="theme-dropdown" ref={el => dropdownRefs.current['commandBarLocation'] = el}>
              <button 
                ref={el => triggerRefs.current['commandBarLocation'] = el}
                className="settings-select-inline"
                onClick={() => toggleDropdown('commandBarLocation')}
              >
                <span>{config.commandBarLocation === 'titlebar' ? 'Barra de título' : 'Barra de estado'}</span>
              </button>

              {openDropdown === 'commandBarLocation' && menuPositions['commandBarLocation'] && (
                <div 
                  className="context-menu"
                  style={{ 
                    position: 'fixed',
                    top: `${menuPositions['commandBarLocation'].top}px`, 
                    left: `${menuPositions['commandBarLocation'].left}px`, 
                    width: `${menuPositions['commandBarLocation'].width}px` 
                  }}
                >
                  <div
                    className={`context-menu-item ${config.commandBarLocation === 'titlebar' ? 'context-menu-item-active' : ''}`}
                    onClick={() => {
                      layoutService.setCommandBarLocation('titlebar');
                      setOpenDropdown(null);
                    }}
                  >
                    <span className="context-menu-label">Barra de título</span>
                    {config.commandBarLocation === 'titlebar' && (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="theme-check-icon">
                        <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                      </svg>
                    )}
                  </div>
                  <div
                    className={`context-menu-item ${config.commandBarLocation === 'statusbar' ? 'context-menu-item-active' : ''}`}
                    onClick={() => {
                      layoutService.setCommandBarLocation('statusbar');
                      setOpenDropdown(null);
                    }}
                  >
                    <span className="context-menu-label">Barra de estado</span>
                    {config.commandBarLocation === 'statusbar' && (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="theme-check-icon">
                        <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                      </svg>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ToolDock */}
      <div className="layout-block">
        <div className="layout-block-header">
          <h3 className="layout-block-title">ToolDock</h3>
          <p className="layout-block-desc">El ToolDock muestra herramientas flotantes en la parte inferior del panel</p>
        </div>
        
        <div className="settings-list">
        <div className="settings-item">
          <div className="settings-item-content">
            <span className="settings-item-label">Mostrar en todos los paneles</span>
            <span className="settings-item-desc">Los botones específicos de cada panel se integran automáticamente</span>
          </div>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={config.universalToolDock}
              onChange={() => layoutService.setUniversalToolDock(!config.universalToolDock)}
            />
            <span className="settings-toggle-slider"></span>
          </label>
        </div>
        
        <div className="settings-item">
          <div className="settings-item-content">
            <span className="settings-item-label">Herramientas de archivo en todos los paneles</span>
            <span className="settings-item-desc">Esquema, línea de tiempo, marcadores, comentarios e info</span>
          </div>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={config.showFileToolsEverywhere}
              onChange={() => layoutService.setShowFileToolsEverywhere(!config.showFileToolsEverywhere)}
            />
            <span className="settings-toggle-slider"></span>
          </label>
        </div>
        
        <div className="settings-item">
          <div className="settings-item-content">
            <span className="settings-item-label">Mostrar Spotify en todos los paneles</span>
            <span className="settings-item-desc">El botón y panel de Spotify estarán disponibles en todos los paneles</span>
          </div>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={config.showSpotifyEverywhere}
              onChange={() => layoutService.setShowSpotifyEverywhere(!config.showSpotifyEverywhere)}
            />
            <span className="settings-toggle-slider"></span>
          </label>
        </div>

        <div className="settings-item">
          <div className="settings-item-content">
            <span className="settings-item-label">Orientación</span>
            <span className="settings-item-desc">Horizontal (abajo) o vertical (lateral)</span>
          </div>
          <div className="theme-dropdown" ref={el => dropdownRefs.current['toolDockOrientation'] = el}>
            <button 
              ref={el => triggerRefs.current['toolDockOrientation'] = el}
              className="settings-select-inline"
              onClick={() => toggleDropdown('toolDockOrientation')}
            >
              <span>{config.toolDockOrientation === 'horizontal' ? 'Horizontal' : 'Vertical'}</span>
            </button>

            {openDropdown === 'toolDockOrientation' && menuPositions['toolDockOrientation'] && (
              <div 
                className="context-menu"
                style={{ 
                  position: 'fixed',
                  top: `${menuPositions['toolDockOrientation'].top}px`, 
                  left: `${menuPositions['toolDockOrientation'].left}px`, 
                  width: `${menuPositions['toolDockOrientation'].width}px` 
                }}
              >
                <div
                  className={`context-menu-item ${config.toolDockOrientation === 'horizontal' ? 'context-menu-item-active' : ''}`}
                  onClick={() => {
                    layoutService.setToolDockOrientation('horizontal');
                    setOpenDropdown(null);
                  }}
                >
                  <span className="context-menu-label">Horizontal</span>
                  {config.toolDockOrientation === 'horizontal' && (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="theme-check-icon">
                      <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                    </svg>
                  )}
                </div>
                <div
                  className={`context-menu-item ${config.toolDockOrientation === 'vertical' ? 'context-menu-item-active' : ''}`}
                  onClick={() => {
                    layoutService.setToolDockOrientation('vertical');
                    setOpenDropdown(null);
                  }}
                >
                  <span className="context-menu-label">Vertical</span>
                  {config.toolDockOrientation === 'vertical' && (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="theme-check-icon">
                      <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                    </svg>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {config.toolDockOrientation === 'vertical' && (
          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Posición vertical</span>
              <span className="settings-item-desc">Lado donde aparece el ToolDock</span>
            </div>
            <div className="theme-dropdown" ref={el => dropdownRefs.current['toolDockSide'] = el}>
              <button 
                ref={el => triggerRefs.current['toolDockSide'] = el}
                className="settings-select-inline"
                onClick={() => toggleDropdown('toolDockSide')}
              >
                <span>{config.toolDockVerticalSide === 'left' ? 'Izquierda' : 'Derecha'}</span>
              </button>

              {openDropdown === 'toolDockSide' && menuPositions['toolDockSide'] && (
                <div 
                  className="context-menu"
                  style={{ 
                    position: 'fixed',
                    top: `${menuPositions['toolDockSide'].top}px`, 
                    left: `${menuPositions['toolDockSide'].left}px`, 
                    width: `${menuPositions['toolDockSide'].width}px` 
                  }}
                >
                  <div
                    className={`context-menu-item ${config.toolDockVerticalSide === 'left' ? 'context-menu-item-active' : ''}`}
                    onClick={() => {
                      layoutService.setToolDockVerticalSide('left');
                      setOpenDropdown(null);
                    }}
                  >
                    <span className="context-menu-label">Izquierda</span>
                    {config.toolDockVerticalSide === 'left' && (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="theme-check-icon">
                        <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                      </svg>
                    )}
                  </div>
                  <div
                    className={`context-menu-item ${config.toolDockVerticalSide === 'right' ? 'context-menu-item-active' : ''}`}
                    onClick={() => {
                      layoutService.setToolDockVerticalSide('right');
                      setOpenDropdown(null);
                    }}
                  >
                    <span className="context-menu-label">Derecha</span>
                    {config.toolDockVerticalSide === 'right' && (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="theme-check-icon">
                        <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                      </svg>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {config.toolDockOrientation === 'vertical' && (
          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Centrar menús verticalmente</span>
              <span className="settings-item-desc">Centrar los menús desplegables en el panel</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={config.toolDockMenusVerticalCenter}
                onChange={() => layoutService.setToolDockMenusVerticalCenter(!config.toolDockMenusVerticalCenter)}
              />
              <span className="settings-toggle-slider"></span>
            </label>
          </div>
        )}
        </div>
      </div>

      {/* Botones del ToolDock */}
      <div className="layout-block">
        <div className="layout-block-header">
          <h3 className="layout-block-title">Botones del ToolDock</h3>
          <p className="layout-block-desc">Selecciona qué botones deseas mantener visibles en la barra del ToolDock</p>
        </div>
        
        <div className="settings-list" style={{ maxHeight: '260px', overflowY: 'auto', overflowX: 'hidden', borderRadius: '10px', paddingRight: '6px' }}>
          {[
            { id: 'files', label: 'Explorador', desc: 'Mostrar el botón de explorador de archivos' },
            { id: 'search', label: 'Buscar', desc: 'Mostrar el botón de búsqueda global' },
            { id: 'sourceControl', label: 'Control de versiones', desc: 'Mostrar el botón de control de versiones (Git)' },
            { id: 'browser', label: 'Navegador', desc: 'Mostrar el botón de navegador web integrado' },
            { id: 'notes', label: 'Notas', desc: 'Mostrar el botón de notas rápidas' },
            { id: 'debugger', label: 'Ejecutar y depurar', desc: 'Mostrar el botón de ejecución y depuración nativa' },
            { id: 'devtools', label: 'DevTools', desc: 'Mostrar el botón de herramientas de desarrollador' },
            { id: 'spotify', label: 'Spotify', desc: 'Mostrar el botón para abrir el panel de Spotify' },
            { id: 'youtubemusic', label: 'YouTube Music', desc: 'Mostrar el botón de YouTube Music' },
            { id: 'outline', label: 'Esquema (Outline)', desc: 'Mostrar el botón de esquema del archivo' },
            { id: 'timeline', label: 'Línea de tiempo', desc: 'Mostrar el botón de la línea de tiempo de cambios' },
            { id: 'markers', label: 'Marcadores', desc: 'Mostrar el botón de marcadores del editor' },
            { id: 'comments', label: 'Comentarios', desc: 'Mostrar el botón de comentarios del archivo' },
            { id: 'info', label: 'Información de archivo', desc: 'Mostrar el botón con metadatos del archivo' }
          ].map(btn => {
            const disabledList = layoutService.getDisabledToolDockButtons();
            const isVisible = !disabledList.includes(btn.id);
            return (
              <div 
                key={btn.id}
                className={`settings-item settings-item-selectable${isVisible ? ' settings-item-selected' : ''}`}
                onClick={() => layoutService.toggleToolDockButtonDisabled(btn.id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="settings-item-content">
                  <span className="settings-item-label">{btn.label}</span>
                  <span className="settings-item-desc">{btn.desc}</span>
                </div>
                <div className={`settings-engine-check${isVisible ? ' checked' : ''}`}>
                  {isVisible && (
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                    </svg>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ActivityBar */}
      <div className="layout-block">
        <div className="layout-block-header">
          <h3 className="layout-block-title">Barra de Actividad</h3>
          <p className="layout-block-desc">Configuración de la barra de navegación principal</p>
        </div>
        
        <div className="settings-list">
          <div className="settings-item settings-item-selectable"
            onClick={() => layoutService.setActivityBarCentered(!config.activityBarCentered)}
            style={{ cursor: 'pointer' }}
          >
            <div className="settings-item-content">
              <span className="settings-item-label">Centrar botones</span>
              <span className="settings-item-desc">Centrar botones verticalmente en la barra principal</span>
            </div>
            <div className={`settings-engine-check${config.activityBarCentered ? ' checked' : ''}`}>
              {config.activityBarCentered && (
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                </svg>
              )}
            </div>
          </div>
          <div className="settings-item settings-item-selectable"
            onClick={() => layoutService.setSecondaryActivityBarCentered(!config.secondaryActivityBarCentered)}
            style={{ cursor: 'pointer' }}
          >
            <div className="settings-item-content">
              <span className="settings-item-label">Centrar barra secundaria</span>
              <span className="settings-item-desc">Centrar botones verticalmente en la barra secundaria</span>
            </div>
            <div className={`settings-engine-check${config.secondaryActivityBarCentered ? ' checked' : ''}`}>
              {config.secondaryActivityBarCentered && (
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                </svg>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Secondary ActivityBar (siempre a la derecha) */}
      <div className="layout-block">
        <div className="layout-block-header">
          <h3 className="layout-block-title">Barra secundaria</h3>
          <p className="layout-block-desc">ActivityBar auxiliar fija en el lado derecho (estilo Android Studio). Arrastrá items entre barras para redistribuirlos.</p>
        </div>

        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Mostrar barra secundaria</span>
              <span className="settings-item-desc">Toggle on/off de la barra auxiliar del lado derecho</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={config.secondaryActivityBarEnabled !== false}
                onChange={() => layoutService.setSecondaryActivityBarEnabled(!(config.secondaryActivityBarEnabled !== false))}
              />
              <span className="settings-toggle-slider"></span>
            </label>
          </div>

          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Invertir items entre barras</span>
              <span className="settings-item-desc">Mueve todos los items de la barra principal a la secundaria y viceversa</span>
            </div>
            <button
              type="button"
              className="settings-btn settings-btn-secondary"
              onClick={() => {
                if (confirm('¿Invertir los items entre la barra principal y la secundaria?')) {
                  layoutService.swapActivityBars();
                }
              }}
            >
              Invertir
            </button>
          </div>
        </div>
      </div>

      {/* Reset button */}
      <div className="layout-block">
        <button className="layout-reset-btn" onClick={handleReset}>
          Restablecer diseño predeterminado
        </button>
      </div>
    </div>
  );
}

export default LayoutSection;
