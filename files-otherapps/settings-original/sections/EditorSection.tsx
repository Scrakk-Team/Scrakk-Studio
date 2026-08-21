import { useState, useEffect } from 'react';
import './SectionStyles.css';

type EngineOption = {
  id: 'ste' | 'InnertaEngine' | 'monaco';
  label: string;
  desc: string;
};

const ENGINE_OPTIONS: EngineOption[] = [
  {
    id: 'InnertaEngine',
    label: 'InnertaEngine (nativo)',
    desc: 'Hole + surface nativo (ITE) — swapchain D3D11 listo para pintar; engine de texto por Innerta/ITE.',
  },
  {
    id: 'ste',
    label: 'Scrakk Text Engine (Web)',
    desc: 'Motor propio de Scrakk — renderizado en el navegador con el STE web.',
  },
  {
    id: 'monaco',
    label: 'Monaco Editor',
    desc: 'Motor de Microsoft VSCode — funcionalidades avanzadas de edición, IntelliSense y extensibilidad.',
  },
];

export default function EditorSection() {
  const [engine, setEngine] = useState<'ste' | 'InnertaEngine' | 'monaco'>(() => {
    const raw = localStorage.getItem('editorEngine');
    if (raw === 'ste-native' || raw === 'InnertaEngine') return 'InnertaEngine';
    if (raw === 'ste' || raw === 'monaco') return raw;
    return 'ste';
  });

  const [gpuAccel, setGpuAccel] = useState<boolean>(() => {
    return localStorage.getItem('steGpuAccel') !== 'false';
  });

  const handleEngineChange = (newEngine: 'ste' | 'InnertaEngine' | 'monaco') => {
    setEngine(newEngine);
    localStorage.setItem('editorEngine', newEngine);
    window.dispatchEvent(new CustomEvent('editor-engine-changed', {
      detail: { engine: newEngine }
    }));
  };

  const handleGpuToggle = (enabled: boolean) => {
    setGpuAccel(enabled);
    localStorage.setItem('steGpuAccel', String(enabled));
    const bridge = (window as any).ole?.ste;
    if (bridge?.setGpuEnabled) {
      bridge.setGpuEnabled(enabled);
    }
  };

  useEffect(() => {
    if (engine === 'InnertaEngine') {
      const bridge = (window as any).ole?.ste;
      if (bridge?.setGpuEnabled) {
        bridge.setGpuEnabled(gpuAccel);
      }
    }
  }, [engine]);

  return (
    <div className="editor-section">
      {/* Motor de renderizado */}
      <div className="editor-block">
        <div className="editor-block-header">
          <h3 className="editor-block-title">Motor de renderizado</h3>
          <p className="editor-block-desc">
            Elige qué motor se usa para editar código.
          </p>
        </div>

        <div className="settings-list">
          {ENGINE_OPTIONS.map((opt) => (
            <div
              key={opt.id}
              className={`settings-item settings-item-selectable${engine === opt.id ? ' settings-item-selected' : ''}`}
              onClick={() => handleEngineChange(opt.id)}
              style={{ cursor: 'pointer' }}
            >
              <div className="settings-item-content">
                <span className="settings-item-label">{opt.label}</span>
                <span className="settings-item-desc">{opt.desc}</span>
              </div>
              <div className={`settings-engine-check${engine === opt.id ? ' checked' : ''}`}>
                {engine === opt.id && (
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                  </svg>
                )}
              </div>
            </div>
          ))}
        </div>

        {engine === 'InnertaEngine' && (
          <div className="settings-list" style={{ marginTop: 8 }}>
            <div className="settings-item">
              <div className="settings-item-content">
                <span className="settings-item-label">Aceleración GPU</span>
                <span className="settings-item-desc">Renderiza con Direct3D 11 en vez de GDI (BitBlt)</span>
              </div>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={gpuAccel}
                  onChange={(e) => handleGpuToggle(e.target.checked)}
                />
                <span className="settings-toggle-slider"></span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
