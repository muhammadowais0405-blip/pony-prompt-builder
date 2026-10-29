import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useStore, saveTagImageFile, loadTagImageUrl, deleteTagImageFile } from '../store/index.jsx';
import {
  Plus, X, ChevronDown, ChevronRight, Trash2, Tag, Search, Check,
  Download, Upload, HardDrive, Clock, ImagePlus, ImageOff, Pencil,
  LayoutGrid, List, FolderOpen, FolderCog, ExternalLink, RefreshCw, Database,
  GripVertical, Eye, EyeOff, Star, User, Palette
} from 'lucide-react';
import { ConfirmModal } from './RightColumn.jsx';

const COLOR_OPTIONS = [
  { id: 'cat-blue', hex: '#3b82f6', label: 'Blue' },
  { id: 'cat-violet', hex: '#8b5cf6', label: 'Violet' },
  { id: 'cat-emerald', hex: '#10b981', label: 'Emerald' },
  { id: 'cat-amber', hex: '#f59e0b', label: 'Amber' },
  { id: 'cat-rose', hex: '#f43f5e', label: 'Rose' },
  { id: 'cat-cyan', hex: '#06b6d4', label: 'Cyan' },
  { id: 'cat-orange', hex: '#f97316', label: 'Orange' },
  { id: 'cat-pink', hex: '#ec4899', label: 'Pink' },
  { id: 'cat-lime', hex: '#84cc16', label: 'Lime' },
  { id: 'cat-indigo', hex: '#6366f1', label: 'Indigo' },
];
function getHex(colorId) { return COLOR_OPTIONS.find(c => c.id === colorId)?.hex || '#3b82f6'; }

