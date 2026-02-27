export interface Tab {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  lastAccessed?: number;  // ms since epoch, returned by Chrome tabs API
}

export interface TabGroupProposal {
  groupName: string;
  color: 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan';
  tabIds: number[];
}

export interface GroupingResponse {
  groups: TabGroupProposal[];
}

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  REVIEW = 'REVIEW',
  APPLYING = 'APPLYING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  SETTINGS = 'SETTINGS'
}

export type GroupingStrategy = 'chrome-groups' | 'vivaldi-stacks' | 'unsupported';

export interface Settings {
  apiKey: string;
  model: string;
}

export interface CleanupCandidate {
  tabId: number;
  reason: 'stale' | 'duplicate' | 'stale+duplicate';
  lastAccessed: number;       // ms since epoch
  duplicateOfTabId?: number;  // tabId of the tab being kept
}

export const DEFAULT_MODEL = 'google/gemini-3-flash-preview';
