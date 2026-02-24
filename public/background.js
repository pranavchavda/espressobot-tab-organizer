// Service worker for handling tab grouping operations
// This persists longer than the popup context

let groupingStrategy = null;
let detectionPromise = null;

async function detectStrategy() {
  if (typeof chrome.tabGroups !== 'undefined') {
    groupingStrategy = 'chrome-groups';
  } else {
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      if (tabs.length > 0 && tabs[0].vivExtData !== undefined) {
        groupingStrategy = 'vivaldi-stacks';
      } else {
        groupingStrategy = 'unsupported';
      }
    } catch {
      groupingStrategy = 'unsupported';
    }
  }
  console.log('[TabOrganizer BG] Detected grouping strategy:', groupingStrategy);
}

detectionPromise = detectStrategy();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getStrategy') {
    (async () => {
      if (!groupingStrategy) await detectionPromise;
      sendResponse({ success: true, strategy: groupingStrategy });
    })();
    return true;
  }

  if (message.action === 'applyTabGroups') {
    applyTabGroups(message.groups)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.action === 'getTabs') {
    getOpenTabs()
      .then((tabs) => sendResponse({ success: true, tabs }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function getOpenTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true, pinned: false });
  return tabs
    .map((t) => ({
      id: t.id || 0,
      title: t.title || 'Untitled',
      url: t.url || '',
      favIconUrl: t.favIconUrl
    }))
    .filter(t =>
      t.url &&
      !t.url.startsWith('chrome://') &&
      !t.url.startsWith('edge://') &&
      !t.url.startsWith('vivaldi://') &&
      !t.url.startsWith('about:') &&
      !t.url.startsWith('chrome-extension://')
    );
}

async function applyTabGroupsVivaldi(groups) {
  console.log('[TabOrganizer BG] Applying Vivaldi tab stacks:', groups);

  for (const group of groups) {
    if (!group.tabIds || group.tabIds.length === 0) continue;

    const stackId = crypto.randomUUID();
    console.log(`[TabOrganizer BG] Creating Vivaldi stack "${group.groupName}" (${stackId})`);

    for (const tabId of group.tabIds) {
      try {
        const tab = await chrome.tabs.get(tabId);
        const vivExtData = tab.vivExtData ? JSON.parse(tab.vivExtData) : {};
        vivExtData.group = stackId;
        vivExtData.fixedGroupTitle = group.groupName;
        await chrome.tabs.update(tabId, { vivExtData: JSON.stringify(vivExtData) });
      } catch (err) {
        console.error(`[TabOrganizer BG] Error stacking tab ${tabId}:`, err);
        throw err;
      }
    }
  }

  console.log('[TabOrganizer BG] All Vivaldi stacks applied successfully');
}

async function applyTabGroups(groups) {
  if (!groupingStrategy) await detectStrategy();
  console.log('[TabOrganizer BG] Applying groups (strategy: ' + groupingStrategy + '):', groups);

  if (groupingStrategy === 'vivaldi-stacks') {
    return applyTabGroupsVivaldi(groups);
  }

  if (groupingStrategy === 'chrome-groups') {
    for (const group of groups) {
      if (!group.tabIds || group.tabIds.length === 0) continue;
      console.log(`[TabOrganizer BG] Creating group "${group.groupName}" with tabs:`, group.tabIds);
      try {
        const groupId = await chrome.tabs.group({ tabIds: group.tabIds });
        console.log(`[TabOrganizer BG] Created group with ID: ${groupId}`);
        if (chrome.tabGroups && chrome.tabGroups.update) {
          await chrome.tabGroups.update(groupId, {
            title: group.groupName,
            color: group.color
          });
          console.log(`[TabOrganizer BG] Updated group "${group.groupName}"`);
        }
      } catch (err) {
        console.error(`[TabOrganizer BG] Error creating group "${group.groupName}":`, err);
        throw err;
      }
    }
    console.log('[TabOrganizer BG] All groups applied successfully');
    return;
  }

  throw new Error('Tab grouping is not supported in this browser');
}
