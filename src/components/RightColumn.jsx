import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/index.jsx';
import { Plus, RotateCcw, X, Undo2, Redo2, RefreshCw, Copy, Check, Clock, ChevronDown, ChevronRight, Tag, Lightbulb, User, Star, ImagePlus } from 'lucide-react';
import { extractTagsFromImage } from '../utils/ocr.js';
import { getCurrentTag, fuzzyMatchTags, getBooruTypeColor, analyzeTagsForReplacements, normalizeTag } from '../utils/booru.js';

// ─── Suggestion Dropdown ───────────────────────────────────────────────────────
function SuggestionDropdown({ suggestions, selectedIndex, onSelect, onHoverIndex, relationships }) {
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (dropdownRef.current) {
      // Reset first to read natural metrics
      dropdownRef.current.style.left = '0';
      dropdownRef.current.style.right = 'auto';
      dropdownRef.current.style.top = '100%';
      dropdownRef.current.style.bottom = 'auto';
      dropdownRef.current.style.marginTop = '0.25rem';
      dropdownRef.current.style.marginBottom = 'auto';
      
      const rect = dropdownRef.current.getBoundingClientRect();
      const margin = 16;
      
      if (rect.right > window.innerWidth - margin) {
        dropdownRef.current.style.left = 'auto';
        dropdownRef.current.style.right = '0';
      }
      
      // If it goes below the screen, position it ABOVE the input field
      if (rect.bottom > window.innerHeight - margin) {
        dropdownRef.current.style.top = 'auto';
        dropdownRef.current.style.bottom = '100%';
        dropdownRef.current.style.marginTop = 'auto';
        dropdownRef.current.style.marginBottom = '0.25rem';
      }
    }
  }, [suggestions]);

  if (!suggestions.length) return null;

  return (
    <div ref={dropdownRef} className="absolute z-[400] w-max min-w-[320px] max-w-[calc(100vw-32px)] mt-1 rounded-xl shadow-2xl overflow-hidden border border-[var(--border-strong)]"
      style={{ background: '#1a1f28' }}>
      <div className="max-h-[280px] overflow-y-auto overflow-x-hidden custom-scrollbar">
        {suggestions.map((item, idx) => {
          if (item.source === 'character') {
             return (
               <button
                 key={`${item.tag}-${idx}`}
                 onMouseEnter={() => onHoverIndex(idx)}
                 onMouseDown={(e) => e.preventDefault()}
                 onClick={() => onSelect(item)}
                 className={`w-full flex border-b border-[rgba(255,255,255,0.02)] px-3 py-2 text-left transition-fast ${selectedIndex === idx ? 'bg-[var(--bg-active)]' : 'hover:bg-[var(--bg-hover)]'}`}
               >
                 <div className="flex flex-col min-w-0 w-full gap-1">
                   <div className="flex items-center gap-2 min-w-0">
                     <User size={13} className="text-emerald-400 shrink-0" />
                     <span className="font-bold text-sm truncate text-[#e2e8f0]">
                       {item.tag} <span className="text-[var(--text-muted)] font-normal text-xs ml-1">({item.categoryName})</span>
                     </span>
                   </div>
                 </div>
               </button>
             );
          }
          if (item.source === 'special') {
             return (
               <button
                 key={`${item.categoryId}-${idx}`}
                 onMouseEnter={() => onHoverIndex(idx)}
                 onMouseDown={(e) => e.preventDefault()}
                 onClick={() => onSelect(item)}
                 className={`w-full flex border-b border-[rgba(255,255,255,0.02)] px-3 py-2 text-left transition-fast ${selectedIndex === idx ? 'bg-[var(--bg-active)]' : 'hover:bg-[var(--bg-hover)]'}`}
               >
                 <div className="flex flex-col min-w-0 w-full gap-1">
                   <div className="flex items-center justify-between w-full">
                     <div className="flex items-center gap-2 min-w-0">
                       <Star size={13} className="text-amber-400 shrink-0" />
                       <span className="font-bold text-sm truncate text-[#e2e8f0]">
                         {item.categoryName} <span className="text-[var(--text-muted)] font-normal text-xs ml-1">{'-> Navigate'}</span>
                       </span>
                     </div>
                     <span className="text-[10px] font-mono opacity-50 text-[var(--text-secondary)]">
                       {item.count} tags
                     </span>
                   </div>
                 </div>
               </button>
             );
          }

          const rels = relationships?.[item.tag]?.related || [];
          return (
            <button
              key={`${item.tag}-${idx}`}
              onMouseEnter={() => onHoverIndex(idx)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(item)}
              className={`w-full flex border-b border-[rgba(255,255,255,0.02)] px-3 py-2 text-left transition-fast ${selectedIndex === idx ? 'bg-[var(--bg-active)]' : 'hover:bg-[var(--bg-hover)]'}`}
            >
              <div className="flex flex-col min-w-0 w-full gap-1">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-sm truncate" style={{ color: getBooruTypeColor(item.type) }}>
                      {item.matchType === 'alias' ? (
                        <>
                          <span className="text-[var(--text-muted)] line-through italic mr-1.5">{item.matchedAlias}</span>
                          <span className="text-[var(--text-muted)] mr-1.5">{'->'}</span>
                          {item.tag}
                        </>
                      ) : (
                        item.tag
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-mono opacity-50" style={{ color: 'var(--text-secondary)' }}>
                      {Number(item.count || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
                
                {rels.length > 0 && (
                  <div className="flex items-center flex-wrap gap-1 mt-0.5">
                    <span className="text-[8px] uppercase tracking-wider font-bold opacity-30 mt-0.5">Related:</span>
                    {rels.map((r, i) => (
                      <span key={i} className="text-[9px] px-1.5 rounded-sm whitespace-nowrap" style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)' }}>
                        {r.tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Confirm Modal ─────────────────────────────────────────────────────────────
export function ConfirmModal({ title, message, confirmLabel = 'Confirm', onConfirm, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center modal-backdrop" onClick={onClose}>
      <div className="fade-slide-in rounded-2xl shadow-2xl w-80 overflow-hidden"
        style={{ background: '#1c2030', border: '1px solid var(--border-strong)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-4 p-5 pb-4">
          <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-lg font-bold"
            style={{ background: '#92400e', color: '#fbbf24' }}>!</div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="font-bold text-sm mb-1.5" style={{ color: 'var(--text-white)' }}>{title}</h3>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{message}</p>
          </div>
        </div>
        {children && <div className="px-5 pb-3">{children}</div>}
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm font-semibold transition-fast"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>
            Cancel
          </button>
          <button onClick={() => { onConfirm(); onClose(); }}
            className="flex-1 py-2 rounded-xl text-sm font-bold transition-fast hover:brightness-110"
            style={{ background: 'var(--accent-blue)', color: '#fff' }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Copy button ───────────────────────────────────────────────────────────────
function CopyBtn({ text, label }) {
  const [copied, setCopied] = useState(false);
  const [empty, setEmpty] = useState(false);
  const handleCopy = (e) => {
    e.stopPropagation();
    if (!text?.trim()) {
      setEmpty(true);
      setTimeout(() => setEmpty(false), 1200);
      return;
    }
    navigator.clipboard.writeText(text.trim()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button onClick={handleCopy} title={`Copy ${label} to clipboard`}
      className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold transition-fast"
      style={{
        background: copied ? '#10b98122' : empty ? '#f43f5e18' : 'transparent',
        color: copied ? '#10b981' : empty ? '#f43f5e' : 'var(--text-muted)',
        border: copied ? '1px solid #10b98144' : empty ? '1px solid #f43f5e33' : '1px solid transparent',
      }}>
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? 'Copied!' : empty ? 'Empty' : 'Copy'}
    </button>
  );
}

// Returns true if a hex background color needs dark text for contrast
function needsDarkText(hex) {
  if (!hex || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.5;
}

// ─── Prompt Tag Pill (with remove animation) ──────────────────────────────────
function PromptTagPill({ tag, index, accentColor, onRemove }) {
  const [removing, setRemoving] = useState(false);
  const handleClick = (e) => {
    e.stopPropagation();
    setRemoving(true);
    setTimeout(() => onRemove(index), 180);
  };
  return (
    <button onClick={handleClick} title="Click to remove"
      className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold group/tag transition-fast border border-transparent shadow-sm"
    style={{
        background: accentColor,
        color: needsDarkText(accentColor) ? '#1a1a1a' : '#fff',
        transform: removing ? 'scale(0)' : 'scale(1)',
        opacity: removing ? 0 : 1,
        transition: removing
          ? 'transform 0.18s cubic-bezier(0.4,0,1,1), opacity 0.18s ease'
          : 'transform 0.12s ease, background 0.12s ease',
      }}>
      <span className="group-hover/tag:line-through transition-fast truncate">{tag}</span>
    </button>
  );
}

// ─── Prompt Section (Positive / Negative) ─────────────────────────────────────
function PromptSection({ label, field, value, accentColor, isTrash }) {
  const { actions, state, undo, redo } = useStore();
  const isActive = state.activeField === field;
  const [dragOver, setDragOver] = useState(false);
const [isCollapsed, setIsCollapsed] = useState(false);
const [inputValue, setInputValue] = useState('');
const [suggestions, setSuggestions] = useState([]);
const [selectedIndex, setSelectedIndex] = useState(0);
const [showMenu, setShowMenu] = useState(false);
const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
const [aliasMatches, setAliasMatches] = useState({ positive: [], negative: [] });
const [isScanningAliases, setIsScanningAliases] = useState(false);
const inputRef = useRef(null);
const menuRef = useRef(null);
const menuBtnRef = useRef(null);

useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => {
        if (
            menuRef.current && !menuRef.current.contains(e.target) &&
            menuBtnRef.current && !menuBtnRef.current.contains(e.target)
        ) {
            setShowMenu(false);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 10);
    return () => document.removeEventListener('mousedown', handler);
}, [showMenu]);

const findAliasMatches = useCallback(() => {
    if (!state.indexedBooruTags?.length) return;
    setIsScanningAliases(true);
    const normalize = (str) => str.toLowerCase().replace(/ /g, '_').trim();
    const denormalize = (str) => str.replace(/_/g, ' ');

    const scan = (tagString) => {
        return analyzeTagsForReplacements(state.indexedBooruTags, tagString);
    };

    setAliasMatches({
        positive: scan(state.activePrompt.positive),
        negative: scan(state.activePrompt.negative),
    });
    setIsScanningAliases(false);
}, [state.indexedBooruTags, state.activePrompt]);

const applyReplacement = (original, canonical, targetField, matchedPortion) => {
    const current = state.activePrompt[targetField] || '';
    const updated = current.split(',').map(t => {
        const trimmed = t.trim();
        if (trimmed.toLowerCase() !== original.toLowerCase()) return trimmed;

        // whole tag replacement
        if (!matchedPortion || matchedPortion.toLowerCase() === original.toLowerCase()) {
            return canonical;
        }

        // partial — replace just the matched portion inside the sentence
        const escaped = matchedPortion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'gi');
        return trimmed.replace(regex, canonical);
    }).join(', ');

    actions.updateActive(targetField, updated);
    setAliasMatches(prev => ({
        ...prev,
        [targetField]: prev[targetField].filter(m => m.original !== original),
    }));
};

const applyAll = () => {
    ['positive', 'negative'].forEach(targetField => {
        if (!aliasMatches[targetField].length) return;
        const current = state.activePrompt[targetField] || '';
        const updated = current.split(',').map(t => {
            let trimmed = t.trim();
            for (const { original, canonical, matchedPortion } of aliasMatches[targetField]) {
                if (trimmed.toLowerCase() !== original.toLowerCase()) continue;
                if (!matchedPortion || matchedPortion.toLowerCase() === original.toLowerCase()) {
                    trimmed = canonical;
                } else {
                    const escaped = matchedPortion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(escaped, 'gi');
                    trimmed = trimmed.replace(regex, canonical);
                }
            }
            return trimmed;
        }).join(', ');
        actions.updateActive(targetField, updated);
    });
    setAliasMatches({ positive: [], negative: [] });
};
const totalMatches = aliasMatches.positive.length + aliasMatches.negative.length;
  
  const tags = value ? value.split(',').map(t => t.trim()).filter(Boolean) : [];

  const handleRemoveTag = (index) => {
    actions.updateActive(field, tags.filter((_, i) => i !== index).join(', '));
  };

  const insertSuggestion = (suggestion) => {
    if (suggestion.source === 'special') {
      // Navigate to folder and close suggestions
      actions.selectView('folder', suggestion.folderId); 
      setSuggestions([]);
      setInputValue('');
      return;
    }

    const targetTags = suggestion.source === 'character' ? suggestion.categoryTags : [suggestion.tag];

    const cursor = inputRef.current.selectionStart;
    const { start, end } = getCurrentTag(inputValue, cursor);
    
    // Replace the currently typed tag with the target tag(s)
    const before = inputValue.substring(0, start).trim();
    const after = inputValue.substring(end).trim();
    const newTagsFromInput = [
      ...(before ? before.split(',').map(t => t.trim()) : []),
      ...targetTags,
      ...(after ? after.split(',').map(t => t.trim()) : [])
    ].filter(Boolean);
    
    // Extract existing active tags and merge
    const existingTags = value ? value.split(',').map(t => t.trim()).filter(Boolean) : [];
    
    // We want to avoid duplicates if possible, especially if adding character category tags
    const lowerExisting = new Set(existingTags.map(t => t.toLowerCase()));
    const finalNewTags = newTagsFromInput.filter(t => !lowerExisting.has(t.toLowerCase()));

    actions.updateActive(field, [...existingTags, ...finalNewTags].join(', '));
    setInputValue('');
    setSuggestions([]);
  };

  const handleDragOver = (e) => {
    if (isTrash) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    const types = Array.from(e.dataTransfer.types || []).map(t => t.toLowerCase());
    if (types.includes('folderid') || types.includes('application/folder-id')) return;
    if (types.includes('text/tag') || types.includes('text/plain')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDragOver(true);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const tagData = e.dataTransfer.getData('text/tag') || e.dataTransfer.getData('text/plain');
    if (tagData?.trim()) {
      actions.setActiveField(field);
      const tagsToDrop = tagData.split(',').map(t => t.trim()).filter(Boolean);
      tagsToDrop.forEach(t => actions.appendTag(t, field));
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    
    if (val.trim().length >= 2) {
      const { term } = getCurrentTag(val, e.target.selectionStart);
      const rawTerm = term.trim();
      let results = [];
      
      if (rawTerm.startsWith('!')) {
         const searchTerm = rawTerm.slice(1).toLowerCase();
         state.categories.filter(c => c.type === 'character').forEach(c => {
             c.tags.forEach(t => {
                 if (normalizeTag(t).includes(searchTerm)) {
                     results.push({
                         source: 'character',
                         tag: t,
                         categoryName: c.name,
                         categoryId: c.id,
                         categoryTags: c.tags,
                     });
                 }
             });
         });
         results = results.slice(0, 50);
      } else if (rawTerm.startsWith('&')) {
         const searchTerm = rawTerm.slice(1).toLowerCase();
         state.categories.filter(c => c.type === 'special').forEach(c => {
             if (c.name.toLowerCase().includes(searchTerm)) {
                 results.push({
                     source: 'special',
                     categoryName: c.name,
                     categoryId: c.id,
                     count: c.tags ? c.tags.length : 0,
                     folderId: c.folderId,
                 });
             }
         });
         results = results.slice(0, 50);
      } else {
         results = fuzzyMatchTags(state.indexedBooruTags, term);
      }
      
      setSuggestions(results);
      setSelectedIndex(0);
    } else {
      setSuggestions([]);
    }
  };

  const handleInputKeyDown = (e) => {
    if (isTrash) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'x' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
      return;
    }

    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertSuggestion(suggestions[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setSuggestions([]);
        return;
      }
    }

    if (e.key === ',' || e.key === 'Enter') {
      e.preventDefault();
      if (inputValue.trim()) {
        actions.appendTag(inputValue.trim(), field);
        setInputValue('');
        setSuggestions([]);
      }
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      handleRemoveTag(tags.length - 1);
    }
  };

  const handleInputPaste = (e) => {
    if (isTrash) return;
    const pastedText = e.clipboardData.getData('text');
    if (pastedText.includes(',') || pastedText.includes('\n')) {
      e.preventDefault();
      const newTags = pastedText.split(/,|\n/).map(t => t.trim()).filter(Boolean);
      const combined = [...tags, ...newTags];
      actions.updateActive(field, combined.join(', '));
      setInputValue('');
    }
  };

  return (
    <div className="flex flex-col rounded-xl transition-fast relative"
      style={{
        border: dragOver ? `1px dashed ${accentColor}` : '1px solid var(--border-subtle)',
        background: dragOver ? `${accentColor}08` : 'var(--bg-elevated)',
        opacity: isTrash ? 0.8 : 1,
      }}
      onDragOver={handleDragOver}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
      onDrop={handleDrop}>

      {/* Group Header */}
      <div className="flex items-center justify-between px-4 py-4 flex-shrink-0 cursor-pointer select-none group/header transition-fast rounded-t-xl overflow-hidden"
        style={{ 
          background: isActive ? `${accentColor}1a` : 'rgba(255,255,255,0.02)', 
          borderBottom: '1px solid var(--border-subtle)' 
        }}
        onClick={() => setIsCollapsed(!isCollapsed)}>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 flex items-center justify-center transition-fast" 
            style={{ color: isActive ? accentColor : 'var(--text-muted)', transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>
            <ChevronDown size={13} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.15em]" 
            style={{ color: isActive ? accentColor : 'var(--text-primary)', opacity: isActive ? 1 : 0.6 }}>{label}</span>
          {isActive && !isCollapsed && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-md font-black tracking-wider animate-pulse"
              style={{ background: `${accentColor}28`, color: accentColor }}>ACTIVE</span>
          )}
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover/header:opacity-100 transition-fast">
    <span className="text-[9px] font-bold opacity-40" style={{ color: isActive ? accentColor : 'var(--text-muted)' }}>{tags.length} ITEMS</span>
    <button 
      onClick={(e) => { e.stopPropagation(); actions.updateActive(field, ''); }}
      title="Clear tags"
      className="flex items-center justify-center w-5 h-5 rounded-md transition-fast hover:bg-white/10"
      style={{ color: 'var(--text-muted)' }}>
      <X size={12} />
    </button>
    <CopyBtn text={value} label={label} />
    {field === 'positive' && (
    <div className="relative">
        <button
            ref={menuBtnRef}
            onClick={(e) => {
                e.stopPropagation();
                if (!showMenu && menuBtnRef.current) {
                    const rect = menuBtnRef.current.getBoundingClientRect();
                    setMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
                }
                setShowMenu(v => !v);
            }}
            title="Prompt options"
            className="flex items-center justify-center w-5 h-5 rounded-md transition-fast"
            style={{
                color: showMenu ? accentColor : 'var(--text-muted)',
                background: showMenu ? `${accentColor}20` : 'transparent',
                border: showMenu ? `1px solid ${accentColor}44` : '1px solid transparent',
            }}>
            <ChevronDown size={11} style={{ transform: showMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
        </button>

        {showMenu && createPortal(
            <div
                ref={menuRef}
                className="fixed z-[9999] rounded-xl shadow-2xl fade-slide-in overflow-hidden"
                style={{ top: menuPos.top, right: menuPos.right, width: 300, background: '#1a1f28', border: '1px solid var(--border-strong)' }}
                onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2.5"
                    style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.02)' }}>
                    <span className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                        Prompt Tools
                    </span>
                    {totalMatches > 0 && (
                        <button
                            onClick={applyAll}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold transition-fast hover:brightness-110"
                            style={{ background: '#10b98122', color: '#10b981', border: '1px solid #10b98144' }}>
                            Apply All ({totalMatches})
                        </button>
                    )}
                </div>

                {/* Alias Normalizer Section */}
                <div className="px-3 pt-2.5 pb-1">
                    <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-50" style={{ color: 'var(--text-primary)' }}>
                            Alias Normalizer
                        </span>
                        <button
                            onClick={findAliasMatches}
                            className="text-[9px] px-1.5 py-0.5 rounded font-bold transition-fast hover:opacity-80"
                            style={{ background: 'var(--bg-active)', color: 'var(--text-muted)' }}>
                            Rescan
                        </button>
                    </div>

                    {isScanningAliases ? (
                        <p className="text-xs py-2 text-center" style={{ color: 'var(--text-muted)' }}>Scanning…</p>
                    ) : !state.indexedBooruTags?.length ? (
                        <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>No booru database loaded. Sync one in Backup panel.</p>
                    ) : totalMatches === 0 ? (
                        <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>✓ All tags look canonical.</p>
                    ) : (
                        <div className="space-y-1 max-h-[280px] overflow-y-auto custom-scrollbar pr-1 pb-1">
                            {['positive', 'negative'].map(targetField => (
                                aliasMatches[targetField].length > 0 && (
                                    <div key={targetField}>
                                        <p className="text-[9px] font-black uppercase tracking-widest mb-1 mt-1"
                                            style={{ color: targetField === 'positive' ? '#10b981' : '#f43f5e', opacity: 0.7 }}>
                                            {targetField}
                                        </p>
                                      {aliasMatches[targetField].map(({ original, canonical, count, matchType, matchedPortion }) => {
    const badgeStyles = {
        'alias':      { bg: '#3b82f622', color: '#3b82f6', border: '#3b82f644', label: 'ALIAS' },
        'phrase':     { bg: '#8b5cf622', color: '#8b5cf6', border: '#8b5cf644', label: 'PHRASE' },
        'partial':    { bg: '#f97316222', color: '#f97316', border: '#f9731644', label: 'PARTIAL' },
        'word-match': { bg: '#f59e0b22', color: '#f59e0b', border: '#f59e0b44', label: 'WORDS' },
    };
    const badge = badgeStyles[matchType] || badgeStyles['alias'];
    return (
        <div key={original}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg mb-1"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex-1 min-w-0">
                {/* Match type badge */}
                <div className="flex items-center gap-1 mb-1">
                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded tracking-widest"
                        style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                        {badge.label}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
    {/* For partial replacements show what portion is being swapped */}
    {matchedPortion && matchedPortion.toLowerCase() !== original.toLowerCase() ? (
        <>
            {/* Full original sentence with matched portion highlighted */}
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md leading-relaxed"
                style={{ background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44' }}>
                {original.split(new RegExp(`(${matchedPortion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) =>
                    part.toLowerCase() === matchedPortion.toLowerCase()
                        ? <span key={i} style={{ textDecoration: 'line-through', opacity: 0.9 }}>{part}</span>
                        : <span key={i}>{part}</span>
                )}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>→</span>
            {/* Only the replacement portion in green */}
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md"
                style={{ background: '#10b98122', color: '#10b981', border: '1px solid #10b98144' }}>
                {canonical}
            </span>
        </>
    ) : (
        <>
            {/* Whole tag replacement */}
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md"
                style={{ background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44', textDecoration: 'line-through', opacity: 0.8 }}>
                {original}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>→</span>
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md"
                style={{ background: '#10b98122', color: '#10b981', border: '1px solid #10b98144' }}>
                {canonical}
            </span>
        </>
    )}
</div>
                <span className="text-[9px] font-mono opacity-40 mt-0.5 block" style={{ color: 'var(--text-muted)' }}>
                    {Number(count).toLocaleString()} posts
                </span>
            </div>
            <button
                onClick={() => applyReplacement(original, canonical, targetField, matchedPortion)}
                className="flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg transition-fast hover:brightness-110"
                style={{ background: '#10b98120', color: '#10b981', border: '1px solid #10b98140' }}>
                Fix
            </button>
        </div>
    );
})}
                                    </div>
                                )
                            ))}
                        </div>
                    )}
                </div>

                {/* Divider for future features */}
                <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
                <p className="px-3 py-2 text-[10px] italic" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                  More tools coming soon…
                </p>
            </div>,
            document.body
        )}
    </div>
)}
</div>
      </div>

      {!isCollapsed && (
        <div className="p-2.5 flex-1 flex flex-wrap content-start gap-1.5 min-h-[100px] overflow-visible rounded-b-xl"
          onClick={(e) => { e.stopPropagation(); actions.setActiveField(field); inputRef.current?.focus(); }}>
          {tags.map((tag, i) => (
            <PromptTagPill key={`${tag}-${i}`} tag={tag} index={i} accentColor={accentColor} onRemove={handleRemoveTag} />
          ))}
          {!isTrash && (
            <div className="flex-1 min-w-[120px] relative">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                onPaste={handleInputPaste}
                onFocus={() => actions.setActiveField(field)}
                onBlur={() => setSuggestions([])}
                placeholder={tags.length === 0 ? "Type tags..." : ""}
                className="w-full bg-transparent border-none outline-none text-base font-medium py-1.5 placeholder:opacity-30 placeholder:text-[var(--text-muted)]"
                style={{ color: 'var(--text-primary)' }}
              />
              <SuggestionDropdown 
                suggestions={suggestions} 
                relationships={state.tagRelationships}
                selectedIndex={selectedIndex}
                onHoverIndex={setSelectedIndex}
                onSelect={insertSuggestion}
              />
            </div>
          )}
                </div>
      )}
    </div>
  );
}

import { extractImageMetadata, parseA1111Parameters } from '../utils/imageMetadata.js';

function ExtractedMetadataModal({ metadata, onMerge, onOverwrite, onCancel }) {
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center modal-backdrop" onClick={onCancel}>
      <div className="fade-slide-in rounded-2xl shadow-2xl w-[500px] max-w-[90vw] overflow-hidden flex flex-col max-h-[80vh]"
        style={{ background: '#1c2030', border: '1px solid var(--border-strong)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-5 border-b border-[rgba(255,255,255,0.05)]">
           <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/20 text-blue-400">
              <ImagePlus size={20} />
           </div>
           <div>
             <h3 className="font-bold text-base text-white">Image Metadata Extracted</h3>
             <p className="text-xs text-gray-400">Found hidden prompt data inside the image.</p>
           </div>
        </div>
        
        <div className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4">
           {metadata.positive && (
             <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#10b981] uppercase tracking-widest">Positive Prompt</label>
                <div className="p-3 bg-black/30 border border-emerald-500/20 rounded-xl text-sm text-gray-200">
                   {metadata.positive}
                </div>
             </div>
           )}
           {metadata.negative && (
             <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#f43f5e] uppercase tracking-widest">Negative Prompt</label>
                <div className="p-3 bg-black/30 border border-rose-500/20 rounded-xl text-sm text-gray-200">
                   {metadata.negative}
                </div>
             </div>
           )}
        </div>
        
        <div className="p-5 bg-black/20 flex gap-3 border-t border-[rgba(255,255,255,0.05)] text-sm">
           <button onClick={onCancel} className="flex-1 py-2 rounded-xl font-semibold bg-white/5 hover:bg-white/10 text-white transition-fast">
             Cancel
           </button>
           <button onClick={onMerge} className="flex-1 py-2 rounded-xl font-bold bg-[#10b981] hover:brightness-110 text-white transition-fast shadow-[0_4px_12px_rgba(16,185,129,0.3)]">
             Merge Append
           </button>
           <button onClick={onOverwrite} className="flex-1 py-2 rounded-xl font-bold bg-[#3b82f6] hover:brightness-110 text-white transition-fast shadow-[0_4px_12px_rgba(59,130,246,0.3)]">
             Overwrite
           </button>
        </div>
      </div>
    </div>
  );
}

// ─── Right Column ─────────────────────────────────────────────────────────────
export default function RightColumn({ width, onResizeStart }) {
  const { state, actions, undo, redo, canUndo, canRedo } = useStore();
const isTrash = state.view === 'trash';
const [isScanning, setIsScanning] = useState(false);
const [extractedMetadata, setExtractedMetadata] = useState(null);

  const impliedSuggestions = useMemo(() => {
    if (!state.tagRelationships || !state.activePrompt) return [];
    
    const getTags = str => (str || '').split(',').map(t => t.trim()).filter(Boolean);
    const pos = getTags(state.activePrompt.positive);
    const neg = getTags(state.activePrompt.negative);
    const activePromptTags = [...pos, ...neg];
    
    // No tags entered, don't calculate suggestions
    if (activePromptTags.length === 0) return [];
    
    const existingSet = new Set(activePromptTags.map(t => normalizeTag(t)));
    const suggestionsMap = new Map();
    
    activePromptTags.forEach(t => {
      const matchedKey = Object.keys(state.tagRelationships).find(k => normalizeTag(k) === normalizeTag(t));
      
      if (matchedKey && state.tagRelationships[matchedKey]) {
        state.tagRelationships[matchedKey].related.forEach(rel => {
          const relNorm = normalizeTag(rel.tag);
          if (!existingSet.has(relNorm)) {
            if (!suggestionsMap.has(rel.tag)) {
              suggestionsMap.set(rel.tag, { tag: rel.tag, count: rel.count, sources: new Set() });
            }
            suggestionsMap.get(rel.tag).sources.add(t);
          }
        });
      }
    });

    return Array.from(suggestionsMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [state.activePrompt, state.tagRelationships]);

  const handleAddSuggestedTag = useCallback((tagToAdd) => {
    const field = state.activeField || 'positive';
    actions.appendTag(tagToAdd, field);
  }, [state.activeField, actions]);

useEffect(() => {
    const handleKeyDown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
            e.preventDefault();
            const field = state.activeField;
            const current = state.activePrompt[field] || '';
            const replaced = current.replace(/_/g, ' ');
            if (replaced !== current) {
                actions.updateActive(field, replaced);
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
}, [state.activeField, state.activePrompt, actions]);

  const processImage = useCallback(async (file) => {
    if (isTrash) return;
    setIsScanning(true);
    try {
      // 1. Try extracting actual metadata first
      try {
         const metadataChunks = await extractImageMetadata(file);
         let parsed = null;
         
         if (metadataChunks) {
             if (metadataChunks.parameters) {
                 parsed = parseA1111Parameters(metadataChunks.parameters);
             } else if (metadataChunks.Description) {
                 parsed = { positive: metadataChunks.Description, negative: '' }; 
             } else if (metadataChunks.prompt && typeof metadataChunks.prompt === 'string') {
                 // Try stringify if JSON
                 parsed = { positive: metadataChunks.prompt, negative: '' };
             }
         }
         
         if (!parsed || (!parsed.positive && !parsed.negative)) {
             const exifr = await import('exifr');
             const exifData = await exifr.parse(file, true).catch(() => null);
             if (exifData && exifData.userComment) {
                 let text = typeof exifData.userComment === 'string' ? exifData.userComment : new TextDecoder().decode(exifData.userComment);
                 text = text.replace(/^UNICODE\0+/, '').replace(/^ASCII\0+/, '').trim();
                 if (text) parsed = parseA1111Parameters(text);
             }
         }

         if (parsed && (parsed.positive || parsed.negative)) {
             setExtractedMetadata({
                 positive: parsed.positive || '',
                 negative: parsed.negative || '',
             });
             return; // wait for modal
         }
      } catch (metadataError) {
         console.warn('Metadata parsing failed, falling back to OCR', metadataError);
      }
      
      // 2. Fall back to OCR if no metadata available
      const tags = await extractTagsFromImage(file);
      if (tags.length > 0) {
        tags.forEach(t => actions.appendTag(t));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsScanning(false);
    }
  }, [isTrash, actions]);

  useEffect(() => {
    let unlistenDrop;
    if (window.__TAURI__) {
      import('@tauri-apps/api/webviewWindow').then(({ getCurrentWebviewWindow }) => {
        getCurrentWebviewWindow().onDragDropEvent(async (event) => {
          if (isTrash) return;
          if (event.payload.type === 'drop') {
            const paths = event.payload.paths;
            if (paths && Array.isArray(paths)) {
              const { invoke } = await import('@tauri-apps/api/core');
              for (const p of paths) {
                const lower = p.toLowerCase();
                if (lower.match(/\.(png|jpe?g|webp|gif|avif)$/i)) {
                  try {
                    const bytes = await invoke('read_file_binary', { path: p });
                    const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
                    processImage(blob);
                  } catch(e) {
                    console.error('Failed to read image via Tauri:', e);
                  }
                }
              }
            }
          }
        }).then(u => unlistenDrop = u);
      });
    }
    return () => {
      if (unlistenDrop) unlistenDrop();
    };
  }, [processImage, isTrash]);

  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) processImage(file);
        }
      }
    };
    
    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };
    
    const handleDragEnter = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    
    const handleDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isTrash) return;
      const files = Array.from(e.dataTransfer?.files || []);
      const imageFile = files.find(f => f.type.startsWith('image/'));
      if (imageFile) {
        processImage(imageFile);
      }
    };

    window.addEventListener('paste', handlePaste);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('drop', handleDrop);
    
    return () => {
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('drop', handleDrop);
    }
  }, [processImage, isTrash]);

    return (
    <>
    <div className="flex flex-col h-full relative w-full"
      style={{ background: 'var(--bg-elevated)' }}>

      {extractedMetadata && (
        <ExtractedMetadataModal 
          metadata={extractedMetadata}
          onCancel={() => { 
             setExtractedMetadata(null); 
             setIsScanning(false); 
          }}
          onOverwrite={() => {
             if (extractedMetadata.positive) actions.updateActive('positive', extractedMetadata.positive);
             if (extractedMetadata.negative) actions.updateActive('negative', extractedMetadata.negative);
             setExtractedMetadata(null);
             setIsScanning(false);
          }}
          onMerge={() => {
             const getTags = str => (str || '').split(',').map(s => s.trim()).filter(Boolean);
             const posTags = getTags(extractedMetadata.positive);
             const negTags = getTags(extractedMetadata.negative);
             posTags.forEach(t => actions.appendTag(t, 'positive'));
             negTags.forEach(t => actions.appendTag(t, 'negative'));
             setExtractedMetadata(null);
             setIsScanning(false);
          }}
        />
      )}

      {isScanning && !extractedMetadata && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-md"
          style={{ background: 'rgba(13, 15, 18, 0.85)' }}>
          <div className="p-8 rounded-3xl flex flex-col items-center gap-4"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
            <div className="relative">
              <div className="absolute inset-0 rounded-full blur-xl animate-pulse" style={{ background: 'var(--accent-blue)', opacity: 0.3 }} />
              <RefreshCw className="animate-spin text-blue-500 relative" size={40} />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-lg text-white mb-1">Scanning Image</h3>
              <p className="text-sm text-gray-400">Extracting tags with OCR...</p>
            </div>
          </div>
        </div>
      )}



      {/* WORKSPACE - Inspector Style */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        <PromptSection label="Positive Prompt" field="positive" value={state.activePrompt.positive} accentColor="#10b981" isTrash={isTrash} />
        <PromptSection label="Negative Prompt" field="negative" value={state.activePrompt.negative} accentColor="#f43f5e" isTrash={isTrash} />
        
        {impliedSuggestions.length > 0 && !isTrash && (
          <div className="mt-4 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
               <Lightbulb className="w-4 h-4 text-emerald-400" />
               <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Suggested Tags</h3>
            </div>
            <div className="flex flex-wrap gap-2">
               {impliedSuggestions.map(sug => (
                 <button
                   key={sug.tag}
                   onClick={() => handleAddSuggestedTag(sug.tag)}
                   className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium transition-colors outline-none
                              bg-[#1e2532] hover:bg-[#2a3441] border border-[var(--border-strong)] text-[var(--text-primary)]"
                   title={`Implied by: ${Array.from(sug.sources).join(', ')}\nUsed in ${sug.count} posts`}
                 >
                   <span>{sug.tag}</span>
                   <span className="text-[10px] opacity-50 font-mono">{Number(sug.count).toLocaleString()}</span>
                 </button>
               ))}
            </div>
          </div>
        )}
      </div>

      {/* Column resize handle */}
      <div onMouseDown={onResizeStart}
        className="absolute top-0 left-0 h-full w-1.5 cursor-col-resize z-10 group">
        <div className="h-full w-px group-hover:bg-blue-500 transition-fast"
          style={{ background: 'var(--border-subtle)' }} />
      </div>
    </div>
    </>
  );
}
