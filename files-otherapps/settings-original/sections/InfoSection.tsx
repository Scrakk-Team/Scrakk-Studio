import './SectionStyles.css';
import {
  Folder,
  Search,
  Branch as SourceControl,
  Globe as Browser,
  Note as Notes,
  ColorPalette as Palete,
  Grid as Dashboard,
  Terminal,
  Layout,
  Save,
  History,
  Wrench as Tool,
  Settings
} from '../../Icons';

// Versión de Scrakk. Inyectada por Vite `define` desde package.json
// (dev/build web) y overriddeada por el host nativo vía
// window.__SCRAKK_VERSION__ (ole/src/config/owear_config.h).
// Fallback al literal por si el define no inyectó (tests, SSR).
declare const __SCRAKK_VERSION__: string | undefined;
const APP_VERSION: string =
  (typeof __SCRAKK_VERSION__ === 'string' && __SCRAKK_VERSION__) || '0.1.0';

function InfoSection() {
  return (
    <div className="editor-section">
      {/* Acerca de Scrakk */}
      <div className="editor-block">
        <div className="editor-block-header">
          <h3 className="editor-block-title">Acerca de Scrakk</h3>
          <p className="editor-block-desc">Información de la versión</p>
        </div>
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-content" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: 'var(--tree-color)', display: 'flex', alignItems: 'center' }}>
                <Settings size={18} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                <span className="settings-item-label">Scrakk</span>
                <span className="settings-item-desc" style={{ fontFamily: 'Consolas, monospace' }}>
                  v{APP_VERSION}
                </span>
              </div>
              <a
                href="https://github.com/scrakk/scrakk/blob/main/CHANGELOG.md"
                target="_blank"
                rel="noreferrer"
                className="settings-btn settings-btn-secondary"
                style={{ textDecoration: 'none' }}
              >
                Ver CHANGELOG
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Actividades */}
      <div className="editor-block">
        <div className="editor-block-header">
          <h3 className="editor-block-title">Barra de Actividades</h3>
          <p className="editor-block-desc">Paneles principales del editor</p>
        </div>
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-content" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: 'var(--tree-color)', display: 'flex', alignItems: 'center' }}>
                <Folder size={18} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="settings-item-label">Explorador</span>
                <span className="settings-item-desc">Navega por archivos y carpetas. Clic derecho para crear, renombrar o eliminar.</span>
              </div>
            </div>
          </div>
          <div className="settings-item">
            <div className="settings-item-content" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: 'var(--tree-color)', display: 'flex', alignItems: 'center' }}>
                <Search size={18} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="settings-item-label">Buscar</span>
                <span className="settings-item-desc">Busca texto en todos los archivos. Soporta regex y reemplazo.</span>
              </div>
            </div>
          </div>
          <div className="settings-item">
            <div className="settings-item-content" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: 'var(--tree-color)', display: 'flex', alignItems: 'center' }}>
                <SourceControl size={18} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="settings-item-label">Control de Versiones</span>
                <span className="settings-item-desc">Gestiona cambios con Git. Prepara archivos, crea commits y sincroniza.</span>
              </div>
            </div>
          </div>
          <div className="settings-item">
            <div className="settings-item-content" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: 'var(--tree-color)', display: 'flex', alignItems: 'center' }}>
                <Browser size={18} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="settings-item-label">Navegador</span>
                <span className="settings-item-desc">Navega por la web sin salir del editor. Útil para consultar documentación.</span>
              </div>
            </div>
          </div>
          <div className="settings-item">
            <div className="settings-item-content" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: 'var(--tree-color)', display: 'flex', alignItems: 'center' }}>
                <Notes size={18} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="settings-item-label">Notas</span>
                <span className="settings-item-desc">Toma notas rápidas con soporte Markdown. Perfecto para ideas y tareas.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Editor de Código */}
      <div className="editor-block">
        <div className="editor-block-header">
          <h3 className="editor-block-title">Editor de Código</h3>
          <p className="editor-block-desc">Características del motor STE</p>
        </div>
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-content" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: 'var(--tree-color)', display: 'flex', alignItems: 'center' }}>
                <Palete size={18} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="settings-item-label">Temas</span>
                <span className="settings-item-desc">Personaliza la apariencia desde Configuración → Apariencia. Más de 80 temas disponibles.</span>
              </div>
            </div>
          </div>
          <div className="settings-item">
            <div className="settings-item-content" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: 'var(--tree-color)', display: 'flex', alignItems: 'center' }}>
                <Dashboard size={18} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="settings-item-label">Minimap</span>
                <span className="settings-item-desc">Vista previa del código completo. Ajusta la calidad desde Configuración → Editor.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chat con IA */}
      <div className="editor-block">
        <div className="editor-block-header">
          <h3 className="editor-block-title">Chat con IA</h3>
          <p className="editor-block-desc">Asistente inteligente integrado</p>
        </div>
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-content" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: 'var(--tree-color)', display: 'flex', alignItems: 'center' }}>
                <History size={18} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="settings-item-label">Asistente de Código</span>
                <span className="settings-item-desc">Pregunta sobre código, genera funciones, explica errores. Soporta múltiples modelos de IA.</span>
              </div>
            </div>
          </div>
          <div className="settings-item">
            <div className="settings-item-content" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: 'var(--tree-color)', display: 'flex', alignItems: 'center' }}>
                <Tool size={18} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="settings-item-label">Herramientas</span>
                <span className="settings-item-desc">La IA puede leer archivos, buscar en el proyecto, ejecutar comandos y más.</span>
              </div>
            </div>
          </div>
          <div className="settings-item">
            <div className="settings-item-content" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: 'var(--tree-color)', display: 'flex', alignItems: 'center' }}>
                <Settings size={18} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="settings-item-label">Configuración</span>
                <span className="settings-item-desc">Configura tu API key en Configuración → Chat. Soporta Gemini, OpenAI, Claude y OpenRouter.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Terminal */}
      <div className="editor-block">
        <div className="editor-block-header">
          <h3 className="editor-block-title">Terminal</h3>
          <p className="editor-block-desc">Terminal integrada en el editor</p>
        </div>
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-content" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: 'var(--tree-color)', display: 'flex', alignItems: 'center' }}>
                <Terminal size={18} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="settings-item-label">Terminal Integrada</span>
                <span className="settings-item-desc">Ejecuta comandos sin salir del editor. Soporta múltiples terminales.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Herramientas Flotantes */}
      <div className="editor-block">
        <div className="editor-block-header">
          <h3 className="editor-block-title">Herramientas Flotantes</h3>
          <p className="editor-block-desc">Accesos rápidos en el explorador</p>
        </div>
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-content" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: 'var(--tree-color)', display: 'flex', alignItems: 'center' }}>
                <Layout size={18} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="settings-item-label">ToolDock</span>
                <span className="settings-item-desc">Accede rápidamente a esquema, línea de tiempo, marcadores y más desde el explorador.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Atajos de Teclado */}
      <div className="editor-block">
        <div className="editor-block-header">
          <h3 className="editor-block-title">Atajos de Teclado</h3>
          <p className="editor-block-desc">Atajos más utilizados</p>
        </div>
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Paleta de Comandos</span>
              <span className="settings-item-desc">Accede a todos los comandos disponibles</span>
            </div>
            <div className="shortcut-item-keys">
              <div className="shortcut-key-wrapper">
                <span className="shortcut-key-badge">Ctrl</span>
                <span className="key-separator">+</span>
                <span className="shortcut-key-badge">Shift</span>
                <span className="key-separator">+</span>
                <span className="shortcut-key-badge">P</span>
              </div>
            </div>
          </div>
          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Buscar Archivo</span>
              <span className="settings-item-desc">Busca y abre archivos rápidamente</span>
            </div>
            <div className="shortcut-item-keys">
              <div className="shortcut-key-wrapper">
                <span className="shortcut-key-badge">Ctrl</span>
                <span className="key-separator">+</span>
                <span className="shortcut-key-badge">P</span>
              </div>
            </div>
          </div>
          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Guardar Archivo</span>
              <span className="settings-item-desc">Guarda el archivo actual</span>
            </div>
            <div className="shortcut-item-keys">
              <div className="shortcut-key-wrapper">
                <span className="shortcut-key-badge">Ctrl</span>
                <span className="key-separator">+</span>
                <span className="shortcut-key-badge">S</span>
              </div>
            </div>
          </div>
          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Cerrar Pestaña</span>
              <span className="settings-item-desc">Cierra la pestaña activa</span>
            </div>
            <div className="shortcut-item-keys">
              <div className="shortcut-key-wrapper">
                <span className="shortcut-key-badge">Ctrl</span>
                <span className="key-separator">+</span>
                <span className="shortcut-key-badge">W</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InfoSection;
