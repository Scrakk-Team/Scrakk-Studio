import { useState, useEffect } from "react";
import "./WelcomePanel.css";

const SCRAKK_TIPS = [
  {
    title: "Usa Ctrl+P para búsqueda rápida",
    description:
      "Encuentra y abre cualquier archivo de tu proyecto al instante sin navegar por carpetas.",
  },
  {
    title: "Ctrl+Shift+P abre la paleta de comandos",
    description:
      "Accede a todas las funciones de Scrakk escribiendo lo que necesitas hacer.",
  },
  {
    title: "Arrastra archivos para dividir el editor",
    description:
      "Trabaja con múltiples archivos lado a lado arrastrando pestañas a los bordes.",
  },
  {
    title: "Ctrl+/ comenta código rápidamente",
    description:
      "Comenta o descomenta líneas de código sin escribir los símbolos manualmente.",
  },
  {
    title: "Selecciona texto y pregunta a la IA",
    description:
      "Selecciona código y haz clic derecho para explicar, refactorizar o mejorar con IA.",
  },
  {
    title: "Usa Ctrl+B para mostrar/ocultar el explorador",
    description:
      "Gana más espacio para tu código ocultando el panel lateral cuando no lo necesites.",
  },
  {
    title: "Ctrl+J muestra/oculta la terminal",
    description:
      "Ejecuta comandos sin salir del editor. Soporta múltiples terminales simultáneas.",
  },
  {
    title: "Haz clic derecho en carpetas para crear archivos",
    description:
      "Crea, renombra o elimina archivos y carpetas directamente desde el explorador.",
  },
];

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
    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % SCRAKK_TIPS.length);
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="10"
                height="10"
                viewBox="0 0 24 24"
              >
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M4.25 18.219c0-2.352 0-3.527.383-4.455a5.06 5.06 0 0 1 2.743-2.743c.928-.383 2.103-.383 4.455-.383h8.298m-4.236-4.857l3.796 3.796c.293.293.44.677.44 1.061m-4.236 4.857l3.796-3.796c.293-.293.44-.677.44-1.061"
                />
              </svg>
              Ctrl+N
            </span>
            <button
              className={`welcome-action-card ${hoveredAction === "new" ? "hovered" : ""}`}
              onClick={onNewFile}
              onMouseEnter={() => setHoveredAction("new")}
              onMouseLeave={() => setHoveredAction(null)}
            >
              <div className="action-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                  >
                    <g fill="none">
                      <path
                        fill="currentColor"
                        fillRule="evenodd"
                        d="M6.5 23a5.5 5.5 0 1 0 0-11a5.5 5.5 0 0 0 0 11m0-8.993a.5.5 0 0 1 .5.5V17h2.493a.5.5 0 1 1 0 1H7v2.493a.5.5 0 1 1-1 0V18H3.507a.5.5 0 0 1 0-1H6v-2.493a.5.5 0 0 1 .5-.5"
                        clipRule="evenodd"
                      />
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M4.292 10.25v-4a3.5 3.5 0 0 1 3.5-3.5h2.448a3.5 3.5 0 0 1 1.447.313M13.75 21.25h2.458a3.5 3.5 0 0 0 3.5-3.5v-5.53c0-.505-.109-.999-.314-1.45m-7.706-7.707a3.5 3.5 0 0 1 1.027.712l5.968 5.97c.3.3.54.647.711 1.026m-7.706-7.708V8.77a2 2 0 0 0 2 2h5.706"
                      />
                    </g>
                  </svg>
              </div>
              <div className="action-content">
                <span className="action-title">Nuevo archivo</span>
              </div>
            </button>
          </div>

          <div className="welcome-action-wrapper">
            <span className="action-badge">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="10"
                height="10"
                viewBox="0 0 24 24"
              >
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M4.25 18.219c0-2.352 0-3.527.383-4.455a5.06 5.06 0 0 1 2.743-2.743c.928-.383 2.103-.383 4.455-.383h8.298m-4.236-4.857l3.796 3.796c.293.293.44.677.44 1.061m-4.236 4.857l3.796-3.796c.293-.293.44-.677.44-1.061"
                />
              </svg>
              Ctrl+O
            </span>
            <button
              className={`welcome-action-card ${hoveredAction === "open" ? "hovered" : ""}`}
              onClick={onOpenFile}
              onMouseEnter={() => setHoveredAction("open")}
              onMouseLeave={() => setHoveredAction(null)}
            >
              <div className="action-icon">
                  <svg
                    width="24"
                    height="24"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                  >
                    <g
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinejoin="round"
                        d="M11.688 3.063a3.5 3.5 0 0 1 1.027.712l5.968 5.97c.3.3.54.647.711 1.026m-7.706-7.708a3.5 3.5 0 0 0-1.448-.313H7.792a3.5 3.5 0 0 0-3.5 3.5v11.5a3.5 3.5 0 0 0 3.5 3.5h8.416a3.5 3.5 0 0 0 3.5-3.5v-5.53c0-.505-.109-.999-.314-1.45m-7.706-7.707V8.77a2 2 0 0 0 2 2h5.706"
                      />
                      <path d="M7.29 13.77h9.42m-9.42 3.48h6.42" />
                    </g>
                  </svg>
              </div>
              <div className="action-content">
                <span className="action-title">Abrir archivo</span>
              </div>
            </button>
          </div>

          <div className="welcome-action-wrapper">
            <span className="action-badge">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="10"
                height="10"
                viewBox="0 0 24 24"
              >
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M4.25 18.219c0-2.352 0-3.527.383-4.455a5.06 5.06 0 0 1 2.743-2.743c.928-.383 2.103-.383 4.455-.383h8.298m-4.236-4.857l3.796 3.796c.293.293.44.677.44 1.061m-4.236 4.857l3.796-3.796c.293-.293.44-.677.44-1.061"
                />
              </svg>
              Ctrl+K O
            </span>
            <button
              className={`welcome-action-card ${hoveredAction === "folder" ? "hovered" : ""}`}
              onClick={onOpenFolder}
              onMouseEnter={() => setHoveredAction("folder")}
              onMouseLeave={() => setHoveredAction(null)}
            >
              <div className="action-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                  >
                    <path
                      fill="none"
                      stroke="currentColor"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M2.75 8.623v7.379a4 4 0 0 0 4 4h10.5a4 4 0 0 0 4-4v-5.69a4 4 0 0 0-4-4H12M2.75 8.624V6.998a3 3 0 0 1 3-3h2.9a2.5 2.5 0 0 1 1.768.732L12 6.313m-9.25 2.31h5.904a2.5 2.5 0 0 0 1.768-.732L12 6.313"
                    />
                  </svg>
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
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                    >
                      <path
                        fill="currentColor"
                        d="M4 20q-.825 0-1.412-.587T2 18V6q0-.825.588-1.412T4 4h6l2 2h8q.825 0 1.413.588T22 8v10q0 .825-.587 1.413T20 20z"
                      />
                    </svg>
                  </div>
                  <div className="recent-item-info">
                    <span className="recent-item-name">{workspace.name}</span>
                    <span className="recent-item-path">{workspace.path}</span>
                  </div>
                  {workspace.isTrusted && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      style={{ color: "var(--tree-color)", flexShrink: 0 }}
                    >
                      <path
                        fill="currentColor"
                        d="m10.6 13.8l-2.15-2.15q-.275-.275-.7-.275t-.7.275q-.275.275-.275.7t.275.7L9.9 15.9q.3.3.7.3t.7-.3l5.65-5.65q.275-.275.275-.7t-.275-.7q-.275-.275-.7-.275t-.7.275zM12 22q-3.475-.875-5.738-3.988T4 11.1V5l8-3l8 3v6.1q0 3.8-2.262 6.912T12 22"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Consejos de Scrakk */}
        <div className="welcome-tips-section">
          <div className="tips-header">
            <h2 className="tips-title">Consejos</h2>
            <div className="tips-indicators">
              {SCRAKK_TIPS.map((_, index) => (
                <button
                  key={index}
                  className={`tip-indicator ${index === currentTipIndex ? "active" : ""}`}
                  onClick={() => setCurrentTipIndex(index)}
                  aria-label={`Ir al consejo ${index + 1}`}
                />
              ))}
            </div>
          </div>

          <div className="tips-slider">
            <div
              className="tips-track"
              style={{ transform: `translateX(-${currentTipIndex * 100}%)` }}
            >
              {SCRAKK_TIPS.map((tip, index) => (
                <div key={index} className="tip-card">
                  <div className="tip-content">
                    <h3 className="tip-title">{tip.title}</h3>
                    <p className="tip-description">{tip.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

