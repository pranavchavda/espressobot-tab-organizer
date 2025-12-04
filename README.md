# EspressoBot Tab Organizer

An AI-powered browser extension that uses Gemini to intelligently categorize and group your open tabs.

## Features

- Analyzes all open tabs (titles and URLs)
- Uses Gemini AI for intelligent categorization
- Groups tabs by topic, project, or purpose
- Works with Chrome, Edge, and other Chromium browsers

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

### Build & Install Extension

1. Build:
   ```bash
   pnpm build
   ```

2. Load in browser:
   - Open `chrome://extensions` (or `edge://extensions`)
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` folder

## Usage

1. Click the extension icon
2. Click "Generate Stacks" to analyze your tabs
3. Review the proposed groups
4. Click "Apply Stacks" to create tab groups

## How It Works

1. **Analyzes** all your open tabs (titles and URLs)
2. **Sends to Gemini AI** for intelligent categorization
3. **Proposes groups** based on topic, project, or purpose
4. **Creates tab groups** when you approve

## API Key

Get a free Gemini API key at: https://aistudio.google.com/apikey
