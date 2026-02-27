# Tab Cleanup Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add stale/duplicate tab detection with a tabbed review UI and standalone Quick Cleanup mode.

**Architecture:** Client-side detection (no AI) runs in the background service worker alongside tab queries. Results flow into a new `CleanupCandidate[]` state slice in `App.tsx`. The existing review screen gains a tab bar wrapping the current `GroupPreview` list and a new `CleanupList` component. A "Quick Cleanup" button on the idle screen bypasses AI entirely and jumps straight to the Cleanup tab.

**Tech Stack:** Chrome Extension MV3, TypeScript/React 19, Tailwind CSS v4, Vite, vanilla JS service worker

---

### Task 1: Add `CleanupCandidate` to `types.ts`

**Files:**
- Modify: `types.ts`

**Step 1: Add the interface after `Settings`**

```typescript
export interface CleanupCandidate {
  tabId: number;
  reason: 'stale' | 'duplicate' | 'stale+duplicate';
  lastAccessed: number;       // ms since epoch
  duplicateOfTabId?: number;  // tabId of the tab being kept
}
```

**Step 2: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add types.ts
git commit -m "feat: add CleanupCandidate type"
```

---

### Task 2: Create `services/cleanupService.ts`

**Files:**
- Create: `services/cleanupService.ts`

This service contains pure detection logic that runs on the popup side (it receives tab data from the background and computes candidates).

**Step 1: Create the file**

```typescript
import { Tab, CleanupCandidate } from '../types';

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

export function detectCleanupCandidates(tabs: Tab[]): CleanupCandidate[] {
  const now = Date.now();
  const candidates = new Map<number, CleanupCandidate>();

  // --- Duplicate detection ---
  const byUrl = new Map<string, Tab[]>();
  for (const tab of tabs) {
    const key = tab.url;
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key)!.push(tab);
  }
  for (const group of byUrl.values()) {
    if (group.length < 2) continue;
    // Keep the most recently accessed tab; flag the rest
    const sorted = [...group].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
    const keeper = sorted[0];
    for (const tab of sorted.slice(1)) {
      candidates.set(tab.id, {
        tabId: tab.id,
        reason: 'duplicate',
        lastAccessed: tab.lastAccessed ?? 0,
        duplicateOfTabId: keeper.id,
      });
    }
  }

  // --- Stale detection ---
  for (const tab of tabs) {
    const idle = now - (tab.lastAccessed ?? now);
    if (idle < STALE_THRESHOLD_MS) continue;
    const existing = candidates.get(tab.id);
    if (existing) {
      existing.reason = 'stale+duplicate';
    } else {
      candidates.set(tab.id, {
        tabId: tab.id,
        reason: 'stale',
        lastAccessed: tab.lastAccessed ?? 0,
      });
    }
  }

  // Sort stalest first
  return [...candidates.values()].sort((a, b) => a.lastAccessed - b.lastAccessed);
}
```

**Step 2: Add `lastAccessed` to the `Tab` type** (it's returned by Chrome but currently not typed)

In `types.ts`, update `Tab`:

```typescript
export interface Tab {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  lastAccessed?: number;  // add this line
}
```

**Step 3: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

**Step 4: Commit**

```bash
git add services/cleanupService.ts types.ts
git commit -m "feat: add client-side cleanup detection service"
```

---

### Task 3: Expose `lastAccessed` from the background service worker

**Files:**
- Modify: `public/background.js`

The `getOpenTabs()` function in `background.js` already maps tab data but currently drops `lastAccessed`. Add it to the mapping.

**Step 1: Update `getOpenTabs()` in `background.js`**

Find this block (around line 181):
```javascript
return tabs
  .map((t) => ({
    id: t.id || 0,
    title: t.title || 'Untitled',
    url: t.url || '',
    favIconUrl: t.favIconUrl
  }))
```

Change it to:
```javascript
return tabs
  .map((t) => ({
    id: t.id || 0,
    title: t.title || 'Untitled',
    url: t.url || '',
    favIconUrl: t.favIconUrl,
    lastAccessed: t.lastAccessed ?? Date.now(),
  }))
