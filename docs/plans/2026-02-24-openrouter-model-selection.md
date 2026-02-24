# OpenRouter Model Selection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Gemini SDK with OpenRouter's API, add a settings UI for API key and model override, default to `google/gemini-3.0-flash`.

**Architecture:** Drop `@google/genai` and use plain `fetch()` against OpenRouter's OpenAI-compatible endpoint. Settings (API key + model string) are stored in `chrome.storage.local` and managed via a new settings screen in the popup. The `OPENROUTER_API_KEY` env var pre-populates the key at build time.

**Tech Stack:** OpenRouter API (OpenAI-compatible), `chrome.storage.local`, React, TypeScript, Vite

---

### Task 1: Add Settings type and SETTINGS AppState

**Files:**
- Modify: `types.ts`

**Step 1: Add the Settings interface and update AppState**

Add after `GroupingStrategy`:

```typescript
export interface Settings {
  apiKey: string;
  model: string;
}

export const DEFAULT_MODEL = 'google/gemini-3.0-flash';
```

Add `SETTINGS` to the `AppState` enum:

```typescript
export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  REVIEW = 'REVIEW',
  APPLYING = 'APPLYING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  SETTINGS = 'SETTINGS'
}
```

**Step 2: Commit**

```bash
git add types.ts
git commit -m "feat: add Settings interface and SETTINGS AppState"
```

---

### Task 2: Create settings storage service

**Files:**
- Create: `services/settingsService.ts`

**Step 1: Create the service**

This service wraps `chrome.storage.local` with a fallback to `localStorage` for web preview mode. It also checks for the build-time `OPENROUTER_API_KEY` env var.

```typescript
import { Settings, DEFAULT_MODEL } from '../types';

declare var chrome: any;

const STORAGE_KEY = 'espressobot_settings';

const hasExtensionStorage = () =>
  typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

export const loadSettings = async (): Promise<Settings> => {
  // Try chrome.storage.local (extension context)
  if (hasExtensionStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (result: any) => {
        if (result[STORAGE_KEY]) {
          resolve(result[STORAGE_KEY]);
        } else {
          // Fall back to build-time env var
          resolve({
            apiKey: process.env.OPENROUTER_API_KEY || '',
            model: DEFAULT_MODEL,
          });
        }
      });
    });
  }

  // Fallback for web preview
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}

  return {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: DEFAULT_MODEL,
  };
};

export const saveSettings = async (settings: Settings): Promise<void> => {
  if (hasExtensionStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: settings }, resolve);
    });
  }

  // Fallback for web preview
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};
```

**Step 2: Commit**

```bash
git add services/settingsService.ts
git commit -m "feat: add settings storage service with chrome.storage and env var fallback"
```

---

### Task 3: Replace geminiService with aiService using OpenRouter

**Files:**
- Create: `services/aiService.ts`
- Delete: `services/geminiService.ts`

**Step 1: Create aiService.ts**

```typescript
import { Tab, TabGroupProposal, GroupingResponse, Settings } from '../types';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const jsonSchema = {
  name: 'tab_groups',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      groups: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            groupName: {
              type: 'string',
              description: "A short, descriptive name for the tab stack, preferably with an emoji prefix (e.g., '💻 Dev', '🎵 Media')."
            },
            color: {
              type: 'string',
              enum: ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan']
            },
            tabIds: {
              type: 'array',
              items: { type: 'integer' }
            }
          },
          required: ['groupName', 'color', 'tabIds'],
          additionalProperties: false
        }
      }
    },
    required: ['groups'],
    additionalProperties: false
  }
};

export const categorizeTabs = async (tabs: Tab[], settings: Settings): Promise<TabGroupProposal[]> => {
  if (!tabs.length) return [];
  if (!settings.apiKey) throw new Error('No API key configured. Open settings to add your OpenRouter API key.');

  const tabData = tabs.map(t => ({ id: t.id, title: t.title, url: t.url }));

  const systemPrompt = `You are a tab organizer. Analyze browser tabs and group them into logical stacks.
