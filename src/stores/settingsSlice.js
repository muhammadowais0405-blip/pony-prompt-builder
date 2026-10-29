import { useLibraryStore } from './useStore.js';

export const createSettingsSlice = (set, get) => ({
  themeBase: 'auto',
  themeAccent: '#3b82f6',
  autoBackupEnabled: false,
  autoBackupIntervalMins: 60,
  libraries: [],             // { id, name, createdAt }
  currentLibraryId: '',

  // AI Settings
  aiProvider: 'openai', // 'openai', 'gemini', 'anthropic', 'custom'
  aiApiKey: '',
  aiBaseUrl: '', // For custom local SD/Ollama
  aiModel: '', // Selected model
  aiStreaming: true, // Enable stream
  aiCustomInstructions: 'You are an expert AI prompt engineer. Help me create detailed, high-quality prompts.',

  setThemeBase: (theme) => set({ themeBase: theme }),
  setThemeAccent: (accent) => set({ themeAccent: accent }),
  setBackupSettings: (enabled, mins) =>
    set({ autoBackupEnabled: enabled, autoBackupIntervalMins: mins }),
  setLibraries: (libs) => set({ libraries: libs }),
  setCurrentLibrary: (id) => set({ currentLibraryId: id }),

  setAiSettings: (settings) => set((state) => ({ ...state, ...settings })),

  // Library management – these now work correctly
  createLibrary: (id, name, path = null) => {
    const newLib = { id, name, path, createdAt: Date.now() };
    set((state) => ({
      libraries: [...state.libraries, newLib],
      currentLibraryId: id,
    }));
    // Reset the library store (empty library)
    useLibraryStore.getState().createLibrary(id, name); // we'll keep only the reset in librarySlice
  },
  switchLibrary: async (id) => {
    // Load data and update the library store
    const { loadLibrary } = await import('./useStore.js');
    const data = await loadLibrary(id);
    if (data) {
      useLibraryStore.setState(data);
      set({ currentLibraryId: id });
    }
  },
});