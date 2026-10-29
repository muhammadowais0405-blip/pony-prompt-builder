import { createContext, useContext, useReducer, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { parseBooruExcel } from '../utils/booru.js';

export const CATEGORY_COLORS = ['cat-blue','cat-violet','cat-emerald','cat-amber','cat-rose','cat-cyan','cat-orange','cat-pink','cat-lime','cat-indigo'];

export const FOLDER_COLOR_OPTIONS = [
  { id: 'default', hex: null,       label: 'Default' },
  { id: 'blue',    hex: '#3b82f6',  label: 'Blue' },
  { id: 'violet',  hex: '#8b5cf6',  label: 'Violet' },
  { id: 'emerald', hex: '#10b981',  label: 'Emerald' },
  { id: 'amber',   hex: '#f59e0b',  label: 'Amber' },
  { id: 'rose',    hex: '#f43f5e',  label: 'Rose' },
  { id: 'cyan',    hex: '#06b6d4',  label: 'Cyan' },
  { id: 'orange',  hex: '#f97316',  label: 'Orange' },
  { id: 'pink',    hex: '#ec4899',  label: 'Pink' },
];

export const FOLDER_ICONS = [
  '📁','📂','🗂','💼','🎨','⚡','🔮','🌟','🎭','🎯',
  '🚀','🌿','🔧','💡','🏆','🎪','🌈','🦋','🔑','🎵',
  '🧩','🎲','🔬','🌍','🏔','🦄','🎬','📸','🖌','✨',
  '👤','🌄','⚙️','📦','🗃','🖼','🌺','💎','🎀','🔐',
];

// ─── Defaults ─────────────────────────────────────────────────────────────────
const defaultFolders = [
  { id: 'f1', name: 'Characters',   icon: '👤', color: null, parentId: null, createdAt: Date.now() - 200000 },
  { id: 'f2', name: 'Environments', icon: '🌄', color: null, parentId: null, createdAt: Date.now() - 100000 },
  { id: 'f3', name: 'Styles',       icon: '🎨', color: null, parentId: null, createdAt: Date.now() - 50000  },
];
const defaultCategories = [
  { id: 'c1', folderId: 'f1', name: 'Hair', color: 'cat-blue',
    tags: ['long hair','short hair','curly hair','straight hair','braided','wavy','blonde','brunette','redhead','silver hair','black hair','ponytail','messy bun','undercut'] },
  { id: 'c2', folderId: 'f1', name: 'Clothing', color: 'cat-violet',
    tags: ['casual wear','formal attire','armor','robes','jacket','hoodie','dress','suit','uniform','fantasy outfit','leather jacket','cloak','crop top','elegant gown'] },
  { id: 'c3', folderId: 'f1', name: 'Expression', color: 'cat-rose',
    tags: ['smiling','serious','laughing','crying','angry','surprised','pensive','confident','shy','determined','mysterious','joyful'] },
  { id: 'c4', folderId: 'f2', name: 'Setting', color: 'cat-emerald',
    tags: ['forest','cityscape','desert','ocean','mountains','ruins','castle','cyberpunk city','space station','village','underground','tundra','jungle','cave'] },
  { id: 'c5', folderId: 'f2', name: 'Lighting', color: 'cat-amber',
    tags: ['golden hour','blue hour','neon lights','candlelight','moonlight','overcast','harsh sunlight','dramatic shadows','volumetric light','studio lighting','bioluminescent','fog'] },
  { id: 'c6', folderId: 'f3', name: 'Art Style', color: 'cat-cyan',
    tags: ['photorealistic','anime','oil painting','watercolor','digital art','concept art','illustration','cel-shaded','impressionist','surrealism','art nouveau','pencil sketch','low poly','pixel art'] },
  { id: 'c7', folderId: 'f3', name: 'Quality', color: 'cat-lime',
    tags: ['masterpiece','best quality','ultra detailed','8k','high resolution','sharp focus','intricate details','professional','award-winning','cinematic'] },
];
const defaultPrompts = [
  { id: 'p1', folderId: null, title: 'Sample Prompt',
    positive: 'masterpiece, best quality, long hair, redhead',
    negative: 'low quality, blurry', createdAt: Date.now() - 5000 },
];

export const initialState = {
  // ── Libraries (global) ─────────────────────────────────────────────────────
  libraries:              [],
  currentLibraryId:       '',

  // ── Library-scoped state (saved per library) ──────────────────────────────
  folders:                defaultFolders,
  categories:             defaultCategories,
  prompts:                defaultPrompts,
  trashedPrompts:         [],
  trashedCategories:      [],
  trashedTags:            [],
  selectedFolderId:       null,
  selectedPromptId:       null,
  activePrompt:           { title: 'New Prompt', positive: '', negative: '' },
  view:                   'inbox',
  activeField:            'positive',
  folderSortOrders:       {},
  autoDeleteDays:         30,
  tagImageFiles:          {},
  autoBackupEnabled:      false,
  autoBackupIntervalMins: 60,
  themeBase:              'auto',
  themeAccent:            '#3b82f6',
  aiProvider:              'openai',
  aiApiKey:                '',
  aiBaseUrl:               '',
  aiModel:                 '',
  aiStreaming:             true,
  aiCustomInstructions:    'You are an expert AI prompt engineer. Help me create detailed, high-quality prompts.',
  aiTemperature:           1.0,
  aiTopP:                  1.0,
  aiTopK:                  0,
  aiUseProxy:              true,  // route custom-provider requests through Tauri's Rust HTTP proxy
  // ── Local Booru Database ───────────────────────────────────────────────────
  booruTagFolder:         '',
  booruFiles:             [],
  indexedBooruTags:       [],
  tagRelationships:       {},
  isIndexingBooru:        false,
};

const LIBRARY_STATE_KEYS = [
  'folders','categories','prompts',
  'trashedPrompts','trashedCategories','trashedTags',
  'selectedFolderId','selectedPromptId','activePrompt','view','activeField',
  'folderSortOrders','autoDeleteDays','tagImageFiles','recentTags',
  'booruTagFolder','booruFiles','indexedBooruTags','tagRelationships',
];

const PERSIST_KEYS = [
  'folders','categories','prompts',
  'trashedPrompts','trashedCategories','trashedTags',
  'selectedFolderId','selectedPromptId','activePrompt','view','activeField',
  'folderSortOrders','autoDeleteDays','autoBackupEnabled','autoBackupIntervalMins','themeBase','themeAccent',
  'tagImageFiles',
  'booruTagFolder',
  'recentTags',
  'booruFiles',
];

const NO_HISTORY = new Set([
  'HYDRATE','SELECT_VIEW','SELECT_PROMPT','SET_ACTIVE_FIELD','UPDATE_ACTIVE',
  'AUTO_DELETE_TRASH','SET_THEME_BASE','SET_THEME_ACCENT','SET_BACKUP_SETTINGS','UNDO_STATE','REDO_STATE',
  'SET_BOORU_INDEXING', 'SET_BOORU_TAGS', 'REORDER_BOORU_FILES', 'SET_AI_SETTINGS',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getAllDescendantIds(folders, rootId) {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    folders.forEach(f => {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); changed = true; }
    });
  }
  return ids;
}

