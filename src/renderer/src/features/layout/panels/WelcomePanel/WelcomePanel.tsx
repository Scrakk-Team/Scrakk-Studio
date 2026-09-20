import { useState, useEffect } from "react";
import { ProductIcon } from '@services/productIcons/components'
import { FileTypeIcon } from '@features/explorer/components/FileTypeIcon'
import { loadTips } from "./tips";
import "./WelcomePanel.css";

/** Consejos desde `tips/*.json` (agregar JSON = agregar consejo). */
const TIPS = loadTips();

interface WelcomePanelProps {
  onNewFile?: () => void
  onOpenFile?: () => void
  onOpenFolder?: () => void
}

interface Workspace {
  path: string;
  name: string;
  isTrusted: boolean;
}

export function WelcomePanel({
  onNewFile = () => {},
  onOpenFile = () => {},
  onOpenFolder = () => {}
}: WelcomePanelProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [infoTab, setInfoTab] = useState<'tips' | 'ads'>('tips');
  useEffect(() => {

    // Cargar workspaces guardados
    const savedWorkspaces = localStorage.getItem("workspaces");

    if (savedWorkspaces) {
      try {
        const ws = JSON.parse(savedWorkspaces) as Workspace[];
        setWorkspaces(ws);
      } catch {
        setWorkspaces([]);
      }
    }
  }, []);

  // Auto-scroll del slider de consejos
  useEffect(() => {
    if (TIPS.length === 0) return
    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 5000); // Cambiar cada 5 segundos

    return () => clearInterval(interval);
  }, []);

  const handleOpenWorkspace = (path: string) => {
    localStorage.setItem("rootPath", path);
    window.location.reload();
  };

  return (
    <div className="welcome-page" data-component="welcomePage">
      <div className="welcome-container">
        {/* Grid de acciones principales */}
        <div className="welcome-actions-grid">
          <div className="welcome-action-wrapper">
            <span className="action-badge">
              <ProductIcon id="keyboard" size={10} aria-hidden="true" />
              Ctrl+N
            </span>
            <button
              className={`welcome-action-card ${hoveredAction === "new" ? "hovered" : ""}`}
              onClick={onNewFile}
              onMouseEnter={() => setHoveredAction("new")}
              onMouseLeave={() => setHoveredAction(null)}
            >
              <div className="action-icon">
                <ProductIcon id="file" size={24} aria-hidden="true" />
              </div>
              <div className="action-content">
                <span className="action-title">Nuevo archivo</span>
              </div>
            </button>
          </div>

          <div className="welcome-action-wrapper">
            <span className="action-badge">
              <ProductIcon id="keyboard" size={10} aria-hidden="true" />
              Ctrl+O
            </span>
            <button
              className={`welcome-action-card ${hoveredAction === "open" ? "hovered" : ""}`}
              onClick={onOpenFile}
              onMouseEnter={() => setHoveredAction("open")}
              onMouseLeave={() => setHoveredAction(null)}
            >
              <div className="action-icon">
                <ProductIcon id="new-file" size={24} aria-hidden="true" />
              </div>
              <div className="action-content">
                <span className="action-title">Abrir archivo</span>
              </div>
            </button>
          </div>

          <div className="welcome-action-wrapper">
            <span className="action-badge">
              <ProductIcon id="keyboard" size={10} aria-hidden="true" />
              Ctrl+K O
            </span>
            <button
              className={`welcome-action-card ${hoveredAction === "folder" ? "hovered" : ""}`}
              onClick={onOpenFolder}
              onMouseEnter={() => setHoveredAction("folder")}
              onMouseLeave={() => setHoveredAction(null)}
            >
              <div className="action-icon">
                <ProductIcon id="new-folder" size={24} aria-hidden="true" />
              </div>
              <div className="action-content">
                <span className="action-title">Abrir carpeta</span>
              </div>
            </button>
          </div>
        </div>

        {/* Workspaces guardados */}
        {workspaces.length > 0 && (
          <div className="welcome-recent-section">
            <div className="recent-header">
              <h2 className="recent-title">Workspaces</h2>
            </div>

            <div className="recent-list">
              {workspaces.map((workspace, index) => (
                <button
                  key={index}
                  className="recent-item"
                  onClick={() => handleOpenWorkspace(workspace.path)}
                >
                  <div className="recent-item-icon">
                    <FileTypeIcon
                      name={workspace.name}
                      isDirectory
                      isExpanded={false}
                      size={16}
                    />
                  </div>
                  <div className="recent-item-info">
                    <span className="recent-item-name">{workspace.name}</span>
                    <span className="recent-item-path">{workspace.path}</span>
                  </div>
                  {workspace.isTrusted && (
                    <ProductIcon
                      id="shield-check"
                      size={14}
                      aria-hidden="true"
                      style={{ color: "var(--tree-color)", flexShrink: 0 }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Info: split consejos | anuncios en un contenedor surface */}
        <div className="welcome-info-container">
          <div className="info-tabs" role="tablist" aria-label="Información">
            <button
              type="button"
              role="tab"
              aria-selected={infoTab === 'tips'}
              className={`info-tab ${infoTab === 'tips' ? "active" : ""}`}
              onClick={() => setInfoTab('tips')}
            >
              Consejos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={infoTab === 'ads'}
              className={`info-tab ${infoTab === 'ads' ? "active" : ""}`}
              onClick={() => setInfoTab('ads')}
            >
              Anuncios
            </button>
            {infoTab === 'tips' && TIPS.length > 0 && (
              <div className="tips-indicators">
                {TIPS.map((tip, index) => (
                  <button
                    key={tip.id}
                    className={`tip-indicator ${index === currentTipIndex ? "active" : ""}`}
                    onClick={() => setCurrentTipIndex(index)}
                    aria-label={`Ir al consejo ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          {infoTab === 'tips' && TIPS.length > 0 && (
          <div className="welcome-tips-section">
            <div className="tips-slider">
              <div
                className="tips-track"
                style={{ transform: `translateX(-${currentTipIndex * 100}%)` }}
              >
                {TIPS.map((tip) => (
                  <div key={tip.id} className="tip-card">
                    <div className="tip-content">
                      <h3 className="tip-title">{tip.title}</h3>
                      <p className="tip-description">{tip.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          )}

          {infoTab === 'ads' && (
          <div className="welcome-ads-section">
            <div className="ads-slider">
              <div className="ad-card">
                <div className="ad-content">
                  <h3 className="ad-title">Próximamente</h3>
                  <p className="ad-description">Aquí van a aparecer los anuncios.</p>
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

