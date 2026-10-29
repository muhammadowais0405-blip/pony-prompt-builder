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