function ensureDefaults(data) {
  if (!data) return {};
  return {
    ...data,
    folders: data.folders || [],
    categories: data.categories || [],
    prompts: data.prompts || [],
    trashedPrompts: data.trashedPrompts || [],
    trashedCategories: data.trashedCategories || [],
    trashedTags: data.trashedTags || [],
    recentTags: data.recentTags || [],
    booruFiles: data.booruFiles || [],
    indexedBooruTags: data.indexedBooruTags || [],
    tagImageFiles: data.tagImageFiles || {},
    tagRelationships: data.tagRelationships || {}
  };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {

    case 'HYDRATE': return { ...state, ...ensureDefaults(action.data) };
    case 'UNDO_STATE': return { ...action.prevState };
    case 'REDO_STATE': return { ...action.nextState };

    case 'SET_BOORU_FOLDER': return { ...state, booruTagFolder: action.path, booruFiles: action.files || [] };
    case 'REORDER_BOORU_FILES': return { ...state, booruFiles: action.files };
    case 'SET_BOORU_INDEXING': return { ...state, isIndexingBooru: action.loading };
    case 'SET_BOORU_TAGS': return { ...state, indexedBooruTags: action.tags, tagRelationships: action.relationships || {}, isIndexingBooru: false };

    case 'SELECT_VIEW': {
      return {
        ...state,
        view: action.view,
        selectedFolderId: action.folderId || null,
        selectedPromptId: null,
        activePrompt: (state.selectedPromptId || (!state.activePrompt.positive && !state.activePrompt.negative))
          ? { title: 'New Prompt', positive: '', negative: '' }
          : state.activePrompt,
      };
    }

    case 'SELECT_PROMPT': {
      const p = [...state.prompts, ...state.trashedPrompts].find(x => x.id === action.id);
      if (!p) return state;
      return { ...state, selectedPromptId: action.id,
        activePrompt: { title: p.title, positive: p.positive || '', negative: p.negative || '' } };
    }

    case 'NEW_PROMPT':
      return { ...state, selectedPromptId: null,
        activePrompt: { title: 'New Prompt', positive: '', negative: '' } };

    case 'UPDATE_ACTIVE':
      return { ...state, activePrompt: { ...state.activePrompt, [action.field]: action.value } };

    case 'SET_ACTIVE_FIELD':
      return { ...state, activeField: action.field };

    case 'APPEND_TAG': {
      const target = action.field || state.activeField;
      const current = (state.activePrompt[target] || '').trim();
      const tag = action.tag.trim();
      if (!tag) return state;
      const existing = current.split(',').map(t => t.trim()).filter(Boolean);
      if (existing.map(t => t.toLowerCase()).includes(tag.toLowerCase())) return state;
      // Update recent tags (prepend, dedup, cap 20)
      const recent = [tag, ...(state.recentTags || []).filter(t => t.toLowerCase() !== tag.toLowerCase())].slice(0, 20);
      return { ...state, activePrompt: { ...state.activePrompt,
        [target]: current ? `${current}, ${tag}` : tag }, recentTags: recent };
    }

    case 'REMOVE_TAG_FROM_PROMPT': {
      const tags = state.activePrompt[action.field]
        .split(',').map(t => t.trim()).filter((t, i) => t && i !== action.index);
      return { ...state, activePrompt: { ...state.activePrompt, [action.field]: tags.join(', ') } };
    }

    case 'SAVE_PROMPT': {
      const { activePrompt, selectedPromptId, selectedFolderId } = state;
      if (!activePrompt.positive.trim() && !activePrompt.negative.trim()) return state;
      if (selectedPromptId) {
        return { ...state, prompts: state.prompts.map(p =>
          p.id === selectedPromptId ? { ...p, ...activePrompt, updatedAt: Date.now() } : p) };
      }
      const newP = { id: uuidv4(), folderId: selectedFolderId || null, ...activePrompt, createdAt: Date.now() };
      return { ...state, prompts: [newP, ...state.prompts], selectedPromptId: newP.id };
    }

    // ── Prompt trash ──────────────────────────────────────────────────────────
    case 'DELETE_PROMPT': {
      const prompt = state.prompts.find(p => p.id === action.id);
      if (!prompt) return state;
      return { ...state,
        prompts: state.prompts.filter(p => p.id !== action.id),
        trashedPrompts: [{ ...prompt, deletedAt: Date.now() }, ...state.trashedPrompts],
        selectedPromptId: state.selectedPromptId === action.id ? null : state.selectedPromptId,
        activePrompt: state.selectedPromptId === action.id
          ? { title: 'New Prompt', positive: '', negative: '' } : state.activePrompt };
    }
    case 'RESTORE_PROMPT': {
      const prompt = state.trashedPrompts.find(p => p.id === action.id);
      if (!prompt) return state;
      const { deletedAt, ...restored } = prompt;
      return { ...state,
        trashedPrompts: state.trashedPrompts.filter(p => p.id !== action.id),
        prompts: [{ ...restored, restoredAt: Date.now() }, ...state.prompts] };
    }
    case 'PERM_DELETE':
      return { ...state,
        trashedPrompts: state.trashedPrompts.filter(p => p.id !== action.id),
        selectedPromptId: state.selectedPromptId === action.id ? null : state.selectedPromptId };

    case 'EMPTY_TRASH':
      return { ...state, trashedPrompts: [], trashedCategories: [], trashedTags: [] };

    case 'AUTO_DELETE_TRASH': {
      const cutoff = Date.now() - state.autoDeleteDays * 24 * 60 * 60 * 1000;
      return { ...state,
        trashedPrompts:    state.trashedPrompts.filter(p => (p.deletedAt || 0) > cutoff),
        trashedCategories: (state.trashedCategories || []).filter(c => (c.deletedAt || 0) > cutoff),
        trashedTags:       (state.trashedTags || []).filter(t => (t.deletedAt || 0) > cutoff),
      };
    }

    case 'SET_AUTO_DELETE_DAYS': return { ...state, autoDeleteDays: action.days };

    // ── Folders ───────────────────────────────────────────────────────────────
    case 'ADD_FOLDER': {
      const arrKey = 'folders';
      const f = { id: uuidv4(), name: action.name, icon: action.icon || '📁',
        color: action.color || null, parentId: action.parentId || null, createdAt: Date.now() };
      return { ...state, [arrKey]: [...state[arrKey], f] };
    }

    case 'DELETE_FOLDER': {
      const arrKey = 'folders';
      const toDelete = getAllDescendantIds(state[arrKey], action.id);
      const now = Date.now();
      
      let nextState = { ...state };
      
      const promptsToTrash = state.prompts
        .filter(p => toDelete.has(p.folderId))
        .map(p => ({ ...p, deletedAt: now }));
      const categoriesToTrash = state.categories
        .filter(c => toDelete.has(c.folderId))
        .map(c => ({ ...c, deletedAt: now }));
      
      nextState.categories = state.categories.filter(c => !toDelete.has(c.folderId));
      nextState.prompts = state.prompts.filter(p => !toDelete.has(p.folderId));
      nextState.trashedPrompts = [...promptsToTrash, ...state.trashedPrompts];
      nextState.trashedCategories = [...categoriesToTrash, ...(state.trashedCategories || [])];
      
      nextState[arrKey] = state[arrKey].filter(f => !toDelete.has(f.id));
      return nextState;
    }

    case 'UPDATE_FOLDER': {
      const arrKey = 'folders';
      return { ...state, [arrKey]: state[arrKey].map(f =>
        f.id === action.id ? { ...f, ...action.updates } : f) };
    }

    case 'REORDER_FOLDERS': {
      const arrKey = 'folders';
      return { ...state, [arrKey]: action.folders };
    }

    case 'SET_FOLDER_SORT':
      return { ...state, folderSortOrders: { ...state.folderSortOrders,
        [action.scopeKey]: { by: action.by, dir: action.dir || 'asc' } } };

    // ── Category trash ────────────────────────────────────────────────────────
    case 'ADD_CATEGORY': {
      const c = { id: uuidv4(), folderId: action.folderId, name: action.name,
        color: action.color || CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)],
        tags: [] };
      return { ...state, categories: [c, ...state.categories] };
    }
    case 'UPDATE_CATEGORY':
      return { ...state, categories: state.categories.map(c =>
        c.id === action.id ? { ...c, ...action.updates } : c) };
    case 'REORDER_CATEGORIES':
      return { ...state, categories: action.categories };
    case 'DELETE_CATEGORY': {
      const cat = state.categories.find(c => c.id === action.id);
      if (!cat) return state;
      return { ...state,
        categories: state.categories.filter(c => c.id !== action.id),
        trashedCategories: [{ ...cat, deletedAt: Date.now() }, ...(state.trashedCategories || [])] };
    }
    case 'RESTORE_CATEGORY': {
      const cat = (state.trashedCategories || []).find(c => c.id === action.id);
      if (!cat) return state;
      const { deletedAt, ...restored } = cat;
      return { ...state,
        trashedCategories: state.trashedCategories.filter(c => c.id !== action.id),
        categories: [...state.categories, { ...restored, restoredAt: Date.now() }] };
    }
    case 'PERM_DELETE_CATEGORY': {
      const cat = (state.trashedCategories || []).find(c => c.id === action.id);
      const prefix = cat ? `${cat.id}::` : null;
      if (prefix) {
        Object.entries(state.tagImageFiles || {}).forEach(([k, fname]) => {
          if (k.startsWith(prefix)) {
            if (window.__TAURI__) {
              import('@tauri-apps/api/core').then(({ invoke }) =>
    invoke('delete_tag_image', { filename: fname }).catch((err) => {
        console.error('[store] Failed to delete tag image:', fname, err);
    })
);
            } else {
              localStorage.removeItem(`tag-img::${fname}`);
            }
          }
        });
      }
      const tagImageFiles = prefix
        ? Object.fromEntries(Object.entries(state.tagImageFiles || {}).filter(([k]) => !k.startsWith(prefix)))
        : (state.tagImageFiles || {});
      return { ...state, tagImageFiles,
        trashedCategories: state.trashedCategories.filter(c => c.id !== action.id) };
    }

    // ── Tag trash ─────────────────────────────────────────────────────────────
    case 'ADD_TAG':
      return { ...state, categories: state.categories.map(c =>
        c.id === action.categoryId && !c.tags.map(t => t.toLowerCase()).includes(action.tag.toLowerCase())
          ? { ...c, tags: [...c.tags, action.tag] } : c) };

    case 'REMOVE_TAG': {
      const cat = state.categories.find(c => c.id === action.categoryId);
      const trashedTag = {
        id: `${action.categoryId}::${action.tag}::${Date.now()}`,
        tag: action.tag,
        categoryId: action.categoryId,
        categoryName: cat?.name || '',
        categoryColor: cat?.color || 'cat-blue',
        deletedAt: Date.now(),
      };
      return { ...state,
        categories: state.categories.map(c =>
          c.id === action.categoryId ? { ...c, tags: c.tags.filter(t => t !== action.tag) } : c),
        trashedTags: [trashedTag, ...(state.trashedTags || [])] };
    }
    case 'REMOVE_TAGS_BULK': {
      const cat = state.categories.find(c => c.id === action.categoryId);
      const now = Date.now();
      const newTrashedTags = action.tags.map((tagName, i) => ({
        id: `${action.categoryId}::${tagName}::${now + i}`,
        tag: tagName,
        categoryId: action.categoryId,
        categoryName: cat?.name || '',
        categoryColor: cat?.color || 'cat-blue',
        deletedAt: now,
      }));
      return { ...state,
        categories: state.categories.map(c =>
          c.id === action.categoryId
            ? { ...c, tags: c.tags.filter(t => !action.tags.includes(t)) } : c),
        trashedTags: [...newTrashedTags, ...(state.trashedTags || [])] };
    }
    case 'RESTORE_TAG': {
      const tt = (state.trashedTags || []).find(t => t.id === action.id);
      if (!tt) return state;
      const alreadyExists = state.categories
        .find(c => c.id === tt.categoryId)?.tags
        .map(t => t.toLowerCase()).includes(tt.tag.toLowerCase());
      return { ...state,
        trashedTags: state.trashedTags.filter(t => t.id !== action.id),
        categories: state.categories.map(c =>
          c.id === tt.categoryId && !alreadyExists
            ? { ...c, tags: [...c.tags, tt.tag] } : c) };
    }
    case 'PERM_DELETE_TAG': {
      const tt = (state.trashedTags || []).find(t => t.id === action.id);
      const imgKey = tt ? `${tt.categoryId}::${tt.tag}` : null;
      const fname = imgKey ? (state.tagImageFiles || {})[imgKey] : null;
      if (fname) {
        if (window.__TAURI__) {
          import('@tauri-apps/api/core').then(({ invoke }) =>
    invoke('delete_tag_image', { filename: fname }).catch((err) => {
        console.error('[store] Failed to delete tag image:', fname, err);
    })
);
        } else {
          localStorage.removeItem(`tag-img::${fname}`);
        }
      }
      const tagImageFiles = imgKey
        ? Object.fromEntries(Object.entries(state.tagImageFiles || {}).filter(([k]) => k !== imgKey))
        : (state.tagImageFiles || {});
      return { ...state, tagImageFiles,
        trashedTags: state.trashedTags.filter(t => t.id !== action.id) };
    }

    case 'SET_TAG_IMAGE': {
      const key = `${action.categoryId}::${action.tag}`;
      const oldFname = (state.tagImageFiles || {})[key];
      if (oldFname && oldFname !== action.filename && window.__TAURI__) {
        import('@tauri-apps/api/core').then(({ invoke }) =>
    invoke('delete_tag_image', { filename: oldFname }).catch((err) => {
        console.error('[store] Failed to delete tag image:', oldFname, err);
    })
);
      }
      const tagImageFiles = { ...(state.tagImageFiles || {}) };
      if (action.filename) tagImageFiles[key] = action.filename;
      else delete tagImageFiles[key];
      return { ...state, tagImageFiles };
    }

    case 'SET_BACKUP_SETTINGS':
      return { ...state, autoBackupEnabled: action.enabled,
        autoBackupIntervalMins: action.intervalMins ?? state.autoBackupIntervalMins };
    case 'SET_THEME_BASE': return { ...state, themeBase: action.theme };
    case 'SET_THEME_ACCENT': return { ...state, themeAccent: action.accent };
    case 'SET_AI_SETTINGS': return { ...state, ...action.settings };

    case 'RESTORE_ALL': {
      const d = action.data;
      return { ...state,
        folders:           d.folders           ?? state.folders,
        categories:        d.categories        ?? state.categories,
        prompts:           d.prompts           ?? state.prompts,
        trashedPrompts:    d.trashedPrompts    ?? [],
        trashedCategories: d.trashedCategories ?? [],
        trashedTags:       d.trashedTags       ?? [],
        tagImageFiles:     d.tagImageFiles     ?? {},
      };
    }

    // ── Library system ────────────────────────────────────────────────────────
    case 'CREATE_LIBRARY': {
      const { id, name, path } = action;
      const newLib = { id, name, path, createdAt: Date.now() };
      const libState = {
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
        tagRelationships: {},
        booruTagFolder: '',
        booruFiles: [],
        indexedBooruTags: [],
      };
      return {
        ...state,
        ...libState,
        libraries: [...state.libraries, newLib],
        currentLibraryId: id,
      };
    }

    case 'ADD_OR_SWITCH_LIBRARY': {
      const { id, name, path, data } = action;
      let newLib = state.libraries;
      if (!newLib.find(l => l.id === id)) {
         newLib = [...newLib, { id, name, path, createdAt: Date.now() }];
      }
      return { ...state, ...ensureDefaults(data), libraries: newLib, currentLibraryId: id };
    }

    case 'SWITCH_LIBRARY':
      return { ...state, ...ensureDefaults(action.data), currentLibraryId: action.id };

    case 'DELETE_LIBRARY': {
      const { id, newLibraryId, data } = action;
      const libraries = state.libraries.filter(l => l.id !== id);
      return {
        ...state,
        ...ensureDefaults(data),
        libraries,
        currentLibraryId: newLibraryId
      };
    }

    case 'SET_LIBRARY_MODE':
      return { ...state, libraryMode: action.mode };

    default: return state;
  }
}

