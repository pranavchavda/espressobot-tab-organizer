// Service worker for handling tab grouping operations
// This persists longer than the popup context

// Log available APIs on startup
console.log('[TabOrganizer BG] Checking available APIs...');
console.log('[TabOrganizer BG] chrome.tabs:', !!chrome.tabs);
console.log('[TabOrganizer BG] chrome.tabs.group:', !!(chrome.tabs && chrome.tabs.group));
console.log('[TabOrganizer BG] chrome.tabGroups:', !!chrome.tabGroups);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
      !t.url.startsWith('about:') &&
      !t.url.startsWith('chrome-extension://')
    );
}

async function applyTabGroups(groups) {
  console.log('[TabOrganizer BG] Applying groups:', groups);

  if (!chrome.tabs.group) {
    console.error('[TabOrganizer BG] chrome.tabs.group API not available!');
    throw new Error('Tab grouping API not available in this browser');
  }

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
}
