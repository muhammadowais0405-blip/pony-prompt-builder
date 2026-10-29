export const createTauriStorage = (storeName) => ({
  getItem: async (key) => {
    if (window.__TAURI__) {
      try {
        const { load } = await import('@tauri-apps/plugin-store');
        const store = await load(`${storeName}.json`, { autoSave: false });
        const data = await store.get(key);
        return data ?? null;
      } catch (e) {
        console.warn('[tauri-storage] getItem failed', e);
        return null;
      }
    }
    return JSON.parse(localStorage.getItem(key));
  },
  setItem: async (key, value) => {
    if (window.__TAURI__) {
      try {
        const { load } = await import('@tauri-apps/plugin-store');
        const store = await load(`${storeName}.json`, { autoSave: false });
        await store.set(key, value);
        await store.save();
        return;
      } catch (e) {
        console.warn('[tauri-storage] setItem failed', e);
      }
    }
    localStorage.setItem(key, JSON.stringify(value));
  },
  removeItem: async (key) => {
    if (window.__TAURI__) {
      try {
        const { load } = await import('@tauri-apps/plugin-store');
        const store = await load(`${storeName}.json`, { autoSave: false });
        await store.delete(key);
        await store.save();
        return;
      } catch (e) {
        console.warn('[tauri-storage] removeItem failed', e);
      }
    }
    localStorage.removeItem(key);
  },
});