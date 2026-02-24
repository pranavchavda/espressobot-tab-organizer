import { Settings, DEFAULT_MODEL } from '../types';

declare var chrome: any;

const STORAGE_KEY = 'espressobot_settings';

const hasExtensionStorage = () =>
  typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

export const loadSettings = async (): Promise<Settings> => {
  if (hasExtensionStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (result: any) => {
        if (result[STORAGE_KEY]) {
          resolve(result[STORAGE_KEY]);
        } else {
          resolve({
            apiKey: process.env.OPENROUTER_API_KEY || '',
            model: DEFAULT_MODEL,
          });
        }
      });
    });
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}

  return {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: DEFAULT_MODEL,
  };
};

export const saveSettings = async (settings: Settings): Promise<void> => {
  if (hasExtensionStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: settings }, resolve);
    });
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};
