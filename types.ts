export interface Tab {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
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
  ERROR = 'ERROR'
}