```

Do the same in the `getTabs` handler's direct `chrome.tabs.query` fallback path (around line 36 in `tabManager.ts` — covered in Task 4).

**Step 2: Add `applyCleanup` message handler in `background.js`**

Add this handler inside the `chrome.runtime.onMessage.addListener` block, after the existing `applyTabGroups` handler:

```javascript
if (message.action === 'applyCleanup') {
  applyCleanup(message.tabIdsToClose, message.groups)
    .then(() => sendResponse({ success: true }))
    .catch((err) => sendResponse({ success: false, error: err.message }));
  return true;
}
```

**Step 3: Add `applyCleanup` function in `background.js`**

Add this function after `applyTabGroups`:

```javascript
async function applyCleanup(tabIdsToClose, groups) {
  // 1. Close tabs first
  if (tabIdsToClose && tabIdsToClose.length > 0) {
    try {
      await chrome.tabs.remove(tabIdsToClose);
    } catch (err) {
      // Some tabs may already be closed — not fatal
      console.warn('[TabOrganizer BG] Some tabs already closed:', err.message);
    }
  }

  // 2. Strip closed IDs from group proposals and apply
  if (groups && groups.length > 0) {
    const closedSet = new Set(tabIdsToClose || []);
    const filteredGroups = groups
      .map(g => ({ ...g, tabIds: g.tabIds.filter(id => !closedSet.has(id)) }))
      .filter(g => g.tabIds.length > 0);
    if (filteredGroups.length > 0) {
      await applyTabGroups(filteredGroups);
    }
  }
}
```

**Step 4: Build to verify background.js syntax**

```bash
pnpm build
```

Expected: build succeeds, no errors.

**Step 5: Commit**

```bash
git add public/background.js
git commit -m "feat: expose lastAccessed from background, add applyCleanup handler"
```

---

### Task 4: Add cleanup wrappers to `services/tabManager.ts`

**Files:**
- Modify: `services/tabManager.ts`

**Step 1: Expose `lastAccessed` in the direct fallback path**

Find the `.map()` inside the direct `chrome.tabs.query` block and add `lastAccessed`:

```typescript
const mappedTabs = tabs.map((t) => ({
  id: t.id || 0,
  title: t.title || 'Untitled',
  url: t.url || '',
  favIconUrl: t.favIconUrl,
  lastAccessed: t.lastAccessed ?? Date.now(),
}))
```

**Step 2: Add `applyCleanup` export**

```typescript
export const applyCleanup = async (
  tabIdsToClose: number[],
  groups: { groupName: string; tabIds: number[]; color: string }[]
): Promise<void> => {
  if (hasExtensionRuntime()) {
    const response = await chrome.runtime.sendMessage({
      action: 'applyCleanup',
      tabIdsToClose,
      groups,
    });
    if (!response?.success) {
      throw new Error(response?.error || 'applyCleanup failed');
    }
    return;
  }
  // Web preview mock
  console.log('[TabOrganizer] Mock applyCleanup:', { tabIdsToClose, groups });
  await new Promise(resolve => setTimeout(resolve, 800));
};
```

**Step 3: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

**Step 4: Commit**

```bash
git add services/tabManager.ts
git commit -m "feat: add applyCleanup wrapper in tabManager"
```

---

### Task 5: Create `components/CleanupList.tsx`

**Files:**
- Create: `components/CleanupList.tsx`

**Step 1: Create the component**

```tsx
import React from 'react';
import { CleanupCandidate, Tab } from '../types';
import { Layers } from 'lucide-react';

interface CleanupListProps {
  candidates: CleanupCandidate[];
  allTabs: Tab[];
  onToggle: (tabId: number, selected: boolean) => void;
  selectedIds: Set<number>;
}

