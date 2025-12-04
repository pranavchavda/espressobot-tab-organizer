# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EspressoBot Tab Organizer is a Chrome/Edge browser extension that uses Gemini AI to intelligently categorize and group open browser tabs into logical groups based on their content, domain, and context.

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

Set `GEMINI_API_KEY` in `.env.local` with your Google Gemini API key. The key is injected at build time via Vite's `define` config.

## Architecture

### Core Flow
1. **Tab Retrieval** (`services/tabManager.ts`) - Gets open browser tabs via Chrome Extension API, falls back to mock data for web preview
2. **AI Analysis** (`services/geminiService.ts`) - Sends tab data to Gemini 2.5 Flash with structured output schema for grouping proposals
3. **User Review** (`App.tsx`) - State machine handles IDLE → ANALYZING → REVIEW → APPLYING → SUCCESS/ERROR flow
4. **Apply Groups** (`services/tabManager.ts`) - Uses `chrome.tabs.group()` and `chrome.tabGroups.update()` to create named tab groups

### Key Files
- `App.tsx` - Main React component with state machine (AppState enum)
- `types.ts` - TypeScript interfaces for Tab, TabGroupProposal, AppState
- `services/geminiService.ts` - Gemini API integration with JSON schema for structured responses
- `services/tabManager.ts` - Chrome Extension API wrapper with mock fallback
- `components/GroupPreview.tsx` - Collapsible group preview with tab removal

### Extension vs Web Mode
The app detects `chrome.tabs` availability. When running as extension, uses real browser APIs. When running in web browser (dev mode), uses mock tab data defined in `tabManager.ts`.

## Browser Extension Details

- **Manifest V3** extension with `tabs` and `tabGroups` permissions
- Popup dimensions: 400x600px (set in `index.html` body class)
- Filters out internal pages (chrome://, edge://, about:, chrome-extension://)
- Excludes pinned tabs from grouping

## Styling

Uses Tailwind CSS v4 with PostCSS (`@tailwindcss/postcss`). Custom scrollbar styling in `styles.css`. Dark slate-900 color scheme throughout.
