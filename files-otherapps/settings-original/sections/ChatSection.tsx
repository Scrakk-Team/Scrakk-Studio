import { useState, useEffect, useRef } from 'react';
import './SectionStyles.css';
import { storage } from '../../../utils/storage';
import { CopyIcon, Search, Key, Box, Tag, Add, CloseIcon } from '../../Icons';

type MainProvider = 'gemini' | 'openai' | 'claude' | 'openrouter' | 'opencode-go';

interface OpenRouterModel {
  name: string;
  modelId: string;
  apiKey: string;
  supportsThinking?: boolean;
  thinkingEnabled?: boolean;
}

const OLLAMA_CLOUD_MODELS = [
  "gpt-oss:20b", "gpt-oss:120b", "deepseek-v3.2", "deepseek-v4-flash", "deepseek-v4-pro",
  "qwen3.5:397b", "qwen3-coder:480b", "qwen3-coder-next", "qwen3-next:80b",
  "gemma3:4b", "gemma3:12b", "gemma3:27b", "gemma4:31b",
  "llama3.1:8b", "llama3.1:70b", "llama3.1:405b",
  "mistral-large-3:675b", "ministral-3:3b", "ministral-3:8b", "ministral-3:14b",
  "glm-5", "glm-5.1", "kimi-k2.5", "kimi-k2.6", "kimi-k2:1t",
  "minimax-m2.1", "minimax-m2.5", "minimax-m2.7", "minimax-m3",
  "nemotron-3-nano:30b", "nemotron-3-super", "nemotron-3-ultra",
  "cogito-2.1:671b", "devstral-2:123b", "devstral-small-2:24b", "rnj-1:8b",
  "gemini-3-flash-preview", "qwen3-vl:235b", "qwen3-vl:235b-instruct",
];

const PROVIDERS: { id: MainProvider; label: string }[] = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'claude', label: 'Claude' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'opencode-go', label: 'OpenCode Go' },
];

