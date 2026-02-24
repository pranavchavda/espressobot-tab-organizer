# Vivaldi Tab Stacks Support - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Vivaldi browser support by detecting browser capabilities at runtime and using Vivaldi's `vivExtData` tab stacking API as a fallback when Chrome's `tabGroups` API is unavailable.

**Architecture:** The background service worker detects the grouping strategy (`chrome-groups` vs `vivaldi-stacks` vs `unsupported`) on startup and caches it. The popup queries the strategy via message passing and adapts the UI (hiding color dots on Vivaldi). The apply flow branches in `background.js` — Chrome path uses `chrome.tabs.group()`, Vivaldi path uses `chrome.tabs.update()` with `vivExtData.group` UUID and `vivExtData.fixedGroupTitle`.

**Tech Stack:** Chrome Extension Manifest V3, TypeScript/React (popup), vanilla JS (service worker)

---

### Task 1: Add GroupingStrategy type

**Files:**
- Modify: `types.ts`

**Step 1: Add the type**

Add after the `AppState` enum:

```typescript
export type GroupingStrategy = 'chrome-groups' | 'vivaldi-stacks' | 'unsupported';
```

**Step 2: Commit**

```bash
git add types.ts
git commit -m "feat: add GroupingStrategy type for browser detection"
```

---

### Task 2: Add strategy detection and Vivaldi apply path in background.js

**Files:**
- Modify: `public/background.js`

**Step 1: Add strategy detection function**

Replace the startup API logging (lines 4-8) with a `detectStrategy()` function that:
1. Queries a single tab
2. Checks if `chrome.tabGroups` exists → `'chrome-groups'`
3. Else checks if the tab has a `vivExtData` property → `'vivaldi-stacks'`
4. Else → `'unsupported'`

Cache the result in a module-level variable.

```javascript
let groupingStrategy = null;

async function detectStrategy() {
  if (typeof chrome.tabGroups !== 'undefined') {
    groupingStrategy = 'chrome-groups';
  } else {
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true, maxResults: 1 });
      if (tabs.length > 0 && tabs[0].vivExtData !== undefined) {
        groupingStrategy = 'vivaldi-stacks';
      } else {
        groupingStrategy = 'unsupported';
      }
    } catch {
      groupingStrategy = 'unsupported';
    }
  }
  console.log('[TabOrganizer BG] Detected grouping strategy:', groupingStrategy);
}

detectStrategy();
```

**Step 2: Add message handler for getStrategy**

In the `onMessage` listener, add a handler:

```javascript
if (message.action === 'getStrategy') {
  (async () => {
    if (!groupingStrategy) await detectStrategy();
    sendResponse({ success: true, strategy: groupingStrategy });
  })();
  return true;
}
```

**Step 3: Add Vivaldi apply path**

Add a `applyTabGroupsVivaldi(groups)` function:

```javascript
async function applyTabGroupsVivaldi(groups) {
  console.log('[TabOrganizer BG] Applying Vivaldi tab stacks:', groups);

  for (const group of groups) {
    if (!group.tabIds || group.tabIds.length === 0) continue;

    const stackId = crypto.randomUUID();
    console.log(`[TabOrganizer BG] Creating Vivaldi stack "${group.groupName}" (${stackId})`);

    for (const tabId of group.tabIds) {
      try {
        const tab = await chrome.tabs.get(tabId);
        const vivExtData = tab.vivExtData ? JSON.parse(tab.vivExtData) : {};
        vivExtData.group = stackId;
        vivExtData.fixedGroupTitle = group.groupName;
        await chrome.tabs.update(tabId, { vivExtData: JSON.stringify(vivExtData) });
      } catch (err) {
        console.error(`[TabOrganizer BG] Error stacking tab ${tabId}:`, err);
        throw err;
      }
    }
  }

  console.log('[TabOrganizer BG] All Vivaldi stacks applied successfully');
}
```

**Step 4: Update applyTabGroups to branch on strategy**

Modify `applyTabGroups()` to check `groupingStrategy`:

```javascript
async function applyTabGroups(groups) {
  if (!groupingStrategy) await detectStrategy();

  if (groupingStrategy === 'vivaldi-stacks') {
    return applyTabGroupsVivaldi(groups);
  }

  if (groupingStrategy === 'chrome-groups') {
    // existing Chrome path (chrome.tabs.group + chrome.tabGroups.update)
    ...
  }

  throw new Error('Tab grouping is not supported in this browser');
}
```

Keep the existing Chrome code inside the `chrome-groups` branch.

**Step 5: Add vivaldi:// to URL filter**

In `getOpenTabs()`, add `vivaldi://` to the filtered prefixes:

```javascript
!t.url.startsWith('vivaldi://')
```

**Step 6: Commit**

```bash
git add public/background.js
git commit -m "feat: add Vivaldi tab stacks support in background service worker"
```

---

### Task 3: Update tabManager.ts popup-side code

**Files:**
- Modify: `services/tabManager.ts`

**Step 1: Add getGroupingStrategy function**

Export a function that messages the background worker:

```typescript
export const getGroupingStrategy = async (): Promise<'chrome-groups' | 'vivaldi-stacks' | 'unsupported'> => {
  if (hasExtensionRuntime()) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getStrategy' });
      if (response?.success) {
        return response.strategy;
      }
    } catch (err) {
      console.warn('[TabOrganizer] Failed to get strategy:', err);
    }
  }
  return 'unsupported';
};
```

