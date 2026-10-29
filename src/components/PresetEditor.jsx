import React, { useState } from 'react';
import { useStore } from '../store/index.jsx';
import { Save, Trash2, Download, Plus, ChevronDown, ChevronRight, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';

export default function PresetEditor({ width, onResizeStart }) {
  const { state, actions } = useStore();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'sections'

  const preset = state.presets.find(p => p.id === state.selectedPresetId);

  if (!preset) {
    return (
      <div className="flex flex-col h-full relative gradient-separator-left items-center justify-center"
        style={{ width, minWidth: 320, background: 'var(--bg-elevated)', flexShrink: 0 }}>
        <div className="w-1 absolute left-0 top-0 bottom-0 cursor-col-resize hover:bg-blue-500/50 transition-colors z-50"
          onMouseDown={onResizeStart} />
        <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Select a preset to edit</p>
      </div>
    );
  }

  const updatePreset = (updates) => {
    actions.updatePreset(preset.id, updates);
  };

  const handleExport = async () => {
    if (!window.__TAURI__) {
      // Web fallback
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(preset, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", preset.name + ".json");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      return;
    }

    // Tauri export
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const filePath = await invoke('save_file_dialog', { 
        title: 'Export Preset', 
        defaultName: preset.name + '.json' 
      });
      if (filePath) {
        // Write the file
        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify(preset, null, 2));
        await invoke('write_file_binary', { path: filePath, contents: Array.from(data) });
      }
    } catch (err) {
      console.error("Failed to export preset:", err);
    }
  };

  const handleDelete = () => {
    actions.deletePreset(preset.id);
    actions.selectPreset(null);
  };

  const addSection = () => {
    const sections = preset.sections || [];
    updatePreset({
      sections: [...sections, {
        id: crypto.randomUUID(),
        name: 'New Section',
        content: '',
        role: 'system',
        position: 'ordered'
      }]
    });
  };

  const updateSection = (id, updates) => {
    const sections = preset.sections || [];
    updatePreset({
      sections: sections.map(s => s.id === id ? { ...s, ...updates } : s)
    });
  };

  const deleteSection = (id) => {
    const sections = preset.sections || [];
    updatePreset({
      sections: sections.filter(s => s.id !== id)
    });
  };

  const moveSection = (index, dir) => {
    const sections = [...(preset.sections || [])];
    if (index + dir < 0 || index + dir >= sections.length) return;
    const temp = sections[index];
    sections[index] = sections[index + dir];
    sections[index + dir] = temp;
    updatePreset({ sections });
  };

  return (
    <div className="flex flex-col h-full relative gradient-separator-left"
      style={{ width, minWidth: 320, background: 'var(--bg-elevated)', flexShrink: 0 }}>
      {/* Resizer Handle */}
      <div className="w-1 absolute left-0 top-0 bottom-0 cursor-col-resize transition-colors z-50 hover:bg-[var(--accent-blue)]"
        onMouseDown={onResizeStart} />

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
        <h2 className="text-lg font-bold truncate" style={{ color: 'var(--text-white)' }}>{preset.name}</h2>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-fast" title="Export">
            <Download size={16} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button onClick={handleDelete} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-fast" title="Delete Preset">
            <Trash2 size={16} style={{ color: '#f43f5e' }} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-6 border-b shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition-fast ${activeTab === 'overview' ? 'text-blue-500 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('sections')}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition-fast ${activeTab === 'sections' ? 'text-blue-500 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
        >
          Sections
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-bold mb-2 tracking-wider" style={{ color: 'var(--text-muted)' }}>PRESET NAME</label>
              <input
                type="text"
                value={preset.name}
                onChange={e => updatePreset({ name: e.target.value })}
                className="w-full bg-transparent border-b outline-none py-1 transition-fast focus:border-[var(--accent-blue)]"
                style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)' }}
                placeholder="Give your preset a name..."
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-2 tracking-wider" style={{ color: 'var(--text-muted)' }}>DESCRIPTION</label>
              <textarea
                value={preset.description || ''}
                onChange={e => updatePreset({ description: e.target.value })}
                className="w-full bg-transparent border rounded-lg outline-none p-3 resize-y min-h-[100px] transition-fast focus:border-[var(--accent-blue)]"
                style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)' }}
                placeholder="Describe what this preset does..."
              />
            </div>
          </div>
        )}

        {activeTab === 'sections' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {(preset.sections || []).length} SECTIONS
              </span>
              <button onClick={addSection} className="flex items-center gap-1 text-sm font-medium text-blue-500 hover:text-blue-400 transition-fast">
                <Plus size={14} /> Add Section
              </button>
            </div>

            <div className="space-y-3">
              {(preset.sections || []).map((section, idx) => (
                <SectionEditor
                  key={section.id}
                  section={section}
                  onChange={(updates) => updateSection(section.id, updates)}
                  onDelete={() => deleteSection(section.id)}
                  onMoveUp={() => moveSection(idx, -1)}
                  onMoveDown={() => moveSection(idx, 1)}
                  isFirst={idx === 0}
                  isLast={idx === (preset.sections || []).length - 1}
                />
              ))}
              {(preset.sections || []).length === 0 && (
                <div className="py-12 flex flex-col items-center justify-center text-center border border-dashed rounded-2xl"
                  style={{ borderColor: 'var(--border-subtle)' }}>
                  <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>No sections yet</p>
                  <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Logic blocks will appear here.</p>
                  <button onClick={addSection} className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-500 rounded-full text-sm font-medium hover:bg-blue-500/20 transition-fast">
                    <Plus size={16} /> Create First Section
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionEditor({ section, onChange, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border overflow-hidden transition-all duration-200"
      style={{
        borderColor: expanded ? 'var(--border-strong)' : 'var(--border-default)',
        background: 'var(--bg-surface)'
      }}>
      <div 
        className="flex items-center px-4 py-3 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors select-none"
        onClick={() => setExpanded(!expanded)}
      >
        {!isFirst && (
          <button className="text-gray-500 mr-1 hover:text-white transition-colors" onClick={(e) => { e.stopPropagation(); onMoveUp(); }}>
            <ArrowUp size={14} />
          </button>
        )}
        {!isLast && (
          <button className="text-gray-500 mr-2 hover:text-white transition-colors" onClick={(e) => { e.stopPropagation(); onMoveDown(); }}>
            <ArrowDown size={14} />
          </button>
        )}
        
        {expanded ? <ChevronDown size={16} className="text-gray-500 mr-2" /> : <ChevronRight size={16} className="text-gray-500 mr-2" />}
        
        <div className="flex-1 font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
          {section.name || 'Untitled Section'}
        </div>
        
        {/* Chips for role/position */}
        <div className="flex items-center gap-2 mr-4">
          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(5b, 130, 246, 0.1)', color: 'var(--accent-blue)' }}>
            {section.role || 'system'}
          </span>
        </div>

        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 rounded-md hover:bg-red-500/10 hover:text-red-500 transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="border-t p-4 space-y-4" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-base)' }}>
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: 'var(--text-muted)' }}>Section Name</label>
            <input
              type="text"
              value={section.name}
              onChange={e => onChange({ name: e.target.value })}
              className="w-full bg-transparent border-b outline-none py-1 text-sm transition-fast focus:border-[var(--accent-blue)]"
              style={{ borderColor: 'var(--border-strong)', color: 'var(--text-white)' }}
            />
          </div>
          
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: 'var(--text-muted)' }}>AI Role</label>
              <select
                value={section.role}
                onChange={e => onChange({ role: e.target.value })}
                className="w-full bg-transparent border rounded-md outline-none p-1.5 text-sm transition-fast focus:border-[var(--accent-blue)]"
                style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)', background: 'var(--bg-surface)' }}
              >
                <option value="system">System</option>
                <option value="user">User</option>
                <option value="assistant">Assistant</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: 'var(--text-muted)' }}>Position</label>
              <select
                value={section.position}
                onChange={e => onChange({ position: e.target.value })}
                className="w-full bg-transparent border rounded-md outline-none p-1.5 text-sm transition-fast focus:border-[var(--accent-blue)]"
                style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)', background: 'var(--bg-surface)' }}
              >
                <option value="ordered">Ordered (in sequence)</option>
                <option value="before">Before</option>
                <option value="after">After</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: 'var(--text-muted)' }}>Content</label>
            <textarea
              value={section.content}
              onChange={e => onChange({ content: e.target.value })}
              className="w-full bg-transparent border rounded-md outline-none p-2 text-sm font-mono resize-y min-h-[120px] transition-fast focus:border-[var(--accent-blue)]"
              style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)', background: '#00000020' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