// ─── Persistence ──────────────────────────────────────────────────────────────
async function saveSettings(settings) {
  const data = {
    libraries: settings.libraries,
    currentLibraryId: settings.currentLibraryId,
    themeBase: settings.themeBase,
    themeAccent: settings.themeAccent,
    autoBackupEnabled: settings.autoBackupEnabled,
    autoBackupIntervalMins: settings.autoBackupIntervalMins,
    aiProvider: settings.aiProvider,
    aiApiKey: settings.aiApiKey,
    aiBaseUrl: settings.aiBaseUrl,
    aiModel: settings.aiModel,
    aiStreaming: settings.aiStreaming,
    aiCustomInstructions: settings.aiCustomInstructions,
    aiTemperature: settings.aiTemperature,
    aiTopP: settings.aiTopP,
    aiTopK: settings.aiTopK,
    aiUseProxy: settings.aiUseProxy,
  };
  if (window.__TAURI__) {
    try {
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load('pony-prompt-settings.json', { autoSave: false });
      await store.set('settings', data); await store.save();
      return;
    } catch (e) { console.warn('[store] Tauri settings save failed', e); }
  }
  try { localStorage.setItem('pp-settings', JSON.stringify(data)); } catch {}
}

async function loadSettings() {
  if (window.__TAURI__) {
    try {
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load('pony-prompt-settings.json', { autoSave: false });
      const data = await store.get('settings');
      if (data) return data;
    } catch (e) { console.warn('[store] Tauri settings load failed', e); }
  }
  try {
    const str = localStorage.getItem('pp-settings');
    if (str) return JSON.parse(str);
  } catch {}
  return null;
}

