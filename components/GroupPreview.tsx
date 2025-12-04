import React, { useState } from 'react';
import { Tab, TabGroupProposal } from '../types';
import { ChevronDown, ChevronRight, X, Layers } from 'lucide-react';

interface GroupPreviewProps {
  proposal: TabGroupProposal;
  allTabs: Tab[];
  onRemoveTab: (tabId: number, groupName: string) => void;
}

const colorMap: Record<string, string> = {
  grey: 'bg-slate-500',
  blue: 'bg-blue-500',
  red: 'bg-red-500',
  yellow: 'bg-yellow-500',
  green: 'bg-green-500',
  pink: 'bg-pink-500',
  purple: 'bg-purple-500',
  cyan: 'bg-cyan-500',
};

const GroupPreview: React.FC<GroupPreviewProps> = ({ proposal, allTabs, onRemoveTab }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // Filter tabs that belong to this group
  const groupTabs = allTabs.filter(t => proposal.tabIds.includes(t.id));

  if (groupTabs.length === 0) return null;

  return (
    <div className="mb-3 border border-slate-700 rounded-lg overflow-hidden bg-slate-800/50">
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-800 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <div className={`w-3 h-3 rounded-full ${colorMap[proposal.color] || 'bg-slate-500'}`} />
          <span className="font-semibold text-sm">{proposal.groupName}</span>
          <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
            {groupTabs.length}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-slate-700 bg-slate-900/30">
          {groupTabs.map(tab => (
            <div key={tab.id} className="flex items-center justify-between px-4 py-2 hover:bg-slate-800/50 group">
              <div className="flex items-center gap-3 overflow-hidden">
                {tab.favIconUrl ? (
                  <img src={tab.favIconUrl} alt="" className="w-4 h-4 shrink-0" onError={(e) => e.currentTarget.style.display = 'none'} />
                ) : (
                  <Layers size={14} className="text-slate-500 shrink-0" />
                )}
                <span className="text-xs text-slate-300 truncate">{tab.title}</span>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveTab(tab.id, proposal.groupName);
                }}
                className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                aria-label="Remove from group"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GroupPreview;
