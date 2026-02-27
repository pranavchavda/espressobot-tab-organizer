import React, { useState } from 'react';

interface ReviewTabDescriptor {
  id: string;
  label: string;
  count: number;
}

interface ReviewTabsProps {
  tabs: ReviewTabDescriptor[];
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
        {children[activeIdx] ?? null}
      </div>
    </div>
  );
};

export default ReviewTabs;
