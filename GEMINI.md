# Pony Prompt Builder (PromptBuilder)

A professional desktop application for managing and constructing AI image generation prompts, built with Tauri v2, React 19, and Tailwind CSS v4.

## Project Overview
PromptBuilder allows users to organize tags into categories and folders, construct complex positive and negative prompts, and persist them locally. It features a triple-column layout:
- **Navigation (Left):** Folder management, Inbox, and Trash.
- **Workspace (Center):** Active prompt editing with tag chips and field selection (Positive/Negative).
- **Library (Right):** Tag categories with search, color-coding, and image support for individual tags.

### Key Technologies
- **Frontend:** React 19 (Hooks/Context/useReducer), Vite, Tailwind CSS v4, Lucide React.
- **Backend:** Rust, Tauri v2, `tauri-plugin-store` (persistence), `tauri-plugin-shell`.
- **State Management:** Custom `useReducer` implementation in `src/store/index.jsx` with undo/redo support and automatic persistence.
- **Native Integration:** Custom Rust commands for image file management and native folder selection via `rfd`.

## Building and Running
### Prerequisites
- Node.js 18+
- Rust (stable)
- Platform-specific build tools (see README.md for details)

### Development
```bash
# Install dependencies
npm install

# Run in development mode (hot-reload)
npm run tauri dev
```

### Production Build
```bash
# Build for production
npm run tauri build
```

## Development Conventions
### Frontend
- **State:** Use the `useStore` hook to access global state and actions.
- **Components:** Functional components with Tailwind CSS for styling. Follow the existing architecture in `src/components/`.
- **Icons:** Use `lucide-react` for UI icons.
- **Persistence:** State is automatically persisted to `pony-prompt.json` via `tauri-plugin-store` or `localStorage` as a fallback.

### Backend (Rust)
- **Commands:** All native functionality should be exposed via Tauri commands in `src-tauri/src/lib.rs`.
- **State:** Shared state like the images directory is managed via Tauri's `manage` and `Mutex`.

### Data Models
- **Folders:** `{ id, name, icon, color, parentId, createdAt }`
- **Categories:** `{ id, folderId, name, color, tags: [] }`
- **Prompts:** `{ id, folderId, title, positive, negative, createdAt }`
- **Presets:** `{ id, name, positive, negative }`

### Trash System
The application maintains three separate trash bins for Prompts, Categories, and Tags, with support for restoration and permanent deletion.
