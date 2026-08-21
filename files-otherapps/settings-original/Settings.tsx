import { useState, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import './Settings.css';
import { Extension, Code, ChevronRight } from '../Icons';
import ContextMenu from '../ContextMenu/ContextMenu';
import { useContextMenu } from '../../hooks/useContextMenu';
import { ProductIcon } from '../../services/compatibility/vscode/contributions/product-icon-themes';

// Lazy load sections for better performance - import directamente to avoid barrel file
const EditorSection = lazy(() => import('./sections/EditorSection'));
const AppearanceSection = lazy(() => import('./sections/AppearanceSection'));
const ExplorerSection = lazy(() => import('./sections/ExplorerSection'));
const LayoutSection = lazy(() => import('./sections/LayoutSection'));
const ChatSection = lazy(() => import('./sections/ChatSection'));
const ExtensionsSection = lazy(() => import('./sections/ExtensionsSection'));
const ShortcutsSection = lazy(() => import('./sections/ShortcutsSection'));
const SecuritySection = lazy(() => import('./sections/SecuritySection'));
const InfoSection = lazy(() => import('./sections/InfoSection'));
const ToolsSection = lazy(() => import('./sections/ToolsSection'));
const LspSection = lazy(() => import('./sections/LspSection'));
const ModesSection = lazy(() => import('./sections/ModesSection'));

type SettingsSection = 'editor' | 'appearance' | 'explorer' | 'layout' | 'chat' | 'extensions' | 'shortcuts' | 'security' | 'info' | 'tools' | 'lsp' | 'modes';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SectionItem {
  id: SettingsSection;
  label: string;
  icon: ReactNode;
  children?: SectionItem[];
}

function Settings({ isOpen, onClose }: SettingsProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('editor');
  const { contextMenu, hideContextMenu } = useContextMenu();

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const sectionGroups: { label: string; items: SectionItem[] }[] = [
    {
      label: 'EDITOR',
      items: [
        {
          id: 'editor',
          label: 'Editor',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4.75 19.25L9 18.25L18.2929 8.95711C18.6834 8.56658 18.6834 7.93342 18.2929 7.54289L16.4571 5.70711C16.0666 5.31658 15.4334 5.31658 15.0429 5.70711L5.75 15L4.75 19.25Z"/>
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.25 19.25H13.75"/>
            </svg>
          ),
          children: [
            {
              id: 'lsp',
              label: 'Language Servers',
              icon: <Code size={14} />,
            }
          ]
        },
        {
          id: 'appearance',
          label: 'Apariencia',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5.32 5.75a3 3 0 0 1 3-3h7.36a3 3 0 0 1 3 3V12H5.32zM18.68 12H5.32v2.611a1.5 1.5 0 0 0 1.5 1.5h3.38v3.34a1.799 1.799 0 0 0 3.598 0v-3.34h3.382a1.5 1.5 0 0 0 1.5-1.5zM15.5 2.75V6.5m-3-3.75v2.5"/>
            </svg>
          ),
          children: [
            {
              id: 'layout',
              label: 'Diseño',
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M2.75 8.75v8a3 3 0 0 0 3 3H10m-7.25-11v-1.5a3 3 0 0 1 3-3h12.5a3 3 0 0 1 3 3v1.5m-18.5 0H10m11.25 0v8a3 3 0 0 1-3 3H10m11.25-11H10m0 0v11"/>
                </svg>
              )
            }
          ]
        }
      ]
    },
    {
      label: 'WORKSPACE',
      items: [
        {
          id: 'explorer',
          label: 'Explorador',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5" d="M2.75 8.623v7.379a4 4 0 0 0 4 4h10.5a4 4 0 0 0 4-4v-5.69a4 4 0 0 0-4-4H12M2.75 8.624V6.998a3 3 0 0 1 3-3h2.9a2.5 2.5 0 0 1 1.768.732L12 6.313m-9.25 2.31h5.904a2.5 2.5 0 0 0 1.768-.732L12 6.313"/>
            </svg>
          )
        }
      ]
    },
    {
      label: 'FUNCIONALIDAD',
      items: [
        {
          id: 'chat',
          label: 'Chat',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 21.25a9.25 9.25 0 1 0-8.307-5.177c.108.22.144.468.089.706l-.816 3.536a.6.6 0 0 0 .72.72l3.535-.817a1.06 1.06 0 0 1 .706.09A9.2 9.2 0 0 0 12 21.25M7.97 9.886h8.06m-8.06 4.228h5.748"/>
            </svg>
          ),
          children: [
            {
              id: 'tools',
              label: 'Herramientas (Tools)',
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
              )
            },
            {
              id: 'modes',
              label: 'Modos',
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2l4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 1 3 9c0 5.591 3.824 10.29 9 11.622c5.176-1.332 9-6.03 9-11.622c0-1.042-.133-2.052-.382-3.016z"/>
                </svg>
              )
            }
          ]
        },
        {
          id: 'extensions',
          label: 'Extensiones',
          icon: <Extension size={18} />
        }
      ]
    },
    {
      label: 'SISTEMA',
      items: [
        {
          id: 'shortcuts',
          label: 'Atajos',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect width="18.5" height="13.5" x="2.75" y="5.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" rx="3"/>
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 15.38h8"/>
              <circle cx="7.5" cy="8.875" r="1" fill="currentColor"/>
              <circle cx="10.5" cy="8.875" r="1" fill="currentColor"/>
              <circle cx="13.5" cy="8.875" r="1" fill="currentColor"/>
              <circle cx="16.5" cy="8.875" r="1" fill="currentColor"/>
              <circle cx="7.5" cy="11.875" r="1" fill="currentColor"/>
              <circle cx="10.5" cy="11.875" r="1" fill="currentColor"/>
              <circle cx="13.5" cy="11.875" r="1" fill="currentColor"/>
              <circle cx="16.5" cy="11.875" r="1" fill="currentColor"/>
            </svg>
          )
        },
        {
          id: 'security',
          label: 'Seguridad',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
                <path d="M20.25 10.907V7.272c0-.829-.633-1.521-1.453-1.644c-.951-.142-2.18-.376-3.078-.722c-.907-.349-1.997-1.007-2.762-1.505a1.76 1.76 0 0 0-1.914 0c-.764.498-1.855 1.156-2.762 1.505c-.899.346-2.127.58-3.078.722c-.82.123-1.453.815-1.453 1.644v3.635a10.13 10.13 0 0 0 5.363 8.939l.23.123l1.962.946a1.6 1.6 0 0 0 1.39 0l1.961-.946l.23-.123a10.13 10.13 0 0 0 5.364-8.939"/>
                <path d="m15.509 10l-4.076 4.076a.6.6 0 0 1-.849 0l-2.093-2.09"/>
              </g>
            </svg>
          )
        }
      ]
    },
    {
      label: 'INFORMACIÓN',
      items: [
        {
          id: 'info',
          label: 'Información',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15.013 17.104c.126-.958.736-1.764 1.464-2.4a6.816 6.816 0 1 0-8.955 0c.729.636 1.34 1.442 1.465 2.4l.084.633l.233 1.774a2 2 0 0 0 1.983 1.739h1.426a2 2 0 0 0 1.983-1.739l.233-1.774zm-5.943.633h5.86"/>
            </svg>
          )
        },
      ]
    }
  ];

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    editor: true,
    appearance: true,
    chat: true,
  });

  const toggleSectionExpand = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedSections(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const getSectionInfo = () => {
    switch (activeSection) {
      case 'editor':
        return { title: 'Editor', description: 'Configura el motor de renderizado y opciones del editor' };
      case 'appearance': 
        return { title: 'Apariencia', description: 'Personaliza los colores y efectos visuales de la interfaz' };
      case 'lsp':
        return { title: 'Language Servers', description: 'Catálogo de servidores LSP y herramientas de instalación' };
      case 'explorer':
        return { title: 'Explorador', description: 'Configura el comportamiento del explorador de archivos' };
      case 'layout': 
        return { title: 'Diseño', description: 'Personaliza la disposición de los componentes de la interfaz' };
      case 'chat': 
        return { title: 'Chat', description: 'Configura los proveedores de IA y modelos de lenguaje' };
      case 'extensions':
        return { title: 'Extensiones', description: 'Gestiona las extensiones que amplían la funcionalidad de Scrakk' };
      case 'shortcuts': 
        return { title: 'Atajos de Teclado', description: 'Personaliza los atajos de teclado del editor' };
      case 'security': 
        return { title: 'Seguridad', description: 'Controla qué workspaces son confiables y qué funcionalidades están disponibles' };
      case 'info': 
        return { title: 'Información', description: 'Información sobre la aplicación y sus componentes' };
      case 'tools':
        return { title: 'Herramientas (Tools)', description: 'Activa/desactiva herramientas de IA y configura modos de aprobación' };
      case 'modes':
        return { title: 'Modos', description: 'Crea y gestiona modos de aprobación personalizados' };
    }
  };

  const sectionInfo = getSectionInfo();

  const renderContent = () => {
    switch (activeSection) {
      case 'editor':
        return <EditorSection />;
      case 'appearance':
        return <AppearanceSection />;
      case 'explorer':
        return <ExplorerSection />;
      case 'layout':
        return <LayoutSection />;
      case 'chat':
        return <ChatSection />;
      case 'extensions':
        return <ExtensionsSection />;
      case 'shortcuts':
        return <ShortcutsSection />;
      case 'security':
        return <SecuritySection />;
      case 'info':
        return <InfoSection />;
      case 'tools':
        return <ToolsSection />;
      case 'lsp':
        return <LspSection />;
      case 'modes':
        return <ModesSection />;
    }
  };

  const renderNavItem = (item: SectionItem, level = 0) => {
    const isSelected = activeSection === item.id;
    const hasChildren = !!item.children && item.children.length > 0;
    const isExpanded = expandedSections[item.id] !== false; // default to true

    return (
      <div key={item.id}>
        <div
          className={`settings-nav-item ${isSelected ? 'active' : ''} ${level > 0 ? 'child-item' : ''}`}
          onClick={() => {
            setActiveSection(item.id);
          }}
          style={{ 
            paddingLeft: `${8 + level * 8}px`, 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px',
            position: 'relative'
          }}
        >
          {level > 0 && Array.from({ length: level }).map((_, i) => (
            <div
              key={i}
              className="settings-indent-guide"
              style={{
                left: `${8 + i * 8 + 5}px`
              }}
            />
          ))}
          {hasChildren ? (
            <span 
              className="settings-chevron-container"
              onClick={(e) => {
                toggleSectionExpand(item.id, e);
              }}
            >
              <ChevronRight
                className="settings-chevron-icon"
                style={{
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                }}
              />
            </span>
          ) : (
            <span className="settings-chevron-container empty" />
          )}
          <ProductIcon statusBarId={item.id} size={level > 0 ? 14 : 18}>
            {item.icon}
          </ProductIcon>
          <span style={{ fontSize: '12px' }}>{item.label}</span>
        </div>
        {hasChildren && isExpanded && item.children!.map(child => renderNavItem(child, level + 1))}
      </div>
    );
  };

  return (
    <div 
      className={`settings-overlay ${isOpen ? 'settings-open' : 'settings-closed'}`} 
      onClick={handleOverlayClick} 
      onKeyDown={handleKeyDown} 
      tabIndex={-1}
      style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
    >
      <div className="settings-modal">
        <div className="settings-body">
          <div className="settings-sidebar">
            {sectionGroups.map((group) => (
              <div key={group.label} className="settings-sidebar-group">
                <div className="settings-sidebar-group-label">{group.label}</div>
                {group.items.map((section) => renderNavItem(section))}
              </div>
            ))}
          </div>
          <div className="settings-content custom-scrollbar">
            <div className="settings-content-header">
              <div className="settings-content-header-text">
                <span className="settings-content-title">{sectionInfo.title}</span>
                <span className="settings-content-separator">·</span>
                <span className="settings-content-description">{sectionInfo.description}</span>
              </div>
              <div className="settings-close" onClick={onClose}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
                </svg>
              </div>
            </div>
            <div className="settings-content-body custom-scrollbar">
              <Suspense fallback={<div style={{ padding: '20px', color: 'var(--text-muted)', fontSize: '12px' }}>Cargando...</div>}>
                {renderContent()}
              </Suspense>
            </div>
          </div>
        </div>
      </div>
      
      {/* Context Menu Global */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={hideContextMenu}
          minWidth={contextMenu.minWidth}
        />
      )}
    </div>
  );
}

export default Settings;
