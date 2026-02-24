# EspressoBot Tab Organizer

An AI-powered browser extension that uses OpenRouter to intelligently categorize and group your open tabs. Works with Chrome, Edge, and Vivaldi. Supports any OpenRouter model (default: `google/gemini-3.0-flash`).

## Features

- Analyzes all open tabs (titles and URLs)
- Uses OpenRouter API with configurable model selection
- Groups tabs by topic, project, or purpose
- Review and edit proposed groups before applying
- Remove individual tabs from groups during review

## Browser Support

| Browser | How it works |
|---------|-------------|
| Chrome / Edge | Native tab groups with colors and names |
| Vivaldi | Tab Stacks with names (via `vivExtData`) |
| Other Chromium | Detected as unsupported, UI shows warning |

The extension detects capabilities automatically at runtime — no configuration needed.

## Installation

### Development

**Prerequisites:** Node.js with pnpm

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Optionally set `OPENROUTER_API_KEY` in `.env.local` (or configure via the extension's settings UI)

3. Run dev server:
   ```bash
   pnpm dev
   ```

In dev mode the extension runs as a web page with mock tab data.

### Build & Install Extension

1. Build:
   ```bash
   pnpm build
   ```

2. Load in browser:
   - Open `chrome://extensions`, `edge://extensions`, or `vivaldi://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` folder

## Usage

1. Click the extension icon
2. Click "Generate Stacks" to analyze your tabs
3. Review the proposed groups (remove tabs if needed)
4. Click "Apply Stacks" to create tab groups / stacks

## How It Works

1. **Retrieves** all your open tabs (titles and URLs), excluding pinned and internal pages
2. **Sends to OpenRouter API** with a structured JSON schema for deterministic output
3. **Proposes groups** with emoji-prefixed names, colors, and tab assignments
4. **Creates groups** using the best available API for your browser

## Tech Stack

- React 19 + TypeScript
- Vite (build tooling)
- Tailwind CSS v4
- OpenRouter API (default model: `google/gemini-3.0-flash`)
- Chrome Extension Manifest V3

## API Key

Get an OpenRouter API key at: https://openrouter.ai/keys

You can configure the API key and model in two ways:
1. **Settings UI** -- Click the gear icon in the extension popup to enter your API key and optionally override the default model
2. **Environment variable** -- Set `OPENROUTER_API_KEY` in `.env.local` before building (pre-fills the key for all installs)

The default model is `google/gemini-3.0-flash`. You can use any model available on [OpenRouter](https://openrouter.ai/models).
