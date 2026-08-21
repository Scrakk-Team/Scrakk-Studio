import { useState, useEffect } from 'react';
import { workspaceTrustService } from '../../../services/workspaceTrust';
import type { WorkspaceTrustConfig } from '../../../services/workspaceTrust';
import './SectionStyles.css';

function SecuritySection() {
  const [config, setConfig] = useState<WorkspaceTrustConfig>(workspaceTrustService.getConfig());
  const [currentWorkspace] = useState<string>(localStorage.getItem('rootPath') || '');
  const [isTrusted, setIsTrusted] = useState<boolean>(workspaceTrustService.getCurrentTrustState());

  useEffect(() => {
    const unsub = workspaceTrustService.subscribe(() => {
      setConfig(workspaceTrustService.getConfig());
      setIsTrusted(workspaceTrustService.getCurrentTrustState());
    });
    return unsub;
  }, []);

  const handleTrustMode = (mode: 'ask' | 'trustAll' | 'restrictAll') => {
    workspaceTrustService.setTrustMode(mode);
  };

  const handleTrustCurrent = () => {
    if (currentWorkspace) {
      workspaceTrustService.trustWorkspace(currentWorkspace);
    }
  };

  const handleDontTrustCurrent = () => {
    if (currentWorkspace) {
      workspaceTrustService.dontTrustWorkspace(currentWorkspace);
    }
  };

  const handleRemoveFolder = (folder: string, type: 'trusted' | 'untrusted') => {
    workspaceTrustService.removeWorkspace(folder);
  };

  return (
    <div className="security-section">
      {/* Current Workspace */}
      {currentWorkspace && (
        <div className="security-block">
          <div className="security-block-header">
            <h3 className="security-block-title">Workspace Actual</h3>
            <p className="security-block-desc">{currentWorkspace}</p>
          </div>
          
          <div className="settings-list">
            <div className="settings-item">
              <div className="settings-item-content">
                <span className="settings-item-label">Estado</span>
                <span className="settings-item-desc" style={{ 
                  color: isTrusted ? 'var(--success-color)' : 'var(--warning-color)',
                  fontWeight: 500
                }}>
                  {isTrusted ? 'Confiable' : 'Restringido'}
                </span>
              </div>
              {!isTrusted ? (
                <button className="security-btn security-btn-trust" onClick={handleTrustCurrent}>
                  Confiar
                </button>
              ) : (
                <button className="security-btn security-btn-untrust" onClick={handleDontTrustCurrent}>
                  No confiar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Trust Mode */}
      <div className="security-block">
        <div className="security-block-header">
          <h3 className="security-block-title">Modo de Confianza</h3>
          <p className="security-block-desc">Controla cómo se manejan los workspaces nuevos</p>
        </div>

        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Preguntar siempre</span>
              <span className="settings-item-desc">Mostrar diálogo al abrir workspaces nuevos</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={config.trustMode === 'ask'}
                onChange={() => handleTrustMode('ask')}
              />
              <span className="settings-toggle-slider"></span>
            </label>
          </div>

          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Confiar en todos</span>
              <span className="settings-item-desc">Todos los workspaces son confiables automáticamente</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={config.trustMode === 'trustAll'}
                onChange={() => handleTrustMode('trustAll')}
              />
              <span className="settings-toggle-slider"></span>
            </label>
          </div>

          <div className="settings-item">
            <div className="settings-item-content">
              <span className="settings-item-label">Restringir todos</span>
              <span className="settings-item-desc">Todos los workspaces están en modo restringido</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={config.trustMode === 'restrictAll'}
                onChange={() => handleTrustMode('restrictAll')}
              />
              <span className="settings-toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      {/* Trusted Folders */}
      {config.trustedFolders.length > 0 && (
        <div className="security-block">
          <div className="security-block-header">
            <h3 className="security-block-title">Carpetas Confiables</h3>
            <p className="security-block-desc">{config.trustedFolders.length} carpeta(s) configurada(s)</p>
          </div>
          
          <div className="settings-list">
            {config.trustedFolders.map((folder) => (
              <div key={folder} className="settings-item">
                <div className="settings-item-content">
                  <span className="settings-item-label security-folder-path">{folder}</span>
                </div>
                <button 
                  className="security-btn security-btn-remove"
                  onClick={() => handleRemoveFolder(folder, 'trusted')}
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Untrusted Folders */}
      {config.untrustedFolders.length > 0 && (
        <div className="security-block">
          <div className="security-block-header">
            <h3 className="security-block-title">Carpetas No Confiables</h3>
            <p className="security-block-desc">{config.untrustedFolders.length} carpeta(s) configurada(s)</p>
          </div>
          
          <div className="settings-list">
            {config.untrustedFolders.map((folder) => (
              <div key={folder} className="settings-item">
                <div className="settings-item-content">
                  <span className="settings-item-label security-folder-path">{folder}</span>
                </div>
                <button 
                  className="security-btn security-btn-remove"
                  onClick={() => handleRemoveFolder(folder, 'untrusted')}
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Restrictions Info */}
      <div className="security-block">
        <div className="security-block-header">
          <h3 className="security-block-title">Funcionalidades Restringidas</h3>
          <p className="security-block-desc">En modo restringido, las siguientes funcionalidades están deshabilitadas</p>
        </div>
        
        <div className="security-restrictions">
          <div className="security-restriction-item">Terminal integrada</div>
          <div className="security-restriction-item">Ejecución y depuración de código</div>
          <div className="security-restriction-item">Herramientas de IA que ejecutan comandos</div>
          <div className="security-restriction-item">Operaciones de Git (commits, push, pull)</div>
          <div className="security-restriction-item">Configuraciones del workspace (.vscode/settings.json)</div>
        </div>
      </div>
    </div>
  );
}

export default SecuritySection;