**Step 2: Add vivaldi:// to URL filter**

In the direct `chrome.tabs.query` fallback (lines 44-50), add:

```typescript
!t.url.startsWith('vivaldi://')
```

**Step 3: Commit**

```bash
git add services/tabManager.ts
git commit -m "feat: add getGroupingStrategy helper and vivaldi URL filter"
```

---

### Task 4: Wire strategy into App.tsx

**Files:**
- Modify: `App.tsx`

**Step 1: Import and detect strategy on mount**

Import `getGroupingStrategy` from tabManager. Add state:

```typescript
import { getOpenTabs, applyTabGroups, getGroupingStrategy } from './services/tabManager';
import { Tab, TabGroupProposal, AppState, GroupingStrategy } from './types';

const [strategy, setStrategy] = useState<GroupingStrategy>('unsupported');
```

In the `useEffect`, call it alongside `loadTabs`:

```typescript
useEffect(() => {
  loadTabs();
  getGroupingStrategy().then(setStrategy);
}, []);
```

**Step 2: Pass strategy to GroupPreview**

Add `showColors={strategy === 'chrome-groups'}` prop:

```tsx
<GroupPreview
  key={`${group.groupName}-${idx}`}
  proposal={group}
  allTabs={tabs}
  onRemoveTab={handleRemoveTabFromGroup}
  showColors={strategy === 'chrome-groups'}
/>
```

**Step 3: Show unsupported warning**

In `renderIdle()`, if `strategy === 'unsupported'`, show a small warning banner above the button:

```tsx
{strategy === 'unsupported' && (
  <div className="w-full text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-800 rounded-lg p-2 text-center">
    Tab grouping is not supported in this browser.
  </div>
)}
```

And disable the "Generate Stacks" button when unsupported:

```tsx
<button
  onClick={handleAnalyze}
  disabled={strategy === 'unsupported'}
  className="... disabled:opacity-50 disabled:cursor-not-allowed"
>
```

**Step 4: Commit**

```bash
git add App.tsx
git commit -m "feat: detect grouping strategy and adapt UI"
```

---

### Task 5: Conditionally hide color dots in GroupPreview

**Files:**
- Modify: `components/GroupPreview.tsx`

**Step 1: Accept showColors prop**

Update the interface and component:

```typescript
interface GroupPreviewProps {
  proposal: TabGroupProposal;
  allTabs: Tab[];
  onRemoveTab: (tabId: number, groupName: string) => void;
  showColors: boolean;
}
```

**Step 2: Conditionally render the color dot**

Replace the always-rendered color dot with:

```tsx
{showColors && (
  <div className={`w-3 h-3 rounded-full ${colorMap[proposal.color] || 'bg-slate-500'}`} />
)}
```

**Step 3: Commit**

```bash
git add components/GroupPreview.tsx
git commit -m "feat: conditionally show color dots based on browser support"
```

---

### Task 6: Make tabGroups permission optional in manifest

**Files:**
- Modify: `public/manifest.json`

**Step 1: Move tabGroups to optional_permissions**

Vivaldi may warn or fail on the `tabGroups` permission since it doesn't support the API. Move it to `optional_permissions`:

```json
{
  "permissions": [
    "tabs",
    "storage"
  ],
  "optional_permissions": [
    "tabGroups"
  ]
}
```

**Step 2: Update background.js Chrome path**

In the Chrome groups branch of `applyTabGroups`, request the permission before using it:

```javascript
if (groupingStrategy === 'chrome-groups') {
  // Request optional permission if needed
  const granted = await chrome.permissions.contains({ permissions: ['tabGroups'] });
  if (!granted) {
    await chrome.permissions.request({ permissions: ['tabGroups'] });
  }
  // ... existing chrome.tabs.group() code
}
```

**Step 3: Commit**

```bash
git add public/manifest.json public/background.js
git commit -m "feat: make tabGroups permission optional for Vivaldi compat"
```

---

### Task 7: Build and manual test

**Step 1: Build the extension**

```bash
pnpm build
```

Verify: no TypeScript errors, no build warnings.

**Step 2: Test in Chrome/Edge**

1. Load `dist/` as unpacked extension
2. Open several tabs across different domains
3. Click "Generate Stacks" → verify groups appear with color dots
4. Click "Apply Stacks" → verify native Chrome tab groups are created

**Step 3: Test in Vivaldi**

1. Load `dist/` as unpacked extension
2. Open several tabs across different domains
3. Click "Generate Stacks" → verify groups appear WITHOUT color dots
4. Click "Apply Stacks" → verify Vivaldi tab stacks are created with names

**Step 4: Test in web preview**

```bash
pnpm dev
```

Verify: mock data loads, "unsupported" banner shown, button disabled.

**Step 5: Commit any fixes, then final commit**

```bash
git add -A
git commit -m "chore: build verification for Vivaldi tab stacks support"
```

---

### Task 8: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update docs**

Add a "Browser Compatibility" section noting the hybrid strategy:
- Chrome/Edge: native tab groups
- Vivaldi: tab stacks via vivExtData
- Other: unsupported

Update the "Browser Extension Details" section to mention `optional_permissions` for `tabGroups`.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Vivaldi support details"
```
