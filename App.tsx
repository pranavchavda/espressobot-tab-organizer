import React, { useState, useEffect } from 'react';
import { BrainCircuit, Loader2, Sparkles, CheckCircle, AlertTriangle, Layers } from 'lucide-react';
import { getOpenTabs, applyTabGroups, getGroupingStrategy } from './services/tabManager';
import { categorizeTabs } from './services/geminiService';
import { Tab, TabGroupProposal, AppState, GroupingStrategy } from './types';
import GroupPreview from './components/GroupPreview';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [proposals, setProposals] = useState<TabGroupProposal[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [strategy, setStrategy] = useState<GroupingStrategy>('unsupported');

  // Initial load of tabs
  useEffect(() => {
    loadTabs();
    getGroupingStrategy().then(setStrategy);
  }, []);

  const loadTabs = async () => {
    try {
      const currentTabs = await getOpenTabs();
      setTabs(currentTabs);
    } catch (e) {
      console.error(e);
      setErrorMsg("Failed to load tabs.");
    }
  };

  const handleAnalyze = async () => {
    setAppState(AppState.ANALYZING);
    setErrorMsg('');
    try {
      const groups = await categorizeTabs(tabs);
      setProposals(groups);
      setAppState(AppState.REVIEW);
    } catch (error) {
      console.error(error);
      setErrorMsg("Failed to analyze tabs using Gemini.");
      setAppState(AppState.ERROR);
    }
  };

  const handleApply = async () => {
    setAppState(AppState.APPLYING);
    try {
      await applyTabGroups(proposals);
      setAppState(AppState.SUCCESS);
      
      // Reset after a delay
      setTimeout(() => {
        setAppState(AppState.IDLE);
        loadTabs(); // Reload to see new state if we were really connected
      }, 2500);
    } catch (error) {
      console.error(error);
      setErrorMsg("Failed to apply tab groups.");
      setAppState(AppState.ERROR);
    }
  };

  const handleRemoveTabFromGroup = (tabId: number, groupName: string) => {
    setProposals(prev => prev.map(group => {
      if (group.groupName === groupName) {
        return { ...group, tabIds: group.tabIds.filter(id => id !== tabId) };
      }
      return group;
    }));
  };

  // --- Render Views ---

  const renderHeader = () => (
    <div className="p-4 border-b border-slate-700 bg-slate-800 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg">
        <Sparkles size={18} className="text-white" />
      </div>
      <div>
        <h1 className="font-bold text-lg leading-tight text-white">EspressoBot Tab Organizer</h1>
        <p className="text-xs text-slate-400">Powered by Gemini AI</p>
      </div>
    </div>
  );

  const renderIdle = () => (
    <div className="flex flex-col h-full p-6 text-center justify-center items-center space-y-6">
      <div className="bg-slate-800 p-4 rounded-full mb-2">
        <Layers size={48} className="text-slate-400" />
      </div>
      <div>
        <h2 className="text-xl font-bold mb-2">Organize your Tabs</h2>
        <p className="text-slate-400 text-sm">
          You have <span className="text-white font-bold">{tabs.length}</span> tabs open. 
          Let AI analyze and stack them for you.
        </p>
      </div>
      
      <div className="w-full max-h-[200px] overflow-y-auto bg-slate-800/50 rounded-lg p-2 text-left border border-slate-700">
        {tabs.map(t => (
          <div key={t.id} className="text-xs text-slate-400 truncate py-1 border-b border-slate-700/50 last:border-0">
             • {t.title}
          </div>
        ))}
      </div>

      {strategy === 'unsupported' && (
        <div className="w-full text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-800 rounded-lg p-2 text-center">
          Tab grouping is not supported in this browser.
        </div>
      )}

      <button
        onClick={handleAnalyze}
        disabled={strategy === 'unsupported'}
        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <BrainCircuit size={18} />
        Generate Stacks
      </button>
    </div>
  );

  const renderLoading = () => (
    <div className="flex flex-col h-full justify-center items-center p-8 text-center space-y-4">
      <Loader2 size={48} className="animate-spin text-blue-500" />
      <h3 className="text-lg font-medium">Analyzing Context...</h3>
      <p className="text-sm text-slate-400">Gemini is looking at your tab titles and URLs to find patterns.</p>
    </div>
  );

  const renderReview = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 bg-slate-800/30 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-1">Proposed Stacks</h2>
        <p className="text-xs text-slate-500">Review the groups before applying.</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {proposals.map((group, idx) => (
          <GroupPreview
            key={`${group.groupName}-${idx}`}
            proposal={group}
            allTabs={tabs}
            onRemoveTab={handleRemoveTabFromGroup}
            showColors={strategy === 'chrome-groups'}
          />
        ))}
      </div>

      <div className="p-4 border-t border-slate-700 bg-slate-800 flex gap-3">
        <button 
          onClick={() => setAppState(AppState.IDLE)}
          className="flex-1 py-2 px-4 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors text-sm font-medium"
        >
          Cancel
        </button>
        <button 
          onClick={handleApply}
          className="flex-[2] py-2 px-4 rounded-lg bg-green-600 text-white hover:bg-green-500 transition-colors shadow-lg shadow-green-900/20 text-sm font-medium"
        >
          Apply Stacks
        </button>
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className="flex flex-col h-full justify-center items-center p-8 text-center space-y-4">
      <CheckCircle size={64} className="text-green-500" />
      <h3 className="text-xl font-bold">Tabs Organized!</h3>
      <p className="text-sm text-slate-400">Your workspace has been tidied up.</p>
    </div>
  );

  const renderError = () => (
    <div className="flex flex-col h-full justify-center items-center p-8 text-center space-y-4">
      <AlertTriangle size={64} className="text-red-500" />
      <h3 className="text-xl font-bold">Something went wrong</h3>
      <p className="text-sm text-slate-400">{errorMsg || "An unknown error occurred."}</p>
      <button 
        onClick={() => setAppState(AppState.IDLE)}
        className="mt-4 px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm"
      >
        Try Again
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 font-sans">
      {renderHeader()}
      <main className="flex-1 overflow-hidden relative">
        {appState === AppState.IDLE && renderIdle()}
        {appState === AppState.ANALYZING && renderLoading()}
        {appState === AppState.REVIEW && renderReview()}
        {(appState === AppState.APPLYING || appState === AppState.SUCCESS) && (
          appState === AppState.SUCCESS ? renderSuccess() : renderLoading()
        )}
        {appState === AppState.ERROR && renderError()}
      </main>
    </div>
  );
};

export default App;