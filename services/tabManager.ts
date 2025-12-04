import { Tab } from '../types';

declare var chrome: any;

// Mock data for web preview when chrome API is missing
const MOCK_TABS: Tab[] = [
  { id: 1, title: 'React Documentation', url: 'https://react.dev', favIconUrl: 'https://react.dev/favicon.ico' },
  { id: 2, title: 'Tailwind CSS - Utility-First', url: 'https://tailwindcss.com', favIconUrl: 'https://tailwindcss.com/favicon.ico' },
  { id: 3, title: 'YouTube - LoFi Girl', url: 'https://youtube.com/watch?v=5qap5aO4i9A', favIconUrl: 'https://www.youtube.com/s/desktop/favicon.ico' },
  { id: 4, title: 'Gmail - Inbox (2)', url: 'https://mail.google.com', favIconUrl: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico' },
  { id: 5, title: 'Google Gemini API Docs', url: 'https://ai.google.dev', favIconUrl: 'https://www.gstatic.com/devrel-devsite/prod/v45f6/google/images/favicon.png' },
  { id: 6, title: 'Stack Overflow - How to center div', url: 'https://stackoverflow.com/questions/12345', favIconUrl: 'https://cdn.sstatic.net/Sites/stackoverflow/Img/favicon.ico' },
  { id: 7, title: 'Spotify - Web Player', url: 'https://open.spotify.com', favIconUrl: 'https://open.spotify.com/favicon.ico' },
  { id: 8, title: 'GitHub - google/genai-js', url: 'https://github.com/google/genai-js', favIconUrl: 'https://github.com/fluidicon.png' },
];

// Check if we're in an extension context with service worker support
const hasExtensionRuntime = () =>
  typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;

export const getOpenTabs = async (): Promise<Tab[]> => {
  // Try using service worker first (more reliable)
  if (hasExtensionRuntime()) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getTabs' });
      if (response?.success) {
        return response.tabs;
      }
      console.warn('[TabOrganizer] Service worker getTabs failed:', response?.error);
    } catch (err) {
      console.warn('[TabOrganizer] Service worker not available, falling back to direct API');
    }
  }

  // Fallback: Direct API call (works but popup context may be invalidated)
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    return new Promise((resolve) => {
      chrome.tabs.query({ currentWindow: true, pinned: false }, (tabs: any[]) => {
        const mappedTabs = tabs.map((t) => ({
          id: t.id || 0,
          title: t.title || 'Untitled',
          url: t.url || '',
          favIconUrl: t.favIconUrl
        })).filter(t =>
          t.url &&
          !t.url.startsWith('chrome://') &&
          !t.url.startsWith('edge://') &&
          !t.url.startsWith('about:') &&
          !t.url.startsWith('chrome-extension://')
        );
        resolve(mappedTabs);
      });
    });
  }

  // Fallback for web preview
  console.warn('[TabOrganizer] Chrome API not found. Using mock data.');
  return Promise.resolve(MOCK_TABS);
};

export const applyTabGroups = async (groups: { groupName: string; tabIds: number[]; color: string }[]): Promise<void> => {
  console.log('[TabOrganizer] Applying groups via service worker...');

  // Use service worker to avoid "Extension context invalidated" errors
  if (hasExtensionRuntime()) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'applyTabGroups',
        groups: groups
      });

      if (response?.success) {
        console.log('[TabOrganizer] Groups applied successfully via service worker');
        return;
      } else {
        throw new Error(response?.error || 'Unknown error from service worker');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[TabOrganizer] Service worker error:', errMsg);
      throw new Error(`Failed to apply tab groups: ${errMsg}`);
    }
  }

  // Fallback for web preview (mock)
  console.log('[TabOrganizer] Mock: Applying groups...', groups);
  await new Promise(resolve => setTimeout(resolve, 1000));
};