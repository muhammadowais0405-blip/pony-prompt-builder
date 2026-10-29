import { useState } from 'react';
import { useStore } from '../store/index.jsx';
import { ConfirmModal } from './RightColumn.jsx';
import { X, Trash2, RotateCcw } from 'lucide-react';

const COLOR_OPTIONS = [
  { id: 'cat-blue',    hex: '#3b82f6' }, { id: 'cat-violet',  hex: '#8b5cf6' },
  { id: 'cat-emerald', hex: '#10b981' }, { id: 'cat-amber',   hex: '#f59e0b' },
  { id: 'cat-rose',    hex: '#f43f5e' }, { id: 'cat-cyan',    hex: '#06b6d4' },
  { id: 'cat-orange',  hex: '#f97316' }, { id: 'cat-pink',    hex: '#ec4899' },
  { id: 'cat-lime',    hex: '#84cc16' }, { id: 'cat-indigo',  hex: '#6366f1' },
];
function getHex(id) { return COLOR_OPTIONS.find(c => c.id === id)?.hex || '#3b82f6'; }

function timeAgo(ts) {
  if (!ts) return '';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function TrashItem({ icon, title, subtitle, accentColor, deletedAt, autoDeleteDays, onRestore, onDelete }) {
  const daysLeft = deletedAt
    ? Math.max(0, Math.ceil((deletedAt + autoDeleteDays * 86400000 - Date.now()) / 86400000))
    : null;
  const urgent = daysLeft !== null && daysLeft <= 3;
  const soon   = daysLeft !== null && daysLeft <= 7;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl group transition-fast"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate"
          style={{ color: accentColor || 'var(--text-white)' }}>{title}</p>
        {subtitle && (
          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Deleted {timeAgo(deletedAt)}
          </span>
          {daysLeft !== null && (
            <span className="text-xs font-bold"
              style={{ color: urgent ? '#f43f5e' : soon ? '#f59e0b' : 'var(--text-muted)' }}>
              · {daysLeft}d left
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-fast">
        <button onClick={onRestore} title="Restore"
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-fast"
          style={{ background: '#10b98120', color: '#10b981' }}>
          <RotateCcw size={13} />
        </button>
        <button onClick={onDelete} title="Delete permanently"
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-fast"
          style={{ background: '#f43f5e20', color: '#f43f5e' }}>
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

function EmptyBin({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <Trash2 size={22} style={{ color: 'var(--text-muted)', opacity: 0.2 }} />
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

export default function TrashPanel({ onClose }) {
  const { state, actions } = useStore();
  const [tab, setTab] = useState('prompts');
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const trashedCategories = state.trashedCategories || [];
  const trashedTags       = state.trashedTags || [];

  const tabs = [
    { id: 'prompts',    label: 'Prompts',    count: (state.trashedPrompts || []).length },
    { id: 'categories', label: 'Categories', count: trashedCategories.length },
    { id: 'tags',       label: 'Tags',       count: trashedTags.length },
  ];
  const totalCount = tabs.reduce((a, t) => a + t.count, 0);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center modal-backdrop" onClick={onClose}>
      <div className="fade-slide-in rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ width: 480, maxHeight: '80vh',
                 background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: '#7f1d1d', color: '#fca5a5' }}>
              <Trash2 size={15} />
            </div>
            <div>
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-white)' }}>Trash</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {totalCount} item{totalCount !== 1 ? 's' : ''} · auto-deletes after {state.autoDeleteDays} days
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {totalCount > 0 && (
              <button onClick={() => setConfirmEmpty(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-fast"
                style={{ background: '#7f1d1d40', color: '#fca5a5', border: '1px solid #7f1d1d60' }}>
                <Trash2 size={11} /> Empty All
              </button>
            )}
            <button onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-70 transition-fast"
              style={{ color: 'var(--text-muted)', background: 'var(--bg-hover)' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-1 py-2.5 text-xs font-bold transition-fast flex items-center justify-center gap-1.5"
              style={{
                color: tab === t.id ? 'var(--text-white)' : 'var(--text-muted)',
                borderBottom: tab === t.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
                background: tab === t.id ? 'var(--bg-base)' : 'transparent',
              }}>
              {t.label}
              {t.count > 0 && (
                <span className="px-1.5 py-0.5 rounded-md font-bold"
                  style={{ background: tab === t.id ? 'var(--accent-blue)' : '#7f1d1d40',
                           color: tab === t.id ? '#fff' : '#fca5a5', fontSize: 10 }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {tab === 'prompts' && (
            (state.trashedPrompts || []).length === 0
              ? <EmptyBin label="No trashed prompts" />
              : (state.trashedPrompts || []).map(p => (
                  <TrashItem key={p.id}
                    icon="📝" title={p.title || 'Untitled'}
                    subtitle={p.positive ? `${p.positive.slice(0, 60)}…` : ''}
                    deletedAt={p.deletedAt} autoDeleteDays={state.autoDeleteDays}
                    onRestore={() => actions.restorePrompt(p.id)}
                    onDelete={() => actions.permDelete(p.id)} />
                ))
          )}
          {tab === 'categories' && (
            trashedCategories.length === 0
              ? <EmptyBin label="No trashed categories" />
              : trashedCategories.map(c => (
                  <TrashItem key={c.id}
                    icon="🗂" title={c.name}
                    subtitle={`${c.tags?.length || 0} tag${c.tags?.length !== 1 ? 's' : ''} inside`}
                    accentColor={getHex(c.color)}
                    deletedAt={c.deletedAt} autoDeleteDays={state.autoDeleteDays}
                    onRestore={() => actions.restoreCategory(c.id)}
                    onDelete={() => actions.permDeleteCategory(c.id)} />
                ))
          )}
          {tab === 'tags' && (
            trashedTags.length === 0
              ? <EmptyBin label="No trashed tags" />
              : trashedTags.map(t => (
                  <TrashItem key={t.id}
                    icon="🏷" title={t.tag}
                    subtitle={`from "${t.categoryName}"`}
                    accentColor={getHex(t.categoryColor)}
                    deletedAt={t.deletedAt} autoDeleteDays={state.autoDeleteDays}
                    onRestore={() => actions.restoreTag(t.id)}
                    onDelete={() => actions.permDeleteTag(t.id)} />
                ))
          )}
        </div>
      </div>

      {confirmEmpty && (
        <ConfirmModal
          title="Empty All Trash"
          message="Permanently delete everything in Trash? This cannot be undone."
          confirmLabel="Empty Trash"
          onConfirm={() => { actions.emptyTrash(); setConfirmEmpty(false); }}
          onClose={() => setConfirmEmpty(false)} />
      )}
    </div>
  );
}
