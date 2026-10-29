import React, { useState, useEffect } from 'react';
import { X, Save, KeyRound, Bot, SquareTerminal, ExternalLink, Link2, Loader2, Check, Sliders } from 'lucide-react';
import { useStore } from '../store/index.jsx';
import { checkConnectionAndGetModels, sendChatMessage } from '../services/aiService';

// Reusable slider row for sampling params. Lives at module scope so both the
// modal and the per-message popover can share it.
function SamplingSlider({ label, value, onChange, min, max, step, format, help, disabled }) {
  const display = format ? format(value) : value;
  const isDefault = value === 0 || value === 1; // crude default marker; refine per-field if needed
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--text-primary)]">{label}</span>
        <span className="text-[11px] font-mono tabular-nums text-[var(--accent-primary)]">{display}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[var(--accent-primary)] disabled:opacity-40"
      />
      {help && <p className="text-[10px] text-[var(--text-muted)] leading-tight">{help}</p>}
    </div>
  );
}

export { SamplingSlider };

export default function AISettingsModal({ isOpen, onClose }) {
  const { state: settings, actions } = useStore();
  const [provider, setProvider] = useState(settings.aiProvider || 'openai');
  const [apiKey, setApiKey] = useState(settings.aiApiKey || '');
  const [baseUrl, setBaseUrl] = useState(settings.aiBaseUrl || '');
  const [model, setModel] = useState(settings.aiModel || '');
  const [isStreaming, setIsStreaming] = useState(settings.aiStreaming !== false);
  const [useProxy, setUseProxy] = useState(settings.aiUseProxy !== false); // default ON
  const [temperature, setTemperature] = useState(
    typeof settings.aiTemperature === 'number' ? settings.aiTemperature : 1.0
  );
  const [topP, setTopP] = useState(
    typeof settings.aiTopP === 'number' ? settings.aiTopP : 1.0
  );
  const [topK, setTopK] = useState(
    typeof settings.aiTopK === 'number' ? settings.aiTopK : 0
  );
  const [instructions, setInstructions] = useState(settings.aiCustomInstructions || 'You are an expert AI prompt engineer. Help me create detailed, high-quality prompts.');

  const [isChecking, setIsChecking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null); // { status: "success"|"error", message: "", models: [] }
  const [isTestingMsg, setIsTestingMsg] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setProvider(settings.aiProvider || 'openai');
      setApiKey(settings.aiApiKey || '');
      setBaseUrl(settings.aiBaseUrl || '');
      setModel(settings.aiModel || '');
      setIsStreaming(settings.aiStreaming !== false);
      setUseProxy(settings.aiUseProxy !== false);
      setTemperature(typeof settings.aiTemperature === 'number' ? settings.aiTemperature : 1.0);
      setTopP(typeof settings.aiTopP === 'number' ? settings.aiTopP : 1.0);
      setTopK(typeof settings.aiTopK === 'number' ? settings.aiTopK : 0);
      setInstructions(settings.aiCustomInstructions || 'You are an expert AI prompt engineer. Help me create detailed, high-quality prompts.');
      setConnectionStatus(null);
      setTestResult(null);
    }
  }, [isOpen, settings]);

  const handleSave = () => {
    actions.setAiSettings({
      aiProvider: provider,
      aiApiKey: apiKey,
      aiBaseUrl: baseUrl,
      aiModel: model,
      aiStreaming: isStreaming,
      aiCustomInstructions: instructions,
      aiUseProxy: useProxy,
      aiTemperature: temperature,
      aiTopP: topP,
      aiTopK: topK,
    });
    onClose();
  };

  const handleCheckConnection = async () => {
    setIsChecking(true);
    setConnectionStatus(null);
    setTestResult(null);
    try {
      const testSettings = {
        aiProvider: provider,
        aiApiKey: apiKey,
        aiBaseUrl: baseUrl,
        aiUseProxy: useProxy,
      };
      const models = await checkConnectionAndGetModels(testSettings);
      setConnectionStatus({ status: 'success', message: 'Connection successful', models });
      
      // Select first model if none is selected or selected model is not in the list
      if (models.length > 0 && (!model || !models.includes(model))) {
        setModel(models[0]);
      }
    } catch (e) {
      setConnectionStatus({ status: 'error', message: e.message });
    } finally {
      setIsChecking(false);
    }
  };

  const handleTestMessage = async () => {
    setIsTestingMsg(true);
    setTestResult(null);
    try {
      const testSettings = {
        aiProvider: provider,
        aiApiKey: apiKey,
        aiBaseUrl: baseUrl,
        aiModel: model,
        aiStreaming: false, // Turn off streaming for simple test
        aiCustomInstructions: 'You are a test assistant. Reply strictly with a confirmation that the API is working.',
        aiUseProxy: useProxy,
      };
      const messages = [{ role: 'user', content: 'Say hello.' }];

      const response = await sendChatMessage(messages, testSettings, {}, null, null);
      // sendChatMessage can return either a plain string or an object like
      // { text, reasoning_content, geminiParts } depending on provider/branch.
      // Coerce to a string so the result is always renderable.
      const replyText =
        typeof response === 'string'
          ? response
          : response?.text ?? response?.reasoning_content ?? JSON.stringify(response);
      setTestResult({ status: 'success', message: replyText });
    } catch (e) {
      setTestResult({ status: 'error', message: e.message || 'Error occurred during test.' });
    } finally {
      setIsTestingMsg(false);
    }
  };

  // Reset models list when changing provider/host/key
  useEffect(() => {
    setConnectionStatus(null);
    setTestResult(null);
  }, [provider, apiKey, baseUrl]);

  // Validate baseUrl + give provider-specific hints (e.g. Ollama Cloud vs local).
  const urlValidation = (() => {
    if (!baseUrl) return { error: null, hint: null };
    const trimmed = baseUrl.trim();
    try {
      const parsed = new URL(trimmed);
      if (!/^https?:$/.test(parsed.protocol)) {
        return { error: 'URL must start with http:// or https://', hint: null };
      }
      const isLocal = /^(localhost|127\.|0\.0\.0\.0)/i.test(parsed.hostname);
      const isHttps = parsed.protocol === 'https:';
      const pathLooksRight = /\/v1\/?$/.test(parsed.pathname) || /\/v1\//.test(parsed.pathname);

      // Provider-specific hints
      if (/ollama\.com/i.test(parsed.hostname)) {
        return {
          error: null,
          hint: '☁️ Detected Ollama Cloud — this endpoint requires an API key from ollama.com → Settings → API Keys. The API Key field above is not optional for hosted Ollama.'
        };
      }
      if (isLocal && /ollama/i.test(trimmed)) {
        return {
          error: null,
          hint: '🏠 Local Ollama detected — make sure the Ollama server is running (default port 11434). The API Key field can be left blank.'
        };
      }
      if (isLocal && isHttps) {
        return {
          error: null,
          hint: '⚠️ https:// for a local address is unusual. Local servers usually use http://.'
        };
      }
      if (!pathLooksRight && parsed.pathname !== '/' && parsed.pathname !== '') {
        return {
          error: null,
          hint: 'ℹ️ Most OpenAI-compatible servers expect the path to end with /v1.'
        };
      }
      return { error: null, hint: null };
    } catch (_) {
      return { error: 'Not a valid URL (e.g. http://localhost:11434/v1)', hint: null };
    }
  })();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="bg-[var(--bg-base)] border border-[var(--border-strong)] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2 text-[var(--text-primary)]">
            <Bot size={20} className="text-[var(--accent-primary)]" />
            <h2 className="font-semibold text-[15px]">AI Assistant Settings</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-active)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
          
          {/* Provider Selection */}
          <div className="space-y-3">
            <label className="text-[13px] font-medium text-[var(--text-primary)] flex items-center gap-1.5">
              Provider
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {['openai', 'gemini', 'anthropic', 'custom'].map((prov) => (
                <button
                  key={prov}
                  onClick={() => setProvider(prov)}
                  className={`py-2 px-3 rounded-xl border text-[13px] capitalize font-medium transition-all ${
                    provider === prov
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                      : 'border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
                  }`}
                >
                  {prov}
                </button>
              ))}
            </div>
            {provider === 'custom' && (
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Use local endpoints like LocalAI, Ollama, or custom UI backends.
              </p>
            )}
            {provider !== 'custom' && (
              <a 
                href={
                  provider === 'openai' ? 'https://platform.openai.com/api-keys' : 
                  provider === 'gemini' ? 'https://aistudio.google.com/app/apikey' : 
                  'https://console.anthropic.com/settings/keys'
                }
                target="_blank" rel="noreferrer"
                className="text-[11px] text-[var(--accent-primary)] hover:underline flex items-center gap-1 mt-1 w-fit"
              >
                Get API Key <ExternalLink size={10} />
              </a>
            )}
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-[var(--text-primary)] flex items-center gap-1.5">
              <KeyRound size={14} className="text-[var(--text-muted)]" />
              API Key {provider === 'custom' && <span className="text-[11px] text-[var(--text-muted)] opacity-70 font-normal">(Optional)</span>}
            </label>
            <input
              type="password"
              placeholder={`Enter your ${provider.charAt(0).toUpperCase() + provider.slice(1)} API key...`}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-[var(--bg-active)] border border-[var(--border-strong)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-all placeholder-[var(--text-muted)]/50"
            />
          </div>

          {/* Base URL (Custom) */}
          {provider === 'custom' && (
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-[var(--text-primary)]">
                Base URL
              </label>
              <input
                type="text"
                placeholder="http://localhost:11434/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className={`w-full bg-[var(--bg-active)] border text-[var(--text-primary)] rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-1 transition-all placeholder-[var(--text-muted)]/50 ${
                  baseUrl && urlValidation.error
                    ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/30'
                    : 'border-[var(--border-strong)] focus:border-[var(--accent-primary)] focus:ring-[var(--accent-primary)]'
                }`}
              />
              {baseUrl && urlValidation.error && (
                <p className="text-[11px] text-red-500 dark:text-red-400">⚠ {urlValidation.error}</p>
              )}
              <p className="text-[11px] text-[var(--text-muted)]">
                Must be compatible with the OpenAI Chat Completions API format.
              </p>
              {urlValidation.hint && (
                <p className="text-[11px] text-[var(--accent-primary)]">{urlValidation.hint}</p>
              )}
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={useProxy}
                  onChange={(e) => setUseProxy(e.target.checked)}
                  className="accent-[var(--accent-primary)] cursor-pointer"
                />
                <span className="text-[12px] text-[var(--text-secondary)]">
                  Route through built-in HTTP proxy <span className="text-[var(--text-muted)]">(recommended for CORS-restricted endpoints like Ollama Cloud)</span>
                </span>
              </label>
            </div>
          )}

          {/* Connection Test & Model Selection */}
          <div className="space-y-3 bg-[var(--bg-panel)] p-4 rounded-xl border border-[var(--border-subtle)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
               <span className="text-[13px] font-medium text-[var(--text-primary)] flex items-center gap-1.5">
                <Link2 size={14} className="text-[var(--text-muted)]" />
                Connection & Model
              </span>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={handleCheckConnection}
                  disabled={isChecking || (!apiKey && provider !== 'custom')}
                  className="px-3 py-1.5 bg-[var(--bg-active)] hover:bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg text-[12px] font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isChecking ? <Loader2 size={12} className="animate-spin" /> : null}
                  {isChecking ? 'Checking...' : 'Check Connection'}
                </button>
                <button 
                  onClick={handleTestMessage}
                  disabled={isTestingMsg || (!apiKey && provider !== 'custom') || !model}
                  className="px-3 py-1.5 bg-[var(--bg-active)] hover:bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg text-[12px] font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Send a test message to the API"
                >
                  {isTestingMsg ? <Loader2 size={12} className="animate-spin" /> : null}
                  {isTestingMsg ? 'Wait' : 'Test MSG'}
                </button>
              </div>
            </div>

            {connectionStatus && (
              <div className={`text-[12px] p-2 rounded-lg flex flex-col gap-1 ${
                connectionStatus.status === 'success' 
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
                  : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
              }`}>
                <div className="flex items-center gap-1.5 font-medium">
                  {connectionStatus.status === 'success' ? <Check size={14} /> : <X size={14} />}
                  {connectionStatus.message}
                </div>
              </div>
            )}
            
            {testResult && (
              <div className={`text-[12px] p-2 rounded-lg flex flex-col gap-1 ${
                testResult.status === 'success' 
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20' 
                  : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
              }`}>
                <div className="font-medium flex items-start gap-1.5">
                  <span className="mt-0.5">{testResult.status === 'success' ? '🤖' : <X size={14} />}</span>
                  <div className="whitespace-pre-wrap">{testResult.message}</div>
                </div>
              </div>
            )}

            {connectionStatus?.status === 'success' && connectionStatus.models && connectionStatus.models.length > 0 && (
               <div className="space-y-1.5 pt-2">
                 <label className="text-[12px] font-medium text-[var(--text-secondary)]">
                   Select Model
                 </label>
                 <select
                   value={connectionStatus.models.includes(model) ? model : ''}
                   onChange={(e) => { if(e.target.value) setModel(e.target.value); }}
                   className="w-full bg-[var(--bg-active)] border border-[var(--border-strong)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-all custom-scrollbar"
                 >
                   <option value="" disabled>Custom Model...</option>
                   {connectionStatus.models.map(m => (
                     <option key={m} value={m}>{m}</option>
                   ))}
                 </select>
               </div>
            )}
            
             <div className="space-y-1.5 pt-2">
               <label className="text-[12px] font-medium text-[var(--text-secondary)]">
                 Model ID Override (Optional)
               </label>
               <input
                 type="text"
                 placeholder="e.g. gpt-4, claude-3-5-sonnet..."
                 value={model}
                 onChange={(e) => setModel(e.target.value)}
                 className="w-full bg-[var(--bg-active)] border border-[var(--border-strong)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-all placeholder-[var(--text-muted)]/50"
               />
               <p className="text-[11px] text-[var(--text-muted)]">Check connection to fetch available models, or type a custom ID.</p>
             </div>
          </div>

          {/* Advanced Sampling */}
          <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
            <details>
              <summary className="flex items-center justify-between cursor-pointer text-[13px] font-medium text-[var(--text-primary)] list-none">
                <span className="flex items-center gap-1.5">
                  <Sliders size={14} className="text-[var(--text-muted)]" />
                  Advanced Sampling
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  temp {temperature.toFixed(2)} · top_p {topP.toFixed(2)} · top_k {topK === 0 ? 'off' : topK}
                </span>
              </summary>
              <div className="mt-4 space-y-4">
                <SamplingSlider
                  label="Temperature"
                  value={temperature}
                  onChange={setTemperature}
                  min={0} max={2} step={0.05}
                  format={(v) => v.toFixed(2)}
                  help="Lower = focused & deterministic. Higher = creative & varied. Default 1.0."
                />
                <SamplingSlider
                  label="Top-P (nucleus)"
                  value={topP}
                  onChange={setTopP}
                  min={0} max={1} step={0.05}
                  format={(v) => v.toFixed(2)}
                  help="Cumulative probability cutoff. 1.0 = disabled. Ignored by Anthropic."
                />
                <SamplingSlider
                  label="Top-K"
                  value={topK}
                  onChange={setTopK}
                  min={0} max={100} step={1}
                  format={(v) => (v === 0 ? 'off' : v)}
                  help="Restrict to the K most likely tokens. 0 = off. Only Gemini honors this — others ignore it."
                />
              </div>
            </details>
          </div>

          {/* Custom Instructions */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-[var(--text-primary)] flex items-center justify-between">
              <span className="flex items-center gap-1.5"><SquareTerminal size={14} className="text-[var(--text-muted)]" /> Custom System Instructions</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-[11px] text-[var(--text-muted)]">Enable Streaming</span>
                <input 
                  type="checkbox" 
                  checked={isStreaming} 
                  onChange={(e) => setIsStreaming(e.target.checked)}
                  className="accent-[var(--accent-primary)] cursor-pointer"
                />
              </label>
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Tell the AI how you want it to behave or respond..."
              className="w-full bg-[var(--bg-active)] border border-[var(--border-strong)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-all placeholder-[var(--text-muted)]/50 min-h-[120px] resize-y"
            />
            <p className="text-[11px] text-[var(--text-muted)]">
              This system prompt defines the personality, goals, and behavior rules for the assistant.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 font-medium text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 font-medium text-[13px] bg-[var(--accent-primary)] text-white hover:brightness-110 active:scale-95 transition-all rounded-lg flex items-center gap-1.5 shadow-sm"
          >
            <Save size={15} />
            Save Settings
          </button>
        </div>

      </div>
    </div>
  );
}
