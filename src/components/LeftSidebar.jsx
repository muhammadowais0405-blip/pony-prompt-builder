import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useStore, FOLDER_COLOR_OPTIONS, FOLDER_ICONS } from '../store/index.jsx';
import { ConfirmModal } from './RightColumn.jsx';
import TrashPanel from './TrashPanel.jsx';
import { THEMES } from '../App.jsx';
import {
  Search, Plus, Trash2, FolderPlus,
  Pencil, X, Palette, Smile, ArrowUpDown, ArrowUp, ArrowDown,
  ChevronRight, ChevronDown, GripVertical, Check, FileText, Clock, Copy, Save,
  Folder
} from 'lucide-react';

// ─── Modal Shell ──────────────────────────────────────────────────────────────
function Modal({ children, onClose, width = 320 }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" onClick={onClose}>
      <div className="fade-slide-in rounded-xl p-5 shadow-2xl"
        style={{ width, background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ─── Folder Form Modal ─────────────────────────────────────────────────────────
function FolderFormModal({ title, initialName = '', initialIcon = '📁', initialColor = null, onSave, onClose }) {
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState(initialIcon);
  const [color, setColor] = useState(initialColor);
  const handleSubmit = () => { if (!name.trim()) return; onSave(name.trim(), icon, color); onClose(); };
  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold" style={{ color: 'var(--text-white)' }}>{title}</h3>
        <button onClick={onClose} className="p-1 rounded" style={{ color: 'var(--text-muted)' }}><X size={15} /></button>
      </div>
      <div className="mb-3">
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Name</label>
        <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Folder name"
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} />
      </div>
      <div className="mb-3">
        <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Color</label>
        <div className="flex flex-wrap gap-1.5">
          {FOLDER_COLOR_OPTIONS.map(c => (
            <button key={c.id} onClick={() => setColor(c.hex)} title={c.label}
              className="w-6 h-6 rounded-full flex items-center justify-center transition-fast"
              style={{
                background: c.hex || 'var(--bg-hover)',
                border: `2px solid ${color === c.hex ? '#fff' : 'transparent'}`,
                outline: color === c.hex ? `2px solid ${c.hex || '#888'}` : 'none', outlineOffset: 1,
              }}>
              {!c.hex && (color === null) && <Check size={10} style={{ color: 'var(--text-muted)' }} />}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-5">
        <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Icon</label>
        <div className="grid grid-cols-10 gap-1">
          {FOLDER_ICONS.map(ic => (
            <button key={ic} onClick={() => setIcon(ic)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-sm transition-fast"
              style={{ background: icon === ic ? 'var(--bg-active)' : 'var(--bg-surface)', border: icon === ic ? '1px solid var(--border-strong)' : '1px solid transparent' }}>
              {ic}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>Cancel</button>
        <button onClick={handleSubmit} disabled={!name.trim()}
          className="flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
          style={{ background: color || 'var(--accent-blue)', color: '#fff' }}>
          {title.includes('Edit') ? 'Save' : 'Create'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Context Menu ──────────────────────────────────────────────────────────────
function ContextMenu({ x, y, folder, onClose, onNewFolder, onNewSubfolder, onDeleteFolder }) {
  const { state, actions } = useStore();
  const [showSortSub, setShowSortSub] = useState(false);
  const [showColorSub, setShowColorSub] = useState(false);
  const [showIconSub, setShowIconSub] = useState(false);
  const ref = useRef(null);
  const scopeKey = folder?.id || '__root';
  const currentSort = state.folderSortOrders[scopeKey] || { by: 'name', dir: 'asc' };

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', handler), 10);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleMoveUp = () => {
    if (!folder) return;
    const allFolders = state.folders;
    const sameLevel = allFolders.filter(f => f.parentId === folder.parentId);
    const others = allFolders.filter(f => f.parentId !== folder.parentId);
    const idx = sameLevel.findIndex(f => f.id === folder.id);
    if (idx > 0) {
      const newSameLevel = [...sameLevel];
      [newSameLevel[idx - 1], newSameLevel[idx]] = [newSameLevel[idx], newSameLevel[idx - 1]];
      actions.reorderFolders([...others, ...newSameLevel]);
    }
    onClose();
  };

  const handleMoveDown = () => {
    if (!folder) return;
    const allFolders = state.folders;
    const sameLevel = allFolders.filter(f => f.parentId === folder.parentId);
    const others = allFolders.filter(f => f.parentId !== folder.parentId);
    const idx = sameLevel.findIndex(f => f.id === folder.id);
    if (idx < sameLevel.length - 1) {
      const newSameLevel = [...sameLevel];
      [newSameLevel[idx], newSameLevel[idx + 1]] = [newSameLevel[idx + 1], newSameLevel[idx]];
      actions.reorderFolders([...others, ...newSameLevel]);
    }
    onClose();
  };

  const menuW = 220, menuH = 320;
  const cx = Math.max(8, Math.min(x, window.innerWidth - menuW - 8));
  const cy = Math.max(8, Math.min(y, window.innerHeight - menuH - 8));

  const MI = ({ icon, label, shortcut, onClick, danger, hasSubmenu, onMouseEnter, onMouseLeave }) => (
    <button onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      onClick={e => { e.stopPropagation(); onClick?.(); }}
      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-fast text-left"
      style={{ color: danger ? 'var(--accent-rose)' : 'var(--text-primary)' }}>
      <span style={{ color: danger ? 'var(--accent-rose)' : 'var(--text-muted)', width: 14 }}>{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{shortcut}</span>}
      {hasSubmenu && <ChevronRight size={11} style={{ color: 'var(--text-muted)' }} />}
    </button>
  );
  const Div = () => <div style={{ height: 1, background: 'var(--border-subtle)', margin: '3px 0' }} />;

  return (
    <div ref={ref} className="fixed z-[200] rounded-xl py-1.5 shadow-2xl fade-slide-in select-none"
      style={{ left: cx, top: cy, width: menuW, background: '#1a1f28', border: '1px solid var(--border-strong)' }}>
      <MI icon={<FolderPlus size={13} />} label="New Folder" shortcut="Ctrl+Shift+N" onClick={() => { onNewFolder(); onClose(); }} />
      <MI icon={<Plus size={13} />} label="New Subfolder" shortcut="Alt+N" onClick={() => { onNewSubfolder(); onClose(); }} />
      <Div />
      <MI icon={<Pencil size={13} />} label="Rename" shortcut="F2"
        onClick={() => { if (folder?.id) { window.dispatchEvent(new CustomEvent('folder-rename', { detail: { id: folder.id } })); } onClose(); }} />
      
      {folder && (
        <>
          <MI icon={<ArrowUp size={13} />} label="Move Up" onClick={handleMoveUp} />
          <MI icon={<ArrowDown size={13} />} label="Move Down" onClick={handleMoveDown} />
        </>
      )}

      {/* Sort submenu */}
      <div className="relative" onMouseEnter={() => { setShowSortSub(true); setShowColorSub(false); setShowIconSub(false); }} onMouseLeave={() => setShowSortSub(false)}>
        <MI icon={<ArrowUpDown size={13} />} label="Sort Current Level By" hasSubmenu />
        {showSortSub && (
          <div className="absolute left-full top-0 rounded-xl py-1.5 shadow-2xl" style={{ width: 170, background: '#1a1f28', border: '1px solid var(--border-strong)' }}>
            {[{ label: 'By Name', by: 'name' }, { label: 'By Date', by: 'date' }, { label: 'By Size', by: 'size' }].map(opt => (
              <button key={opt.by} onClick={() => { actions.setFolderSort(scopeKey, opt.by, currentSort.by === opt.by && currentSort.dir === 'asc' ? 'desc' : 'asc'); onClose(); }}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs transition-fast"
                style={{ color: currentSort.by === opt.by ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
                <span>{opt.label}</span>
                {currentSort.by === opt.by && (currentSort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Color submenu */}
      <div className="relative" onMouseEnter={() => { setShowColorSub(true); setShowSortSub(false); setShowIconSub(false); }} onMouseLeave={() => setShowColorSub(false)}>
        <MI icon={<Palette size={13} />} label="Assign Color" hasSubmenu />
        {showColorSub && (
          <div className="absolute left-full top-0 rounded-xl p-3 shadow-2xl" style={{ width: 160, background: '#1a1f28', border: '1px solid var(--border-strong)' }}>
            <div className="flex flex-wrap gap-2">
              {FOLDER_COLOR_OPTIONS.map(c => (
                <button key={c.id} onClick={() => { if (folder?.id) { actions.updateFolder(folder.id, { color: c.hex }); } onClose(); }} title={c.label}
                  className="w-7 h-7 rounded-full flex items-center justify-center transition-fast"
                  style={{ background: c.hex || 'var(--bg-hover)', border: folder?.color === c.hex ? '2px solid #fff' : '2px solid transparent', outline: folder?.color === c.hex ? `2px solid ${c.hex || '#888'}` : 'none', outlineOffset: 1 }}>
                  {!c.hex && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>✕</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Icon submenu */}
      <div className="relative" onMouseEnter={() => { setShowIconSub(true); setShowSortSub(false); setShowColorSub(false); }} onMouseLeave={() => setShowIconSub(false)}>
        <MI icon={<Smile size={13} />} label="Change Icon" hasSubmenu />
        {showIconSub && (
          <div className="absolute left-full top-0 rounded-xl p-3 shadow-2xl" style={{ width: 220, background: '#1a1f28', border: '1px solid var(--border-strong)' }}>
            <div className="grid grid-cols-8 gap-1">
              {FOLDER_ICONS.map(ic => (
                <button key={ic} onClick={() => { if (folder?.id) { actions.updateFolder(folder.id, { icon: ic }); } onClose(); }}
                  className="w-6 h-6 rounded flex items-center justify-center text-sm transition-fast"
                  style={{ background: folder?.icon === ic ? 'var(--bg-active)' : 'transparent' }}>{ic}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Div />
      <MI icon={<Trash2 size={13} />} label="Delete Folder" danger onClick={() => { onDeleteFolder(); onClose(); }} />
    </div>
  );
}

// ─── Folder Item ───────────────────────────────────────────────────────────────
function FolderItem({ folder, depth = 0, folderMatches }) {
  const { state, actions } = useStore();
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(folder.name);
  const [contextMenu, setContextMenu] = useState(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showNewSub, setShowNewSub] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dragRef = useRef(null);

  const currentFolderId = state.selectedFolderId;
  const isActive = state.view === 'folder' && currentFolderId === folder.id;
  const count = (state.categories || []).filter(c => c.folderId === folder.id).length;
  const displayFolders = state.folders;
  const children = displayFolders.filter(f => f.parentId === folder.id);
  const scopeKey = folder.id;
  const sort = state.folderSortOrders[scopeKey] || null;

  const sortedChildren = sort ? [...children].sort((a, b) => {
    let cmp = 0;
    if (sort.by === 'name') cmp = a.name.localeCompare(b.name);
    else if (sort.by === 'date') cmp = (a.createdAt || 0) - (b.createdAt || 0);
    else if (sort.by === 'size') {
      const sa = (state.prompts || []).filter(p => p.folderId === a.id).length;
      const sb = (state.prompts || []).filter(p => p.folderId === b.id).length;
      cmp = sa - sb;
    }
    return sort.dir === 'desc' ? -cmp : cmp;
  }) : children;

  useEffect(() => {
    const renameHandler = (e) => { if (e.detail?.id === folder.id) { setRenaming(true); setNewName(folder.name); } };
    const subfolderHandler = (e) => { if (e.detail?.id === folder.id) setShowNewSub(true); };
    window.addEventListener('folder-rename', renameHandler);
    window.addEventListener('new-subfolder', subfolderHandler);
    return () => {
      window.removeEventListener('folder-rename', renameHandler);
      window.removeEventListener('new-subfolder', subfolderHandler);
    };
  }, [folder.id, folder.name]);

  const isSearchActive = !!folderMatches;
  const matchData = isSearchActive ? folderMatches[folder.id] : null;

  useEffect(() => {
    if (isSearchActive && (matchData?.hasMatchingDescendant || matchData?.direct)) {
      setExpanded(true);
    }
  }, [isSearchActive, matchData]);

  const visibleChildren = sortedChildren.filter(child => {
    if (!isSearchActive) return true;
    const cm = folderMatches[child.id];
    return cm && (cm.direct || cm.inheritedMatch || cm.hasMatchingDescendant);
  });

  const handleRename = () => {
    if (newName.trim() && newName !== folder.name) actions.updateFolder(folder.id, { name: newName.trim() });
    setRenaming(false);
  };

  const [dropZone, setDropZone] = useState(null);
  const dragCounterRef = useRef(0);

  const handleDragStart = (e) => {
    e.dataTransfer.setData('folderId', folder.id);
    e.dataTransfer.setData('application/folder-id', folder.id);
    e.dataTransfer.setData('text/plain', folder.id);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => dragRef.current?.classList.add('opacity-40'), 0);
  };

  const handleDragEnd = () => {
    dragRef.current?.classList.remove('opacity-40');
    setDragOver(false);
    setDropZone(null);
    dragCounterRef.current = 0;
  };

  const getDropZone = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const pct = y / rect.height;
    if (pct < 0.25) return 'above';
    if (pct > 0.75) return 'below';
    return 'into';
  };

  const handleDragOver = (e) => {
    const types = Array.from(e.dataTransfer.types || []).map(t => t.toLowerCase());
    if (types.includes('files')) return; // ignore file drops
    const isFolder = types.includes('folderid') || types.includes('application/folder-id');
    const isCategory = types.includes('text/category') || types.includes('application/category-id');
    if (!isFolder && !isCategory) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
    setDropZone(isCategory ? 'into' : getDropZone(e));
  };

  const handleDragEnter = (e) => {
    const types = Array.from(e.dataTransfer.types || []).map(t => t.toLowerCase());
    if (types.includes('files')) return;
    const isFolder = types.includes('folderid') || types.includes('application/folder-id');
    const isCategory = types.includes('text/category') || types.includes('application/category-id');
    if (!isFolder && !isCategory) return;
    e.preventDefault();
    dragCounterRef.current++;
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragOver(false);
      setDropZone(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setDragOver(false);
    const zone = dropZone;
    setDropZone(null);

    const categoryId = e.dataTransfer.getData('text/category') || e.dataTransfer.getData('application/category-id');
    if (categoryId) {
        actions.updateCategory(categoryId, { folderId: folder.id });
        return;
    }

    const draggedId = e.dataTransfer.getData('application/folder-id') || e.dataTransfer.getData('folderId') || e.dataTransfer.getData('folderid');
    if (!draggedId || draggedId === folder.id) return;
    const displayFolders = state.folders;
    const dragged = displayFolders.find(f => f.id === draggedId);
    if (!dragged) return;

    const descendants = new Set();
    const getDesc = (id) => { displayFolders.filter(f => f.parentId === id).forEach(f => { descendants.add(f.id); getDesc(f.id); }); };
    getDesc(draggedId);
    if (descendants.has(folder.id)) return;

    if (zone === 'into') {
        actions.updateFolder(draggedId, { parentId: folder.id });
        setExpanded(true);
    } else {
        const targetParentId = folder.parentId;
        const sameLevelFolders = allFolders.filter(f => f.parentId === targetParentId && f.id !== draggedId);
        const targetIdx = sameLevelFolders.findIndex(f => f.id === folder.id);
        const insertIdx = zone === 'below' ? targetIdx + 1 : targetIdx;
        const reordered = [...sameLevelFolders.slice(0, insertIdx), { ...dragged, parentId: targetParentId }, ...sameLevelFolders.slice(insertIdx)];
        const otherFolders = allFolders.filter(f => f.parentId !== targetParentId && f.id !== draggedId);
        actions.reorderFolders([...otherFolders, ...reordered]);
    }
  };

  return (
    <div ref={dragRef}>
      <div draggable
        onDragStart={handleDragStart} onDragEnd={handleDragEnd}
        onDragOver={handleDragOver} onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave} onDrop={handleDrop}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
        className="group relative flex items-center rounded-lg transition-fast cursor-pointer"
        style={{
          paddingLeft: depth * 14 + 6, paddingRight: 6,
          background: isActive ? 'var(--bg-active)'
            : (dragOver && dropZone === 'into') ? 'rgba(59,130,246,0.1)'
            : 'transparent',
          border: (dragOver && dropZone === 'into')
            ? '1px dashed var(--accent-blue)'
            : '1px solid transparent',
          boxShadow: dragOver && dropZone === 'above'
            ? 'inset 0 2px 0 0 var(--accent-blue)'
            : dragOver && dropZone === 'below'
              ? 'inset 0 -2px 0 0 var(--accent-blue)'
              : 'none',
        }}>

        {/* Expand chevron */}
        {visibleChildren.length > 0 ? (
          <button onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
            className="w-4 h-4 flex items-center justify-center mr-1 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        ) : <span className="w-4 mr-1" />}

        {/* Folder button – Eagle style */}
        <button onClick={() => actions.selectView('folder', folder.id)}
          className="flex items-center gap-2 flex-1 py-1 text-left text-sm min-w-0">

          {/* Tiny folder emoji (always visible) */}
          <span className="text-xs flex-shrink-0 leading-none" style={{ fontSize: '12px' }}>
            {folder.icon || '📁'}
          </span>

          {renaming ? (
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false); }}
              className="flex-1 bg-transparent text-sm outline-none min-w-0"
              style={{ color: 'var(--text-white)' }} onClick={e => e.stopPropagation()} />
          ) : (
            <span className="flex-1 truncate text-sm font-medium"
              style={{ color: isActive ? 'var(--text-white)' : 'var(--text-secondary)' }}>
              {folder.name}
            </span>
          )}
        </button>
        <span className="count-badge ml-1" style={{ color: 'var(--text-muted)', fontSize: 10 }}>{count}</span>
      </div>

      {expanded && visibleChildren.map(child => <FolderItem key={child.id} folder={child} depth={depth + 1} folderMatches={folderMatches} />)}

      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} folder={folder}
        onClose={() => setContextMenu(null)} onNewFolder={() => setShowNewFolder(true)}
        onNewSubfolder={() => setShowNewSub(true)} onDeleteFolder={() => setConfirmDelete(true)} />}

      {showNewFolder && <FolderFormModal title="New Folder"
        onSave={(n, i, c) => actions.addFolder(n, i, c, folder.parentId)} onClose={() => setShowNewFolder(false)} />}

      {showNewSub && <FolderFormModal title="New Subfolder"
        onSave={(n, i, c) => actions.addFolder(n, i, c, folder.id)} onClose={() => setShowNewSub(false)} />}

      {confirmDelete && (
        <ConfirmModal title="Delete folder"
          message={`Are you sure you want to delete the folder "${folder.name}"?`}
          confirmLabel="Delete folder"
          onConfirm={() => actions.deleteFolder(folder.id)}
          onClose={() => setConfirmDelete(false)}>
          <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#f59e0b18', color: '#f59e0b' }}>
            ⚠ Prompts inside will be moved to Trash.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}

// ─── Theme Picker ──────────────────────────────────────────────────────────────
function ThemePicker() {
  const { state, actions } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    setTimeout(() => document.addEventListener('mousedown', handler), 10);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const bases = [
    { id: 'auto',   label: 'Auto',   bg: '#0d0f12' },
    { id: 'black',  label: 'Black',  bg: '#000000' },
    { id: 'grey',   label: 'Grey',   bg: '#18181b' },
    { id: 'white',  label: 'White',  bg: '#f1f5f9' },
    { id: 'blue',   label: 'Blue',   bg: '#060d1a' },
    { id: 'purple', label: 'Purple', bg: '#0d0a16' },
  ];

  const accents = FOLDER_COLOR_OPTIONS.filter(o => o.hex);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)} title="Theme Settings"
        className="w-7 h-7 rounded-lg flex items-center justify-center transition-fast hover:opacity-80"
        style={{ background: open ? 'var(--bg-active)' : 'transparent', border: open ? '1px solid var(--border-default)' : '1px solid transparent' }}>
        <Palette size={15} style={{ color: 'var(--text-secondary)' }} />
      </button>

      {open && (
        <div className="absolute left-full top-0 ml-2 z-[250] rounded-2xl shadow-2xl fade-slide-in overflow-hidden"
          style={{ width: 240, background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>

          <div className="p-4 space-y-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-3 opacity-40">Background</p>
              <div className="grid grid-cols-3 gap-2">
                {bases.map(b => (
                  <button key={b.id} onClick={() => actions.setThemeBase(b.id)}
                    className="group relative h-10 rounded-xl transition-fast flex flex-col items-center justify-center border border-transparent overflow-hidden"
                    style={{ 
                      background: b.bg, 
                      border: state.themeBase === b.id ? `1.5px solid var(--accent-primary)` : '1px solid rgba(255,255,255,0.05)'
                    }}>
                    <span className="text-[9px] font-bold" style={{ color: b.id === 'white' ? '#000' : '#fff' }}>{b.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
              <p className="text-[10px] font-black uppercase tracking-widest mb-3 opacity-40">Accent Color</p>
              <div className="flex flex-wrap gap-2.5">
                {accents.map(a => (
                  <button key={a.id} onClick={() => actions.setThemeAccent(a.hex)}
                    title={a.label}
                    className="w-6 h-6 rounded-full transition-fast hover:scale-110 active:scale-90 flex items-center justify-center relative"
                    style={{ background: a.hex }}>
                    {state.themeAccent === a.hex && (
                      <div className="w-8 h-8 rounded-full border-2 absolute animate-pulse" style={{ borderColor: a.hex, opacity: 0.5 }} />
                    )}
                    {state.themeAccent === a.hex && <Check size={12} color="#fff" strokeWidth={4} />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sidebar Toggle Icon ───────────────────────────────────────────────────────
function SidebarToggleIcon({ leftCollapsed, centerCollapsed, onToggle }) {
  const active = leftCollapsed || centerCollapsed;
  return (
    <button onClick={onToggle}
      title="Toggle left sidebar + workspace (Tab)"
      className="w-7 h-7 rounded-lg flex items-center justify-center transition-fast hover:opacity-80"
      style={{ background: active ? 'var(--bg-active)' : 'transparent', border: active ? '1px solid var(--border-default)' : '1px solid transparent' }}>
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="1" y="2" width="4" height="11" rx="1"
          fill={leftCollapsed ? 'var(--text-muted)' : 'var(--text-primary)'} opacity={leftCollapsed ? 0.35 : 1} />
        <rect x="6.5" y="2" width="7.5" height="11" rx="1"
          fill={centerCollapsed ? 'var(--text-muted)' : 'var(--text-primary)'} opacity={centerCollapsed ? 0.35 : 1} />
      </svg>
    </button>
  );
}

// ─── Left Sidebar ──────────────────────────────────────────────────────────────
export default function LeftSidebar({ collapsed, centerCollapsed, onToggleLeft }) {
  const { state, actions, totalTrashCount } = useStore();

  const [showAddFolder, setShowAddFolder] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [showTrash, setShowTrash] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentExpanded, setRecentExpanded] = useState(false);
  const [showLibraryPopover, setShowLibraryPopover] = useState(false);
  const [showCreateLibrary, setShowCreateLibrary] = useState(false);
  const [newLibName, setNewLibName] = useState('');
  const [libraryToDelete, setLibraryToDelete] = useState(null);

  const ref = useRef(null);

  const totalCount = (state.prompts || []).length;

  const displayFolders = state.folders || [];

  const rootSort = state.folderSortOrders['__root'] || null;
  const rootFolders = displayFolders.filter(f => !f.parentId);
  const sortedRootFolders = rootSort ? [...rootFolders].sort((a, b) => {
    let cmp = 0;
    if (rootSort.by === 'name') cmp = a.name.localeCompare(b.name);
    else if (rootSort.by === 'date') cmp = (a.createdAt || 0) - (b.createdAt || 0);
    else if (rootSort.by === 'size') {
      const sa = (state.prompts || []).filter(p => p.folderId === a.id).length;
      const sb = (state.prompts || []).filter(p => p.folderId === b.id).length;
      cmp = sa - sb;
    }
    return rootSort.dir === 'desc' ? -cmp : cmp;
  }) : rootFolders;

  const folderMatches = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const matches = {};
    const lower = searchQuery.toLowerCase();
    
    displayFolders.forEach(f => {
      let direct = false;
      if (f.name.toLowerCase().includes(lower)) {
        direct = true;
      } else {
        const cats = state.categories.filter(c => c.folderId === f.id);
        if (cats.some(c => c.name.toLowerCase().includes(lower) || c.tags.some(t => t.toLowerCase().includes(lower)))) {
          direct = true;
        }
      }
      matches[f.id] = { direct, hasMatchingDescendant: false, inheritedMatch: false };
    });

    const markInherited = (parentId) => {
      displayFolders.filter(f => f.parentId === parentId).forEach(child => {
        matches[child.id].inheritedMatch = true;
        markInherited(child.id);
      });
    };

    const markAncestors = (folderId) => {
      const parentId = displayFolders.find(f => f.id === folderId)?.parentId;
      if (parentId && matches[parentId]) {
        if (!matches[parentId].hasMatchingDescendant) {
          matches[parentId].hasMatchingDescendant = true;
          markAncestors(parentId);
        }
      }
    };

    displayFolders.forEach(f => {
      if (matches[f.id] && matches[f.id].direct) {
        markInherited(f.id);
        markAncestors(f.id);
      }
    });

    return matches;
  }, [searchQuery, displayFolders, state.categories]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault(); setShowAddFolder(true);
      }
      if (e.altKey && e.key.toLowerCase() === 'n') {
        if (state.view === 'folder' && state.selectedFolderId) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('new-subfolder', { detail: { id: state.selectedFolderId } }));
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.view, state.selectedFolderId]);

  const visibleRootFolders = sortedRootFolders.filter(f => {
    if (!folderMatches) return true;
    const cm = folderMatches[f.id];
    return cm && (cm.direct || cm.inheritedMatch || cm.hasMatchingDescendant);
  });

  const [headerLeftEl, setHeaderLeftEl] = useState(null);
  useEffect(() => {
    const id = setTimeout(() => setHeaderLeftEl(document.getElementById('top-header-left')), 0);
    return () => clearTimeout(id);
  }, []);

  // Collapsed state: show only icon strip
  if (collapsed) {
    return (
      <>
        {headerLeftEl && createPortal(
          <div className="flex items-center gap-1 flex-shrink-0">
            <SidebarToggleIcon leftCollapsed={collapsed} centerCollapsed={centerCollapsed} onToggle={onToggleLeft} />
            <ThemePicker />
          </div>,
          headerLeftEl
        )}
        <aside className="flex flex-col h-full items-center py-3 gap-2 select-none gradient-separator-right w-full"
          style={{ background: 'var(--bg-surface)' }}>
          <button onClick={() => setShowTrash(true)}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-fast mt-auto mb-1"
            title="Trash" style={{ color: totalTrashCount > 0 ? 'var(--accent-rose)' : 'var(--text-muted)' }}>
            <Trash2 size={15} />
          </button>
        </aside>
        {showTrash && <TrashPanel onClose={() => setShowTrash(false)} />}
      </>
    );
  }

  return (
    <>
      <aside className="flex flex-col h-full select-none w-full"
        style={{ background: 'var(--bg-surface)' }}>

        {/* App header mapped to Top Panel */}
        {headerLeftEl && createPortal(
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
              style={{ background: 'var(--accent-blue)' }}>🐴</div>
            <div className="relative">
              <button
                onClick={() => setShowLibraryPopover(v => !v)}
                className="flex items-center gap-1 text-left w-full group"
                style={{ color: 'var(--text-white)' }}
              >
                <span className="text-sm font-bold truncate max-w-[200px]">{state.libraries.find(l => l.id === state.currentLibraryId)?.name || 'Library'}</span>
                <ChevronDown size={11} className="flex-shrink-0 opacity-40 group-hover:opacity-100 transition-fast"
                  style={{ color: 'var(--text-muted)' }} />
              </button>
              {showLibraryPopover && (
                <div className="absolute left-0 top-full mt-4 z-[250] rounded-xl py-1.5 shadow-2xl fade-slide-in"
                  style={{ width: 260, background: '#1a1f28', border: '1px solid var(--border-strong)' }}
                  onClick={() => setShowLibraryPopover(false)}>

                  {/* Library name and type */}
                  <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <p className="text-xs font-bold truncate" style={{ color: 'var(--text-white)' }}>
                      {state.libraries.find(l => l.id === state.currentLibraryId)?.name || 'Library'}
                    </p>
                    <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                      {state.libraries.find(l => l.id === state.currentLibraryId)?.path || 'Personal library'}
                    </p>
                  </div>

                  {/* New Library / Open Library */}
                  <div className="py-1">
                    <button
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-fast hover:bg-white/5 text-left"
                      style={{ color: 'var(--text-primary)' }}
                      onClick={() => { setShowCreateLibrary(true); setShowLibraryPopover(false); }}
                    >
                      <Plus size={13} style={{ color: 'var(--accent-blue)' }} />
                      New Library
                    </button>
                    <button
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-fast hover:bg-white/5 text-left"
                      style={{ color: 'var(--text-primary)' }}
                      onClick={() => { actions.openLibrary(); setShowLibraryPopover(false); }}
                    >
                      <Folder size={13} style={{ color: 'var(--accent-blue)' }} />
                      Open Library...
                    </button>
                  </div>

                  <div style={{ height: 1, background: 'var(--border-subtle)', margin: '3px 0' }} />

                  {/* Switch Library section */}
                  <div className="px-2 py-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider mb-1 px-1" style={{ color: 'var(--text-muted)' }}>
                      Switch Library
                    </p>
                    {state.libraries.map(lib => (
                      <div key={lib.id} className="group flex items-center justify-between w-full px-2 py-1.5 rounded-md text-xs transition-fast hover:bg-white/5">
                        <button
                          className="flex items-center gap-2 flex-1 text-left min-w-0"
                          style={{ color: lib.id === state.currentLibraryId ? 'var(--accent-blue)' : 'var(--text-primary)' }}
                          onClick={() => {
                            if (lib.id !== state.currentLibraryId) {
                              actions.switchLibrary(lib.id);
                            }
                            setShowLibraryPopover(false);
                          }}
                        >
                          <span className="flex-1 truncate">{lib.name}</span>
                          {lib.id === state.currentLibraryId && <Check size={12} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />}
                        </button>
                        {state.libraries.length > 1 && (
                          <button
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/10 rounded transition-opacity ml-1 z-10 flex-shrink-0"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                            onClick={(e) => {
                              e.stopPropagation();
                              setLibraryToDelete(lib);
                            }}
                            title="Remove library from list"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <SidebarToggleIcon leftCollapsed={collapsed} centerCollapsed={centerCollapsed} onToggle={onToggleLeft} />
              <ThemePicker />
            </div>
          </div>,
          headerLeftEl
        )}

        {/* All / Recently Used */}
        <div className="px-3 mb-1 pt-2">
          <button
            onClick={() => actions.selectView('folder', null)}
            className="w-full flex items-center gap-2 px-2 py-1 rounded-lg transition-fast text-left group mb-1"
            style={{
              background: (state.view === 'folder' && !state.selectedFolderId) ? 'var(--bg-active)' : 'transparent',
              border: '1px solid transparent',
            }}
            onMouseEnter={e => { if (state.view !== 'folder' || state.selectedFolderId) e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { if (state.view !== 'folder' || state.selectedFolderId) e.currentTarget.style.background = 'transparent' }}
          >
            <Folder size={13} style={{ color: (state.view === 'folder' && !state.selectedFolderId) ? 'var(--text-white)' : 'var(--text-muted)', flexShrink: 0 }} />
            <span className="flex-1 text-sm font-medium" style={{ color: (state.view === 'folder' && !state.selectedFolderId) ? 'var(--text-white)' : 'var(--text-secondary)' }}>
              All
            </span>
          </button>

            <>
              <button
                onClick={() => setRecentExpanded(v => !v)}
                className="w-full flex items-center gap-2 px-2 py-1 rounded-lg transition-fast text-left group"
                style={{ background: 'transparent', border: '1px solid transparent' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <Clock size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span className="flex-1 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Recently Used
                </span>
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                  {state.recentTags?.length || 0}
                </span>
              </button>
              {recentExpanded && state.recentTags?.length > 0 && (
                <div className="ml-6 mt-1 flex flex-wrap gap-1.5">
                  {state.recentTags.map(tag => (
                    <button
                      key={tag}
                      onClick={(e) => {
                        if (e.altKey) {
                          actions.setActiveField('negative');
                          actions.appendTag(tag, 'negative');
                        } else {
                          actions.appendTag(tag, state.activeField);
                        }
                      }}
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium transition-fast hover:brightness-110"
                      style={{
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </>
        </div>

        {/* Trash – Eagle style */}
        <div className="px-3 mb-1">
          <button
            onClick={() => setShowTrash(true)}
            className="w-full flex items-center gap-2 px-2 py-1 rounded-lg transition-fast text-left group"
            style={{
              background: state.view === 'trash' ? 'var(--bg-active)' : 'transparent',
              border: '1px solid transparent',
            }}
            onMouseEnter={e => { if (state.view !== 'trash') e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { if (state.view !== 'trash') e.currentTarget.style.background = 'transparent'; }}
          >
            <Trash2 size={13} style={{ color: state.view === 'trash' ? '#fca5a5' : 'var(--text-muted)', flexShrink: 0 }} />
            <span className="flex-1 text-sm font-medium" style={{ color: state.view === 'trash' ? '#fca5a5' : 'var(--text-secondary)' }}>
              Trash
            </span>
            {totalTrashCount > 0 && (
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                {totalTrashCount}
              </span>
            )}
          </button>
        </div>

        {/* Folders label */}
        <div className="px-3 flex items-center justify-between mb-1">
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>Folders</span>
          <button onClick={() => setShowAddFolder(true)}
            className="w-5 h-5 rounded flex items-center justify-center transition-fast hover:opacity-80"
            style={{ color: 'var(--text-muted)' }} title="New Folder (Ctrl+Shift+N)">
            <Plus size={13} />
          </button>
        </div>

        {/* Folder list */}
        <div ref={ref} className="flex-1 overflow-y-auto px-2 pb-2"
          onContextMenu={e => { if (e.target === ref.current) { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); } }}>
          {visibleRootFolders.map(folder => <FolderItem key={folder.id} folder={folder} depth={0} folderMatches={folderMatches} />)}
          {rootFolders.length === 0 && (
            <p className="text-xs px-2 py-3" style={{ color: 'var(--text-muted)' }}>Right-click to add a folder.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 text-xs" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}>
          {displayFolders.length} folders
        </div>
      </aside>

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} folder={null}
          onClose={() => setContextMenu(null)} onNewFolder={() => setShowAddFolder(true)}
          onNewSubfolder={() => setShowAddFolder(true)} onDeleteFolder={() => {}} />
      )}

      {showAddFolder && (
        <FolderFormModal title="New Folder"
          onSave={(name, icon, color) => actions.addFolder(name, icon, color, null)}
          onClose={() => setShowAddFolder(false)} />
      )}
      {showTrash && <TrashPanel onClose={() => setShowTrash(false)} />}

      {/* Create Library modal */}
      {libraryToDelete && (
        <ConfirmModal
          title={`Remove Library "${libraryToDelete.name}"`}
          message="Are you sure you want to remove this library from the list? Your local files will NOT be deleted."
          confirmLabel="Remove"
          onConfirm={() => actions.deleteLibrary(libraryToDelete.id)}
          onClose={() => setLibraryToDelete(null)}
        />
      )}

      {showCreateLibrary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" onClick={() => setShowCreateLibrary(false)}>
          <div className="fade-slide-in rounded-2xl p-5 shadow-2xl" style={{ width: 300, background: '#1c2030', border: '1px solid var(--border-strong)' }} onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-3" style={{ color: 'var(--text-white)' }}>New Library</h3>
            <input
              autoFocus
              value={newLibName}
              onChange={e => setNewLibName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && newLibName.trim() && (actions.createLibrary(newLibName.trim()), setNewLibName(''), setShowCreateLibrary(false))}
              placeholder="Library name"
              className="w-full rounded-lg px-3 py-2 text-sm mb-3"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            />
            <div className="flex gap-2">
              <button onClick={() => setShowCreateLibrary(false)} className="flex-1 py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>Cancel</button>
              <button onClick={() => { actions.createLibrary(newLibName.trim()); setNewLibName(''); setShowCreateLibrary(false); }}
                disabled={!newLibName.trim()} className="flex-1 py-2 rounded-lg text-sm font-bold disabled:opacity-40"
                style={{ background: 'var(--accent-blue)', color: '#fff' }}>Create</button>
            </div>
          </div>
        </div>
      )}
      {showTrash && <TrashPanel onClose={() => setShowTrash(false)} />}
    </>
  );
}