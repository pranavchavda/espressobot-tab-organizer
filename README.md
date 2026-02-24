# EspressoBot Tab Organizer

An AI-powered browser extension that uses Gemini to intelligently categorize and group your open tabs. Works with Chrome, Edge, and Vivaldi.

## Features

- Analyzes all open tabs (titles and URLs)
- Uses Gemini 2.5 Flash for intelligent categorization
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

2. Set `GEMINI_API_KEY` in `.env.local`

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
2. **Sends to Gemini AI** with a structured JSON schema for deterministic output
3. **Proposes groups** with emoji-prefixed names, colors, and tab assignments
4. **Creates groups** using the best available API for your browser

## Tech Stack

- React 19 + TypeScript
- Vite (build tooling)
- Tailwind CSS v4
- Google Gemini 2.5 Flash (`@google/genai`)
- Chrome Extension Manifest V3

## API Key

Get a free Gemini API key at: https://aistudio.google.com/apikey
