// src/stores/librarySlice.js
import { v4 as uuidv4 } from 'uuid';

// Default empty library state
const emptyLibrary = () => ({
  folders: [],
  categories: [],
  prompts: [],
  trashedPrompts: [],
  trashedCategories: [],
  trashedTags: [],
  selectedFolderId: null,
  selectedPromptId: null,
  activePrompt: { title: '', positive: '', negative: '' },
  view: 'folder',
  activeField: 'positive',
  folderSortOrders: {},
  autoDeleteDays: 30,
  tagImageFiles: {},
  recentTags: [],
  booruTagFolder: '',
  booruFiles: [],
  booruTagCount: 0,
  isIndexingBooru: false,

  // undo/redo for prompt
  promptHistory: [],
  promptFuture: [],
});

export const createLibrarySlice = (set, get) => ({
  ...emptyLibrary(),

  // ── Library lifecycle ────────────────────────────────────────
  createLibrary: () => set(emptyLibrary()),
  switchLibrary: (id, data) => set({ currentLibraryId: id, ...data }),

  // ── Folder actions ──────────────────────────────────────────
  addFolder: (name, icon, color, parentId) =>
    set((state) => ({
      folders: [...state.folders, {
        id: uuidv4(),
        name,
        icon: icon || '📁',
        color: color || null,
        parentId: parentId || null,
        createdAt: Date.now(),
      }],
    })),
  updateFolder: (id, updates) =>
    set((state) => ({
      folders: state.folders.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    })),
  deleteFolder: (folderId) =>
    set((state) => {
      // recursively collect descendant folder ids
      const getAllDescendants = (rootId, all) => {
        const ids = new Set([rootId]);
        let changed = true;
        while (changed) {
          changed = false;
          all.forEach((f) => {
            if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
              ids.add(f.id);
              changed = true;
            }
          });
        }
        return ids;
      };
      const toDelete = getAllDescendants(folderId, state.folders);
      const now = Date.now();
      const promptsToTrash = state.prompts
        .filter((p) => toDelete.has(p.folderId))
        .map((p) => ({ ...p, deletedAt: now }));
      const categoriesToTrash = state.categories
        .filter((c) => toDelete.has(c.folderId))
        .map((c) => ({ ...c, deletedAt: now }));
      return {
        folders: state.folders.filter((f) => !toDelete.has(f.id)),
        categories: state.categories.filter((c) => !toDelete.has(c.folderId)),
        prompts: state.prompts.filter((p) => !toDelete.has(p.folderId)),
        trashedPrompts: [...promptsToTrash, ...state.trashedPrompts],
        trashedCategories: [...categoriesToTrash, ...(state.trashedCategories || [])],
      };
    }),
  reorderFolders: (folders) => set({ folders }),
  setFolderSort: (scopeKey, by, dir) =>
    set((state) => ({
      folderSortOrders: { ...state.folderSortOrders, [scopeKey]: { by, dir: dir || 'asc' } },
    })),

  // ── Category actions ────────────────────────────────────────
  addCategory: (folderId, name, color) =>
    set((state) => {
      const newCat = {
        id: uuidv4(),
        folderId,
        name,
        color: color || ['cat-blue','cat-violet','cat-emerald','cat-amber','cat-rose','cat-cyan','cat-orange','cat-pink','cat-lime','cat-indigo'][Math.floor(Math.random()*10)],
        tags: [],
      };
      return { categories: [newCat, ...state.categories] };
    }),
  updateCategory: (id, updates) =>
    set((state) => ({
      categories: state.categories.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),
  reorderCategories: (categories) => set({ categories }),
  deleteCategory: (categoryId) =>
    set((state) => {
      const cat = state.categories.find((c) => c.id === categoryId);
      if (!cat) return state;
      return {
        categories: state.categories.filter((c) => c.id !== categoryId),
        trashedCategories: [{ ...cat, deletedAt: Date.now() }, ...(state.trashedCategories || [])],
      };
    }),
  restoreCategory: (id) =>
    set((state) => {
      const cat = (state.trashedCategories || []).find((c) => c.id === id);
      if (!cat) return state;
      const { deletedAt, ...restored } = cat;
      return {
        trashedCategories: state.trashedCategories.filter((c) => c.id !== id),
        categories: [...state.categories, { ...restored, restoredAt: Date.now() }],
      };
    }),
  permDeleteCategory: (id) =>
    set((state) => {
      const cat = (state.trashedCategories || []).find((c) => c.id === id);
      // clean up tag images
      if (cat) {
        const prefix = `${cat.id}::`;
        Object.entries(state.tagImageFiles || {}).forEach(([k, fname]) => {
          if (k.startsWith(prefix)) {
            // fire-and-forget file delete
            if (window.__TAURI__) {
              import('@tauri-apps/api/core').then(({ invoke }) =>
                invoke('delete_tag_image', { filename: fname }).catch(() => {})
              );
            } else {
              localStorage.removeItem(`tag-img::${fname}`);
            }
          }
        });
      }
      const tagImageFiles = cat
        ? Object.fromEntries(Object.entries(state.tagImageFiles || {}).filter(([k]) => !k.startsWith(`${cat.id}::`)))
        : state.tagImageFiles || {};
      return {
        tagImageFiles,
        trashedCategories: state.trashedCategories.filter((c) => c.id !== id),
      };
    }),

  // ── Tag actions ─────────────────────────────────────────────
  addTag: (categoryId, tag) =>
    set((state) => ({
      categories: state.categories.map((c) =>
        c.id === categoryId && !c.tags.map((t) => t.toLowerCase()).includes(tag.toLowerCase())
          ? { ...c, tags: [...c.tags, tag] }
          : c
      ),
    })),
  removeTag: (categoryId, tag) =>
    set((state) => {
      const cat = state.categories.find((c) => c.id === categoryId);
      if (!cat) return state;
      const trashedTag = {
        id: `${categoryId}::${tag}::${Date.now()}`,
        tag,
        categoryId,
        categoryName: cat.name,
        categoryColor: cat.color,
        deletedAt: Date.now(),
      };
      return {
        categories: state.categories.map((c) =>
          c.id === categoryId ? { ...c, tags: c.tags.filter((t) => t !== tag) } : c
        ),
        trashedTags: [trashedTag, ...(state.trashedTags || [])],
      };
    }),
  removeTagsBulk: (categoryId, tags) =>
    set((state) => {
      const cat = state.categories.find((c) => c.id === categoryId);
      if (!cat) return state;
      const now = Date.now();
      const newTrashed = tags.map((tagName, i) => ({
        id: `${categoryId}::${tagName}::${now + i}`,
        tag: tagName,
        categoryId,
        categoryName: cat.name,
        categoryColor: cat.color,
        deletedAt: now,
      }));
      return {
        categories: state.categories.map((c) =>
          c.id === categoryId ? { ...c, tags: c.tags.filter((t) => !tags.includes(t)) } : c
        ),
        trashedTags: [...newTrashed, ...(state.trashedTags || [])],
      };
    }),
  restoreTag: (id) =>
    set((state) => {
      const tt = (state.trashedTags || []).find((t) => t.id === id);
      if (!tt) return state;
      const alreadyExists = state.categories
        .find((c) => c.id === tt.categoryId)
        ?.tags.map((t) => t.toLowerCase())
        .includes(tt.tag.toLowerCase());
      return {
        trashedTags: state.trashedTags.filter((t) => t.id !== id),
        categories: state.categories.map((c) =>
          c.id === tt.categoryId && !alreadyExists
            ? { ...c, tags: [...c.tags, tt.tag] }
            : c
        ),
      };
    }),
  permDeleteTag: (id) =>
    set((state) => {
      const tt = (state.trashedTags || []).find((t) => t.id === id);
      if (tt) {
        const imgKey = `${tt.categoryId}::${tt.tag}`;
        const fname = (state.tagImageFiles || {})[imgKey];
        if (fname) {
          if (window.__TAURI__) {
            import('@tauri-apps/api/core').then(({ invoke }) =>
              invoke('delete_tag_image', { filename: fname }).catch(() => {})
            );
          } else {
            localStorage.removeItem(`tag-img::${fname}`);
          }
        }
      }
      const tagImageFiles = tt
        ? Object.fromEntries(Object.entries(state.tagImageFiles || {}).filter(([k]) => k !== `${tt.categoryId}::${tt.tag}`))
        : state.tagImageFiles || {};
      return {
        tagImageFiles,
        trashedTags: state.trashedTags.filter((t) => t.id !== id),
      };
    }),
  setTagImage: (categoryId, tag, filename) =>
    set((state) => {
      const key = `${categoryId}::${tag}`;
      const oldFname = (state.tagImageFiles || {})[key];
      if (oldFname && oldFname !== filename && window.__TAURI__) {
        import('@tauri-apps/api/core').then(({ invoke }) =>
          invoke('delete_tag_image', { filename: oldFname }).catch(() => {})
        );
      }
      const tagImageFiles = { ...(state.tagImageFiles || {}) };
      if (filename) tagImageFiles[key] = filename;
      else delete tagImageFiles[key];
      return { tagImageFiles };
    }),

  // ── Prompt actions ─────────────────────────────────────────
  savePrompt: () => {
    const state = get();
    const { activePrompt, selectedPromptId, selectedFolderId } = state;
    if (!activePrompt.positive.trim() && !activePrompt.negative.trim()) return;
    if (selectedPromptId) {
      set((s) => ({
        prompts: s.prompts.map((p) =>
          p.id === selectedPromptId ? { ...p, ...activePrompt, updatedAt: Date.now() } : p
        ),
      }));
    } else {
      const newP = {
        id: uuidv4(),
        folderId: selectedFolderId || null,
        ...activePrompt,
        createdAt: Date.now(),
      };
      set((s) => ({
        prompts: [newP, ...s.prompts],
        selectedPromptId: newP.id,
      }));
    }
  },
  deletePrompt: (id) =>
    set((state) => {
      const prompt = state.prompts.find((p) => p.id === id);
      if (!prompt) return state;
      return {
        prompts: state.prompts.filter((p) => p.id !== id),
        trashedPrompts: [{ ...prompt, deletedAt: Date.now() }, ...state.trashedPrompts],
        selectedPromptId: state.selectedPromptId === id ? null : state.selectedPromptId,
        activePrompt: state.selectedPromptId === id ? { title: '', positive: '', negative: '' } : state.activePrompt,
      };
    }),
  restorePrompt: (id) =>
    set((state) => {
      const prompt = state.trashedPrompts.find((p) => p.id === id);
      if (!prompt) return state;
      const { deletedAt, ...restored } = prompt;
      return {
        trashedPrompts: state.trashedPrompts.filter((p) => p.id !== id),
        prompts: [{ ...restored, restoredAt: Date.now() }, ...state.prompts],
      };
    }),
  permDelete: (id) =>
    set((state) => ({
      trashedPrompts: state.trashedPrompts.filter((p) => p.id !== id),
      selectedPromptId: state.selectedPromptId === id ? null : state.selectedPromptId,
    })),

  // ── Trash actions (bulk) ────────────────────────────────────
  emptyTrash: () =>
    set({
      trashedPrompts: [],
      trashedCategories: [],
      trashedTags: [],
    }),
  autoDeleteTrash: () =>
    set((state) => {
      const cutoff = Date.now() - state.autoDeleteDays * 24 * 60 * 60 * 1000;
      return {
        trashedPrompts: state.trashedPrompts.filter((p) => (p.deletedAt || 0) > cutoff),
        trashedCategories: (state.trashedCategories || []).filter((c) => (c.deletedAt || 0) > cutoff),
        trashedTags: (state.trashedTags || []).filter((t) => (t.deletedAt || 0) > cutoff),
      };
    }),
  setAutoDeleteDays: (days) => set({ autoDeleteDays: days }),

  // ── Booru database ──────────────────────────────────────────
  setBooruFolder: (path, files) =>
    set({ booruTagFolder: path, booruFiles: files || [] }),
  reorderBooruFiles: (files) => set({ booruFiles: files }),
  setIndexingBooru: (loading) => set({ isIndexingBooru: loading }),
  setBooruTagCount: (count) => set({ booruTagCount: count || 0, isIndexingBooru: false }),

  // ── Backup settings (per-library, but can also be global) ──
  setBackupSettings: (enabled, mins) =>
    set({ autoBackupEnabled: enabled, autoBackupIntervalMins: mins }),

  // ── Prompt field helpers ────────────────────────────────────
  appendTagToPrompt: (tag, field) =>
    set((state) => {
      const targetField = field || state.activeField;
      const current = (state.activePrompt[targetField] || '').trim();
      if (!tag.trim()) return state;
      const existing = current.split(',').map((t) => t.trim()).filter(Boolean);
      if (existing.map((t) => t.toLowerCase()).includes(tag.toLowerCase())) return state;
      const updated = current ? `${current}, ${tag.trim()}` : tag.trim();
      const recent = [tag, ...(state.recentTags || []).filter((t) => t.toLowerCase() !== tag.toLowerCase())].slice(0, 20);
      return {
        activePrompt: { ...state.activePrompt, [targetField]: updated },
        recentTags: recent,
      };
    }),
  updateActive: (field, value) =>
    set((state) => ({ activePrompt: { ...state.activePrompt, [field]: value } })),
  setActiveField: (field) => set({ activeField: field }),
  removeTagFromPrompt: (field, index) =>
    set((state) => {
      const tags = state.activePrompt[field]
        .split(',')
        .map((t) => t.trim())
        .filter((t, i) => t && i !== index);
      return { activePrompt: { ...state.activePrompt, [field]: tags.join(', ') } };
    }),
  newPrompt: () =>
    set({ selectedPromptId: null, activePrompt: { title: 'New Prompt', positive: '', negative: '' } }),
  selectView: (view, folderId) =>
    set((state) => ({
      view,
      selectedFolderId: folderId || null,
      selectedPromptId: null,
      activePrompt:
        state.selectedPromptId || (!state.activePrompt.positive && !state.activePrompt.negative)
          ? { title: 'New Prompt', positive: '', negative: '' }
          : state.activePrompt,
    })),
  selectPrompt: (id) => {
    const state = get();
    const p = [...state.prompts, ...state.trashedPrompts].find((x) => x.id === id);
    if (p) {
      set({
        selectedPromptId: id,
        activePrompt: { title: p.title, positive: p.positive || '', negative: p.negative || '' },
      });
    }
  },

  // ── Undo/Redo (activePrompt) ────────────────────────────────
  pushPromptHistory: () =>
    set((state) => ({
      promptHistory: [...state.promptHistory.slice(-49), { ...state.activePrompt }],
      promptFuture: [],
    })),
  undoPrompt: () =>
    set((state) => {
      if (state.promptHistory.length === 0) return state;
      const prev = state.promptHistory[state.promptHistory.length - 1];
      const newHistory = state.promptHistory.slice(0, -1);
      const newFuture = [{ ...state.activePrompt }, ...state.promptFuture];
      return { activePrompt: prev, promptHistory: newHistory, promptFuture: newFuture };
    }),
  redoPrompt: () =>
    set((state) => {
      if (state.promptFuture.length === 0) return state;
      const next = state.promptFuture[0];
      const newHistory = [...state.promptHistory, { ...state.activePrompt }];
      const newFuture = state.promptFuture.slice(1);
      return { activePrompt: next, promptHistory: newHistory, promptFuture: newFuture };
    }),
});