Rules:
1. Every tab ID must be assigned to exactly one group.
2. Avoid a 'Miscellaneous' group when possible.
3. Use specific group names with an emoji prefix.
4. Respond ONLY with valid JSON matching the provided schema.`;

  const userPrompt = `Group these tabs:\n${JSON.stringify(tabData)}`;

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/pranavchavda/espressobot-tab-organizer',
      'X-Title': 'EspressoBot Tab Organizer',
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: jsonSchema,
      },
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('[TabOrganizer] OpenRouter error:', err);
    throw new Error(`AI request failed (${response.status}): ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No response from AI model.');

  const result = JSON.parse(content) as GroupingResponse;
  if (!result.groups || !Array.isArray(result.groups)) {
    throw new Error('Invalid response structure from AI model.');
  }
  return result.groups;
};
```

**Step 2: Delete geminiService.ts**

```bash
rm services/geminiService.ts
```

**Step 3: Commit**

```bash
git add services/aiService.ts && git rm services/geminiService.ts
git commit -m "feat: replace Gemini SDK with OpenRouter API via fetch"
```

---

### Task 4: Remove @google/genai dependency and update vite config

**Files:**
- Modify: `package.json` (remove `@google/genai` from dependencies)
- Modify: `vite.config.ts` (replace `GEMINI_API_KEY` define with `OPENROUTER_API_KEY`)

**Step 1: Remove dependency**

```bash
pnpm remove @google/genai
```

**Step 2: Update vite.config.ts**

Replace the `define` block:

```typescript
define: {
  'process.env.OPENROUTER_API_KEY': JSON.stringify(env.OPENROUTER_API_KEY || '')
},
```

Remove the old `GEMINI_API_KEY` / `API_KEY` defines entirely.

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts
git commit -m "chore: remove @google/genai, switch env var to OPENROUTER_API_KEY"
```

---

### Task 5: Create Settings component

**Files:**
- Create: `components/Settings.tsx`

**Step 1: Create the component**

```tsx
import React, { useState } from 'react';
import { Save, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Settings as SettingsType, DEFAULT_MODEL } from '../types';

interface SettingsProps {
  settings: SettingsType;
  onSave: (settings: SettingsType) => void;
  onBack: () => void;
}

const Settings: React.FC<SettingsProps> = ({ settings, onSave, onBack }) => {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [showKey, setShowKey] = useState(false);

  const handleSave = () => {
    onSave({ apiKey: apiKey.trim(), model: model.trim() || DEFAULT_MODEL });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 bg-slate-800/30 border-b border-slate-700 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            OpenRouter API Key <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-..."
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 pr-10"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Get a key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" className="text-blue-400 hover:underline">openrouter.ai/keys</a>
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Model
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={DEFAULT_MODEL}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
          <p className="text-xs text-slate-500 mt-1">
            Any <a href="https://openrouter.ai/models" target="_blank" rel="noopener" className="text-blue-400 hover:underline">OpenRouter model</a>. Default: {DEFAULT_MODEL}
          </p>
        </div>
      </div>

      <div className="p-4 border-t border-slate-700 bg-slate-800">
        <button
          onClick={handleSave}
          disabled={!apiKey.trim()}
          className="w-full py-2 px-4 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={16} />
          Save Settings
        </button>
      </div>
    </div>
  );
};

export default Settings;
```

**Step 2: Commit**

```bash
git add components/Settings.tsx
git commit -m "feat: add Settings component with API key and model inputs"
```

---

### Task 6: Wire everything into App.tsx

**Files:**
- Modify: `App.tsx`

This is the largest change. The key modifications:

**Step 1: Update imports**

Replace:
```typescript
import { categorizeTabs } from './services/geminiService';
import { Tab, TabGroupProposal, AppState, GroupingStrategy } from './types';
```

With:
```typescript
import { categorizeTabs } from './services/aiService';
import { loadSettings, saveSettings } from './services/settingsService';
import SettingsComponent from './components/Settings';
import { Tab, TabGroupProposal, AppState, GroupingStrategy, Settings } from './types';
```

Add `Settings as SettingsIcon` to the lucide import.

**Step 2: Add settings state and loading**

Add state:
```typescript
const [settings, setSettings] = useState<Settings | null>(null);
```

