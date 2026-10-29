import React, { useMemo, useState } from 'react';
import { diffWords } from 'diff';
import { Check, X } from 'lucide-react';

export function DiffView({ oldText, newText, onAccept, onReject, label }) {
  const [status, setStatus] = useState('pending'); // 'pending', 'accepted', 'rejected'

  const diffs = useMemo(() => {
    return diffWords(oldText || '', newText || '');
  }, [oldText, newText]);

  const handleAccept = () => {
    onAccept();
    setStatus('accepted');
  };

  const handleReject = () => {
    if (onReject) onReject();
    setStatus('rejected');
  };

  if (status === 'rejected') {
    return (
      <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl opacity-60">
        <X size={14} className="text-red-400" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Rejected {label} </span>
      </div>
    );
  }

  if (status === 'accepted') {
    return (
      <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl opacity-80 border-emerald-500/30">
        <Check size={14} className="text-emerald-400" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-500/80">Applied {label} Rewrite</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 mt-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl overflow-hidden shadow-sm">
      <div className="flex justify-between items-center px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)]">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Rewrite {label}</span>
        <div className="flex gap-1">
            <button onClick={handleReject} className="p-1 px-2 rounded-md hover:bg-white/10 text-[var(--text-muted)] hover:text-red-400 transition-colors flex items-center gap-1 text-[11px] font-medium">
                <X size={12}/> Reject
            </button>
            <button onClick={handleAccept} className="p-1 px-2 rounded-md hover:bg-white/10 text-[var(--text-muted)] hover:text-emerald-400 transition-colors flex items-center gap-1 text-[11px] font-medium">
                <Check size={12}/> Accept
            </button>
        </div>
      </div>
      <div className="p-3 text-sm leading-relaxed max-h-[200px] overflow-y-auto custom-scrollbar">
        {diffs.map((part, index) => {
          if (part.added) return <span key={index} className="bg-emerald-500/20 text-emerald-300 rounded px-0.5">{part.value}</span>;
          if (part.removed) return <span key={index} className="bg-red-500/20 text-red-300 line-through rounded px-0.5 opacity-60">{part.value}</span>;
          return <span key={index} style={{ color: 'var(--text-secondary)' }}>{part.value}</span>;
        })}
      </div>
    </div>
  );
}
