# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EspressoBot Tab Organizer is a Chrome/Edge/Vivaldi browser extension that uses AI (via OpenRouter) to intelligently categorize and group open browser tabs into logical groups based on their content, domain, and context.

## Development Commands

```bash
# Install dependencies (uses pnpm)
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Environment Setup

Optionally set `OPENROUTER_API_KEY` in `.env.local` to pre-fill the API key. This is injected at build time via Vite's `define` config. Users can also configure their OpenRouter API key and model directly in the extension's settings UI (gear icon in the popup header).

## Architecture

### Core Flow
1. **Tab Retrieval** (`services/tabManager.ts`) - Gets open browser tabs via Chrome Extension API, falls back to mock data for web preview
2. **AI Analysis** (`services/aiService.ts`) - Sends tab data to OpenRouter API (default model: `google/gemini-3.0-flash`) with structured JSON schema for grouping proposals
3. **User Review** (`App.tsx`) - State machine handles IDLE → ANALYZING → REVIEW → APPLYING → SUCCESS/ERROR flow
4. **Apply Groups** (`services/tabManager.ts`) - Detects browser and uses `chrome.tabs.group()` on Chrome/Edge or `vivExtData` tab stacking on Vivaldi

### Key Files
- `App.tsx` - Main React component with state machine (AppState enum)
- `types.ts` - TypeScript interfaces for Tab, TabGroupProposal, AppState, GroupingStrategy
- `services/aiService.ts` - OpenRouter API integration with JSON schema for structured responses
- `services/settingsService.ts` - Settings persistence via chrome.storage.local (extension) or localStorage (web)
- `services/tabManager.ts` - Chrome Extension API wrapper with mock fallback
- `components/GroupPreview.tsx` - Collapsible group preview with tab removal
- `components/Settings.tsx` - Settings UI for API key and model configuration

### Extension vs Web Mode
The app detects `chrome.tabs` availability. When running as extension, uses real browser APIs. When running in web browser (dev mode), uses mock tab data defined in `tabManager.ts`.

## Browser Compatibility

The extension detects browser capabilities at runtime via `GroupingStrategy`:

| Browser | Strategy | Method |
|---------|----------|--------|
| Chrome / Edge | `chrome-groups` | `chrome.tabs.group()` + `chrome.tabGroups.update()` |
| Vivaldi | `vivaldi-stacks` | `chrome.tabs.update()` with `vivExtData.group` (UUID) + `vivExtData.fixedGroupTitle` |
| Other | `unsupported` | UI shows warning, button disabled |

Detection runs in `background.js` at startup: checks `chrome.tabGroups` existence first (Chrome/Edge), then probes a tab for `splitViewId` which is a Vivaldi-only property. The popup queries the strategy via `getStrategy` message.

Vivaldi Tab Stacks don't support colors, so color dots are hidden in the review UI when on Vivaldi. Note: `vivExtData` is not returned by `chrome.tabs.query()` in newer Vivaldi versions, but can still be written via `chrome.tabs.update()`.

## Browser Extension Details

- **Manifest V3** extension with `tabs` permission and `tabGroups` as optional
- Popup dimensions: 400x600px (set in `index.html` body class)
- Filters out internal pages (chrome://, edge://, vivaldi://, about:, chrome-extension://)
- Excludes pinned tabs from grouping

## Styling

Uses Tailwind CSS v4 with PostCSS (`@tailwindcss/postcss`). Custom scrollbar styling in `styles.css`. Dark slate-900 color scheme throughout.