async function saveLibrary(id, libState) {
  const data = Object.fromEntries(LIBRARY_STATE_KEYS.map(k => [k, libState[k]]));
  if (window.__TAURI__) {
    try {
      if (id.includes('/') || id.includes('\\')) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('write_library_data', { path: id, data: JSON.stringify(data) });
        return;
      } else {
        const { load } = await import('@tauri-apps/plugin-store');
        const store = await load(`pony-prompt-lib-${id}.json`, { autoSave: false });
        await store.set('state', data); await store.save();
        return;
      }
    } catch (e) { console.warn('[store] Tauri library save failed', e); }
  }
  try { localStorage.setItem(`pp-lib-${id}`, JSON.stringify(data)); } catch {}
}

async function loadLibrary(id) {
  if (window.__TAURI__) {
    try {
      if (id.includes('/') || id.includes('\\')) {
        const { invoke } = await import('@tauri-apps/api/core');
        const str = await invoke('read_library_data', { path: id });
        if (str) return JSON.parse(str);
      } else {
        const { load } = await import('@tauri-apps/plugin-store');
        const store = await load(`pony-prompt-lib-${id}.json`, { autoSave: false });
        const data = await store.get('state');
        if (data) return data;
      }
    } catch (e) { console.warn('[store] Library load failed', e); }
  }
  try {
    const str = localStorage.getItem(`pp-lib-${id}`);
    if (str) return JSON.parse(str);
  } catch {}
  return null;
}