Update the `useEffect` to also load settings:
```typescript
useEffect(() => {
  loadTabs();
  getGroupingStrategy().then(setStrategy);
  loadSettings().then(setSettings);
}, []);
```

**Step 3: Update handleAnalyze to pass settings**

```typescript
const handleAnalyze = async () => {
  setAppState(AppState.ANALYZING);
  setErrorMsg('');
  try {
    const groups = await categorizeTabs(tabs, settings!);
    setProposals(groups);
    setAppState(AppState.REVIEW);
  } catch (error) {
    console.error(error);
    setErrorMsg(error instanceof Error ? error.message : "Failed to analyze tabs.");
    setAppState(AppState.ERROR);
  }
};
```

**Step 4: Add settings handlers**

```typescript
const handleSaveSettings = async (newSettings: Settings) => {
  await saveSettings(newSettings);
  setSettings(newSettings);
  setAppState(AppState.IDLE);
};
```

**Step 5: Add gear icon to header**

Update `renderHeader()` — add a gear icon button on the right side:

```tsx
const renderHeader = () => (
  <div className="p-4 border-b border-slate-700 bg-slate-800 flex items-center gap-3">
    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg">
      <Sparkles size={18} className="text-white" />
    </div>
    <div className="flex-1">
      <h1 className="font-bold text-lg leading-tight text-white">EspressoBot Tab Organizer</h1>
      <p className="text-xs text-slate-400">Powered by AI</p>
    </div>
    <button
      onClick={() => setAppState(AppState.SETTINGS)}
      className="text-slate-400 hover:text-white transition-colors p-1"
      aria-label="Settings"
    >
      <SettingsIcon size={18} />
    </button>
  </div>
);
```

**Step 6: Update renderIdle — show API key prompt if not configured**

Add before the unsupported browser warning:

```tsx
{settings && !settings.apiKey && (
  <div className="w-full text-xs text-blue-400 bg-blue-900/20 border border-blue-800 rounded-lg p-2 text-center">
    No API key configured.{' '}
    <button onClick={() => setAppState(AppState.SETTINGS)} className="underline hover:text-blue-300">
      Open settings
    </button>{' '}
    to get started.
  </div>
)}
```

Also disable the Generate Stacks button when no API key:

```tsx
disabled={strategy === null || strategy === 'unsupported' || !settings?.apiKey}
```

**Step 7: Update loading text**

Change `renderLoading()` description from "Gemini is looking at..." to:

```tsx
<p className="text-sm text-slate-400">AI is analyzing your tab titles and URLs to find patterns.</p>
```

**Step 8: Add SETTINGS to the render switch**

In the return JSX, add:

```tsx
{appState === AppState.SETTINGS && settings && (
  <SettingsComponent
    settings={settings}
    onSave={handleSaveSettings}
    onBack={() => setAppState(AppState.IDLE)}
  />
)}
```

**Step 9: Commit**

```bash
git add App.tsx
git commit -m "feat: wire settings UI, OpenRouter AI service, and model selection into App"
```

---

### Task 7: Update docs and clean up

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `.env.local` (or `.env.example`)

**Step 1: Update CLAUDE.md**

- Change "Environment Setup" section: replace `GEMINI_API_KEY` with `OPENROUTER_API_KEY` and note it's optional (users can configure via the popup settings)
- Update architecture section: mention OpenRouter and settings storage
- Update the AI Analysis step in Core Flow

**Step 2: Update README.md**

- Update the API Key section to reference OpenRouter instead of Gemini
- Note that users can configure the API key and model in the extension settings
- Mention the default model is `google/gemini-3.0-flash`

**Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update for OpenRouter migration and model selection"
```

---

### Task 8: Build and test

**Step 1: Build**

```bash
pnpm build
```

Verify: no TypeScript errors, no build warnings, `@google/genai` not in bundle.

**Step 2: Test in browser**

1. Load `dist/` as unpacked extension
2. Click gear icon → enter OpenRouter API key → save
3. Click "Generate Stacks" → verify groups appear
4. Try changing model to another (e.g., `anthropic/claude-sonnet-4`) → verify it works
5. Try with no API key → verify the prompt appears and button is disabled

**Step 3: Test web preview**

```bash
pnpm dev
```

Verify: mock data loads, settings work via localStorage.