function formatIdle(lastAccessed: number): string {
  const ms = Date.now() - lastAccessed;
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `idle ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `idle ${hours}h`;
  const days = Math.floor(hours / 24);
  return `idle ${days}d`;
}

const REASON_BADGE: Record<CleanupCandidate['reason'], { label: string; className: string }> = {
  stale: { label: 'STALE', className: 'bg-amber-900/40 text-amber-400 border-amber-800' },
  duplicate: { label: 'DUPLICATE', className: 'bg-blue-900/40 text-blue-400 border-blue-800' },
  'stale+duplicate': { label: 'STALE + DUPE', className: 'bg-red-900/40 text-red-400 border-red-800' },
};

const CleanupList: React.FC<CleanupListProps> = ({ candidates, allTabs, onToggle, selectedIds }) => {
  const tabById = new Map(allTabs.map(t => [t.id, t]));

  if (candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 text-slate-500">
        <p className="text-sm">No stale or duplicate tabs found.</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      {candidates.map(candidate => {
        const tab = tabById.get(candidate.tabId);
        const keeperTab = candidate.duplicateOfTabId ? tabById.get(candidate.duplicateOfTabId) : undefined;
        const badge = REASON_BADGE[candidate.reason];
        const isSelected = selectedIds.has(candidate.tabId);

        return (
          <div
            key={candidate.tabId}
            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
              isSelected
                ? 'border-slate-600 bg-slate-800/60'
                : 'border-slate-700/50 bg-slate-800/20 opacity-50'
            }`}
            onClick={() => onToggle(candidate.tabId, !isSelected)}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={e => onToggle(candidate.tabId, e.target.checked)}
              onClick={e => e.stopPropagation()}
              className="mt-0.5 accent-red-500 shrink-0"
            />
            <div className="flex-1 overflow-hidden">
              <div className="flex items-center gap-2 mb-1">
                {tab?.favIconUrl ? (
                  <img src={tab.favIconUrl} alt="" className="w-4 h-4 shrink-0" onError={e => e.currentTarget.style.display = 'none'} />
                ) : (
                  <Layers size={14} className="text-slate-500 shrink-0" />
                )}
                <span className="text-xs font-medium text-slate-200 truncate">{tab?.title ?? 'Unknown tab'}</span>
              </div>
              <p className="text-xs text-slate-500 truncate mb-1.5">{tab?.url}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${badge.className}`}>
                  {badge.label}
                </span>
                {(candidate.reason === 'stale' || candidate.reason === 'stale+duplicate') && (
                  <span className="text-[10px] text-slate-500">{formatIdle(candidate.lastAccessed)}</span>
                )}
                {keeperTab && (
                  <span className="text-[10px] text-slate-500">keeping: {keeperTab.title}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CleanupList;
```

**Step 2: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add components/CleanupList.tsx
git commit -m "feat: add CleanupList component"
```

---

### Task 6: Create `components/ReviewTabs.tsx`

**Files:**
- Create: `components/ReviewTabs.tsx`

This is a thin tab-bar wrapper. It receives both panes as children and manages the active tab.

**Step 1: Create the component**

```tsx
import React, { useState } from 'react';

interface Tab {
  id: string;
  label: string;
  count: number;
}

interface ReviewTabsProps {
  tabs: Tab[];
  children: React.ReactNode[];
}

