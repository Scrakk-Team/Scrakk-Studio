import './SectionStyles.css';

interface Shortcut {
  action: string;
  keys: string[];
  category: string;
}

const shortcuts: Shortcut[] = [
  { action: 'Guardar archivo', keys: ['Ctrl', 'S'], category: 'Archivos' },
  { action: 'Abrir archivo', keys: ['Ctrl', 'O'], category: 'Archivos' },
  { action: 'Cerrar tab', keys: ['Ctrl', 'W'], category: 'Archivos' },
  { action: 'Nueva terminal', keys: ['Ctrl', '`'], category: 'Terminal' },
  { action: 'Buscar en archivos', keys: ['Ctrl', 'Shift', 'F'], category: 'Búsqueda' },
  { action: 'Ir a línea', keys: ['Ctrl', 'G'], category: 'Navegación' },
  { action: 'Paleta de comandos', keys: ['Ctrl', 'Shift', 'P'], category: 'General' },
  { action: 'Buscar y reemplazar', keys: ['Ctrl', 'H'], category: 'Búsqueda' },
  { action: 'Comentar línea', keys: ['Ctrl', '/'], category: 'Edición' },
  { action: 'Duplicar línea', keys: ['Alt', 'Shift', '↓'], category: 'Edición' },
  { action: 'Mover línea arriba', keys: ['Alt', '↑'], category: 'Edición' },
  { action: 'Mover línea abajo', keys: ['Alt', '↓'], category: 'Edición' },
];

function ShortcutsSection() {
  const categories = Array.from(new Set(shortcuts.map(s => s.category)));

  return (
    <div className="shortcuts-section">
      {categories.map(category => (
        <div key={category} className="shortcuts-block">
          <div className="shortcuts-block-header">
            <h3 className="shortcuts-block-title">{category}</h3>
            <p className="shortcuts-block-desc">Atajos de teclado para {category.toLowerCase()}</p>
          </div>
          
          <div className="shortcuts-list">
            {shortcuts
              .filter(s => s.category === category)
              .map((shortcut, index) => (
                <div key={index} className="shortcut-item">
                  <span className="shortcut-item-label">{shortcut.action}</span>
                  <div className="shortcut-item-keys">
                    {shortcut.keys.map((key, keyIndex) => (
                      <>
                        <span key={keyIndex} className="shortcut-key-badge">{key}</span>
                        {keyIndex < shortcut.keys.length - 1 && <span className="key-separator">+</span>}
                      </>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default ShortcutsSection;
