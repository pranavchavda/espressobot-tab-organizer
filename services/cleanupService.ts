import { Tab, CleanupCandidate } from '../types';

export const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

export function detectCleanupCandidates(tabs: Tab[]): CleanupCandidate[] {
  const now = Date.now();
  const candidates = new Map<number, CleanupCandidate>();

  // --- Duplicate detection ---
  const byUrl = new Map<string, Tab[]>();
  for (const tab of tabs) {
    if (!tab.url) continue;
    const key = tab.url;
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key)!.push(tab);
  }
  for (const group of byUrl.values()) {
    if (group.length < 2) continue;
    // Keep the most recently accessed tab; flag the rest
    const sorted = [...group].sort((a, b) => {
      const timeDiff = (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
      return timeDiff !== 0 ? timeDiff : b.id - a.id;
    });
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
