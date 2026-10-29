import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { PanelRightClose, Sparkles, Send, Bot, User, Loader2, Settings2, FolderUp, FolderTree, RefreshCw, Pencil, Check, X, Trash2, ChevronLeft, ChevronRight, Copy, Tag, ChevronDown, AlertCircle } from 'lucide-react';
import AISettingsModal, { SamplingSlider } from './AISettingsModal';
import { useStore } from '../store/index.jsx';
import { sendChatMessage } from '../services/aiService';
import { DraggableSuggestion } from './DraggableSuggestion';
import { DiffView } from './DiffView';
import { analyzeTagsForReplacements } from '../utils/booru.js';

// ─── Category picker ──────────────────────────────────────────────────────────

// Matches an unclosed `&` token at the caret, e.g. `&Shizuka`, `&Art ` (mid-
// multi-word), or `&`. The token spans from `&` up to (but not including) the
// next whitespace, comma, paren, or bracket — so multi-word category names
// like "Shizuka Minamoto" or "Art Style" are fully addressable.
function getActiveAmpQuery(text, cursorPos) {
  const upto = text.slice(0, cursorPos ?? text.length);
  // Find the last `&` that isn't preceded by an alphanumeric char (so it
  // counts as a token start, not a literal in the middle of a tag).
  const lastAmp = (() => {
    for (let i = upto.length - 1; i >= 0; i--) {
      const c = upto[i];
      if (c === '&') {
        const prev = i > 0 ? upto[i - 1] : '';
        if (!/[A-Za-z0-9_]/.test(prev)) return i;
        return -1;
      }
    }
    return -1;
  })();
  if (lastAmp === -1) return null;
  // Token body = everything after `&` up to the next terminator (space,
  // comma, paren, bracket, or end-of-string). This is what we'll match
  // category names against.
  const tail = upto.slice(lastAmp + 1);
  const termIdx = tail.search(/[\s,()\[\]]/);
  const query = termIdx === -1 ? tail : tail.slice(0, termIdx);
  // No characters yet — user just typed `&`, don't open picker (avoids
  // every-category wall when they really wanted to type `&` literally).
  if (query.length === 0) return null;
  return { start: lastAmp, end: lastAmp + 1 + query.length, query };
}

/**
 * Inline floating picker that appears above the input when the user types `&`.
 *
 * - Shows every category whose name starts with the typed prefix (case-insensitive).
 * - When the typed query contains a space (i.e. the user is mid-multi-word),
 *   falls back to substring matching so "Art St" still finds "Art Style".
 * - Each row displays: category color dot, name, parent folder name (to
 *   disambiguate same-named categories in different folders).
 * - ↑/↓ navigates, Enter/Tab selects, Escape dismisses, click selects.
 * - Selecting inserts `&CategoryName` at the active token position and replaces
 *   the current `&` query.
 * - Hover preview shows the category's tags as a tooltip.
 */
