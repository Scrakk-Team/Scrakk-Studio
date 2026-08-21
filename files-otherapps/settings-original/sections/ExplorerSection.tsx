import { useState } from 'react';
import './SectionStyles.css';

function ExplorerSection() {
  const [accordionMode, setAccordionMode] = useState(() => {
    return localStorage.getItem('explorerAccordion') === 'true';
  });

  return (
    <div className="explorer-section">
      <div className="explorer-block">
        <div className="explorer-block-header">
          <h3 className="explorer-block-title">Comportamiento de carpetas</h3>
          <p className="explorer-block-desc">Controla cómo se expanden y colapsan las carpetas en el explorador</p>
        </div>
        
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Modo acordeón</span>
              <span className="settings-item-desc">Al expandir una carpeta, las carpetas hermanas al mismo nivel se cierran automáticamente</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={accordionMode}
                onChange={(e) => {
                  setAccordionMode(e.target.checked);
                  localStorage.setItem('explorerAccordion', String(e.target.checked));
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

export default ExplorerSection;