const ReviewTabs: React.FC<ReviewTabsProps> = ({ tabs, children }) => {
  const [activeIdx, setActiveIdx] = useState(0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-slate-700 bg-slate-800/30">
        {tabs.map((tab, idx) => (
          <button
            key={tab.id}
            onClick={() => setActiveIdx(idx)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
              activeIdx === idx
                ? 'border-blue-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              activeIdx === idx ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {children[activeIdx]}
      </div>
    </div>
  );
};

export default ReviewTabs;
```

**Step 2: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add components/ReviewTabs.tsx
git commit -m "feat: add ReviewTabs tab-bar component"
```

---

### Task 7: Wire everything into `App.tsx`

**Files:**
- Modify: `App.tsx`

This is the largest task. Work through it in sub-steps.

**Step 1: Add imports**

```tsx
import { detectCleanupCandidates } from './services/cleanupService';
import { applyCleanup } from './services/tabManager';
import { CleanupCandidate } from './types';
import CleanupList from './components/CleanupList';
import ReviewTabs from './components/ReviewTabs';
import { Trash2 } from 'lucide-react';
```

**Step 2: Add state**

Inside the component, after the existing state declarations:

```tsx
const [cleanupCandidates, setCleanupCandidates] = useState<CleanupCandidate[]>([]);
const [selectedCleanupIds, setSelectedCleanupIds] = useState<Set<number>>(new Set());
const [cleanupOnly, setCleanupOnly] = useState(false);
```

**Step 3: Add `handleQuickCleanup`**

```tsx
const handleQuickCleanup = async () => {
  setCleanupOnly(true);
  setAppState(AppState.ANALYZING);
  setErrorMsg('');
  try {
    const currentTabs = await getOpenTabs();
    setTabs(currentTabs);
    const candidates = detectCleanupCandidates(currentTabs);
    setCleanupCandidates(candidates);
    setSelectedCleanupIds(new Set(candidates.map(c => c.tabId)));
    if (candidates.length === 0) {
      setAppState(AppState.SUCCESS);
      setTimeout(() => {
        setCleanupOnly(false);
        setAppState(AppState.IDLE);
      }, 2000);
    } else {
      setAppState(AppState.REVIEW);
    }
  } catch (error) {
    setErrorMsg(error instanceof Error ? error.message : 'Failed to scan tabs.');
    setAppState(AppState.ERROR);
    setCleanupOnly(false);
  }
};
```

**Step 4: Update `handleAnalyze` to also compute cleanup candidates**

After setting proposals in the success branch and in the polling interval, also compute cleanup:

In `handleAnalyze`, after `setAppState(AppState.REVIEW)`:
```tsx
const candidates = detectCleanupCandidates(tabs);
setCleanupCandidates(candidates);
setSelectedCleanupIds(new Set(candidates.map(c => c.tabId)));
```

In the polling interval's success branch (after `setProposals(proposals)` and `setAppState(AppState.REVIEW)`):
```tsx
const candidates = detectCleanupCandidates(tabs);
setCleanupCandidates(candidates);
setSelectedCleanupIds(new Set(candidates.map(c => c.tabId)));
```

**Step 5: Replace `handleApply` to use `applyCleanup`**

```tsx
const handleApply = async () => {
  setAppState(AppState.APPLYING);
  try {
    const tabIdsToClose = [...selectedCleanupIds];
    await applyCleanup(tabIdsToClose, cleanupOnly ? [] : proposals);
    setAppState(AppState.SUCCESS);
    setTimeout(() => {
      setCleanupOnly(false);
      setCleanupCandidates([]);
      setSelectedCleanupIds(new Set());
      setAppState(AppState.IDLE);
      loadTabs();
    }, 2500);
  } catch (error) {
    setErrorMsg('Failed to apply changes.');
    setAppState(AppState.ERROR);
  }
};
```

**Step 6: Add toggle handler**

```tsx
const handleToggleCleanup = (tabId: number, selected: boolean) => {
  setSelectedCleanupIds(prev => {
    const next = new Set(prev);
    if (selected) next.add(tabId); else next.delete(tabId);
    return next;
  });
};
```

**Step 7: Update `renderReview` to use `ReviewTabs`**

Replace the existing `renderReview` function:

```tsx
const renderReview = () => {
  const groupCount = proposals.reduce((acc, g) => acc + g.tabIds.length, 0);
  const cleanupCount = selectedCleanupIds.size;

  const applyLabel = (() => {
    const hasGroups = !cleanupOnly && proposals.length > 0;
    const hasCleanup = cleanupCount > 0;
    if (hasGroups && hasCleanup) return `Apply Groups & Close ${cleanupCount} Tab${cleanupCount !== 1 ? 's' : ''}`;
    if (hasCleanup) return `Close ${cleanupCount} Tab${cleanupCount !== 1 ? 's' : ''}`;
    return 'Apply Stacks';
  })();

  const reviewTabs = [
    ...(!cleanupOnly ? [{ id: 'groups', label: 'Groups', count: proposals.length }] : []),
    ...(cleanupCandidates.length > 0 ? [{ id: 'cleanup', label: 'Cleanup', count: cleanupCount }] : []),
  ];

  const panes = [
    ...(!cleanupOnly ? [(
      <div className="p-4 space-y-0">
        {proposals.map((group, idx) => (
          <GroupPreview
            key={`${group.groupName}-${idx}`}
            proposal={group}
            allTabs={tabs}
            onRemoveTab={handleRemoveTabFromGroup}
            showColors={strategy === 'chrome-groups' || strategy === null}
          />
        ))}
      </div>
    )] : []),
    ...(cleanupCandidates.length > 0 ? [(
      <CleanupList
        candidates={cleanupCandidates}
        allTabs={tabs}
        onToggle={handleToggleCleanup}
        selectedIds={selectedCleanupIds}
      />
    )] : []),
  ];

  // If only one pane, skip the tab bar
  const content = reviewTabs.length > 1
    ? <ReviewTabs tabs={reviewTabs}>{panes}</ReviewTabs>
    : <div className="flex-1 overflow-y-auto custom-scrollbar">{panes[0]}</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 bg-slate-800/30 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-1">
          {cleanupOnly ? 'Quick Cleanup' : 'Proposed Stacks'}
        </h2>
        <p className="text-xs text-slate-500">Review changes before applying.</p>
      </div>

      <div className="flex-1 overflow-hidden">
        {content}
      </div>

      <div className="p-4 border-t border-slate-700 bg-slate-800 flex gap-3">
        <button
          onClick={() => { setAppState(AppState.IDLE); setCleanupOnly(false); }}
          className="flex-1 py-2 px-4 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors text-sm font-medium"
        >
          Cancel
        </button>
        <button
          onClick={handleApply}
          className="flex-[2] py-2 px-4 rounded-lg bg-green-600 text-white hover:bg-green-500 transition-colors shadow-lg shadow-green-900/20 text-sm font-medium"
        >
          {applyLabel}
        </button>
      </div>
    </div>
  );
};
```

**Step 8: Add Quick Cleanup button to `renderIdle`**

After the existing "Generate Stacks" button, add:

```tsx
<button
  onClick={handleQuickCleanup}
  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition-all border border-slate-600 flex items-center justify-center gap-2 text-sm"
>
  <Trash2 size={16} />
  Quick Cleanup
</button>
```

**Step 9: Update the success screen message when in cleanupOnly mode**

In `renderSuccess`, make the subtitle dynamic:

```tsx
<p className="text-sm text-slate-400">
  {cleanupOnly ? 'Stale and duplicate tabs closed.' : 'Your workspace has been tidied up.'}
</p>
```

**Step 10: Type-check**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

**Step 11: Commit**

```bash
git add App.tsx
git commit -m "feat: wire cleanup state, Quick Cleanup button, and tabbed review into App"
```

---

### Task 8: Build and manually test

**Step 1: Build**

```bash
pnpm build
```

Expected: build succeeds, `dist/` produced.

**Step 2: Load in browser**

Load `dist/` as an unpacked extension in Chrome/Edge (or Vivaldi). Open 10+ tabs including:
- Two tabs with the same URL (to trigger duplicate detection)
- Leave some tabs untouched for >2 hours if possible, or temporarily set `STALE_THRESHOLD_MS = 60_000` (1 minute) for testing, then revert

**Step 3: Test integrated flow**

1. Click "Generate Stacks" — wait for analysis
2. Review screen appears; if duplicates/stale found, two tabs show (Groups + Cleanup)
3. Uncheck one candidate on the Cleanup tab → verify count in button label updates
4. Click Apply — verify groups created and checked tabs closed

**Step 4: Test Quick Cleanup standalone**

1. Click "Quick Cleanup" — brief analyzing spinner
2. If candidates found: review with only Cleanup tab visible, header reads "Quick Cleanup"
3. If none found: "Nothing to clean up!" success screen appears and returns to idle

**Step 5: Revert test threshold if changed, then final commit**

```bash
git add -A
git commit -m "chore: verify tab cleanup build and manual test"
```