function CategoryPicker({ query, categories, folders, onPick, onDismiss }) {
  const [activeIdx, setActiveIdx] = useState(0);

  const matches = useMemo(() => {
    const q = (query || '').toLowerCase().trim();
    if (!q) return [];
    return (categories || [])
      .filter(c => {
        const name = c.name.toLowerCase();
        // Prefix match works while the user is still on the first word;
        // once they've typed a space we relax to substring so multi-word
        // names like "Art Style" remain reachable.
        if (!q.includes(' ')) return name.startsWith(q);
        return name.includes(q);
      })
      .slice(0, 8);
  }, [query, categories]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  if (!matches.length) {
    return (
      <div
        className="absolute bottom-full left-0 right-0 mb-2 p-3 rounded-xl shadow-2xl border z-40 text-[12px]"
        style={{ background: 'rgba(0,0,0,0.85)', borderColor: 'var(--border-strong)', color: 'var(--text-muted)', backdropFilter: 'blur(8px)' }}
      >
        No categories match “{query}”. Press Esc to dismiss.
      </div>
    );
  }

  return (
    <div
      role="listbox"
      className="absolute bottom-full left-0 right-0 mb-2 rounded-xl shadow-2xl border z-40 overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.9)', borderColor: 'var(--border-strong)', backdropFilter: 'blur(8px)' }}
      onMouseDown={(e) => e.preventDefault() /* keep textarea focused */}
    >
      <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider border-b flex items-center gap-1.5"
           style={{ color: 'var(--text-muted)', borderColor: 'var(--border-subtle)' }}>
        <Tag size={11} />
        Select category{matches.length > 1 ? ` (${matches.length} matches)` : ''}
      </div>
      {matches.map((cat, idx) => {
        const folder = (folders || []).find(f => f.id === cat.folderId);
        const isActive = idx === activeIdx;
        return (
          <button
            key={cat.id}
            type="button"
            role="option"
            aria-selected={isActive}
            data-picker-idx={idx}
            onMouseEnter={() => setActiveIdx(idx)}
            onClick={() => onPick(cat)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors"
            style={{
              background: isActive ? 'var(--accent-primary)' : 'transparent',
              color: isActive ? 'white' : 'var(--text-primary)',
            }}
            title={(cat.tags || []).slice(0, 50).join(', ')}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 cat-${cat.color}`} />
            <span className="font-semibold truncate">{cat.name}</span>
            {folder && (
              <span
                className="ml-auto text-[10px] truncate max-w-[140px]"
                style={{ color: isActive ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}
              >
                {folder.icon} {folder.name}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Per-message sampling override popover.
 *
 * - When the user touches any slider, an override is recorded in local state.
 * - When the user clicks "Reset", all overrides are cleared so this message
 *   reverts to using the global defaults (state.aiTemperature / aiTopP / aiTopK).
 * - If any override is active, a small dot appears on the trigger icon.
 * - Each value is passed into `sendChatMessage` for this single request, just
 *   like SillyTavern. Defaults are applied for whichever field is `null`.
 */
function SamplingPopover({ overrides, onChange, onReset, anchorRef }) {
  const [open, setOpen] = useState(false);
  const popRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (
        popRef.current && !popRef.current.contains(e.target) &&
        anchorRef.current && !anchorRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, anchorRef]);

  const hasOverrides = overrides.temperature != null || overrides.topP != null || overrides.topK != null;

  return (
    <div className="relative inline-block">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Per-message sampling overrides"
        className="relative p-1.5 rounded-lg transition-colors hover:bg-white/10"
        style={{ color: 'var(--text-muted)' }}
      >
        <Settings2 size={16} />
        {hasOverrides && (
          <span
            className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--accent-primary)' }}
          />
        )}
      </button>

      {open && (
        <div
          ref={popRef}
          className="absolute bottom-full right-0 mb-2 w-64 p-4 rounded-xl shadow-2xl border z-50 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-150"
          style={{ background: 'rgba(0, 0, 0, 0.85)', borderColor: 'var(--border-strong)', backdropFilter: 'blur(8px)' }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                Sampling overrides
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Only this message
              </div>
            </div>
            <button
              type="button"
              onClick={() => { onReset(); setOpen(false); }}
              disabled={!hasOverrides}
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded transition-colors disabled:opacity-30 hover:bg-white/10"
              style={{ color: 'var(--accent-primary)' }}
            >
              Reset
            </button>
          </div>

          <SamplingSlider
            label="Temperature"
            value={overrides.temperature ?? 1.0}
            onChange={(v) => onChange({ ...overrides, temperature: v })}
            min={0} max={2} step={0.05}
            format={(v) => v.toFixed(2)}
          />
          <SamplingSlider
            label="Top-P"
            value={overrides.topP ?? 1.0}
            onChange={(v) => onChange({ ...overrides, topP: v })}
            min={0} max={1} step={0.05}
            format={(v) => v.toFixed(2)}
          />
          <SamplingSlider
            label="Top-K"
            value={overrides.topK ?? 0}
            onChange={(v) => onChange({ ...overrides, topK: v })}
            min={0} max={100} step={1}
            format={(v) => (v === 0 ? 'off' : v)}
          />
        </div>
      )}
    </div>
  );
}

const PROVIDER_META = {
  openai:    { label: 'OpenAI',    color: '#10b981' },
  gemini:    { label: 'Gemini',    color: '#3b82f6' },
  anthropic: { label: 'Anthropic', color: '#f97316' },
  custom:    { label: 'Custom',    color: '#8b5cf6' },
};

function ModelIndicator({ provider, model }) {
  const meta = PROVIDER_META[provider] || PROVIDER_META.custom;
  const shortModel = model
    ? model.length > 22 ? model.slice(0, 20) + '…' : model
    : 'no model set';

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
      style={{ background: 'var(--bg-active)', border: '1px solid var(--border-subtle)' }}>
      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: model ? meta.color : '#64748b' }} />
      <span className="text-[10px] font-black uppercase tracking-wider flex-shrink-0"
        style={{ color: meta.color }}>
        {meta.label}
      </span>
      <span className="text-[10px]" style={{ color: 'var(--border-strong)' }}>·</span>
      <span className="text-[10px] font-medium truncate max-w-[110px]"
        style={{ color: model ? 'var(--text-secondary)' : 'var(--text-muted)', fontFamily: "'DM Mono', monospace" }}>
        {shortModel}
      </span>
    </div>
  );
}

function ParsedMessage({ content }) {
  const { state, actions } = useStore();

  if (typeof content !== 'string') {
    content = String(content || '');
  }

  // Try to parse <TAGS>...</TAGS> and <REWRITE_POS>...</REWRITE_POS>
  const parts = [];
  let remaining = content;

  // Extremely basic regex parser for XML-like tags (handles multiple occurrences)
  const regex = /<(TAGS|REWRITE_POS|REWRITE_NEG)>([\s\S]*?)<\/\1>/g;
  let match;
  let lastIndex = 0;

  while ((match = regex.exec(content)) !== null) {
    // Add text before the tag
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: content.slice(lastIndex, match.index) });
    }

    const type = match[1];
    const inner = match[2].trim();

    if (type === 'TAGS') {
      const tags = inner.split(',').map(t => t.trim()).filter(Boolean);
      parts.push({ type: 'tags', tags });
    } else if (type === 'REWRITE_POS') {
      parts.push({ type: 'rewrite_pos', newText: inner });
    } else if (type === 'REWRITE_NEG') {
      parts.push({ type: 'rewrite_neg', newText: inner });
    }

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push({ type: 'text', text: content.slice(lastIndex) });
  }

  if (parts.length === 0) {
    return <div className="whitespace-pre-wrap">{content}</div>;
  }

  return (
    <div className="space-y-2">
      {parts.map((p, i) => {
        if (p.type === 'text') {
          return <div key={i} className="whitespace-pre-wrap">{p.text}</div>;
        } else if (p.type === 'tags') {
          return (
            <div key={i} className="flex flex-wrap gap-1.5 p-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg">
              {p.tags.map(t => <DraggableSuggestion key={t} tag={t} />)}
            </div>
          );
        } else if (p.type === 'rewrite_pos') {
          return (
            <DiffView
              key={i}
              label="Positive"
              oldText={state.activePrompt?.positive}
              newText={p.newText}
              onAccept={() => actions.updateActive('positive', p.newText)}
              onReject={() => {}}
            />
          );
        } else if (p.type === 'rewrite_neg') {
          return (
            <DiffView
              key={i}
              label="Negative"
              oldText={state.activePrompt?.negative}
              newText={p.newText}
              onAccept={() => actions.updateActive('negative', p.newText)}
              onReject={() => {}}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

export default function ChatAssistant({ isOpen, onClose }) {
  const { state } = useStore();
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      content: "Hi! I'm your AI Prompt Assistant. I can help you brainstorm tags, refine your positive/negative prompts, or suggest categories based on your current workspace. What would you like to create today?\n\n*Tip: You can use the `/fix [prompt]` command to automatically correct and normalize tags using your local database!*"
    }
  ]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [copyState, setCopyState] = useState({}); // { [msgId]: true } while "Copied!" is shown

  // Per-message sampling overrides. Keys are the values that get sent in
  // place of the global defaults; `null` means "use the global default".
  const [samplingOverrides, setSamplingOverrides] = useState({ temperature: null, topP: null, topK: null });
  const samplingBtnRef = useRef(null);
  const hasOverrides = samplingOverrides.temperature != null || samplingOverrides.topP != null || samplingOverrides.topK != null;

  // Resolved category references (selected via the picker or after disambiguation).
  // Each entry: { refText: '&Hair', categoryId: 'c1', categoryName: 'Hair', folderName: 'Characters', folderId: 'f1' }
  // These are what get sent into the AI system context and rendered as chips.
  const [resolvedRefs, setResolvedRefs] = useState([]);

  // Send-time blocker UI: a list of unresolved/ambiguous &category refs that
  // prevented the send. Cleared as soon as the user fixes the input.
  const [sendBlocker, setSendBlocker] = useState(null); // string[] | null

  // Inline picker state
  const [picker, setPicker] = useState(null); // { start, end, query } or null
  const textareaRef = useRef(null);

  // Find every `&something` token in a string. Names may contain spaces (e.g.
// "&Shizuka Minamoto"), but the token must not bleed past the *actual* name
// boundary — i.e. we can't grab "&Shizuka Minamoto give me prompt of her"
// as one giant token. We do this by:
//
//   1. Capturing an over-greedy span up to the next terminator.
//   2. Shrinking from the right word-by-word until the leading slice is the
//      exact name of a category in `categories` (case-insensitive), OR
//      shrinking down to a single word.
//   3. Any leftover trailing words that didn't form a category stay in the
//      text untouched, so "&Shizuka Minamoto give" becomes
//      "&Shizuka Minamoto" + " give".
//
// The set of valid category names is captured by a `useCallback`'s closure
// at call time; pass them via the second argument.
const findAmpTokens = useCallback((text, validNames) => {
  const out = [];
  if (!text) return out;
  const lowerNames = new Set((validNames || []).map(n => n.toLowerCase()));
  // Over-greedy capture: &word( word)* up to a terminator
  const greedy = /&[A-Za-z0-9_-]+(?:\s[A-Za-z0-9_-]+)*/g;
  let m;
  while ((m = greedy.exec(text)) !== null) {
    const fullStart = m.index;
    const fullSpan = m[0]; // e.g. "&Shizuka Minamoto give me prompt of her"
    const ampStart = fullStart;
    // Try progressively shorter tail: full -> minus last word -> ... -> 1 word
    const words = fullSpan.slice(1).split(/\s+/); // drop '&'
    let chosenWords = null;
    for (let n = words.length; n >= 1; n--) {
      const candidate = words.slice(0, n).join(' ').toLowerCase();
      if (lowerNames.has(candidate)) {
        chosenWords = words.slice(0, n);
        break;
      }
    }
    // If no known category matched at any length, fall back to a single word
    // (the longest plausible single token). This still flags it as "unknown"
    // downstream, but we don't bleed into unrelated prose.
    if (!chosenWords) chosenWords = [words[0]];
    const name = chosenWords.join(' ');
    const nameStart = ampStart;
    const nameEnd = nameStart + 1 + name.length; // +1 for the '&'
    out.push({ start: nameStart, end: nameEnd, name });
  }
  return out;
}, []);

  // Classify every `&Name` token in the user's draft against:
  //   1. The chips the user already resolved via the picker (`resolvedRefs`)
  //   2. The local category library (`state.categories`)
  //   3. Whitespace-only leftovers (e.g. `&` with nothing after it)
  //
  // Return shape:
  //   {
  //     resolved: [...],   // already chip'd by the user (highest trust)
  //     unique:   [...],   // one exact-name match in library → auto-pick
  //     ambiguous:[...],   // multiple categories share this name across folders
  //     unknown:  [...]    // no match in library — needs disambiguation or new category
  //   }
  const analyzeAmpTokens = useCallback((text) => {
    const cats = state.categories || [];
    // Pass the library's exact category names so findAmpTokens can decide
    // where the multi-word name boundary actually ends (e.g. recognise
    // "&Shizuka Minamoto give me prompt of her" → "&Shizuka Minamoto"
    // because that exact name exists, instead of bleeding into "give").
    const validNames = cats.map(c => c.name);
    const tokens = findAmpTokens(text, validNames);
    const refsByKey = new Map();
    (resolvedRefs || []).forEach(r => refsByKey.set(r.refText.toLowerCase(), r));

    const out = { resolved: [], unique: [], ambiguous: [], unknown: [] };
    const seenNames = new Set();

    tokens.forEach(t => {
      const refKey = `&${t.name}`.toLowerCase();
      if (refsByKey.has(refKey)) {
        out.resolved.push({ ...t, ref: refsByKey.get(refKey) });
        return;
      }
      if (seenNames.has(refKey)) return; // de-dupe per draft
      seenNames.add(refKey);

      const matches = cats.filter(c => c.name.toLowerCase() === t.name.toLowerCase());
      if (matches.length === 1) {
        out.unique.push({ ...t, category: matches[0] });
      } else if (matches.length > 1) {
        out.ambiguous.push({ ...t, categories: matches });
      } else {
        out.unknown.push(t);
      }
    });

    // Second pass: pick up *bare* names (no `&` prefix) that the user has
    // already resolved via the picker. After commit we strip the `&` and
    // the text reads as plain prose, so we need to scan for the bare name.
    (resolvedRefs || []).forEach(r => {
      const name = (r.bareName || r.categoryName || '').trim();
      if (!name) return;
      // Word-boundary, case-insensitive search. The name may contain spaces.
      const re = new RegExp(`(^|\\W)(${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')})(?=\\W|$)`, 'i');
      if (re.test(text)) {
        const key = `bare:${name.toLowerCase()}`;
        if (seenNames.has(key)) return;
        seenNames.add(key);
        const m = text.match(re);
        const idx = m.index + m[1].length;
        out.resolved.push({ start: idx, end: idx + name.length, name, ref: r, bare: true });
      }
    });

    return out;
  }, [findAmpTokens, state.categories, resolvedRefs]);

  // Auto-clear blocker as soon as the input no longer has any unresolved refs.
  // Declared AFTER analyzeAmpTokens so the const binding isn't in the TDZ
  // when this effect first runs.
  useEffect(() => {
    if (!sendBlocker) return;
    if (!input.trim()) { setSendBlocker(null); return; }
    const a = analyzeAmpTokens(input);
    if (a.ambiguous.length === 0 && a.unknown.length === 0) setSendBlocker(null);
  }, [input, sendBlocker, analyzeAmpTokens]);

  // Live "input health" view — used for inline warning UI just above the chips.
  const analysis = useMemo(() => {
    if (!input.trim()) return null;
    return analyzeAmpTokens(input);
  }, [input, analyzeAmpTokens]);

  // Auto-scroll to bottom
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, isOpen]);

  // Stable id generator to avoid Date.now() collisions on rapid clicks
  const idCounter = useRef(2);
  const nextId = () => {
    idCounter.current += 1;
    return idCounter.current;
  };

  // Core AI runner — given a history slice, runs the assistant turn.
  // historyBase is the messages to send to the model (may be a truncated
  // history for regenerate/edit-resend).
  // seedAlternatives (optional) lets a re-rolled call (regenerate / swipe-re-roll)
  // preserve the existing swipe history and append the new result as the
  // active alternative — so the counter advances to n/n+1 instead of resetting
  // to 1/1.
  const runAI = async (historyBase, seedAlternatives = null) => {
    setIsTyping(true);
    const assistantMsgId = nextId();
    const seedIndex = seedAlternatives ? seedAlternatives.length : 0;

    try {
      const lastUserMsg = [...historyBase].reverse().find(m => m.role === 'user');
      const categoryRefs = lastUserMsg?._categoryRefs || { resolved: [], autoPicked: [] };

      const workspaceContext = {
        positivePrompt: state.activePrompt?.positive || '',
        negativePrompt: state.activePrompt?.negative || '',
        projectTitle: state.activePrompt?.title || 'Untitled Phase',
        allCategories: state.categories || [],
        // The user explicitly resolved references via the picker + any
        // auto-picked single-match references from this turn. The system
        // prompt builder uses these to tell the model which tags to anchor on.
        resolvedCategoryRefs: [
          ...(categoryRefs.resolved || []),
          ...(categoryRefs.autoPicked || []),
        ],
      };

      const toolHandlers = {
         search_tags: async (prompt) => {
             try {
                const hasBooru = state.indexedBooruTags && state.indexedBooruTags.length > 0;
                let results = [];
                if (hasBooru) {
                   results = analyzeTagsForReplacements(state.indexedBooruTags, prompt);
                   const foundTags = results.map(r => r.canonical);
                   if (foundTags.length > 0) return { source: 'booru', found_canonical_tags: foundTags, original_matches: results.map(r => r.matchedPortion) };
                }

                const catTags = [];
                state.categories?.forEach(c => {
                   if (c.tags) catTags.push(...c.tags);
                });

                if (catTags.length > 0) {
                    const matchedFromCats = catTags.filter(ct =>
                        prompt.toLowerCase().includes(ct.toLowerCase().replace(/_/g, ' ')) ||
                        prompt.toLowerCase().includes(ct.toLowerCase())
                    );
                    if (matchedFromCats.length > 0) {
                       return { source: 'categories', found_tags: matchedFromCats };
                    }
                }

                return { result: "No exact matches found in local database, but you can suggest tags based on your knowledge." };
             } catch (err) {
                 console.error('Tool error:', err);
                 return { error: err.message };
             }
         }
      };

      const currentSettings = { ...state };

      // Apply per-message sampling overrides on top of global defaults.
      // `null` means "use whatever is in currentSettings", which is the global value.
      if (samplingOverrides.temperature != null) currentSettings.aiTemperature = samplingOverrides.temperature;
      if (samplingOverrides.topP != null)        currentSettings.aiTopP        = samplingOverrides.topP;
      if (samplingOverrides.topK != null)        currentSettings.aiTopK        = samplingOverrides.topK;

      let hasSentFirstChunk = false;
      const result = await sendChatMessage(historyBase, currentSettings, workspaceContext, (chunk) => {
        if (!hasSentFirstChunk) {
            setMessages(prev => [...prev, {
              id: assistantMsgId,
              role: 'assistant',
              content: chunk,
              _categoryRefs: categoryRefs, // snapshot for the response footer
              alternatives: [
                ...(seedAlternatives || []),
                { content: chunk },
              ],
              swipeIndex: seedIndex,
            }]);
            hasSentFirstChunk = true;
        } else {
            // Stream updates the visible (active) alternative. Earlier swipes
            // are preserved in msg.alternatives[0..swipeIndex-1].
            setMessages(prev => prev.map(m => {
              if (m.id !== assistantMsgId) return m;
              const idx = m.swipeIndex || 0;
              const alts = (m.alternatives || []).slice();
              alts[idx] = { ...(alts[idx] || {}), content: chunk };
              return { ...m, content: chunk, alternatives: alts };
            }));
        }
      }, toolHandlers);

      const responseText = typeof result === 'string' ? result : result?.text || '';
      const geminiParts = typeof result === 'object' && result?.geminiParts ? result.geminiParts : undefined;
      const reasoning_content = typeof result === 'object' && result?.reasoning_content ? result.reasoning_content : undefined;

      if (!hasSentFirstChunk) {
          setMessages(prev => [...prev, {
            id: assistantMsgId,
            role: 'assistant',
            content: responseText,
            geminiParts,
            reasoning_content,
            _categoryRefs: categoryRefs,
            alternatives: [
              ...(seedAlternatives || []),
              { content: responseText, geminiParts, reasoning_content },
            ],
            swipeIndex: seedIndex,
          }]);
      } else {
          setMessages(prev => prev.map(m => m.id === assistantMsgId
            ? {
                ...m,
                content: responseText,
                geminiParts,
                reasoning_content,
                _categoryRefs: categoryRefs,
                alternatives: [
                  ...((m.alternatives || []).slice(0, seedIndex)),
                  { content: responseText, geminiParts, reasoning_content },
                ],
                swipeIndex: seedIndex,
              }
            : m
          ));
      }
    } catch (e) {
      setMessages(prev => [...prev, { id: nextId(), role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handlePickCategory = (category) => {
    if (!picker) return;
    // Strategy: replace `&query` with the bare `CategoryName` (no `&` prefix)
    // so the textarea reads as plain prose. Because the `&` is gone, the
    // picker cannot re-open on this token (getActiveAmpQuery looks for `&`).
    // The chip below the textarea carries the metadata for the AI context.
    const before = input.slice(0, picker.start);
    // The query may have leading space if the user typed "& " or " &Ha".
    // Strip exactly one leading space from the original `&` substitution so
    // the prose reads naturally without doubling up.
    const oldRefLen = picker.end - picker.start; // includes the '&'
    let after = input.slice(picker.end);
    if (after.startsWith(' ')) after = after.slice(1); // we'll add our own space
    const insertedName = category.name;
    const sep = (before.length === 0 || /\s$/.test(before)) ? '' : ' ';
    const newText = before + sep + insertedName + (after.length ? (after.startsWith(' ') ? after : ' ' + after) : after);
    const newCaret = before.length + sep.length + insertedName.length;

    setInput(newText);

    // Record this reference so the AI gets explicit context and the chip renders.
    // We keep refText as `&CategoryName` for analyzer matching (findAmpTokens
    // looks for &-prefixed tokens, but we'll match the *bare* name against the
    // category library at send time too — see analyzeAmpTokens).
    const folder = (state.folders || []).find(f => f.id === category.folderId);
    setResolvedRefs(prev => [
      ...prev,
      {
        refText: '&' + insertedName,
        bareName: insertedName,
        categoryId: category.id,
        categoryName: category.name,
        categoryColor: category.color,
        folderId: category.folderId,
        folderName: folder?.name || '',
        tags: category.tags || [],
        // Track the textarea position where the bare name now lives so we
        // can update it if the user later edits around it.
        anchorPos: before.length + sep.length,
      },
    ]);

    setPicker(null);

    // Restore focus + caret position after React re-renders
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        try { ta.setSelectionRange(newCaret, newCaret); } catch (_) {}
      }
    });
  };

  const handleRemoveRef = (idx) => {
    setResolvedRefs(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSend = async (forcedText) => {
    let text = typeof forcedText === 'string' ? forcedText.trim() : input.trim();
    if ((!text && attachments.length === 0) || isTyping) return;

    let systemModifier = '';
    if (text.toLowerCase().startsWith('/fix ')) {
      systemModifier = `\n\nUSER COMMAND TRIGGERED: /fix\nThe user wants to normalize and fix tags in the following prompt. It may be written as a natural language paragraph. You MUST first identify the core visual concepts, characters, and styles in the prompt. Then use your search_tags tool to look up those concepts/tags in their local database. Finally, rewrite the prompt using the EXACT CANONICAL TAGS returned by the tool while preserving the structure.\n\nPrompt to fix: ${text.slice(5)}`;
      text = `Please normalize tags, concepts, and aliases for this prompt using my local database: "${text.slice(5)}"`;
    }

    // ── Validate &category references before sending ─────────────────────
    // We refuse to send if any `&Token` is still ambiguous (multiple matches
    // in different folders) or completely unknown. The user has to either
    // pick via the picker, or remove the reference.
    const draftAnalysis = analyzeAmpTokens(text);
    const blockers = [];
    if (draftAnalysis.ambiguous.length > 0) {
      draftAnalysis.ambiguous.forEach(a => {
        const folderNames = a.categories
          .map(c => (state.folders || []).find(f => f.id === c.folderId)?.name || 'unknown')
          .join(', ');
        blockers.push(`&${a.name} exists in: ${folderNames}`);
      });
    }
    if (draftAnalysis.unknown.length > 0) {
      draftAnalysis.unknown.forEach(u => blockers.push(`&${u.name} is not in your library`));
    }
    if (blockers.length > 0) {
      setSendBlocker(blockers);
      // Scroll the input into view + flash the textarea border
      textareaRef.current?.focus?.();
      return;
    }
    setSendBlocker(null);

    setInput('');
    setPicker(null);
    setResolvedRefs([]);
    const currentAttachments = [...attachments];
    setAttachments([]);
    const newMsg = {
      id: nextId(),
      role: 'user',
      content: text,
      attachments: currentAttachments,
      // Snapshot of resolved category context for this message. Attached to
      // the user message itself so regenerate / edit-resend stay consistent.
      _categoryRefs: {
        resolved: resolvedRefs,
        autoPicked: draftAnalysis.unique.map(u => {
          const folder = (state.folders || []).find(f => f.id === u.category.folderId);
          return {
            refText: `&${u.category.name}`,
            categoryId: u.category.id,
            categoryName: u.category.name,
            categoryColor: u.category.color,
            folderId: u.category.folderId,
            folderName: folder?.name || '',
            tags: u.category.tags || [],
            autoResolved: true,
          };
        }),
      },
    };
    const newHistory = [...messages, newMsg];
    setMessages(newHistory);

    // Stash system modifier on the message itself so regenerate/edit-resend
    // can re-apply it without leaking into aiCustomInstructions.
    if (systemModifier) {
      newHistory[newHistory.length - 1] = { ...newHistory[newHistory.length - 1], _systemModifier: systemModifier };
      setMessages(newHistory);
    }

    await runAI(newHistory);
  };

  // Regenerate the last assistant response by re-running with the
  // same history (dropping the trailing assistant message).
  const handleRegenerate = async () => {
    if (isTyping || messages.length < 2) return;
    // Find last user message index
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;

    // Capture the trailing assistant message's swipe history so the new
    // generation becomes a new alternative instead of clobbering everything
    // (this is what bumps the counter from 1/1 to 2/2, 3/3, ...).
    const trailingAssistant = messages
      .slice(lastUserIdx + 1)
      .reverse()
      .find(m => m.role === 'assistant');
    const seedAlternatives = trailingAssistant?.alternatives
      ? trailingAssistant.alternatives.slice()
      : (trailingAssistant ? [{ content: trailingAssistant.content }] : null);

    const baseHistory = messages.slice(0, lastUserIdx + 1);
    // Drop any trailing assistant message(s) so we get a fresh response
    setMessages(prev => {
      const idx = prev.findIndex((m, i) => i === lastUserIdx);
      return prev.slice(0, idx + 1);
    });
    await runAI(baseHistory, seedAlternatives);
  };

  // Delete a single message from the chat. Matches SillyTavern's behavior:
  // remove the bubble, leave the surrounding context intact. If the deleted
  // message was currently being edited, exit edit mode.
  const handleDeleteMessage = (msg) => {
    if (isTyping) return;
    setMessages(prev => prev.filter(m => m.id !== msg.id));
    setEditingId(prev => (prev === msg.id ? null : prev));
  };

  // Swipe right (next alternative). If we're on the last alternative,
  // request a fresh generation by truncating history after the previous
  // user message — this is SillyTavern's "swipe to re-roll" behavior.
  const handleSwipeNext = async (msg) => {
    if (isTyping) return;
    const alts = msg.alternatives || [{ content: msg.content }];
    const idx = msg.swipeIndex || 0;
    if (idx < alts.length - 1) {
      // Just move to the next already-generated alternative.
      const nextIdx = idx + 1;
      const next = alts[nextIdx];
      setMessages(prev => prev.map(m => m.id === msg.id
        ? { ...m, content: next.content, geminiParts: next.geminiParts, reasoning_content: next.reasoning_content, swipeIndex: nextIdx }
        : m
      ));
    } else {
      // Re-roll: drop this assistant message, keep history up to the prior
      // user turn, then runAI to produce a new alternative.
      let lastUserIdx = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].id === msg.id) break;
        if (messages[i].role === 'user') { lastUserIdx = i; break; }
      }
      if (lastUserIdx === -1) return;
      const baseHistory = messages.slice(0, lastUserIdx + 1);
      setMessages(prev => prev.slice(0, lastUserIdx + 1));
      await runAI(baseHistory);
    }
  };

  // Swipe left (previous alternative) — only available if we've already
  // swiped right at least once on this message.
  const handleSwipePrev = (msg) => {
    if (isTyping) return;
    const alts = msg.alternatives || [{ content: msg.content }];
    const idx = msg.swipeIndex || 0;
    if (idx <= 0) return;
    const prevIdx = idx - 1;
    const prevAlt = alts[prevIdx];
    setMessages(prev => prev.map(m => m.id === msg.id
      ? { ...m, content: prevAlt.content, geminiParts: prevAlt.geminiParts, reasoning_content: prevAlt.reasoning_content, swipeIndex: prevIdx }
      : m
    ));
  };

  // Copy the visible (active) text of a message to the clipboard.
  const handleCopyMessage = async (msg) => {
    const text = msg.content ?? '';
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts (some Tauri webview builds).
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopyState(prev => ({ ...prev, [msg.id]: true }));
      setTimeout(() => {
        setCopyState(prev => {
          const next = { ...prev };
          delete next[msg.id];
          return next;
        });
      }, 1200);
    } catch (e) {
      console.warn('[ChatAssistant] copy failed', e);
    }
  };

  // Edit a previously sent user message — truncates history after it
  // and re-runs the AI turn with the new content.
  const startEditMessage = (msg) => {
    if (isTyping) return;
    setEditingId(msg.id);
    setEditingContent(msg.content || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingContent('');
  };

  const saveEditAndResend = async (msg) => {
    const trimmed = editingContent.trim();
    if (!trimmed || isTyping) return;

    // Find index of the edited message
    const idx = messages.findIndex(m => m.id === msg.id);
    if (idx === -1) return;

    // Rebuild history up to and including the edited message
    const updated = { ...msg, content: trimmed };
    const newHistory = [...messages.slice(0, idx), updated];

    // Apply /fix command rewriting if applicable (mirrors handleSend logic)
    if (trimmed.toLowerCase().startsWith('/fix ')) {
      const systemModifier = `\n\nUSER COMMAND TRIGGERED: /fix\nThe user wants to normalize and fix tags in the following prompt. It may be written as a natural language paragraph. You MUST first identify the core visual concepts, characters, and styles in the prompt. Then use your search_tags tool to look up those concepts/tags in their local database. Finally, rewrite the prompt using the EXACT CANONICAL TAGS returned by the tool while preserving the structure.\n\nPrompt to fix: ${trimmed.slice(5)}`;
      newHistory[newHistory.length - 1] = {
        ...newHistory[newHistory.length - 1],
        content: `Please normalize tags, concepts, and aliases for this prompt using my local database: "${trimmed.slice(5)}"`,
        _systemModifier: systemModifier
      };
    }

    setMessages(newHistory);
    setEditingId(null);
    setEditingContent('');
    await runAI(newHistory);
  };

  return (
    <div className={`w-[380px] flex-shrink-0 flex flex-col h-full shadow-2xl relative z-50 border-l ${!isOpen ? 'hidden' : 'animate-in slide-in-from-right-8 duration-200'}`}
         style={{ background: 'var(--bg-panel)', borderColor: 'var(--border-subtle)' }}>
      {/* Header */}
      <div className="flex-shrink-0 h-[56px] px-4 flex items-center justify-between border-b relative"
           style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-panel)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] shadow-sm">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="flex flex-col gap-1.5">
              <div className="font-bold text-sm leading-none flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                AI Assistant
                <span className="px-1.5 py-0.5 rounded-full text-[9px] uppercase font-bold"
                      style={{ background: 'var(--bg-active)', color: 'var(--accent-primary)' }}>
                  Beta
                </span>
              </div>
              <ModelIndicator provider={state.aiProvider} model={state.aiModel} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setIsSettingsOpen(true)} className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
                  style={{ color: 'var(--text-muted)' }} title="AI Settings">
            <Settings2 size={16} />
          </button>
          <button onClick={onClose}
                  className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
                  style={{ color: 'var(--text-muted)' }} title="Close Assistant">
            <PanelRightClose size={16} />
          </button>
        </div>
      </div>



      {/* Chat Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar"
           style={{ background: 'var(--bg-base)' }}>
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          const isEditing = editingId === msg.id;
          // Find the last assistant message index — that's where regenerate goes.
          const lastAssistantIdx = (() => {
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i].role === 'assistant') return i;
            }
            return -1;
          })();
          const canRegenerate = msg.role === 'assistant' && idx === lastAssistantIdx && !isTyping;
          const canEdit = isUser && !isTyping;
          const canDelete = msg.role !== 'system' && !isTyping;
          // Swipe is only meaningful on the last assistant message so it
          // doesn't fight with regenerate on a different bubble.
          const canSwipe = msg.role === 'assistant' && idx === lastAssistantIdx && !isTyping;
          const swipeIdx = msg.swipeIndex || 0;
          const swipeCount = msg.alternatives?.length || 1;
          const canSwipeLeft = canSwipe && swipeIdx > 0;
          const canSwipeRight = canSwipe; // right is always available (last index re-rolls)
          const canCopy = !isTyping && (msg.content?.length ?? 0) > 0;

          return (
          <div key={msg.id} className={`group flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 shadow-sm
                            ${msg.role === 'assistant'
                              ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20'
                              : 'bg-white/5 text-[var(--text-secondary)] border border-white/10'}`}>
              {msg.role === 'assistant' ? <Bot size={15} /> : <User size={15} />}
            </div>

            {/* Bubble + actions */}
            <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[82%]`}>
              <div className={`text-sm leading-relaxed w-full
                              ${isUser
                                ? 'rounded-[20px] rounded-br-[4px] shadow-sm'
                                : 'rounded-[20px] rounded-tl-[4px] shadow-sm'}`}
                   style={
                     msg.role === 'assistant'
                       ? { background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }
                       : { background: 'var(--accent-primary)', color: 'white' }
                   }>
                {isEditing ? (
                  <div className="p-3 flex flex-col gap-2">
                    <textarea
                      autoFocus
                      value={editingContent}
                      onChange={e => setEditingContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          saveEditAndResend(msg);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      className="w-full bg-black/20 text-white text-sm outline-none resize-none custom-scrollbar min-h-[60px] max-h-[200px] rounded-lg p-2"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={cancelEdit}
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 hover:bg-white/10 transition-colors"
                        style={{ color: 'white' }}
                      >
                        <X size={12} /> Cancel
                      </button>
                      <button
                        onClick={() => saveEditAndResend(msg)}
                        disabled={!editingContent.trim()}
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
                        style={{ background: 'white', color: 'var(--accent-primary)' }}
                      >
                        <Check size={12} /> Save & Resend
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-3">
                    {msg.reasoning_content && (
                      <div className="mb-2 p-3 text-xs rounded-xl bg-black/10 border border-white/5 opacity-80 whitespace-pre-wrap max-h-40 overflow-y-auto">
                        <span className="font-bold opacity-50 uppercase tracking-wider block mb-1">Thought Process</span>
                        {msg.reasoning_content}
                      </div>
                    )}
                    {msg.role === 'assistant' ? <ParsedMessage content={msg.content} /> : <div className="whitespace-pre-wrap">{msg.content}</div>}

                    {/* Assistant response footer: confirms which &category refs were used */}
                    {msg.role === 'assistant' && msg._categoryRefs && (msg._categoryRefs.resolved?.length > 0 || msg._categoryRefs.autoPicked?.length > 0) && (
                      <div className="mt-2 pt-2 border-t border-white/5 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="font-bold uppercase tracking-wider opacity-50 flex items-center gap-1">
                          <Sparkles size={9} /> Used references:
                        </span>
                        {[...(msg._categoryRefs.resolved || []), ...(msg._categoryRefs.autoPicked || [])].map((r, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border"
                            style={{
                              background: (r.categoryColor || '#6b7280') + '15',
                              borderColor: (r.categoryColor || '#6b7280') + '40',
                              color: 'inherit',
                            }}
                            title={`${r.folderName} › ${r.categoryName} · ${(r.tags || []).length} tags`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: r.categoryColor || '#6b7280' }} />
                            <span className="opacity-70">{r.folderName} ›</span>
                            <span className="font-semibold">{r.categoryName}</span>
                            <span className="opacity-50">({(r.tags || []).length})</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {msg.role === 'user' && msg._categoryRefs && (msg._categoryRefs.resolved?.length > 0 || msg._categoryRefs.autoPicked?.length > 0) && (
                      <div className="mt-2 pt-2 border-t border-white/10 flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 flex items-center gap-1">
                          <Tag size={10} /> Anchored to:
                        </span>
                        {msg._categoryRefs.resolved?.map((r, i) => (
                          <span
                            key={`res-${i}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border"
                            style={{
                              background: (r.categoryColor || '#6b7280') + '25',
                              borderColor: (r.categoryColor || '#6b7280') + '70',
                              color: 'inherit',
                            }}
                            title={`${r.folderName} › ${r.categoryName} · ${(r.tags || []).length} tags`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: r.categoryColor || '#6b7280' }} />
                            <span className="opacity-70">{r.folderName} ›</span>
                            <span className="font-semibold">{r.categoryName}</span>
                          </span>
                        ))}
                        {msg._categoryRefs.autoPicked?.map((r, i) => (
                          <span
                            key={`auto-${i}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border border-dashed"
                            style={{
                              background: (r.categoryColor || '#6b7280') + '15',
                              borderColor: (r.categoryColor || '#6b7280') + '50',
                              color: 'inherit',
                            }}
                            title={`Auto-resolved (single match) — ${r.folderName} › ${r.categoryName}`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full opacity-70" style={{ background: r.categoryColor || '#6b7280' }} />
                            <span className="opacity-70">{r.folderName} ›</span>
                            <span className="font-semibold">{r.categoryName}</span>
                            <span className="opacity-50 text-[9px]">auto</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {msg.role === 'user' && msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {msg.attachments.map((att, idx) => (
                          <img key={idx} src={`data:${att.type};base64,${att.data}`} alt="attachment" className="max-w-[150px] max-h-[150px] object-cover rounded-lg border border-white/20" />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action row (visible on hover) */}
              {!isEditing && (canEdit || canRegenerate || canDelete || canSwipe || canCopy) && (
                <div className={`flex gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity items-center ${isUser ? 'flex-row-reverse' : ''}`}>
                  {canEdit && (
                    <button
                      onClick={() => startEditMessage(msg)}
                      className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 hover:bg-white/10 transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      title="Edit message"
                    >
                      <Pencil size={11} /> Edit
                    </button>
                  )}
                  {canRegenerate && (
                    <button
                      onClick={handleRegenerate}
                      className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 hover:bg-white/10 transition-colors"
                      style={{ color: 'var(--accent-primary)' }}
                      title="Regenerate response"
                    >
                      <RefreshCw size={11} /> Regenerate
                    </button>
                  )}
                  {canSwipe && (
                    <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-md" style={{ color: 'var(--text-muted)' }} title="Cycle alternatives">
                      <button
                        onClick={() => handleSwipePrev(msg)}
                        disabled={!canSwipeLeft}
                        className="p-0.5 rounded hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Previous alternative"
                      >
                        <ChevronLeft size={12} />
                      </button>
                      <span className="text-[9px] font-mono tabular-nums px-1 min-w-[28px] text-center select-none">
                        {swipeIdx + 1}/{swipeCount}
                      </span>
                      <button
                        onClick={() => handleSwipeNext(msg)}
                        disabled={!canSwipeRight}
                        className="p-0.5 rounded hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Next alternative (re-rolls if at the end)"
                      >
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  )}
                  {canCopy && (
                    <button
                      onClick={() => handleCopyMessage(msg)}
                      className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 hover:bg-white/10 transition-colors"
                      style={{ color: copyState[msg.id] ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                      title="Copy message text"
                    >
                      {copyState[msg.id] ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => handleDeleteMessage(msg)}
                      className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 hover:bg-white/10 transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      title="Delete message"
                    >
                      <Trash2 size={11} /> Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          );
        })}
        {isTyping && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 shadow-sm bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20">
              <Sparkles size={15} />
            </div>
            <div className="px-4 py-3 rounded-[20px] rounded-tl-[4px] text-sm flex items-center shadow-sm"
                 style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
              <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          </div>
        )}
      </div>

      {/* Context Chips (Suggestions) */}
      <div className="px-4 py-2 flex gap-2 overflow-x-auto custom-scrollbar border-t"
           style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
        {["Suggest scenery tags", "Enhance prompt quality", "Optimize for style"].map(s => (
          <button key={s} 
                  onClick={() => handleSend(s)}
                  className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer flex-shrink-0 transition-all hover:brightness-110"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--accent-primary)', border: '1px solid var(--border-default)' }}>
            {s}
          </button>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-4 pt-3 border-t flex-shrink-0"
           style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
        <div className="relative rounded-xl focus-within:ring-2 focus-within:ring-[var(--accent-primary)] focus-within:ring-opacity-50 transition-all flex flex-col"
             style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}>
          <textarea
            id="ai-chat-textarea"
            ref={textareaRef}
            value={input}
            onChange={e => {
              const next = e.target.value;
              setInput(next);
              const caret = e.target.selectionStart ?? next.length;
              const candidate = getActiveAmpQuery(next, caret);
              // After a picker commit the textarea contains the bare category
              // name (no `&`), so getActiveAmpQuery returns null and the
              // picker stays closed naturally. It only re-opens when the user
              // types a fresh `&`.
              setPicker(candidate);
            }}
            placeholder={
              attachments.length > 0
                ? `📷 ${attachments.length} image${attachments.length > 1 ? 's' : ''} attached — ask AI about them...`
                : "Ask AI to refine your prompt..."
            }
            className="w-full bg-transparent p-3 pb-0 text-sm outline-none resize-none custom-scrollbar min-h-[60px] max-h-[120px]"
            style={{ color: 'var(--text-primary)' }}
            onKeyDown={(e) => {
              // Picker keyboard nav takes precedence
              if (picker) {
                if (e.key === 'Escape') { e.preventDefault(); setPicker(null); return; }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  // Let our picker handler decide if there's an active match
                  const matches = (state.categories || [])
                    .filter(c => c.name.toLowerCase().startsWith((picker.query || '').toLowerCase()))
                    .slice(0, 8);
                  if (matches.length > 0) {
                    e.preventDefault();
                    const idx = (() => {
                      // Find which item is highlighted via data-attr; default to 0
                      return 0;
                    })();
                    handlePickCategory(matches[idx]);
                    return;
                  }
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />

          {/* Send-time warning: ambiguous / unknown &category refs */}
          {sendBlocker && sendBlocker.length > 0 && (
            <div
              className="mx-3 mt-1.5 mb-1 px-3 py-2 rounded-lg text-[11px] border flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-150"
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                borderColor: 'rgba(239, 68, 68, 0.4)',
                color: '#fca5a5',
              }}
              role="alert"
            >
              <AlertCircle size={13} className="flex-shrink-0 mt-px" style={{ color: '#ef4444' }} />
              <div className="flex-1">
                <div className="font-semibold mb-0.5" style={{ color: '#fca5a5' }}>
                  Can't send — fix these &category references first:
                </div>
                <ul className="space-y-0.5 ml-3 list-disc" style={{ color: '#fca5a5' }}>
                  {sendBlocker.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
                <div className="mt-1 text-[10px] opacity-75">
                  Tip: type <span className="font-mono">&Name</span> to bring up the picker, or remove the reference.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSendBlocker(null)}
                className="rounded hover:bg-white/10 p-0.5 flex-shrink-0"
                aria-label="Dismiss warning"
              >
                <X size={11} />
              </button>
            </div>
          )}

          {/* Resolved &category chips — sit inline below textarea */}
          {resolvedRefs.length > 0 && (
            <div className="flex flex-wrap gap-1 px-3 pb-1.5">
              {resolvedRefs.map((ref, i) => (
                <span
                  key={`${ref.refText}-${i}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border"
                  style={{
                    background: (ref.categoryColor || '#6b7280') + '20',
                    borderColor: (ref.categoryColor || '#6b7280') + '60',
                    color: 'var(--text-primary)',
                  }}
                  title={ref.tags.length > 0 ? `Tags: ${ref.tags.slice(0, 12).join(', ')}${ref.tags.length > 12 ? '…' : ''}` : ref.folderName}
                >
                  <FolderTree size={10} style={{ color: ref.categoryColor || '#6b7280' }} />
                  <span style={{ color: ref.categoryColor || '#6b7280' }}>{ref.folderName}</span>
                  <span style={{ opacity: 0.5 }}>›</span>
                  <span>{ref.categoryName}</span>
                  <span style={{ opacity: 0.5 }}>·</span>
                  <span style={{ opacity: 0.7 }}>{ref.tags.length} tag{ref.tags.length === 1 ? '' : 's'}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRef(i)}
                    className="ml-0.5 rounded-sm hover:bg-black/30 flex items-center justify-center w-3.5 h-3.5"
                    aria-label={`Remove ${ref.refText}`}
                  >
                    <X size={9} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Inline picker dropdown for &category references */}
          {picker && (
            <CategoryPicker
              categories={state.categories || []}
              folders={state.folders || []}
              query={picker.query}
              onPick={handlePickCategory}
              onDismiss={() => setPicker(null)}
            />
          )}

          {attachments.length > 0 && (
            <div className="flex px-3 gap-2 pb-2 overflow-x-auto custom-scrollbar">
              {attachments.map((att, i) => (
                <div key={i} className="relative w-12 h-12 rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] flex-shrink-0">
                  <img src={`data:${att.type};base64,${att.data}`} className="w-full h-full object-cover rounded" alt="upload preview" />
                  <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1.5 -right-1.5 bg-red-500 rounded-full text-white w-4 h-4 flex items-center justify-center text-[10px] hover:bg-red-600 shadow-sm z-10">✕</button>
                </div>
              ))}
            </div>
          )}
          
          {/* Action Row */}
          <div className="flex justify-between items-center px-2 py-2 mt-1">
            <div className="flex gap-1.5">
              <SamplingPopover
                overrides={samplingOverrides}
                onChange={setSamplingOverrides}
                onReset={() => setSamplingOverrides({ temperature: null, topP: null, topK: null })}
                anchorRef={samplingBtnRef}
              />
              <label className="p-1.5 rounded-lg transition-colors hover:bg-white/10 cursor-pointer"
                      title="Import file or image from desktop"
                      style={{ color: 'var(--text-muted)' }}>
                <FolderUp size={16} />
                <input 
                  type="file" 
                  accept=".txt,.md,.json,image/*" 
                  className="hidden" 
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (file.type.startsWith('image/')) {
                      const reader = new FileReader();
                      reader.onload = (e) => {
                        setAttachments(prev => [...prev, {
                          name: file.name,
                          type: file.type,
                          data: e.target.result.split(',')[1] // base64
                        }]);
                      };
                      reader.readAsDataURL(file);
                    } else {
                      try {
                        const text = await file.text();
                        setInput(prev => prev + (prev ? '\n\n' : '') + `[Imported from ${file.name}]\n` + text);
                      } catch (err) {
                        console.error('Failed to read file:', err);
                      }
                    }
                    e.target.value = ''; 
                  }}
                />
              </label>
            </div>
            <button className="p-1.5 rounded-lg transition-transform hover:scale-105 active:scale-95"
                    style={{ background: 'var(--accent-primary)', color: 'white', opacity: (input.trim() || attachments.length > 0) && !isTyping ? 1 : 0.5 }}
                    disabled={(!input.trim() && attachments.length === 0) || isTyping}
                    onClick={handleSend}>
              <Send size={15} className="mr-0.5 mt-0.5" />
            </button>
          </div>
        </div>
        
        <div className="flex justify-between items-center mt-3 px-1">
          <div className="text-[10px] uppercase font-bold tracking-wider flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
             Workspace Context <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          </div>
          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Shift+Enter for newline
          </div>
        </div>
      </div>
      
      <AISettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