// ─── Image helpers (unchanged) ────────────────────────────────────────────────
export function makeImageFilename(categoryId, tag, mimeType) {
  const ext = (mimeType || 'image/png').split('/')[1].replace('jpeg','jpg');
  const safe = tag.replace(/[^a-z0-9]/gi, '_').slice(0, 40);
  return `${categoryId}__${safe}__${Date.now()}.${ext}`;
}

export async function saveTagImageFile(categoryId, tag, dataUrl, mimeType) {
  const filename = makeImageFilename(categoryId, tag, mimeType);
  if (window.__TAURI__) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('save_tag_image', { filename, dataUrl });
    return filename;
  }
  try { localStorage.setItem(`tag-img::${filename}`, dataUrl); } catch {}
  return filename;
}

export async function loadTagImageUrl(filename) {
  if (!filename) return null;
  if (window.__TAURI__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('load_tag_image', { filename });
    } catch { return null; }
  }
  return localStorage.getItem(`tag-img::${filename}`) || null;
}

export async function deleteTagImageFile(filename) {
  if (!filename) return;
  if (window.__TAURI__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('delete_tag_image', { filename });
    } catch {}
  } else {
    localStorage.removeItem(`tag-img::${filename}`);
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer  = useRef(null);
  const historyRef = useRef([]);
  const futureRef  = useRef([]);
  const stateRef   = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const act = useCallback((action) => {
    if (!NO_HISTORY.has(action.type)) {
      historyRef.current = [...historyRef.current.slice(-49), stateRef.current];
      futureRef.current = [];
    }
    dispatch(action);
  }, []);

  const syncBooruTags = useCallback(async () => {
    const { booruTagFolder, booruFiles } = stateRef.current;
    if (!booruTagFolder || !window.__TAURI__) return;
    act({ type: 'SET_BOORU_INDEXING', loading: true });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      let allTags = [];
      const enabledFiles = booruFiles.filter(f => f.enabled);
      for (let i = 0; i < enabledFiles.length; i++) {
        const file = enabledFiles[i];
        const isJson = file.path.toLowerCase().endsWith('.json');
        const isText = file.path.toLowerCase().endsWith('.csv') || file.path.toLowerCase().endsWith('.txt'); 
        const data = await invoke('read_file_binary', { path: file.path });
        const tags = parseBooruExcel(new Uint8Array(data), i, isJson, isText);
        allTags = allTags.concat(tags);
      }
      const { buildRelationships } = await import('../utils/booru.js');
      const relationships = buildRelationships(allTags);
      act({ type: 'SET_BOORU_TAGS', tags: allTags, relationships });
    } catch (e) {
      console.error('Booru sync failed', e);
      act({ type: 'SET_BOORU_INDEXING', loading: false });
    }
  }, [act]);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const prevState = historyRef.current[historyRef.current.length - 1];
    futureRef.current = [stateRef.current, ...futureRef.current.slice(0, 49)];
    historyRef.current = historyRef.current.slice(0, -1);
    dispatch({ type: 'UNDO_STATE', prevState });
  }, []);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const nextState = futureRef.current[0];
    historyRef.current = [...historyRef.current.slice(-49), stateRef.current];
    futureRef.current = futureRef.current.slice(1);
    dispatch({ type: 'REDO_STATE', nextState });
  }, []);

  // Hydration: load settings → load library data
  useEffect(() => {
    (async () => {
      const settings = await loadSettings();
      let libState = null;
      let libraries = settings?.libraries || [];
      let currentId = settings?.currentLibraryId;

      if (!settings || !libraries.length) {
        // Migration: create a "Default" library from current default data
        const defaultId = 'default';
        libState = Object.fromEntries(LIBRARY_STATE_KEYS.map(k => [k, initialState[k]]));
        libraries = [{ id: defaultId, name: 'Default', createdAt: Date.now() }];
        currentId = defaultId;
      } else {
        libState = await loadLibrary(currentId);
        if (!libState) {
          // fallback empty library
          libState = {
            folders: [], categories: [], prompts: [],
            trashedPrompts: [], trashedCategories: [], trashedTags: [],
            selectedFolderId: null, selectedPromptId: null,
            activePrompt: { title: '', positive: '', negative: '' },
            view: 'folder', activeField: 'positive', folderSortOrders: {},
            autoDeleteDays: 30, tagImageFiles: {}, recentTags: [],
            booruTagFolder: '', booruFiles: [], indexedBooruTags: [], tagRelationships: {},
          };
        }
      }

      dispatch({
        type: 'HYDRATE',
        data: {
          ...libState,
          libraries,
          currentLibraryId: currentId,
          themeBase: settings?.themeBase ?? initialState.themeBase,
          themeAccent: settings?.themeAccent ?? initialState.themeAccent,
          autoBackupEnabled: settings?.autoBackupEnabled ?? initialState.autoBackupEnabled,
          autoBackupIntervalMins: settings?.autoBackupIntervalMins ?? initialState.autoBackupIntervalMins,
          aiProvider: settings?.aiProvider ?? initialState.aiProvider,
          aiApiKey: settings?.aiApiKey ?? initialState.aiApiKey,
          aiBaseUrl: settings?.aiBaseUrl ?? initialState.aiBaseUrl,
          aiModel: settings?.aiModel ?? initialState.aiModel,
          aiStreaming: settings?.aiStreaming ?? initialState.aiStreaming,
          aiCustomInstructions: settings?.aiCustomInstructions ?? initialState.aiCustomInstructions,
          aiTemperature: settings?.aiTemperature ?? initialState.aiTemperature,
          aiTopP: settings?.aiTopP ?? initialState.aiTopP,
          aiTopK: settings?.aiTopK ?? initialState.aiTopK,
          aiUseProxy: settings?.aiUseProxy ?? initialState.aiUseProxy,
        }
      });
    })().finally(() => setHydrated(true));
  }, []);

  // Auto‑save library and settings on state change
  useEffect(() => {
    if (!hydrated) return;
    const {
      libraries, currentLibraryId, themeBase, themeAccent,
      autoBackupEnabled, autoBackupIntervalMins,
      aiProvider, aiApiKey, aiBaseUrl, aiModel, aiStreaming, aiCustomInstructions, aiUseProxy,
      aiTemperature, aiTopP, aiTopK,
      ...libState
    } = stateRef.current;
    const settings = {
      libraries, currentLibraryId, themeBase, themeAccent,
      autoBackupEnabled, autoBackupIntervalMins,
      aiProvider, aiApiKey, aiBaseUrl, aiModel, aiStreaming, aiCustomInstructions, aiUseProxy,
      aiTemperature, aiTopP, aiTopK,
    };
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveSettings(settings);
      if (currentLibraryId) saveLibrary(currentLibraryId, libState);
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [state, hydrated]);

  // Auto‑delete trash and booru sync
  useEffect(() => {
    if (hydrated && state.booruTagFolder) syncBooruTags();
  }, [hydrated, state.booruTagFolder, syncBooruTags]);

  useEffect(() => {
    dispatch({ type: 'AUTO_DELETE_TRASH' });
    const iv = setInterval(() => dispatch({ type: 'AUTO_DELETE_TRASH' }), 60 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => { window.__storeDispatch = act; }, [act]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'x' || e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const actions = {
    selectView:          (view, folderId)           => act({ type: 'SELECT_VIEW', view, folderId }),
    selectPrompt:        (id)                       => act({ type: 'SELECT_PROMPT', id }),
    newPrompt:           ()                         => act({ type: 'NEW_PROMPT' }),
    updateActive:        (field, value)             => act({ type: 'UPDATE_ACTIVE', field, value }),
    setActiveField:      (field)                    => act({ type: 'SET_ACTIVE_FIELD', field }),
    appendTag:           (tag, field)               => act({ type: 'APPEND_TAG', tag, field }),
    removeTagFromPrompt: (field, index)             => act({ type: 'REMOVE_TAG_FROM_PROMPT', field, index }),
    savePrompt:          ()                         => act({ type: 'SAVE_PROMPT' }),
    deletePrompt:        (id)                       => act({ type: 'DELETE_PROMPT', id }),
    restorePrompt:       (id)                       => act({ type: 'RESTORE_PROMPT', id }),
    permDelete:          (id)                       => act({ type: 'PERM_DELETE', id }),
    emptyTrash:          ()                         => act({ type: 'EMPTY_TRASH' }),
    setAutoDeleteDays:   (days)                     => act({ type: 'SET_AUTO_DELETE_DAYS', days }),
    addFolder:           (name, icon, color, pid)   => act({ type: 'ADD_FOLDER', name, icon, color, parentId: pid }),
    deleteFolder:        (id)                       => act({ type: 'DELETE_FOLDER', id }),
    updateFolder:        (id, updates)              => act({ type: 'UPDATE_FOLDER', id, updates }),
    reorderFolders:      (folders)                  => act({ type: 'REORDER_FOLDERS', folders }),
    setFolderSort:       (scopeKey, by, dir)        => act({ type: 'SET_FOLDER_SORT', scopeKey, by, dir }),
    addCategory:         (folderId, name, color)    => act({ type: 'ADD_CATEGORY', folderId, name, color }),
    updateCategory:      (id, updates)              => act({ type: 'UPDATE_CATEGORY', id, updates }),
    reorderCategories:   (categories)               => act({ type: 'REORDER_CATEGORIES', categories }),
    deleteCategory:      (id)                       => act({ type: 'DELETE_CATEGORY', id }),
    restoreCategory:     (id)                       => act({ type: 'RESTORE_CATEGORY', id }),
    permDeleteCategory:  (id)                       => act({ type: 'PERM_DELETE_CATEGORY', id }),
    setAiSettings:        (settings)                 => act({ type: 'SET_AI_SETTINGS', settings }),
    addTag:              (categoryId, tag)          => act({ type: 'ADD_TAG', categoryId, tag }),
    removeTag:           (categoryId, tag)          => act({ type: 'REMOVE_TAG', categoryId, tag }),
    removeTagsBulk:      (categoryId, tags)         => act({ type: 'REMOVE_TAGS_BULK', categoryId, tags }),
    restoreTag:          (id)                       => act({ type: 'RESTORE_TAG', id }),
    permDeleteTag:       (id)                       => act({ type: 'PERM_DELETE_TAG', id }),
    setTagImage:         (categoryId, tag, filename) => act({ type: 'SET_TAG_IMAGE', categoryId, tag, filename }),
    setBackupSettings:   (enabled, mins)            => act({ type: 'SET_BACKUP_SETTINGS', enabled, intervalMins: mins }),
    setThemeBase:        (theme)                    => act({ type: 'SET_THEME_BASE', theme }),
    setThemeAccent:      (accent)                   => act({ type: 'SET_THEME_ACCENT', accent }),
    restoreAll:          (data)                     => act({ type: 'RESTORE_ALL', data }),
    setBooruFolder: async (path) => {
      if (!window.__TAURI__) return;
      const { invoke } = await import('@tauri-apps/api/core');
      const paths = await invoke('list_excel_files', { path });
      const files = paths.map(p => ({ 
        path: p, 
        name: p.split(/[\\/]/).pop(), 
        enabled: true 
      }));
      act({ type: 'SET_BOORU_FOLDER', path, files });
    },
    reorderBooruFiles:   (files)                    => act({ type: 'REORDER_BOORU_FILES', files }),
    syncBooruTags,
    createLibrary: async (name) => {
      let path = null;
      let id = uuidv4();
      if (window.__TAURI__) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const picked = await invoke('pick_folder', { title: 'Select a directory for the new library' });
          if (!picked) return; // cancelled
          path = picked;
          id = picked;
        } catch (e) {
          console.error('[store] Failed to pick folder', e);
        }
      }
      act({ type: 'CREATE_LIBRARY', id, name, path });
    },
    openLibrary: async () => {
      if (!window.__TAURI__) return;
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const picked = await invoke('pick_folder', { title: 'Select an existing library directory' });
        if (!picked) return;
        const exists = await invoke('check_library_exists', { path: picked });
        let name = picked.split(/[/\\]/).pop() || 'Library';
        if (!exists) {
          if (confirm('No library data found. Create a new library here?')) {
            act({ type: 'CREATE_LIBRARY', id: picked, name, path: picked });
          }
          return;
        }
        const dataStr = await invoke('read_library_data', { path: picked });
        if (dataStr) {
          const libState = JSON.parse(dataStr);
          act({ type: 'ADD_OR_SWITCH_LIBRARY', id: picked, name, path: picked, data: libState });
        }
      } catch (e) {
        console.error('[store] Failed to open library', e);
      }
    },
    switchLibrary: async (id) => {
      const libState = await loadLibrary(id);
      if (libState) {
        act({ type: 'SWITCH_LIBRARY', id, data: libState });
      }
    },
    deleteLibrary: async (id) => {
      const libs = stateRef.current.libraries;
      if (libs.length <= 1) {
        return;
      }
      
      const newLibs = libs.filter(l => l.id !== id);
      const nextId = newLibs[0].id;
      const libState = await loadLibrary(nextId);
      act({ type: 'DELETE_LIBRARY', id, newLibraryId: nextId, data: libState || {} });
    },
    setLibraryMode: (mode) => act({ type: 'SET_LIBRARY_MODE', mode }),
  };

  const canUndo = historyRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  const visiblePrompts = useMemo(() => {
    if (state.view === 'trash') return state.trashedPrompts;
    if (state.view === 'folder' && state.selectedFolderId)
      return state.prompts.filter(p => p.folderId === state.selectedFolderId);
    return state.prompts;
  }, [state.view, state.selectedFolderId, state.prompts, state.trashedPrompts]);

  const visibleCategories = useMemo(() => {
    if (state.view === 'folder' && state.selectedFolderId)
      return state.categories.filter(c => c.folderId === state.selectedFolderId);
    return state.categories;
  }, [state.view, state.selectedFolderId, state.categories]);

  const totalTrashCount = state.trashedPrompts.length
    + (state.trashedCategories || []).length
    + (state.trashedTags || []).length;

  if (!hydrated) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0d0f12', color: '#666', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  return (
    <StoreContext.Provider value={{
      state, actions, undo, redo, canUndo, canRedo,
      visiblePrompts, visibleCategories, totalTrashCount,
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() { return useContext(StoreContext); }