import React from 'react';

export function DraggableSuggestion({ tag }) {
  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/tag', tag);
    e.dataTransfer.setData('text/plain', tag);
    e.dataTransfer.effectAllowed = 'copyMove';

    // Create ghost image
    const ghost = document.createElement('div');
    ghost.style.position = 'absolute';
    ghost.style.top = '-1000px';
    ghost.style.background = 'var(--accent-primary)';
    ghost.style.color = '#ffffff';
    ghost.style.padding = '4px 10px';
    ghost.style.borderRadius = '6px';
    ghost.style.fontSize = '12px';
    ghost.style.fontWeight = 'bold';
    ghost.textContent = tag;

    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 15, 15);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  return (
    <button
      draggable
      onDragStart={handleDragStart}
      className="group/pill inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold transition-fast cursor-grab active:cursor-grabbing border bg-[var(--bg-active)]"
      style={{
        borderColor: 'var(--border-strong)',
        color: 'var(--text-primary)'
      }}
    >
      {tag}
    </button>
  );
}
