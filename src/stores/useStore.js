// src/stores/useStore.js
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createSettingsSlice } from './settingsSlice';
import { createLibrarySlice } from './librarySlice';
import { createTauriStorage } from './persist';

// ── Global Settings Store (persisted) ───────────────────────────
export const useSettingsStore = create(
  persist(
    (...args) => ({
      ...createSettingsSlice(...args),
    }),
    {
      name: 'pp-ai-settings',
      storage: createJSONStorage(() => createTauriStorage('pony-prompt-ai-settings')),
      partialize: (state) => ({
        themeBase: state.themeBase,
        themeAccent: state.themeAccent,
        autoBackupEnabled: state.autoBackupEnabled,
        autoBackupIntervalMins: state.autoBackupIntervalMins,
        libraries: state.libraries,
        currentLibraryId: state.currentLibraryId,
        aiProvider: state.aiProvider,
        aiApiKey: state.aiApiKey,
        aiBaseUrl: state.aiBaseUrl,
        aiModel: state.aiModel,
        aiStreaming: state.aiStreaming,
        aiCustomInstructions: state.aiCustomInstructions,
      }),
    }
  )
);

// ── Library Store (NOT persisted – we handle load/save manually) ─
export const useLibraryStore = create(createLibrarySlice);

// ── Library persistence helpers (reuse your existing logic) ─────
// These will be called from the library store actions when saving/loading.
const LIBRARY_STATE_KEYS = [
  'folders','categories','prompts',
  'trashedPrompts','trashedCategories','trashedTags',
  'selectedFolderId','selectedPromptId','activePrompt','view','activeField',
  'folderSortOrders','autoDeleteDays','tagImageFiles','recentTags',
  'booruTagFolder','booruFiles','booruTagCount',
];

async function saveLibrary(id, state) {
  const data = Object.fromEntries(LIBRARY_STATE_KEYS.map(k => [k, state[k]]));
  const settings = useSettingsStore.getState();
  const lib = settings.libraries.find(l => l.id === id);

  if (window.__TAURI__) {
    try {
      if (lib && lib.path) {
        const { invoke } = await import('@tauri-apps/api/core');
        const file_path = lib.path.endsWith('.json') ? lib.path : `${lib.path}\\library.json`.replace(/\\\\/g, '\\');
        await invoke('write_text_file', { path: file_path, contents: JSON.stringify(data, null, 2) });
        return;
      } else {
        const { load } = await import('@tauri-apps/plugin-store');
        const store = await load(`pony-prompt-lib-${id}.json`, { autoSave: false });
        await store.set('state', data);
        await store.save();
        return;
      }
    } catch (e) {
      console.warn('[store] Tauri library save failed', e);
    }
  }
  try { localStorage.setItem(`pp-lib-${id}`, JSON.stringify(data)); } catch {}
}

export async function loadLibrary(id) {
  const settings = useSettingsStore.getState();
  const lib = settings.libraries.find(l => l.id === id);

  if (window.__TAURI__) {
    try {
      if (lib && lib.path) {
        const { invoke } = await import('@tauri-apps/api/core');
        const file_path = lib.path.endsWith('.json') ? lib.path : `${lib.path}\\library.json`.replace(/\\\\/g, '\\');
        const str = await invoke('read_text_file', { path: file_path });
        if (str) return JSON.parse(str);
      } else {
        const { load } = await import('@tauri-apps/plugin-store');
        const store = await load(`pony-prompt-lib-${id}.json`, { autoSave: false });
        const data = await store.get('state');
        if (data) return data;
      }
    } catch (e) {
      console.warn('[store] Library load failed', e);
    }
  }
  try {
    const str = localStorage.getItem(`pp-lib-${id}`);
    if (str) return JSON.parse(str);
  } catch {}
  return null;
}

// Wire up auto‑save for the library store whenever it changes
useLibraryStore.subscribe((state) => {
  const settings = useSettingsStore.getState();
  if (settings.currentLibraryId) {
    saveLibrary(settings.currentLibraryId, state);
  }
});

// Expose stores globally for debugging (remove in production)
if (typeof window !== 'undefined') {
  window.useSettingsStore = useSettingsStore;
  window.useLibraryStore = useLibraryStore;
}