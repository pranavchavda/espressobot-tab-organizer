# Tab Cleanup Feature — Design

**Date:** 2026-02-27

## Overview

Add a tab cleanup system that detects stale and duplicate tabs, presents them for user review with checkboxes, and closes them — either integrated into the existing AI grouping flow or as a standalone "Quick Cleanup" mode.

---

## Goals

- Surface stale tabs (idle > 2 hours) and exact-URL duplicates without requiring user configuration
- Let users deselect any suggested closure before applying (opt-out, not opt-in)
- Integrate cleanly into the existing review screen without disrupting the groups UX
- Provide a fast standalone cleanup path that works with no API key

---

## Data Model

### New type in `types.ts`

```typescript
export interface CleanupCandidate {
  tabId: number;
  reason: 'stale' | 'duplicate' | 'stale+duplicate';
  lastAccessed: number;       // ms since epoch
  duplicateOfTabId?: number;  // tabId of the tab being kept (most recently accessed)
}
```

### New state in `App.tsx`

- `cleanupCandidates: CleanupCandidate[]` — list of flagged tabs
- `cleanupOnly: boolean` — true when launched from Quick Cleanup (no AI grouping)

---

## Detection Logic

New file: `services/cleanupService.ts`

**Duplicate detection:**
- Group tabs by exact URL
- For each group with 2+ tabs, keep the one with the highest `lastAccessed`, flag the rest as `'duplicate'`
- `duplicateOfTabId` points to the kept tab

**Stale detection:**
- Flag any tab where `tab.lastAccessed < Date.now() - 2 * 60 * 60 * 1000` (2-hour threshold)
- Sort results by `lastAccessed` ascending (stalest first)

**Combined:**
- A tab matching both criteria gets `reason: 'stale+duplicate'`

Detection runs in the background service worker alongside `getTabs` so `lastAccessed` is reliably populated. Exported as a new `'detectCleanup'` message action.

---

## UI Changes

### Review screen — tabbed layout

The review screen gains a tab bar at the top:

```
[ Groups (4)  |  Cleanup (7) ]
```

- Tab counts update live as the user checks/unchecks items
- **Groups tab**: existing `GroupPreview` cards, unchanged
- **Cleanup tab**: list of `CleanupCandidate` entries, each showing:
  - Favicon + tab title + truncated URL
  - Reason badge: `STALE` (amber), `DUPLICATE` (blue), `STALE + DUPE` (red)
  - For stale tabs: human-readable idle time ("idle 3 days", "idle 6 hours")
  - For duplicates: "keeping: [other tab title]"
  - Checkbox (checked by default) — uncheck to keep the tab

### When `cleanupOnly: true`

- Groups tab is hidden
- Header reads "Quick Cleanup" instead of "Proposed Stacks"

### Apply button label adapts

| State | Label |
|-------|-------|
| Both tabs have selections | `Apply Groups & Close X Tabs` |
| Groups only | `Apply Stacks` |
| Cleanup only | `Close X Tabs` |

---

## Apply Flow

Handled by a new `'applyCleanup'` message action in `background.js`. Takes `{ tabIdsToClose, groups }`.

**Sequence:**
1. `chrome.tabs.remove(tabIdsToClose)` — close checked tabs first
2. Strip closed tab IDs from all group proposals (skip groups that become empty)
3. Run existing `applyTabGroups(groups)` logic

**Error handling:** tabs already closed by the user are silently skipped (consistent with existing apply logic).

---

## Standalone "Quick Cleanup" Path

A secondary button added to the idle screen below "Generate Stacks":

```
[ Generate Stacks  ]   ← primary (blue fill)
[ Quick Cleanup    ]   ← secondary (slate border)
```

**Flow:**
1. Click "Quick Cleanup"
2. → `ANALYZING` state while `detectCleanup` runs (fast, no AI)
3. No candidates found → brief "Nothing to clean up!" success screen → IDLE
4. Candidates found → `REVIEW` state with `cleanupOnly: true`

**Always enabled** — no API key required.

**No new `AppState` values needed** — reuses `ANALYZING` and `REVIEW` with the `cleanupOnly` flag.

---

## File Changes Summary

| File | Change |
|------|--------|
| `types.ts` | Add `CleanupCandidate` interface; add `cleanupOnly` to app state |
| `services/cleanupService.ts` | New file — duplicate + stale detection logic |
| `public/background.js` | Add `'detectCleanup'` and `'applyCleanup'` message handlers |
| `services/tabManager.ts` | Add `detectCleanupCandidates()` and `applyCleanup()` wrappers |
| `App.tsx` | Add `cleanupCandidates` + `cleanupOnly` state; wire Quick Cleanup button; update apply logic |
| `components/ReviewTabs.tsx` | New component — tab bar wrapping Groups and Cleanup views |
| `components/CleanupList.tsx` | New component — checkbox list of cleanup candidates |