function ChatSection() {
  const [setupType, setSetupType] = useState<'cloud' | 'local'>('cloud');
  const [selectedProvider, setSelectedProvider] = useState<MainProvider>('gemini');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [modelNameInput, setModelNameInput] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [curlInput, setCurlInput] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<Record<string, { top: number; left: number; width: number }>>({});
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [reuseApiKey, setReuseApiKey] = useState(false);
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://localhost:11434/api/chat');
  const [ollamaCloudKey, setOllamaCloudKey] = useState('');
  const [ollamaLocalModels, setOllamaLocalModels] = useState<string[]>([]);
  const [ollamaCloudModels, setOllamaCloudModels] = useState<string[]>([]);
  const [isConnectingOllama, setIsConnectingOllama] = useState(false);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState('');
  const [ollamaThinking, setOllamaThinking] = useState(false);
  const [opencodeGoKey, setOpencodeGoKey] = useState('');
  const [opencodeGoModels, setOpencodeGoModels] = useState<Array<{ id: string; name: string; supportsThinking?: boolean; thinkingEnabled?: boolean }>>([]);
  const [selectedOpencodeGoModel, setSelectedOpencodeGoModel] = useState('');
  const [opencodeGoThinking, setOpencodeGoThinking] = useState(false);
  const [isFetchingGoModels, setIsFetchingGoModels] = useState(false);

  useEffect(() => {
    const savedProvider = storage.get<string>('cloud_provider') || 'gemini';
    const savedModelType = storage.get<string>('model_type') || 'cloud';
    if (['gemini', 'openai', 'claude', 'openrouter', 'opencode-go'].includes(savedProvider)) {
      setSelectedProvider(savedProvider as MainProvider);
    }
    setSetupType(savedModelType === 'local' ? 'local' : 'cloud');
    setOpenRouterModels(storage.get<OpenRouterModel[]>('openrouter_models') || []);
    setOllamaCloudKey(storage.get<string>('ollama_api_key') || '');
    setOllamaThinking(storage.get<string>('ollama_thinking') === 'true');
    setOpencodeGoKey(storage.get<string>('opencode_go_api_key') || '');
    setOpencodeGoModels(storage.get<Array<{ id: string; name: string }>>('opencode_go_models') || []);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (openDropdown && dropdownRefs.current[openDropdown] && !dropdownRefs.current[openDropdown]?.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    if (openDropdown) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdown]);

  const toggleDropdown = (id: string) => {
    if (openDropdown === id) { setOpenDropdown(null); return; }
    const trigger = triggerRefs.current[id];
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      setMenuPos(prev => ({ ...prev, [id]: { top: rect.bottom + 4, left: rect.left, width: rect.width } }));
    }
    setOpenDropdown(id);
  };

  const handleSave = async () => {
    setError(''); setSuccessMessage('');
    if (setupType === 'cloud') {
      if (!apiKeyInput.trim()) { setError('Ingresa una API key'); return; }
      if (selectedProvider === 'openrouter') {
        if (!modelNameInput.trim()) { setError('Ingresa el ID del modelo'); return; }
        if (!displayNameInput.trim()) { setError('Ingresa un nombre para el modelo'); return; }
        if (openRouterModels.some(m => m.name === displayNameInput.trim())) { setError('Ya existe un modelo con ese nombre'); return; }
      }
      setIsLoading(true);
      try {
        if (selectedProvider === 'openrouter') {
          const newModel: OpenRouterModel = { name: displayNameInput.trim(), modelId: modelNameInput.trim(), apiKey: apiKeyInput.trim() };
          const updated = [...openRouterModels, newModel];
          storage.set('openrouter_models', updated);
          setOpenRouterModels(updated);
          window.dispatchEvent(new CustomEvent('openrouter-models-updated'));

          // Test thinking in background
          setIsLoading(true);
          testModelThinking(newModel.apiKey, newModel.modelId).then((supportsThinking) => {
            const idx = updated.length - 1;
            const refreshed = storage.get<OpenRouterModel[]>('openrouter_models') || [];
            if (idx < refreshed.length) {
              refreshed[idx] = { ...refreshed[idx], supportsThinking, thinkingEnabled: supportsThinking };
              storage.set('openrouter_models', refreshed);
              setOpenRouterModels(refreshed);
              window.dispatchEvent(new CustomEvent('openrouter-models-updated'));
            }
            setIsLoading(false);
          }).catch(() => setIsLoading(false));
        } else if (selectedProvider === 'opencode-go') {
          storage.set('opencode_go_api_key', apiKeyInput);
          storage.set('model_type', 'cloud');
          storage.set('cloud_provider', 'opencode-go');
          window.dispatchEvent(new CustomEvent('settings-chat-updated', { detail: { provider: 'opencode-go', apiKey: apiKeyInput, isLocal: false } }));
        } else {
          storage.set(`${selectedProvider}_api_key`, apiKeyInput);
          storage.set('model_type', 'cloud');
          storage.set('cloud_provider', selectedProvider);
          window.dispatchEvent(new CustomEvent('settings-chat-updated', { detail: { provider: selectedProvider, apiKey: apiKeyInput, isLocal: false } }));
        }
        setSuccessMessage(selectedProvider === 'openrouter' ? 'Modelo agregado' : 'Configuración guardada');
        if (!reuseApiKey) {
          setApiKeyInput('');
        }
        setModelNameInput(''); 
        setDisplayNameInput('');
      } catch { setError('Error al guardar'); } finally { setIsLoading(false); }
    } else {
      if (!curlInput.trim()) { setError('Ingresa el comando cURL'); return; }
      setIsLoading(true);
      try {
        storage.set('local_model_curl', curlInput);
        storage.set('model_type', 'local');
        window.dispatchEvent(new CustomEvent('settings-chat-updated', { detail: { isLocal: true, localCurl: curlInput } }));
        setSuccessMessage('Configuración guardada'); setCurlInput('');
      } catch { setError('Error al guardar'); } finally { setIsLoading(false); }
    }
  };

  const connectOllama = async () => {
    setError(''); setSuccessMessage('');
    setIsConnectingOllama(true);
    setOllamaLocalModels([]);
    setOllamaCloudModels([]);
    try {
      const tagsUrl = ollamaEndpoint.replace('/api/chat', '/api/tags');
      const [localRes, cloudRes] = await Promise.allSettled([
        fetch(tagsUrl, { signal: AbortSignal.timeout(5000) }),
        fetch('/ollama-api/tags', { signal: AbortSignal.timeout(5000) }),
      ]);
      if (localRes.status === 'fulfilled' && localRes.value.ok) {
        const data = await localRes.value.json();
        setOllamaLocalModels((data.models || []).map((m: any) => m.name));
      }
      if (cloudRes.status === 'fulfilled' && cloudRes.value.ok) {
        const data = await cloudRes.value.json();
        setOllamaCloudModels((data.models || []).map((m: any) => m.name));
      } else {
        setOllamaCloudModels(OLLAMA_CLOUD_MODELS);
      }
      const hasLocal = localRes.status === 'fulfilled' && localRes.value.ok;
      if (!hasLocal) setError('No se pudo conectar a Ollama local. Verifica que el servidor esté corriendo.');
    } catch {
      setError('No se pudo conectar a Ollama.');
    } finally {
      setIsConnectingOllama(false);
    }
  };

  const saveOllamaModel = () => {
    if (!selectedOllamaModel) { setError('Selecciona un modelo'); return; }
    storage.set('ollama_thinking', ollamaThinking ? 'true' : '');
    const isCloud = ollamaCloudModels.includes(selectedOllamaModel);
    if (isCloud) {
      storage.set('ollama_cloud_model', selectedOllamaModel);
      storage.set('selected_model', selectedOllamaModel);
      storage.set('model_type', 'cloud');
      storage.set('cloud_provider', 'ollama');
      storage.set('ollama_api_key', ollamaCloudKey);
      window.dispatchEvent(new CustomEvent('settings-chat-updated', { detail: { provider: 'ollama', apiKey: ollamaCloudKey, isLocal: false } }));
    } else {
      const curl = `curl ${ollamaEndpoint} -d '{"model":"${selectedOllamaModel}","messages":[{"role":"user","content":"hi"}],"stream":false}'`;
      const existing = storage.get<Array<{ name: string; curl: string; thinkingEnabled?: boolean }>>('local_models') || [];
      if (!existing.some(m => m.name === selectedOllamaModel)) {
        storage.set('local_models', [...existing, { name: selectedOllamaModel, curl, thinkingEnabled: ollamaThinking }]);
      }
      storage.set('local_model_curl', curl);
      storage.set('local_provider_type', 'ollama');
      storage.set('selected_model', selectedOllamaModel);
      storage.set('local_model_thinking', ollamaThinking ? 'true' : '');
      storage.set('model_type', 'local');
      window.dispatchEvent(new CustomEvent('settings-chat-updated', { detail: { isLocal: true, localCurl: curl } }));
    }
    setSuccessMessage(`Conectado a Ollama: ${selectedOllamaModel}`);
    setOllamaLocalModels([]);
    setOllamaCloudModels([]);
    setSelectedOllamaModel('');
  };

  const testOpencodeGoModelThinking = async (apiKey: string, modelId: string): Promise<boolean> => {
    try {
      const response = await fetch('/opencode-go-api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: 'say hi' }],
          max_tokens: 5,
          reasoning: { effort: 'high' },
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        if (/invalid params|invalid thinking|allowed:|reasoning|effort/i.test(text)) return false;
        return false;
      }
      const data = await response.json();
      const msg = data?.choices?.[0]?.message;
      return typeof msg?.reasoning === 'string' && msg.reasoning.length > 0;
    } catch {
      return false;
    }
  };

  const fetchOpencodeGoModels = async () => {
    setError('');
    if (!opencodeGoKey.trim()) { setError('Ingresa una API key primero'); return; }
    setIsFetchingGoModels(true);
    setOpencodeGoModels([]);
    try {
      const response = await fetch('/opencode-go-api/v1/models', {
        headers: { Authorization: `Bearer ${opencodeGoKey.trim()}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) { setError('Error al conectar con OpenCode Go'); return; }
      const data = await response.json();
      const rawModels = data.data || data;
      const apiKey = opencodeGoKey.trim();
      const tested = await Promise.all(
        (rawModels as any[]).map(async (m: any) => {
          const supportsThinking = await testOpencodeGoModelThinking(apiKey, m.id);
          return {
            id: m.id,
            name: m.id.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
            supportsThinking,
            thinkingEnabled: supportsThinking,
          };
        }),
      );
      setOpencodeGoModels(tested);
      storage.set('opencode_go_models', tested);
      setSuccessMessage(`${tested.length} modelos encontrados (${tested.filter(m => m.supportsThinking).length} con thinking)`);
    } catch {
      setError('No se pudo conectar con OpenCode Go. Verifica tu API key.');
    } finally {
      setIsFetchingGoModels(false);
    }
  };

  const saveOpencodeGoModel = () => {
    if (!selectedOpencodeGoModel) { setError('Selecciona un modelo'); return; }
    if (!opencodeGoKey.trim()) { setError('Ingresa tu API key de OpenCode Go'); return; }
    const updatedModels = opencodeGoModels.map(m =>
      m.id === selectedOpencodeGoModel ? { ...m, thinkingEnabled: opencodeGoThinking } : m
    );
    storage.set('opencode_go_api_key', opencodeGoKey.trim());
    storage.set('opencode_go_models', updatedModels);
    setOpencodeGoModels(updatedModels);
    storage.set('selected_model', selectedOpencodeGoModel);
    storage.set('model_type', 'cloud');
    storage.set('cloud_provider', 'opencode-go');
    window.dispatchEvent(new CustomEvent('settings-chat-updated', { detail: { provider: 'opencode-go', apiKey: opencodeGoKey.trim(), isLocal: false } }));
    window.dispatchEvent(new CustomEvent('opencode-go-models-updated'));
    setSuccessMessage(`Conectado a OpenCode Go: ${selectedOpencodeGoModel}`);
  };

  const testModelThinking = async (apiKey: string, modelId: string): Promise<boolean> => {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://scrakk.dev',
          'X-Title': 'Scrakk IDE',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: 'say hi' }],
          max_tokens: 5,
          include_reasoning: true,
        }),
      });
      if (!response.ok) return false;
      const data = await response.json();
      const msg = data?.choices?.[0]?.message;
      return typeof msg?.reasoning === 'string' && msg.reasoning.length > 0;
    } catch {
      return false;
    }
  };

  const deleteModel = (index: number) => {
    const updated = openRouterModels.filter((_, i) => i !== index);
    storage.set('openrouter_models', updated);
    setOpenRouterModels(updated);
    window.dispatchEvent(new CustomEvent('openrouter-models-updated'));
  };

  const toggleThinking = (index: number, enabled: boolean) => {
    const updated = openRouterModels.map((m, i) =>
      i === index ? { ...m, thinkingEnabled: enabled } : m,
    );
    storage.set('openrouter_models', updated);
    setOpenRouterModels(updated);
    window.dispatchEvent(new CustomEvent('openrouter-models-updated'));
  };

  return (
    <div className="editor-section">
      {/* Tipo de conexión */}
      <div className="editor-block">
        <div className="editor-block-header">
          <h3 className="editor-block-title">Tipo de conexión</h3>
          <p className="editor-block-desc">Elige entre servicios cloud o servidor local</p>
        </div>

        <div className="settings-list">
          <div
            className={`settings-item settings-item-selectable${setupType === 'cloud' ? ' settings-item-selected' : ''}`}
            onClick={() => setSetupType('cloud')}
            style={{ cursor: 'pointer' }}
          >
            <div className="settings-item-content">
              <span className="settings-item-label">Cloud</span>
              <span className="settings-item-desc">Gemini, OpenAI, Claude</span>
            </div>
            <div className={`settings-engine-check${setupType === 'cloud' ? ' checked' : ''}`}>
              {setupType === 'cloud' && (
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                </svg>
              )}
            </div>
          </div>

          <div
            className={`settings-item settings-item-selectable${setupType === 'local' ? ' settings-item-selected' : ''}`}
            onClick={() => setSetupType('local')}
            style={{ cursor: 'pointer' }}
          >
            <div className="settings-item-content">
              <span className="settings-item-label">Local</span>
              <span className="settings-item-desc">LM Studio, Ollama</span>
            </div>
            <div className={`settings-engine-check${setupType === 'local' ? ' checked' : ''}`}>
              {setupType === 'local' && (
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                </svg>
              )}
            </div>
          </div>
        </div>
      </div>

      {setupType === 'cloud' ? (
        <>
          {/* Configuración del proveedor */}
          <div className="editor-block">
            <div className="editor-block-header">
              <h3 className="editor-block-title">Configuración del proveedor</h3>
              <p className="editor-block-desc">Configura tu API key y modelo</p>
            </div>

            <div className="settings-list">
              <div className="settings-item">
                <div className="settings-item-content">
                  <span className="settings-item-label">Proveedor</span>
                  <span className="settings-item-desc">Selecciona el servicio de IA</span>
                </div>
                <div className="theme-dropdown" ref={el => { dropdownRefs.current['provider'] = el; }}>
                  <button ref={el => { triggerRefs.current['provider'] = el; }} className="theme-dropdown-trigger theme-dropdown-trigger-small" onClick={() => toggleDropdown('provider')}>
                    <span>{PROVIDERS.find(p => p.id === selectedProvider)?.label}</span>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ transform: openDropdown === 'provider' ? 'rotate(180deg)' : 'rotate(90deg)', transition: 'transform 0.15s ease' }}>
                      <path fillRule="evenodd" clipRule="evenodd" d="M7.97612 10.0719L12.3334 5.7146L12.9521 6.33332L8.28548 11L7.66676 11L3.0001 6.33332L3.61882 5.7146L7.97612 10.0719Z"/>
                    </svg>
                  </button>
                  {openDropdown === 'provider' && menuPos['provider'] && (
                    <div className="context-menu" style={{ position: 'fixed', top: menuPos['provider'].top, left: menuPos['provider'].left, width: menuPos['provider'].width }}>
                      {PROVIDERS.map(p => (
                        <div key={p.id} className={`context-menu-item ${selectedProvider === p.id ? 'context-menu-item-active' : ''}`} onClick={() => { setSelectedProvider(p.id); setApiKeyInput(''); setModelNameInput(''); setError(''); setOpenDropdown(null); }}>
                          <span className="context-menu-label">{p.label}</span>
                          {selectedProvider === p.id && <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="theme-check-icon"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {selectedProvider === 'openrouter' && openRouterModels.length > 0 && (
                <div className="settings-item">
                  <div className="settings-item-content">
                    <span className="settings-item-label">Reutilizar API key</span>
                    <span className="settings-item-desc">Usa la key del último modelo agregado</span>
                  </div>
                  <label className="settings-toggle">
                    <input 
                      type="checkbox" 
                      checked={reuseApiKey}
                      onChange={(e) => {
                        setReuseApiKey(e.target.checked);
                        if (e.target.checked && openRouterModels.length > 0) {
                          setApiKeyInput(openRouterModels[openRouterModels.length - 1].apiKey);
                        } else {
                          setApiKeyInput('');
                        }
                      }}
                    />
                    <span className="settings-toggle-slider"></span>
                  </label>
                </div>
              )}
            </div>

            <div className="settings-list" style={{ marginTop: '12px' }}>
              <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                <div className="settings-item-content">
                  <span className="settings-item-label">API Key</span>
                  <span className="settings-item-desc">
                    {selectedProvider === 'gemini' && 'Obtén tu key en aistudio.google.com'}
                    {selectedProvider === 'openai' && 'Obtén tu key en platform.openai.com'}
                    {selectedProvider === 'claude' && 'Obtén tu key en console.anthropic.com'}
                    {selectedProvider === 'openrouter' && 'Obtén tu key en openrouter.ai/keys'}
                    {selectedProvider === 'opencode-go' && 'Obtén tu key en opencode.ai/auth'}
                  </span>
                </div>
                <div className="theme-search-box">
                  <Key size={12} />
                  <input 
                    type="password" 
                    placeholder={selectedProvider === 'gemini' ? 'AIza...' : selectedProvider === 'openai' ? 'sk-...' : selectedProvider === 'openrouter' ? 'sk-or-v1-...' : selectedProvider === 'opencode-go' ? 'oc_gk_...' : 'sk-ant-...'} 
                    value={apiKeyInput} 
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    disabled={reuseApiKey && selectedProvider === 'openrouter'}
                  />
                </div>
              </div>

              {selectedProvider === 'openrouter' && (
                <>
                  <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                    <div className="settings-item-content">
                      <span className="settings-item-label">Nombre del modelo</span>
                      <span className="settings-item-desc">Nombre para identificar este modelo</span>
                    </div>
                    <div className="theme-search-box">
                      <Tag size={12} />
                      <input type="text" placeholder="Claude Sonnet, GPT-4, etc." value={displayNameInput} onChange={(e) => setDisplayNameInput(e.target.value)} />
                    </div>
                  </div>
                  <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                    <div className="settings-item-content">
                      <span className="settings-item-label">ID del modelo</span>
                      <span className="settings-item-desc">Encuentra modelos en openrouter.ai/models</span>
                    </div>
                    <div className="theme-search-box">
                      <Box size={12} />
                      <input type="text" placeholder="anthropic/claude-3.5-sonnet" value={modelNameInput} onChange={(e) => setModelNameInput(e.target.value)} />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {error && <div className="form-error">{error}</div>}
              {successMessage && <div className="form-success">{successMessage}</div>}
              <button className="settings-btn settings-btn-primary" onClick={handleSave} disabled={isLoading || !apiKeyInput.trim() || (selectedProvider === 'openrouter' && (!modelNameInput.trim() || !displayNameInput.trim()))}>
                {isLoading ? 'Guardando...' : selectedProvider === 'openrouter' ? 'Agregar modelo' : selectedProvider === 'opencode-go' ? 'Guardar API Key' : 'Guardar'}
              </button>
            </div>
          </div>

          {/* Modelos configurados */}
          {openRouterModels.length > 0 && (
            <div className="editor-block">
              <div className="editor-block-header">
                <h3 className="editor-block-title">Modelos configurados</h3>
                <p className="editor-block-desc">{openRouterModels.length} modelo{openRouterModels.length !== 1 ? 's' : ''} de OpenRouter</p>
              </div>
              <div className="settings-list">
                {openRouterModels.map((model, i) => (
                  <div key={i} className="settings-item" style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    minHeight: '64px',
                    padding: '12px 16px',
                    gap: '16px'
                  }}>
                    <div className="settings-item-content" style={{ minWidth: 0, flex: 1 }}>
                      <span className="settings-item-label" style={{ 
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis',
                        display: 'block'
                      }}>{model.name}</span>
                      <span className="settings-item-desc" style={{ 
                        fontFamily: 'Consolas, Monaco, monospace',
                        fontSize: '10px',
                        opacity: 0.7,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'block',
                        marginTop: '2px'
                      }}>{model.modelId}</span>
                    </div>
                    
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px',
                      flexShrink: 0 
                    }}>
                      {model.supportsThinking && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '4px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Thinking</span>
                          <label className="settings-toggle">
                            <input
                              type="checkbox"
                              checked={!!model.thinkingEnabled}
                              onChange={(e) => toggleThinking(i, e.target.checked)}
                            />
                            <span className="settings-toggle-slider"></span>
                          </label>
                        </div>
                      )}
                      
                      <button
                        className="settings-btn settings-btn-secondary"
                        style={{ 
                          padding: '6px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '10px'
                        }}
                        onClick={() => {
                          navigator.clipboard.writeText(model.apiKey);
                          setCopiedIndex(i);
                          setTimeout(() => setCopiedIndex(null), 1500);
                        }}
                      >
                        {copiedIndex === i ? 'Copiado' : <><CopyIcon width={12} height={12} /> Key</>}
                      </button>
                      
                      <button 
                        className="settings-btn settings-btn-danger" 
                        style={{ padding: '6px 10px', fontSize: '10px' }}
                        onClick={() => deleteModel(i)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* OpenCode Go */}
          <div className="editor-block">
            <div className="editor-block-header">
              <h3 className="editor-block-title">OpenCode Go</h3>
              <p className="editor-block-desc">Suscríbete en opencode.ai/auth y obtén tu API key</p>
            </div>

            <div className="settings-list">
              <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                <div className="settings-item-content">
                  <span className="settings-item-label">API Key</span>
                  <span className="settings-item-desc">Tu API key de OpenCode Zen/Go</span>
                </div>
                <div className="theme-search-box">
                  <Key size={12} />
                  <input
                    type="password"
                    placeholder="oc_gk_..."
                    value={opencodeGoKey}
                    onChange={(e) => setOpencodeGoKey(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              <button
                className="settings-btn settings-btn-secondary"
                onClick={fetchOpencodeGoModels}
                disabled={isFetchingGoModels || !opencodeGoKey.trim()}
              >
                {isFetchingGoModels ? 'Obteniendo modelos...' : 'Obtener modelos'}
              </button>
            </div>

            {opencodeGoModels.length > 0 && (
              <div className="settings-list" style={{ marginTop: '12px' }}>
                <div className="settings-item">
                  <div className="settings-item-content">
                    <span className="settings-item-label">Modelo</span>
                    <span className="settings-item-desc">Selecciona un modelo para usar</span>
                  </div>
                  <div className="theme-dropdown" ref={el => { dropdownRefs.current['opencode-go-model'] = el; }}>
                    <button ref={el => { triggerRefs.current['opencode-go-model'] = el; }} className="theme-dropdown-trigger theme-dropdown-trigger-small" onClick={() => toggleDropdown('opencode-go-model')}>
                      <span>{opencodeGoModels.find(m => m.id === selectedOpencodeGoModel)?.name || 'Seleccionar modelo'}</span>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ transform: openDropdown === 'opencode-go-model' ? 'rotate(180deg)' : 'rotate(90deg)', transition: 'transform 0.15s ease' }}>
                        <path fillRule="evenodd" clipRule="evenodd" d="M7.97612 10.0719L12.3334 5.7146L12.9521 6.33332L8.28548 11L7.66676 11L3.0001 6.33332L3.61882 5.7146L7.97612 10.0719Z"/>
                      </svg>
                    </button>
                    {openDropdown === 'opencode-go-model' && menuPos['opencode-go-model'] && (
                      <div className="context-menu" style={{ position: 'fixed', top: menuPos['opencode-go-model'].top, left: menuPos['opencode-go-model'].left, width: menuPos['opencode-go-model'].width }}>
                        {opencodeGoModels.map(model => (
                          <div key={model.id} className={`context-menu-item ${selectedOpencodeGoModel === model.id ? 'context-menu-item-active' : ''}`} onClick={() => { setSelectedOpencodeGoModel(model.id); setOpenDropdown(null); }}>
                            <span className="context-menu-label">{model.name}</span>
                            {selectedOpencodeGoModel === model.id && <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="theme-check-icon"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {opencodeGoModels.length > 0 && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {error && <div className="form-error">{error}</div>}
                {successMessage && <div className="form-success">{successMessage}</div>}
                <div className="settings-item">
                  <div className="settings-item-content">
                    <span className="settings-item-label">Thinking</span>
                    <span className="settings-item-desc">Muestra el razonamiento del modelo</span>
                  </div>
                  <label className="settings-toggle">
                    <input type="checkbox" checked={opencodeGoThinking} onChange={(e) => setOpencodeGoThinking(e.target.checked)} />
                    <span className="settings-toggle-slider"></span>
                  </label>
                </div>
                <button
                  className="settings-btn settings-btn-primary"
                  onClick={saveOpencodeGoModel}
                  disabled={!selectedOpencodeGoModel}
                >
                  Usar modelo
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* LM Studio - cURL */}
          <div className="editor-block">
            <div className="editor-block-header">
              <h3 className="editor-block-title">LM Studio</h3>
              <p className="editor-block-desc">Conecta usando el comando cURL desde LM Studio</p>
            </div>
            
            <div className="settings-list">
              <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                <div className="settings-item-content">
                  <span className="settings-item-label">Comando cURL</span>
                  <span className="settings-item-desc">Copia el comando desde LM Studio</span>
                </div>
                <div className="theme-search-box" style={{ padding: '8px' }}>
                  <textarea 
                    placeholder="curl http://localhost:1234/v1/chat/completions ..." 
                    value={curlInput} 
                    onChange={(e) => setCurlInput(e.target.value)} 
                    style={{ 
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'var(--text-color)',
                      minHeight: '80px', 
                      resize: 'vertical', 
                      fontFamily: 'Consolas, monospace', 
                      fontSize: '11px',
                      padding: '0'
                    }} 
                  />
                </div>
              </div>
            </div>

            <div style={{ marginTop: '16px' }}>
              <button className="settings-btn settings-btn-primary" onClick={handleSave} disabled={isLoading || !curlInput.trim()}>
                {isLoading ? 'Conectando...' : 'Guardar'}
              </button>
            </div>
          </div>

          {/* Ollama */}
          <div className="editor-block">
            <div className="editor-block-header">
              <h3 className="editor-block-title">Ollama</h3>
              <p className="editor-block-desc">Conecta automáticamente con tu servidor Ollama local</p>
            </div>
            
            <div className="settings-list">
              <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                <div className="settings-item-content">
                  <span className="settings-item-label">Endpoint</span>
                  <span className="settings-item-desc">URL del servidor Ollama</span>
                </div>
                <div className="theme-search-box">
                  <input 
                    type="text" 
                    placeholder="http://localhost:11434/api/chat" 
                    value={ollamaEndpoint} 
                    onChange={(e) => setOllamaEndpoint(e.target.value)}
                    disabled={isConnectingOllama}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            </div>

            {ollamaCloudModels.length > 0 && (
              <div className="settings-list" style={{ marginTop: '12px' }}>
                <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                  <div className="settings-item-content">
                    <span className="settings-item-label">API Key (Ollama Cloud)</span>
                    <span className="settings-item-desc">Obtén tu key en ollama.com/settings/keys</span>
                  </div>
                  <div className="theme-search-box">
                    <Key size={12} />
                    <input
                      type="password"
                      placeholder="ollama_..."
                      value={ollamaCloudKey}
                      onChange={(e) => setOllamaCloudKey(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {(ollamaLocalModels.length > 0 || ollamaCloudModels.length > 0) && (
              <div className="settings-list" style={{ marginTop: '12px' }}>
                <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                  <div className="settings-item-content">
                    <span className="settings-item-label">Modelos</span>
                    <span className="settings-item-desc">Selecciona un modelo para conectar</span>
                  </div>

                  {ollamaLocalModels.length > 0 && (
                    <>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>Instalados localmente</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                        {ollamaLocalModels.map((model) => (
                          <button
                            key={model}
                            className={`settings-btn ${selectedOllamaModel === model ? 'settings-btn-primary' : 'settings-btn-secondary'}`}
                            style={{ fontSize: '11px', padding: '6px 12px' }}
                            onClick={() => setSelectedOllamaModel(model)}
                          >
                            {model}
                            {selectedOllamaModel === model && (
                              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ marginLeft: '6px' }}>
                                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {ollamaCloudModels.length > 0 && (
                    <>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px' }}>Disponibles en Ollama Cloud</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                        {ollamaCloudModels.map((model) => (
                          <button
                            key={model}
                            className={`settings-btn ${selectedOllamaModel === model ? 'settings-btn-primary' : 'settings-btn-secondary'}`}
                            style={{ fontSize: '11px', padding: '6px 12px' }}
                            onClick={() => setSelectedOllamaModel(model)}
                          >
                            {model}
                            {selectedOllamaModel === model && (
                              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ marginLeft: '6px' }}>
                                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="settings-list" style={{ marginTop: '12px' }}>
              <div className="settings-item">
                <div className="settings-item-content">
                  <span className="settings-item-label">Thinking</span>
                  <span className="settings-item-desc">Muestra el razonamiento del modelo</span>
                </div>
                <label className="settings-toggle">
                  <input type="checkbox" checked={ollamaThinking} onChange={(e) => setOllamaThinking(e.target.checked)} />
                  <span className="settings-toggle-slider"></span>
                </label>
              </div>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {error && <div className="form-error">{error}</div>}
              {successMessage && <div className="form-success">{successMessage}</div>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="settings-btn settings-btn-secondary"
                  onClick={connectOllama}
                  disabled={isConnectingOllama || !ollamaEndpoint.trim()}
                >
                  {isConnectingOllama ? 'Conectando...' : 'Conectar a Ollama'}
                </button>
                {(ollamaLocalModels.length > 0 || ollamaCloudModels.length > 0) && (
                  <button
                    className="settings-btn settings-btn-primary"
                    onClick={saveOllamaModel}
                    disabled={!selectedOllamaModel}
                  >
                    Usar modelo
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ChatSection;