// Returns true if a hex background color needs dark text for contrast
function needsDarkText(hex) {
  if (!hex || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // W3C relative luminance – if it’s > 0.5, use dark text for better contrast
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.5;
}

// ─── Custom Hook: Click Outside ────────────────────────────────────────────────
function useOnClickOutside(ref, handler) {
  useEffect(() => {
    const listener = (event) => {
      if (!ref.current || ref.current.contains(event.target)) return;
      handler(event);
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}

// ─── Add Category Modal ────────────────────────────────────────────────────────
function AddCategoryModal({ folderId, onClose }) {
  const { actions } = useStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState('cat-violet');
  const handleSubmit = () => {
    if (!name.trim()) return;
    actions.addCategory(folderId, name.trim(), color);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" onClick={onClose}>
      <div className="fade-slide-in w-72 rounded-xl p-5 shadow-2xl"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold" style={{ color: 'var(--text-white)' }}>Add Category</h3>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={15} /></button>
        </div>
        <div className="mb-3">
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Name</label>
          <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="e.g. Lighting, Poses…"
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} />
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Color</label>
          <div className="flex flex-wrap gap-2">
            {COLOR_OPTIONS.map(c => (
              <button key={c.id} onClick={() => setColor(c.id)} title={c.label}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: c.hex, outline: color === c.id ? '2px solid #fff' : 'none', outlineOffset: 2, opacity: color === c.id ? 1 : 0.5 }}>
                {color === c.id && <Check size={12} color="#fff" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={!name.trim()}
            className="flex-1 py-2 rounded-lg text-sm font-bold disabled:opacity-40"
            style={{ background: getHex(color), color: '#fff' }}>Add</button>
        </div>
      </div>
    </div>
  );
}

// ─── Booru File List (Draggable) ──────────────────────────────────────────────
function BooruFileList() {
  const { state, actions } = useStore();
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const handleDragStart = (idx) => setDraggedIdx(idx);
  const handleDragOver = (e, idx) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const handleDrop = (e, targetIdx) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIdx) {
      setDraggedIdx(null); setDragOverIdx(null);
      return;
    }
    const newList = [...state.booruFiles];
    const [moved] = newList.splice(draggedIdx, 1);
    newList.splice(targetIdx, 0, moved);
    actions.reorderBooruFiles(newList);
    setDraggedIdx(null); setDragOverIdx(null);
  };

  const toggleFile = (idx) => {
    const newList = [...state.booruFiles];
    newList[idx] = { ...newList[idx], enabled: !newList[idx].enabled };
    actions.reorderBooruFiles(newList);
  };

  if (!state.booruFiles?.length) return null;

  return (
    <div className="mt-3 space-y-1 max-h-[150px] overflow-y-auto custom-scrollbar pr-1">
      <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1.5">Priority Order (Drag to reorder)</p>
      {state.booruFiles.map((file, idx) => (
        <div
          key={file.path}
          draggable
          onDragStart={() => handleDragStart(idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDrop={(e) => handleDrop(e, idx)}
          onDragEnd={() => { setDraggedIdx(null); setDragOverIdx(null); }}
          className="group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-fast"
          style={{
            background: dragOverIdx === idx ? 'var(--bg-active)' : 'var(--bg-elevated)',
            border: `1px solid ${dragOverIdx === idx ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
            opacity: file.enabled ? 1 : 0.4
          }}
        >
          <GripVertical size={12} className="cursor-grab opacity-20 group-hover:opacity-100 transition-fast" style={{ color: 'var(--text-muted)' }} />
          <span className="flex-1 text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {idx + 1}. {file.name}
          </span>
          <button onClick={() => toggleFile(idx)} className="p-1 transition-fast hover:opacity-70" style={{ color: file.enabled ? 'var(--accent-blue)' : 'var(--text-muted)' }}>
            {file.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Backup/Restore Panel ──────────────────────────────────────────────────────
function BackupPanel({ onClose }) {
  const { state, actions } = useStore();
  const [autoEnabled, setAutoEnabled] = useState(state.autoBackupEnabled || false);
  const [intervalMins, setIntervalMins] = useState(state.autoBackupIntervalMins || 60);
  const [lastBackup, setLastBackup] = useState(null);
  const [restoreError, setRestoreError] = useState('');
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const fileRef = useRef(null);
  const timerRef = useRef(null);

  // Build backup JSON from current state
  const buildBackupData = useCallback(() => ({
    version: 1,
    exportedAt: new Date().toISOString(),
    folders: state.folders,
    categories: state.categories,
    prompts: state.prompts,
    trashedPrompts: state.trashedPrompts,
    tagImageFiles: state.tagImageFiles,
  }), [state]);

  // Download backup file
  const handleManualBackup = () => {
    const data = buildBackupData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pony-prompt-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setLastBackup(new Date().toLocaleTimeString());
  };

  // Auto-backup timer — uses a ref to the latest backup fn to avoid stale closure
  const backupFnRef = useRef(handleManualBackup);
  useEffect(() => { backupFnRef.current = handleManualBackup; });
  useEffect(() => {
    clearInterval(timerRef.current);
    if (!autoEnabled) return;
    timerRef.current = setInterval(() => backupFnRef.current(), intervalMins * 60 * 1000);
    return () => clearInterval(timerRef.current);
  }, [autoEnabled, intervalMins]);

  const handleSaveSettings = () => {
    actions.setBackupSettings(autoEnabled, intervalMins);
  };

  // Restore from file
  const handleRestore = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        let data = JSON.parse(ev.target.result);
        
        // Allow migration from older versions or missing fields
        if (!data.version || !data.folders || (!data.categories && !data.tags)) {
          console.warn('Backup file is missing standard fields, attempting to recover data');
          // If the old format was just an array, try to guess
          const parsedOrigin = JSON.parse(ev.target.result);
          if (Array.isArray(parsedOrigin)) {
            if (parsedOrigin.length > 0 && (parsedOrigin[0].positive !== undefined || parsedOrigin[0].negative !== undefined)) {
              data.prompts = parsedOrigin;
            }
          }
        }
        
        // Map old data structures if necessary
        data.categories = data.categories || data.tags || undefined;
        data.version = data.version || '1.0.0';
        
        // Dispatch a full restore action
        window.dispatchEvent(new CustomEvent('restore-backup', { detail: data }));
        setRestoreSuccess(true);
        setTimeout(() => { setRestoreSuccess(false); onClose(); }, 1500);
      } catch (err) {
        setRestoreError('Invalid backup file: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center modal-backdrop" onClick={onClose}>
      <div className="fade-slide-in rounded-2xl shadow-2xl overflow-hidden"
        style={{ width: 380, background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--accent-blue)', color: '#fff' }}>
              <HardDrive size={15} />
            </div>
            <div>
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-white)' }}>Backup & Restore</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Export or import your library data</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center transition-fast hover:opacity-70"
            style={{ color: 'var(--text-muted)', background: 'var(--bg-hover)' }}><X size={14} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Manual backup */}
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-white)' }}>Manual Backup</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Save all prompts, tags & images to a .json file
                </p>
              </div>
              <button onClick={handleManualBackup}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-fast hover:brightness-110"
                style={{ background: 'var(--accent-blue)', color: '#fff' }}>
                <Download size={12} /> Export
              </button>
            </div>
            {lastBackup && (
              <p className="text-xs mt-1" style={{ color: 'var(--accent-emerald)' }}>
                ✓ Last backup at {lastBackup}
              </p>
            )}
          </div>

          {/* Auto-backup */}
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-white)' }}>Auto Backup</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Automatically download backups</p>
              </div>
              {/* Toggle switch */}
              <button onClick={() => setAutoEnabled(v => !v)}
                className="relative w-10 h-5 rounded-full transition-fast flex-shrink-0"
                style={{ background: autoEnabled ? 'var(--accent-blue)' : 'var(--bg-active)', border: '1px solid var(--border-strong)' }}>
                <span className="absolute top-0.5 w-4 h-4 rounded-full transition-fast"
                  style={{ background: '#fff', left: autoEnabled ? '20px' : '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
              </button>
            </div>
            {autoEnabled && (
              <div className="flex items-center gap-2">
                <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Every</span>
                <select value={intervalMins} onChange={e => setIntervalMins(Number(e.target.value))}
                  className="rounded-lg px-2 py-1 text-xs font-medium"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={120}>2 hours</option>
                  <option value={360}>6 hours</option>
                </select>
                <button onClick={handleSaveSettings}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold transition-fast hover:brightness-110"
                  style={{ background: 'var(--accent-emerald)', color: '#fff' }}>Save</button>
              </div>
            )}
          </div>

          {/* Booru Suggestion Database */}
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-white)' }}>Local Booru Database</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Excel-based tag suggestions</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={async () => {
                    if (!window.__TAURI__) return;
                    const { invoke } = await import('@tauri-apps/api/core');
                    const selected = await invoke('pick_images_folder');
                    if (selected) actions.setBooruFolder(selected);
                  }}
                  className="p-1.5 rounded-lg transition-fast hover:bg-white/5"
                  style={{ color: 'var(--accent-blue)', border: '1px solid var(--border-subtle)' }}
                  title="Change tag folder">
                  <FolderCog size={14} />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2.5 rounded-lg"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <FolderOpen size={13} style={{ color: 'var(--accent-amber)', flexShrink: 0 }} />
                <p className="text-[10px] font-mono truncate flex-1" style={{ color: 'var(--text-secondary)' }}>
                  {state.booruTagFolder || 'No folder selected'}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database size={13} style={{ color: 'var(--text-muted)' }} />
                  <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                    {(state.indexedBooruTags?.length || 0).toLocaleString()} Tags Indexed
                  </span>
                </div>
                <button 
                  onClick={() => actions.syncBooruTags()}
                  disabled={!state.booruTagFolder || state.isIndexingBooru}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-fast disabled:opacity-30"
                  style={{ background: 'var(--accent-blue)', color: '#fff' }}>
                  <RefreshCw size={11} className={state.isIndexingBooru ? 'animate-spin' : ''} />
                  {state.isIndexingBooru ? 'Indexing…' : 'Sync Now'}
                </button>
              </div>

              <BooruFileList />
            </div>
          </div>

          {/* Restore */}
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-white)' }}>Restore from Backup</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Import a .json backup file</p>
              </div>
              <button onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-fast hover:brightness-110"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }}>
                <Upload size={12} /> Import
              </button>
            </div>
            <input ref={fileRef} type="file" accept=".json" onChange={handleRestore} style={{ display: 'none' }} />
            {restoreError && <p className="text-xs mt-1" style={{ color: 'var(--accent-rose)' }}>{restoreError}</p>}
            {restoreSuccess && <p className="text-xs mt-1" style={{ color: 'var(--accent-emerald)' }}>✓ Restore successful!</p>}
            <p className="text-xs mt-2 px-3 py-2 rounded-lg" style={{ background: '#f59e0b18', color: '#f59e0b' }}>
              ⚠ Restoring will replace all current data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tag Context Menu (with image option) ─────────────────────────────────────
function TagContextMenu({ x, y, selectedCount, singleTag, categoryId, hex, onAddPositive, onAddNegative, onDelete, onClose }) {
  const { state, actions } = useStore();
  const ref = useRef(null);
  const imageInputRef = useRef(null);
  const isSingle = selectedCount === 1;
  const imgKey = isSingle ? `${categoryId}::${singleTag}` : null;
  const hasImage = imgKey && !!state.tagImageFiles?.[imgKey];

  useOnClickOutside(ref, onClose);

  const menuW = 210, menuH = 220;
  const cx = Math.max(8, Math.min(x, window.innerWidth - menuW - 8));
  const cy = Math.max(8, Math.min(y, window.innerHeight - menuH - 8));

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file || !isSingle) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const filename = await saveTagImageFile(categoryId, singleTag, ev.target.result, file.type);
        actions.setTagImage(categoryId, singleTag, filename);
      } catch (err) {
        console.error('Failed to save tag image', err);
      }
      onClose();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveImage = async () => {
    // Delete file from disk then clear from state
    const filename = state.tagImageFiles?.[`${categoryId}::${singleTag}`];
    if (filename) await deleteTagImageFile(filename);
    actions.setTagImage(categoryId, singleTag, null);
    onClose();
  };

  return (
    <>
      <div ref={ref}
        className="fixed z-[200] rounded-xl py-1.5 shadow-2xl fade-slide-in select-none"
        style={{ left: cx, top: cy, width: menuW, background: '#1a1f28', border: '1px solid var(--border-strong)' }}>

        <div className="px-3 py-1.5 mb-1" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <span className="text-xs font-bold" style={{ color: hex }}>
            {selectedCount} tag{selectedCount !== 1 ? 's' : ''} selected
          </span>
        </div>

        <button onClick={() => { onAddPositive(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-fast hover:brightness-110"
          style={{ color: '#10b981' }}>
          <span style={{ width: 14, color: '#10b981' }}>＋</span> Add to Positive
        </button>

        <button onClick={() => { onAddNegative(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-fast hover:brightness-110"
          style={{ color: '#f43f5e' }}>
          <span style={{ width: 14, color: '#f43f5e' }}>－</span> Add to Negative
        </button>

        {isSingle && (
          <>
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '3px 0' }} />
            {!hasImage ? (
              <button onClick={() => imageInputRef.current?.click()}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-fast"
                style={{ color: 'var(--text-primary)' }}>
                <ImagePlus size={12} style={{ color: 'var(--accent-cyan)' }} /> Add Image Preview
              </button>
            ) : (
              <button onClick={handleRemoveImage}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-fast"
                style={{ color: 'var(--accent-amber)' }}>
                <ImageOff size={12} /> Remove Image
              </button>
            )}
          </>
        )}

        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '3px 0' }} />

        <button onClick={() => { onDelete(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-fast"
          style={{ color: '#f43f5e' }}>
          <Trash2 size={12} style={{ color: '#f43f5e' }} />
          Trash {selectedCount} Tag{selectedCount !== 1 ? 's' : ''}
        </button>

        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '3px 0' }} />

        <button onClick={onClose}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-fast"
          style={{ color: 'var(--text-muted)' }}>
          <X size={12} /> Cancel
        </button>
      </div>

      {/* Hidden file input for image upload */}
      <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/avif" onChange={handleImageSelect} style={{ display: 'none' }} />
    </>
  );
}

// ─── Tag Pill with image hover preview ────────────────────────────────────────
function TagPill({ tag, categoryId, hex, selected, selectedTags, onClickAdd, onContextMenu }) {
  const { state } = useStore();
  const [dragging, setDragging] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewPos, setPreviewPos] = useState({ x: 0, y: 0 });
  const [imageUrl, setImageUrl] = useState(null);
  const [popping, setPopping] = useState(false);
  const pillRef = useRef(null);

  const imgKey = `${categoryId}::${tag}`;
  const filename = state.tagImageFiles?.[imgKey];

  // Load image URL from file whenever filename changes
  useEffect(() => {
    let cancelled = false;
    if (filename) {
      loadTagImageUrl(filename).then(url => { if (!cancelled) setImageUrl(url); });
    } else {
      setImageUrl(null);
    }
    return () => { cancelled = true; };
  }, [filename]);

  const handleDragStart = (e) => {
    let tagsToDrag = [tag];
    if (selectedTags && selectedTags.has(tag)) {
      tagsToDrag = Array.from(selectedTags);
    }
    const dragString = tagsToDrag.join(', ');

    // Set both MIME types so the drop target can accept either
    e.dataTransfer.setData('text/tag', dragString);
    e.dataTransfer.setData('text/plain', dragString);
    e.dataTransfer.effectAllowed = 'copyMove';
    setDragging(true);

    // Create custom drag image
    const ghost = document.createElement('div');
    ghost.style.position = 'absolute';
    ghost.style.top = '-1000px';
    ghost.style.background = hex;
    ghost.style.color = needsDarkText(hex) ? '#1a1a1a' : '#ffffff';
    ghost.style.padding = '6px 12px';
    ghost.style.borderRadius = '8px';
    ghost.style.fontSize = '12px';
    ghost.style.fontWeight = 'bold';
    ghost.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
    ghost.style.zIndex = '9999';
    ghost.style.display = 'flex';
    ghost.style.alignItems = 'center';
    ghost.style.gap = '6px';
    ghost.style.border = `1px solid ${needsDarkText(hex) ? '#00000033' : '#ffffff44'}`;

    if (tagsToDrag.length > 1) {
      ghost.innerHTML = `
        <div style="position:absolute; top:4px; left:4px; right:-4px; bottom:-4px; background:${hex}; opacity:0.6; border-radius:8px; z-index:-1; border:1px solid ${needsDarkText(hex) ? '#00000033' : '#ffffff44'}"></div>
        <div style="position:absolute; top:8px; left:8px; right:-8px; bottom:-8px; background:${hex}; opacity:0.3; border-radius:8px; z-index:-2; border:1px solid ${needsDarkText(hex) ? '#00000033' : '#ffffff44'}"></div>
        <span style="background:rgba(0,0,0,0.2); padding:2px 6px; border-radius:4px;">${tagsToDrag.length}</span> tags
      `;
    } else {
      ghost.textContent = tag;
    }

    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 15, 15);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const handleMouseEnter = (e) => {
    if (!imageUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setPreviewPos({ x: rect.left, y: rect.top });
    setShowPreview(true);
  };

  return (
    <>
            <button
        ref={pillRef}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={() => setDragging(false)}
        onClick={(e) => {
          setPopping(true);
          setTimeout(() => setPopping(false), 300);
          onClickAdd(e);
        }}
        onContextMenu={onContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShowPreview(false)}
        title={imageUrl ? `${tag} · Right-click to manage image` : 'Click: add · Alt: negative · Ctrl: multi-select · Right-click: actions'}
        className={`group/pill inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-fast ${dragging ? 'opacity-50' : ''}`}
        style={{
          background: selected ? hex : `${hex}cc`,
          color: needsDarkText(hex) ? '#1a1a1a' : '#ffffff',
          border: selected ? `2px solid ${needsDarkText(hex) ? '#00000033' : '#ffffff44'}` : `1px solid ${hex}88`,
          cursor: dragging ? 'grabbing' : 'pointer',
          opacity: dragging ? 0.5 : 1,
          outline: selected ? `2px solid ${hex}55` : 'none',
          outlineOffset: 1,
          transform: popping ? 'scale(1.18)' : 'scale(1)',
          transition: 'transform 0.15s cubic-bezier(0.34,1.56,0.64,1), opacity 0.12s ease, background 0.12s ease',
          boxShadow: popping ? `0 0 12px ${hex}88` : 'none',
        }}
      >
        {imageUrl && (
          <span className="w-4 h-4 rounded overflow-hidden flex-shrink-0 ring-1 ring-white/30">
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          </span>
        )}
        {tag}
      </button>

      {/* Hover image preview tooltip */}
      {showPreview && imageUrl && (
        <div
          className="fixed z-[500] pointer-events-none fade-slide-in"
          style={{
            left: Math.min(previewPos.x, window.innerWidth - 220),
            top: Math.max(8, previewPos.y - 185),
          }}>
          <div className="rounded-xl overflow-hidden shadow-2xl"
            style={{ border: '2px solid var(--border-strong)', background: 'var(--bg-elevated)' }}>
            <img src={imageUrl} alt={tag}
              style={{ maxWidth: 250, maxHeight: 250, objectFit: 'contain', display: 'block' }} />
            <div className="px-2.5 py-1.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <p className="text-xs font-bold" style={{ color: '#fff' }}>{tag}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Category Card ─────────────────────────────────────────────────────────────
function CategoryCard({ category, onDeleteCategory, searchActive, onDragStart, onDragOver, onDrop, onDragEnd, dragOverZone }) {
  const { state, actions } = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [lastClickedIdx, setLastClickedIdx] = useState(null);
  const [confirmDeleteTags, setConfirmDeleteTags] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(category.name);
  const renameRef = useRef(null);

  const hex = getHex(category.color);
  const tags = category.tags;
  const isSelectionMode = selected.size > 0;

  // Focus rename input when it appears
  useEffect(() => { if (renaming) setTimeout(() => renameRef.current?.select(), 30); }, [renaming]);

  // Global expand/collapse toggle listener
  useEffect(() => {
    const toggleHandler = () => setCollapsed(v => !v);
    window.addEventListener('toggle-all-categories', toggleHandler);
    return () => window.removeEventListener('toggle-all-categories', toggleHandler);
  }, []);

  const handleRename = () => {
    const trimmed = renameVal.trim();
    if (trimmed && trimmed !== category.name) actions.updateCategory(category.id, { name: trimmed });
    setRenaming(false);
  };

  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/category', category.id);
    e.dataTransfer.setData('application/category-id', category.id);
    e.dataTransfer.effectAllowed = 'move';
    if (onDragStart) onDragStart(e, category);
  };

  const handleTagClick = (e, tag, idx) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setSelected(prev => { const n = new Set(prev); n.has(tag) ? n.delete(tag) : n.add(tag); return n; });
      setLastClickedIdx(idx);
      return;
    }
    if (e.shiftKey && lastClickedIdx !== null) {
      e.preventDefault();
      const start = Math.min(lastClickedIdx, idx), end = Math.max(lastClickedIdx, idx);
      setSelected(new Set(tags.slice(start, end + 1)));
      return;
    }
    if (e.altKey) {
      e.preventDefault();
      actions.setActiveField('negative');
      actions.appendTag(tag, 'negative');
      return;
    }
    if (isSelectionMode) {
      setSelected(prev => { const n = new Set(prev); n.has(tag) ? n.delete(tag) : n.add(tag); return n; });
      setLastClickedIdx(idx);
      return;
    }
    actions.appendTag(tag, state.activeField);
    setLastClickedIdx(idx);
  };

  const handleTagRightClick = (e, tag, idx) => {
    e.preventDefault(); e.stopPropagation();
    if (!selected.has(tag)) { setSelected(new Set([tag])); setLastClickedIdx(idx); }
    setCtxMenu({ x: e.clientX, y: e.clientY, singleTag: tag });
  };

  const handleAddAllSelected = () => { selected.forEach(t => actions.appendTag(t, state.activeField)); setSelected(new Set()); };
  const handleAddSelectedToNegative = () => { selected.forEach(t => actions.appendTag(t, 'negative')); setSelected(new Set()); };
  const handleDeleteSelected = () => { actions.removeTagsBulk(category.id, [...selected]); setSelected(new Set()); };
  const handleAddTag = () => {
    const toAdd = newTag.split(',').map(t => t.trim()).filter(Boolean)
      .filter(t => !tags.map(e => e.toLowerCase()).includes(t.toLowerCase()));
    toAdd.forEach(t => actions.addTag(category.id, t));
    setNewTag(''); setAddingTag(false);
  };

  return (
    <>
      <div className="rounded-xl mb-3 transition-all group/card"
        style={{
          border: dragOverZone ? `2px dashed ${hex}` : `1px solid var(--border-default)`,
          borderLeft: dragOverZone ? undefined : `3px solid ${hex}`,
          background: 'var(--bg-elevated)',
          opacity: dragOverZone ? 0.7 : 1,
          transform: dragOverZone === 'above' ? 'translateY(-4px)' : dragOverZone === 'below' ? 'translateY(4px)' : 'none'
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={onDragEnd}>

        {/* Subtle tinted header */}
        <div className={`flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing transition-fast rounded-t-xl ${collapsed ? 'rounded-b-xl' : ''}`}
          draggable
          onDragStart={handleDragStart}
          onDragEnd={onDragEnd}
          style={{
            background: collapsed ? `${hex}0d` : `${hex}12`,
            borderBottom: collapsed ? 'none' : '1px solid var(--border-subtle)',
          }}>

          {/* Left: chevron + name + count */}
          <div className="flex items-center gap-2 flex-1 min-w-0"
            onClick={e => { if (!renaming) { e.stopPropagation(); setCollapsed(v => !v); } }}>
            <span style={{
              color: hex, flexShrink: 0, transition: 'transform 0.15s ease', display: 'inline-flex',
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)'
            }}>
              <ChevronDown size={13} />
            </span>
            {renaming ? (
              <input
                ref={renameRef}
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                onBlur={handleRename}
                onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setRenameVal(category.name); setRenaming(false); } }}
                onClick={e => e.stopPropagation()}
                className="flex-1 bg-transparent text-xs font-black uppercase tracking-wider outline-none min-w-0 border-b"
                style={{ color: hex, borderColor: `${hex}88` }}
              />
            ) : (
              <span className="text-xs font-black uppercase tracking-wider truncate"
                style={{ color: hex }}>{category.name}</span>
            )}
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
              style={{ background: `${hex}20`, color: hex, fontSize: 10 }}>{category.tags ? category.tags.length : 0}</span>
            {isSelectionMode && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                style={{ background: `${hex}25`, color: hex, fontSize: 10 }}>
                {selected.size} selected
              </span>
            )}
          </div>

          {/* Right: action buttons — hidden until card hover */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-fast flex-shrink-0"
            onClick={e => e.stopPropagation()}>
            <div className="relative group/type flex items-center">
              <button 
                title="Category Type"
                className="w-6 h-6 rounded-md flex items-center justify-center transition-fast"
                style={{ color: (!category.type || category.type === 'none') ? 'var(--text-muted)' : hex }}
                onMouseEnter={e => e.currentTarget.style.color = hex}
                onMouseLeave={e => e.currentTarget.style.color = (!category.type || category.type === 'none') ? 'var(--text-muted)' : hex}>
                {(!category.type || category.type === 'none') && <Tag size={11} />}
                {category.type === 'character' && <User size={11} />}
                {category.type === 'special' && <Star size={11} />}
              </button>
              <div className="absolute top-full right-0 mt-1 hidden group-hover/type:block bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-md shadow-lg p-1 z-50 min-w-[100px]">
                <div className="text-[10px] uppercase font-bold text-[var(--text-muted)] px-2 py-1">Type</div>
                <div className={`text-xs px-2 py-1.5 rounded cursor-pointer hover:bg-black/20 ${(!category.type || category.type === 'none') ? 'text-white font-medium' : 'text-[var(--text-muted)]'}`} onClick={() => actions.updateCategory(category.id, { type: 'none' })}>None</div>
                <div className={`text-xs px-2 py-1.5 rounded cursor-pointer hover:bg-black/20 ${category.type === 'character' ? 'text-white font-medium' : 'text-[var(--text-muted)]'}`} onClick={() => actions.updateCategory(category.id, { type: 'character' })}>Character</div>
                <div className={`text-xs px-2 py-1.5 rounded cursor-pointer hover:bg-black/20 ${category.type === 'special' ? 'text-white font-medium' : 'text-[var(--text-muted)]'}`} onClick={() => actions.updateCategory(category.id, { type: 'special' })}>Special</div>
              </div>
            </div>
            <button onClick={() => { setRenameVal(category.name); setRenaming(true); setCollapsed(false); }}
              title="Rename category"
              className="w-6 h-6 rounded-md flex items-center justify-center transition-fast"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.color = hex}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
              <Pencil size={11} />
            </button>
            <button onClick={() => setAddingTag(!addingTag)}
              title="Add tag"
              className="w-6 h-6 rounded-md flex items-center justify-center transition-fast"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.color = hex}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
              <Plus size={13} />
            </button>
            <button onClick={() => onDeleteCategory(category)}
              title="Delete category"
              className="w-6 h-6 rounded-md flex items-center justify-center transition-fast"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.color = '#f43f5e'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
              <Trash2 size={11} />
            </button>
          </div>
        </div>

        {(!collapsed || searchActive) && (
          <div className="p-3 rounded-b-xl">
            {addingTag && (
              <div className="flex gap-1.5 mb-3">
                <input autoFocus type="text" value={newTag} onChange={e => setNewTag(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddTag(); if (e.key === 'Escape') { setAddingTag(false); setNewTag(''); } }}
                  onPaste={e => {
                    e.preventDefault();
                    const pastedText = e.clipboardData.getData('text');
                    const toAdd = pastedText.split(/,|\n/).map(t => t.trim()).filter(Boolean)
                      .filter(t => !tags.map(x => x.toLowerCase()).includes(t.toLowerCase()));
                    toAdd.forEach(t => actions.addTag(category.id, t));
                    setAddingTag(false);
                    setNewTag('');
                  }}
                  placeholder="tag, multiple, comma separated"
                  className="flex-1 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                  style={{ background: 'var(--bg-surface)', border: `1px solid ${hex}55`, color: 'var(--text-primary)', fontFamily: "'DM Mono', monospace" }} />
                <button onClick={handleAddTag} disabled={!newTag.trim()}
                  className="px-2.5 rounded-lg text-xs font-bold disabled:opacity-40"
                  style={{ background: hex, color: needsDarkText(hex) ? '#1a1a1a' : '#fff' }}>Add</button>
                <button onClick={() => { setAddingTag(false); setNewTag(''); }}
                  className="px-2 rounded-lg" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
                  <X size={12} /></button>
              </div>
            )}

            {tags.length === 0 ? (
              /* Empty state — dashed box with + button */
              <button onClick={() => setAddingTag(true)}
                className="w-full flex flex-col items-center justify-center gap-1.5 py-4 rounded-lg transition-fast"
                style={{ border: `1.5px dashed ${hex}44`, color: 'var(--text-muted)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = `${hex}99`; e.currentTarget.style.background = `${hex}08`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = `${hex}44`; e.currentTarget.style.background = 'transparent'; }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: `${hex}22`, color: hex }}>
                  <Plus size={13} />
                </div>
                <span className="text-xs font-medium">Add first tag</span>
              </button>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag, idx) => (
                  <TagPill key={`${tag}-${idx}`} tag={tag}
                    categoryId={category.id} hex={hex}
                    selected={selected.has(tag)} selectedTags={selected} view="list"
                    onClickAdd={e => handleTagClick(e, tag, idx)}
                    onContextMenu={e => handleTagRightClick(e, tag, idx)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {ctxMenu && (
        <TagContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          selectedCount={selected.size}
          singleTag={ctxMenu.singleTag}
          categoryId={category.id}
          hex={hex}
          onAddPositive={handleAddAllSelected}
          onAddNegative={handleAddSelectedToNegative}
          onDelete={() => setConfirmDeleteTags(true)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {confirmDeleteTags && (
        <ConfirmModal
          title="Delete Tags"
          message={`Move ${selected.size} tag${selected.size !== 1 ? "s" : ""} to Trash from "${category.name}"? You can restore them later.`}
          confirmLabel={`Move to Trash`}
          onConfirm={handleDeleteSelected}
          onClose={() => setConfirmDeleteTags(false)}
        />
      )}
    </>
  );
}


// ─── Images Folder Popover ─────────────────────────────────────────────────────
function ImagesFolderPopover({ onClose }) {
  const [dir, setDir] = useState('');
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const ref = useRef(null);

  const isTauri = !!window.__TAURI__;

  const load = async () => {
    if (!isTauri) return;
    setLoading(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const [path, n] = await Promise.all([
        invoke('get_images_dir'),
        invoke('count_tag_images'),
      ]);
      setDir(path);
      setCount(n);
    } catch (e) { setDir('Error loading path'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useOnClickOutside(ref, onClose);

  const handleOpenInExplorer = async () => {
    if (!isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_images_folder');
    } catch { }
  };

  const handleChangeFolder = async () => {
    if (!isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      // pick_images_folder is a Rust command using rfd — no plugin needed
      const selected = await invoke('pick_images_folder');
      if (selected) {
        const newPath = await invoke('set_images_dir', { path: selected });
        setDir(newPath);
        setMsg('Folder changed! New images will save here.');
        const n = await invoke('count_tag_images');
        setCount(n);
        setTimeout(() => setMsg(''), 3000);
      }
    } catch (e) { setMsg('Failed to change folder.'); }
  };

  const handleReset = async () => {
    if (!isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const newPath = await invoke('reset_images_dir');
      setDir(newPath);
      setMsg('Reset to default folder.');
      const n = await invoke('count_tag_images');
      setCount(n);
      setTimeout(() => setMsg(''), 3000);
    } catch { }
  };

  return (
    <div ref={ref}
      className="absolute right-0 top-full mt-2 z-[250] rounded-2xl shadow-2xl fade-slide-in"
      style={{ width: 320, background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--accent-blue)22', border: '1px solid var(--accent-blue)44' }}>
          <FolderCog size={15} style={{ color: 'var(--accent-blue)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--text-white)' }}>Tag Images Folder</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {count !== null ? `${count} image${count !== 1 ? 's' : ''} stored` : 'Loading…'}
          </p>
        </div>
        <button onClick={onClose}
          className="w-6 h-6 rounded-lg flex items-center justify-center transition-fast hover:opacity-70"
          style={{ color: 'var(--text-muted)', background: 'var(--bg-hover)' }}>
          <X size={12} />
        </button>
      </div>

      {/* Path display */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Current location</p>
        <div className="flex items-start gap-2 p-2.5 rounded-lg"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
          <FolderOpen size={12} style={{ color: 'var(--accent-amber)', flexShrink: 0, marginTop: 2 }} />
          <p className="text-xs font-medium break-all leading-relaxed" style={{ color: loading ? 'var(--text-muted)' : 'var(--text-primary)', fontFamily: "'DM Mono', monospace" }}>
            {loading ? 'Loading…' : dir || (isTauri ? 'Not set' : 'Not available in browser')}
          </p>
        </div>

        {!isTauri && (
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            ℹ️ File system access requires the desktop app.
          </p>
        )}

        {msg && (
          <p className="text-xs mt-2 font-semibold" style={{ color: 'var(--accent-emerald)' }}>✓ {msg}</p>
        )}
      </div>

      {/* Actions */}
      {isTauri && (
        <div className="p-3 flex flex-col gap-2">
          <button onClick={handleOpenInExplorer}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-fast hover:brightness-110"
            style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>
            <ExternalLink size={13} style={{ color: 'var(--accent-blue)' }} />
            Open in File Explorer
          </button>
          <button onClick={handleChangeFolder}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-fast hover:brightness-110"
            style={{ background: 'var(--accent-blue)22', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)44' }}>
            <FolderCog size={13} />
            Change Folder…
          </button>
          <button onClick={handleReset}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-fast hover:brightness-110"
            style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
            <RefreshCw size={12} />
            Reset to Default
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Middle Column ──────────────────────────────────────────────────────────────
export default function MiddleColumn() {
  const { state, actions, visibleCategories } = useStore();
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [search, setSearch] = useState('');
  const [confirmDeleteCat, setConfirmDeleteCat] = useState(null);
  const [showImagesFolder, setShowImagesFolder] = useState(false);

  const [draggedCatId, setDraggedCatId] = useState(null);
  const [dragOverCatId, setDragOverCatId] = useState(null);
  const [dragOverZone, setDragOverZone] = useState(null);

  const folderId = state.view === 'folder' ? state.selectedFolderId : null;

  const [headerRightEl, setHeaderRightEl] = useState(null);
  const [headerCenterEl, setHeaderCenterEl] = useState(null);
  useEffect(() => {
    // Repeated polling to handle remounts of right panel
    const interval = setInterval(() => {
      const right = document.getElementById('top-header-right-search');
      const center = document.getElementById('top-header-center');
      if (right) setHeaderRightEl(right);
      if (center) setHeaderCenterEl(center);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Global shortcut for adding category (Alt+S) and toggle collapse all (Alt+A)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (folderId) {
          setShowAddCategory(true);
        }
      }
      if (e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('toggle-all-categories'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [folderId]);

  // Listen for restore-backup event dispatched by BackupPanel
  useEffect(() => {
    const handler = (e) => {
      const data = e.detail;
      if (!data) return;
      // Dispatch individual actions to restore all state
      if (data.folders !== undefined) window.__storeDispatch?.({ type: 'RESTORE_ALL', data });
    };
    window.addEventListener('restore-backup', handler);
    return () => window.removeEventListener('restore-backup', handler);
  }, []);

  const filteredCategories = useMemo(() => {
    if (!search) return visibleCategories;
    const lowerSearch = search.toLowerCase();
    return visibleCategories.filter(c =>
      c.name.toLowerCase().includes(lowerSearch) ||
      c.tags.some(t => t.toLowerCase().includes(lowerSearch))
    );
  }, [search, visibleCategories]);


  const handleDragStart = (e, cat) => {
    setDraggedCatId(cat.id);
  };

  const handleDragOver = (e, cat) => {
    if (!draggedCatId || draggedCatId === cat.id) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const zone = y < rect.height / 2 ? 'above' : 'below';
    setDragOverCatId(cat.id);
    setDragOverZone(zone);
  };

  const handleDrop = (e, targetCat) => {
    e.preventDefault();
    if (!draggedCatId || draggedCatId === targetCat.id) {
      setDraggedCatId(null);
      setDragOverCatId(null);
      setDragOverZone(null);
      return;
    }

    const allCats = state.categories;
    const draggedCat = allCats.find(c => c.id === draggedCatId);
    if (!draggedCat) return;

    // Filter to only categories in the current view (same folder/preset)
    const currentViewCats = visibleCategories;
    const otherCats = allCats.filter(c => !currentViewCats.find(vc => vc.id === c.id));

    const targetIdx = currentViewCats.findIndex(c => c.id === targetCat.id);
    const insertIdx = dragOverZone === 'below' ? targetIdx + 1 : targetIdx;

    const newViewCats = currentViewCats.filter(c => c.id !== draggedCatId);
    const draggedIdx = currentViewCats.findIndex(c => c.id === draggedCatId);

    let finalInsertIdx = insertIdx;
    if (draggedIdx !== -1 && draggedIdx < insertIdx) {
      finalInsertIdx -= 1;
    }

    newViewCats.splice(finalInsertIdx, 0, draggedCat);

    actions.reorderCategories([...otherCats, ...newViewCats]);

    setDraggedCatId(null);
    setDragOverCatId(null);
    setDragOverZone(null);
  };

  const handleDragEnd = () => {
    setDraggedCatId(null);
    setDragOverCatId(null);
    setDragOverZone(null);
  };

  return (
    <>
      <div className="flex flex-col h-full flex-1" style={{ background: 'var(--bg-base)', minWidth: 260 }}>

        {headerCenterEl && createPortal(
          <>
            <div>
              <h2 className="font-bold text-sm" style={{ color: 'var(--text-white)' }}>Tag Library</h2>
              <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                {filteredCategories.length} categor{filteredCategories.length !== 1 ? 'ies' : 'y'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 relative">
                {/* Images folder button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setShowImagesFolder(v => !v); }}
                  title="Tag images folder"
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-fast"
                  style={{
                    background: showImagesFolder ? 'var(--accent-blue)22' : 'var(--bg-elevated)',
                    color: showImagesFolder ? 'var(--accent-blue)' : 'var(--text-muted)',
                    border: showImagesFolder ? '1px solid var(--accent-blue)55' : '1px solid var(--border-default)',
                  }}>
                  <FolderOpen size={13} />
                </button>
                {showImagesFolder && <ImagesFolderPopover onClose={() => setShowImagesFolder(false)} />}
              </div>
              {/* Backup button */}
              <button onClick={() => setShowBackup(true)}
                title="Backup & Restore"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-fast hover:brightness-110"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
                <HardDrive size={12} /> Backup
              </button>
              {/* Add Category button */}
              {folderId && (
                <button onClick={() => setShowAddCategory(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-fast hover:brightness-110"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }}>
                  <Plus size={12} /> Add Category
                </button>
              )}

              {/* Collapse / Expand All Categories icon */}
              <button onClick={() => window.dispatchEvent(new CustomEvent('toggle-all-categories'))}
                title="Toggle all categories (Alt+A)"
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-fast hover:brightness-110"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-muted)' }}>
                <ChevronDown size={14} />
              </button>
            </div>
          </>,
          headerCenterEl
        )}

        {headerRightEl && createPortal(
          <div className="relative w-full">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search categories & tags..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} />
          </div>,
          headerRightEl
        )}

        {/* Category list */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          
          {filteredCategories.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 py-12">
              <Tag size={24} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
              <p className="text-xs font-medium text-center" style={{ color: 'var(--text-muted)' }}>
                {search ? 'No matching categories' : folderId ? 'No categories.\nClick "Add Category" to start.' : 'No categories.'}
              </p>
            </div>
            
          ) : filteredCategories.map(cat => (
            <CategoryCard key={cat.id} category={cat}
              searchActive={!!search}
              onDeleteCategory={cat => setConfirmDeleteCat(cat)}
              onDragStart={handleDragStart}
              onDragOver={(e) => handleDragOver(e, cat)}
              onDrop={(e) => handleDrop(e, cat)}
              onDragEnd={handleDragEnd}
              dragOverZone={dragOverCatId === cat.id ? dragOverZone : null} />
          ))}
        </div>
      </div>

      {showAddCategory && <AddCategoryModal folderId={folderId} onClose={() => setShowAddCategory(false)} />}
      {showBackup && <BackupPanel onClose={() => setShowBackup(false)} />}

      {confirmDeleteCat && (
        <ConfirmModal
          title="Delete Category"
          message={`Move "${confirmDeleteCat.name}" and its ${(confirmDeleteCat.tags || []).length} tag${(confirmDeleteCat.tags || []).length !== 1 ? "s" : ""} to Trash? You can restore it later.`}
          confirmLabel="Move to Trash"
          onConfirm={() => actions.deleteCategory(confirmDeleteCat.id)}
          onClose={() => setConfirmDeleteCat(null)}
        />
      )}
    </>
  );
}
