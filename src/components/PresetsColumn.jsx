import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/index.jsx';
import { Star, Copy, Trash2, Search, FileCode, Upload } from 'lucide-react';
import { ConfirmModal } from './CenterColumn.jsx';

// Simple helper to parse presets and determine xml sections roughly
function analyzePreset(preset) {
  const content = (preset.positive || '') + '\n' + (preset.negative || '');
  // Very rough regex for XML tags, checking common tags
  const tags = content.match(/<[a-zA-Z0-9_-]+>/g);
  return {
    format: tags ? 'XML' : 'TEXT',
    sections: tags ? tags.length : content.split('\n\n').filter(Boolean).length
  };
}

export default function PresetsColumn() {
  const { state, actions } = useStore();
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Default presets to current folder if they had folderId, but our presets are global
  // The user says "displaying all presets in your current folder".
  // If presets don't actually track folderId yet, we can filter them if they do,
  // or fall back to global. Let's just filter if preset has folderId.
  const currentFolderId = state.selectedPresetFolderId;
  
  const presetsToShow = state.presets.filter(p => {
    if (search) {
      if (!p.name.toLowerCase().includes(search.toLowerCase())) return false;
    }
    if (currentFolderId && p.folderId !== currentFolderId) {
      return false;
    }
    return true;
  });

  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileInput = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      for (const file of files) {
        let text;
        try {
          text = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = ev => resolve(ev.target.result);
            reader.onerror = ev => reject(ev);
            reader.readAsText(file);
          });
        } catch (err) {
          console.error('Failed to read file:', err);
          continue;
        }
        processPresetFileText(file.name, text);
      }
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

    const processPresetFileText = (filename, text) => {
    if (filename.endsWith('.xml') || filename.endsWith('.json') || filename.endsWith('.txt')) {
      if (filename.endsWith('.json')) {
        try {
          const data = JSON.parse(text);
          if (data.presets && Array.isArray(data.presets)) {
            data.presets.forEach(p => {
              actions.addPreset({
                ...p,
                name: p.name || 'Imported Preset',
                positive: p.positive || p.prompt || p.pos || '',
                negative: p.negative || p.negative_prompt || p.neg || ''
              });
            });
            return;
          } else if (Array.isArray(data)) {
            data.forEach(p => {
              actions.addPreset({
                ...p,
                name: p.name || 'Imported Preset',
                positive: p.positive || p.prompt || p.pos || '',
                negative: p.negative || p.negative_prompt || p.neg || ''
              });
            });
            return;
          } else {
            actions.addPreset({
              ...data,
              name: data.name || filename.replace(/\.[^/.]+$/, ""),
              positive: data.positive || data.prompt || data.pos || '',
              negative: data.negative || data.negative_prompt || data.neg || ''
            });
            return;
          }
        } catch (err) {
          // Fallback to text if JSON parse fails
        }
      }
      
      // Basic extraction for text / xml
      actions.addPreset({
        name: filename.replace(/\.[^/.]+$/, ""),
        positive: text,
        negative: ''
      });
    }
  };

  return (
    <div 
      className="flex flex-col h-full flex-1 w-full relative" 
      style={{ background: 'var(--bg-base)' }}
    >
      <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-white)' }}>Presets</h2>
        <div className="flex items-center gap-2">
          <input 
            type="file" 
            multiple 
            accept=".json,.xml,.txt" 
            ref={fileInputRef} 
            onChange={handleFileInput} 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center p-1.5 rounded-full hover:bg-[var(--bg-hover)] transition-fast"
            title="Import Presets"
          >
            <Upload size={16} style={{ color: 'var(--text-muted)' }} />
          </button>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-9 pr-4 py-1.5 rounded-full text-sm outline-none transition-fast w-32 focus:w-48"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
        <div className="w-full max-w-3xl space-y-3">
          {presetsToShow.map(preset => {
            const { format, sections } = analyzePreset(preset);
            const isFav = preset.favorite;
            const isSelected = preset.id === state.selectedPresetId;
            return (
              <div
                key={preset.id}
                onClick={(e) => {
                  // Prevent triggering if clicked on a button inside
                  if (e.target.closest('button')) return;
                  actions.selectPreset(preset.id);
                }}
                className={`group flex items-center justify-between rounded-2xl p-4 transition-fast relative overflow-hidden cursor-pointer ${
                  isSelected ? 'ring-2' : ''
                }`}
                style={{ 
                  background: isSelected ? 'var(--bg-active)' : 'var(--bg-surface)', 
                  borderColor: isSelected ? 'var(--accent-blue)' : 'var(--border-default)',
                  borderWidth: '1px',
                  borderStyle: 'solid'
                }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: '#8b5cf6', color: '#fff' }}>
                    <FileCode size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--text-white)' }}>{preset.name}</h3>
                    <div className="text-xs mt-1 flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
                      <span className="flex items-center gap-1 font-medium"><FileCode size={12} /> {format}</span>
                      <span>{sections} sections</span>
                    </div>
                  </div>
                </div>

                {/* Quick actions popup on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-fast flex items-center gap-3 px-4 py-2 rounded-full shadow-lg ml-4"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}>
                  <button
                    onClick={() => actions.updatePreset(preset.id, { favorite: !isFav })}
                    className="hover:scale-110 transition-transform"
                    style={{ color: isFav ? '#f59e0b' : 'var(--text-secondary)' }}
                    title={isFav ? "Unfavorite" : "Favorite"}
                  >
                    <Star size={16} fill={isFav ? '#f59e0b' : 'none'} />
                  </button>
                  <button
                    onClick={() => {
                        actions.addPreset({...preset, name: (preset.name || 'Preset') + ' Copy'});
                    }}
                    className="hover:scale-110 transition-transform"
                    style={{ color: 'var(--text-secondary)' }}
                    title="Duplicate preset"
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(preset)}
                    className="hover:scale-110 transition-transform"
                    style={{ color: '#f43f5e' }}
                    title="Delete preset"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        
        {presetsToShow.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40" style={{ color: 'var(--text-muted)' }}>
            <FileCode size={32} className="mb-2 opacity-50" />
            <p>No presets found.</p>
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Delete Preset"
          message={`Are you sure you want to delete "${confirmDelete.name}"?`}
          confirmLabel="Delete"
          onConfirm={() => {
            actions.deletePreset(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
