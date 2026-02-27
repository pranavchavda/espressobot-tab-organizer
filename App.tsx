import React, { useState, useEffect } from 'react';
import { BrainCircuit, Loader2, Sparkles, CheckCircle, AlertTriangle, Layers, Settings as SettingsIcon, Trash2 } from 'lucide-react';
import { getOpenTabs, applyCleanup, getGroupingStrategy } from './services/tabManager';
import { categorizeTabs, checkAnalysisStatus, resetAnalysisStatus } from './services/aiService';
import { loadSettings, saveSettings } from './services/settingsService';
import { detectCleanupCandidates } from './services/cleanupService';
import SettingsComponent from './components/Settings';
import { Tab, TabGroupProposal, AppState, GroupingStrategy, Settings, CleanupCandidate } from './types';
import GroupPreview from './components/GroupPreview';
import CleanupList from './components/CleanupList';
import ReviewTabs from './components/ReviewTabs';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [proposals, setProposals] = useState<TabGroupProposal[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [strategy, setStrategy] = useState<GroupingStrategy | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [cleanupCandidates, setCleanupCandidates] = useState<CleanupCandidate[]>([]);
  const [selectedCleanupIds, setSelectedCleanupIds] = useState<Set<number>>(new Set());
  const [cleanupOnly, setCleanupOnly] = useState(false);

  // Initial load of tabs
  useEffect(() => {
    loadTabs();
    getGroupingStrategy().then(setStrategy);
    loadSettings().then(setSettings);

    // Check if there is an ongoing or finished background analysis
    checkAnalysisStatus().then(({ status, proposals, error }) => {
      if (status === 'analyzing') {
        setAppState(AppState.ANALYZING);
      } else if (status === 'success' && proposals && proposals.length > 0) {
        setProposals(proposals);
        setAppState(AppState.REVIEW);
      } else if (status === 'error') {
        setErrorMsg(error || 'Failed to analyze tabs in background.');
        setAppState(AppState.ERROR);
      }
    });
  }, []);

  useEffect(() => {
    let interval: number;
    if (appState === AppState.ANALYZING) {
      interval = window.setInterval(async () => {
        try {
          const { status, proposals, error } = await checkAnalysisStatus();
          if (status === 'success' && proposals) {
            setProposals(proposals);
            setAppState(AppState.REVIEW);
            const candidates = detectCleanupCandidates(tabs);
            setCleanupCandidates(candidates);
            setSelectedCleanupIds(new Set(candidates.map(c => c.tabId)));
            await resetAnalysisStatus();
          } else if (status === 'error') {
            setErrorMsg(error || 'Analysis failed.');
            setAppState(AppState.ERROR);
            await resetAnalysisStatus();
          }
        } catch (e) {
          // Silent fallback
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [appState]);

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
    await resetAnalysisStatus(); // clear any previous state
    try {
      const groups = await categorizeTabs(tabs, settings!);
      // If we got direct groups (fallback web mode), use them directly
      if (groups && groups.length > 0) {
        setProposals(groups);
        setAppState(AppState.REVIEW);
        const candidates = detectCleanupCandidates(tabs);
        setCleanupCandidates(candidates);
        setSelectedCleanupIds(new Set(candidates.map(c => c.tabId)));
      }
      // Otherwise, the interval will poll for the background result
    } catch (error) {
      console.error(error);
      setErrorMsg(error instanceof Error ? error.message : "Failed to analyze tabs.");
      setAppState(AppState.ERROR);
    }
  };

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
      console.error(error);
      setErrorMsg('Failed to apply changes.');
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

  const handleSaveSettings = async (newSettings: Settings) => {
    try {
      await saveSettings(newSettings);
      setSettings(newSettings);
      setAppState(AppState.IDLE);
    } catch (error) {
      console.error(error);
      setErrorMsg("Failed to save settings.");
      setAppState(AppState.ERROR);
    }
  };

  const handleToggleCleanup = (tabId: number, selected: boolean) => {
    setSelectedCleanupIds(prev => {
      const next = new Set(prev);
      if (selected) next.add(tabId); else next.delete(tabId);
      return next;
    });
  };

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

  // --- Render Views ---

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

      {settings && !settings.apiKey && (
        <div className="w-full text-xs text-blue-400 bg-blue-900/20 border border-blue-800 rounded-lg p-2 text-center">
          No API key configured.{' '}
          <button onClick={() => setAppState(AppState.SETTINGS)} className="underline hover:text-blue-300">
            Open settings
          </button>{' '}
          to get started.
        </div>
      )}

      {strategy !== null && strategy === 'unsupported' && (
        <div className="w-full text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-800 rounded-lg p-2 text-center">
          Tab grouping is not supported in this browser.
        </div>
      )}

      <button
        onClick={handleAnalyze}
        disabled={strategy === null || strategy === 'unsupported' || !settings?.apiKey}
        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <BrainCircuit size={18} />
        Generate Stacks
      </button>
      <button
        onClick={handleQuickCleanup}
        className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition-all border border-slate-600 flex items-center justify-center gap-2 text-sm"
      >
        <Trash2 size={16} />
        Quick Cleanup
      </button>
    </div>
  );

  const renderLoading = () => (
    <div className="flex flex-col h-full justify-center items-center p-8 text-center space-y-4">
      <Loader2 size={48} className="animate-spin text-blue-500" />
      <h3 className="text-lg font-medium">Analyzing Context...</h3>
      <p className="text-sm text-slate-400">AI is analyzing your tab titles and URLs to find patterns.</p>
    </div>
  );

  const renderReview = () => {
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

  const renderSuccess = () => (
    <div className="flex flex-col h-full justify-center items-center p-8 text-center space-y-4">
      <CheckCircle size={64} className="text-green-500" />
      <h3 className="text-xl font-bold">Tabs Organized!</h3>
      <p className="text-sm text-slate-400">
        {cleanupOnly ? 'Stale and duplicate tabs closed.' : 'Your workspace has been tidied up.'}
      </p>
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
        {appState === AppState.SETTINGS && settings && (
          <SettingsComponent
            settings={settings}
            onSave={handleSaveSettings}
            onBack={() => setAppState(AppState.IDLE)}
          />
        )}
      </main>
    </div>
  );
};

export default App;