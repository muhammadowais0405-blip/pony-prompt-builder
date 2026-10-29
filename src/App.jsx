import { useState, useRef, useCallback, useEffect } from 'react';
import { StoreProvider, useStore } from './store/index.jsx';
import LeftSidebar from './components/LeftSidebar.jsx';
import RightColumn from './components/RightColumn.jsx';
import MiddleColumn from './components/MiddleColumn.jsx';
import GlobalErrorBoundary from './components/GlobalErrorBoundary.jsx';
import ChatAssistant from './components/ChatAssistant.jsx';
import { Sparkles } from 'lucide-react';

export const THEMES = [
  { id: 'auto',   label: 'Auto',   bg: '#0d0f12', surface: '#13161b', accent: '#3b82f6', text: '#e2e8f0' },
  { id: 'black',  label: 'Black',  bg: '#000000', surface: '#111111', accent: '#60a5fa', text: '#e8eaf0' },
  { id: 'white',  label: 'White',  bg: '#f1f5f9', surface: '#ffffff', accent: '#2563eb', text: '#1e293b' },
  { id: 'grey',   label: 'Grey',   bg: '#18181b', surface: '#27272a', accent: '#60a5fa', text: '#e4e4e7' },
  { id: 'blue',   label: 'Blue',   bg: '#060d1a', surface: '#0f1d35', accent: '#60a5fa', text: '#ccd9f0' },
  { id: 'purple', label: 'Purple', bg: '#0d0a16', surface: '#1a152e', accent: '#c084fc', text: '#d8ccf0' },
];

export function applyTheme(baseId, accentHex) {
  const root = document.documentElement;
  root.setAttribute('data-theme', baseId === 'auto' ? '' : baseId);
  
  if (accentHex) {
    root.style.setProperty('--accent-primary', accentHex);
    // Create a semi-transparent version for selection/dim backgrounds
    const r = parseInt(accentHex.slice(1, 3), 16);
    const g = parseInt(accentHex.slice(3, 5), 16);
    const b = parseInt(accentHex.slice(5, 7), 16);
    root.style.setProperty('--accent-primary-dim', `rgba(${r}, ${g}, ${b}, 0.15)`);
  }
}

function Layout() {
  const { state, actions } = useStore();
  
  const [leftWidth, setLeftWidth] = useState(230);
  const leftWidthRef = useRef(230);
  
  const [rightWidth, setRightWidth] = useState(440);
  const rightWidthRef = useRef(440);
  
  const draggingSide = useRef(null);
  const startX = useRef(0);

  const [leftCollapsed, setLeftCollapsed]     = useState(false);
  const [centerCollapsed, setCenterCollapsed] = useState(false);
  const [isChatOpen, setIsChatOpen]           = useState(false);

  // Apply persisted theme on hydration and changes
  useEffect(() => {
    applyTheme(state.themeBase, state.themeAccent);
  }, [state.themeBase, state.themeAccent]);

  // Tab key toggles left sidebar
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        setLeftCollapsed(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleResizeStart = useCallback((side, e) => {
    draggingSide.current = side;
    startX.current = e.clientX;
    if (side === 'left') {
      leftWidthRef.current = leftWidth;
    } else {
      rightWidthRef.current = rightWidth;
    }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [leftWidth, rightWidth]);

  useEffect(() => {
    const move = (e) => {
      if (!draggingSide.current) return;
      const delta = e.clientX - startX.current;
      
      if (draggingSide.current === 'left') {
        const newW = Math.max(160, Math.min(400, leftWidthRef.current + delta));
        setLeftWidth(newW);
      } else if (draggingSide.current === 'right') {
        const newW = Math.max(320, Math.min(700, rightWidthRef.current - delta));
        setRightWidth(newW);
      }
    };
    const up = () => {
      if (!draggingSide.current) return;
      draggingSide.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      leftWidthRef.current = leftWidth;
      rightWidthRef.current = rightWidth;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [leftWidth, rightWidth]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {/* Global App Header (populated via portals) */}
      <div className="flex-shrink-0 h-[56px] flex items-center border-b border-[rgba(255,255,255,0.05)] bg-[var(--bg-panel)] z-40">
        <div id="top-header-left" className="flex items-center gap-3 px-4" style={{ width: leftCollapsed ? 46 : leftWidth, flexShrink: 0 }}></div>
        <div id="top-header-center" className="flex items-center gap-2 flex-1 justify-between px-4 min-w-0"></div>
        {!centerCollapsed && (
          <div id="top-header-right" className="flex items-center justify-between px-4 gap-3 border-l border-[rgba(255,255,255,0.05)]" style={{ width: rightWidth, flexShrink: 0 }}>
            {/* Search portal anchor */}
            <div id="top-header-right-search" className="flex-1 min-w-0"></div>
            
            <button 
              onClick={() => setIsChatOpen(!isChatOpen)}
              className="p-1.5 flex-shrink-0 rounded-lg border transition-all flex items-center justify-center gap-1.5 px-2.5 shadow-sm"
              style={{
                borderColor: isChatOpen ? 'var(--accent-primary)' : 'var(--border-default)',
                color: isChatOpen ? 'var(--accent-primary)' : 'var(--text-secondary)',
                background: isChatOpen ? 'var(--accent-primary-dim)' : 'var(--bg-elevated)'
              }}
              title="Toggle AI Assistant"
            >
              <Sparkles size={14} className={isChatOpen ? 'animate-pulse' : ''} />
              <span className="text-[11px] font-bold uppercase tracking-wider hidden sm:block">AI Context</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div style={{ width: leftCollapsed ? 46 : leftWidth, display: 'flex', flexShrink: 0 }} className="shadow-sm border-r border-[rgba(255,255,255,0.05)] relative z-20">
          <LeftSidebar
            collapsed={leftCollapsed}
            centerCollapsed={centerCollapsed}
            onToggleLeft={() => setLeftCollapsed(v => !v)}
            width={leftCollapsed ? 46 : leftWidth}
          />
        </div>
        
        {!leftCollapsed && (
          <div 
            className="w-1 cursor-col-resize hover:bg-white/10 active:bg-white/20 transition-colors z-[100] flex-shrink-0"
            onMouseDown={(e) => handleResizeStart('left', e)}
          />
        )}

        <div className="flex-1 min-w-0 shadow-sm relative z-10 flex">
          <MiddleColumn />
        </div>

        {!centerCollapsed && (
          <div 
            className="w-1 cursor-col-resize hover:bg-white/10 active:bg-white/20 transition-colors z-[100] flex-shrink-0"
            onMouseDown={(e) => handleResizeStart('right', e)}
          />
        )}

        {!centerCollapsed && (
          <div style={{ width: rightWidth, display: 'flex', flexShrink: 0 }} className="shadow-sm border-l border-[rgba(255,255,255,0.05)] relative z-20">
            <RightColumn width={rightWidth} />
          </div>
        )}
        
        <ChatAssistant isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <GlobalErrorBoundary>
      <StoreProvider>
        <Layout />
      </StoreProvider>
    </GlobalErrorBoundary>
  );
}
