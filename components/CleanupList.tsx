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
  const tabById = new Map<number, Tab>(allTabs.map(t => [t.id, t]));

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
