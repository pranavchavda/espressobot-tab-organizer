// Service worker for handling tab grouping operations
// This persists longer than the popup context

let groupingStrategy = null;
let detectionPromise = null;

let analysisStatus = 'idle'; // 'idle', 'analyzing', 'success', 'error'
let analysisProposals = [];
let analysisError = '';

async function detectStrategy() {
  // Chrome/Edge: chrome.tabGroups API exists
  if (typeof chrome.tabGroups !== 'undefined') {
    groupingStrategy = 'chrome-groups';
    console.log('[TabOrganizer BG] Detected strategy:', groupingStrategy);
    return;
  }

  // Vivaldi: tabs have splitViewId (Vivaldi-only property)
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    if (tabs.length > 0 && 'splitViewId' in tabs[0]) {
      groupingStrategy = 'vivaldi-stacks';
    } else {
      groupingStrategy = 'unsupported';
    }
  } catch {
    groupingStrategy = 'unsupported';
  }
  console.log('[TabOrganizer BG] Detected strategy:', groupingStrategy);
}

detectionPromise = detectStrategy();

// DEBUG: Dump all tab data + storage to discover Vivaldi's color property
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'debugDumpTabs') {
    (async () => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      for (const tab of tabs) {
        console.log(`[DEBUG] Tab ${tab.id} full object:`, JSON.stringify(tab));
      }
      // Also check chrome.storage.local for any stack-related keys
      chrome.storage.local.get(null, (all) => {
        const keys = Object.keys(all);
        console.log('[DEBUG] All storage keys:', keys);
        for (const key of keys) {
          if (typeof all[key] === 'string' && all[key].length < 2000) {
            console.log(`[DEBUG] storage["${key}"]:`, all[key]);
          } else {
            console.log(`[DEBUG] storage["${key}"]: (type=${typeof all[key]}, length=${JSON.stringify(all[key]).length})`);
          }
        }
      });
      sendResponse({ success: true });
    })();
    return true;
  }

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

  if (message.action === 'startCategorization') {
    categorizeTabsAI(message.tabs, message.settings);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'getCategorizationStatus') {
    sendResponse({
      status: analysisStatus,
      proposals: analysisProposals,
      error: analysisError
    });
    return true;
  }

  if (message.action === 'resetCategorizationStatus') {
    analysisStatus = 'idle';
    analysisProposals = [];
    analysisError = '';
    sendResponse({ success: true });
    return true;
  }
});

async function categorizeTabsAI(tabs, settings) {
  analysisStatus = 'analyzing';
  analysisProposals = [];
  analysisError = '';

  try {
    const tabData = tabs.map(t => ({ id: t.id, title: t.title, url: t.url }));
    const systemPrompt = `You are a tab organizer. Analyze browser tabs and group them into logical stacks.\nRules:\n1. Every tab ID must be assigned to exactly one group.\n2. Avoid a 'Miscellaneous' group when possible.\n3. Use specific group names with an emoji prefix.\n4. Respond ONLY with valid JSON matching the provided schema.`;
    const userPrompt = `Group these tabs:\n${JSON.stringify(tabData)}`;

    const jsonSchema = {
      name: 'tab_groups',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          groups: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                groupName: { type: 'string' },
                color: { type: 'string', enum: ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'] },
                accentColor: { type: 'string', enum: ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'] },
                tabIds: { type: 'array', items: { type: 'integer' } }
              },
              required: ['groupName', 'color', 'accentColor', 'tabIds'],
              additionalProperties: false
            }
          }
        },
        required: ['groups'],
        additionalProperties: false
      }
    };

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/pranavchavda/espressobot-tab-organizer',
        'X-Title': 'EspressoBot Tab Organizer',
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_schema', json_schema: jsonSchema },
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`AI request failed (${response.status}): ${err}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No response from AI model.');
    const result = JSON.parse(content);
    if (!result.groups || !Array.isArray(result.groups)) {
      throw new Error('Invalid response structure from AI model.');
    }
    analysisProposals = result.groups;
    analysisStatus = 'success';
  } catch (e) {
    analysisError = e.message;
    analysisStatus = 'error';
  }
}

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

// Map AI color names to Vivaldi's TabGroupColor enum values
const VIVALDI_COLOR_MAP = {
  grey: 'Grey', blue: 'Blue', red: 'Red', yellow: 'Yellow',
  green: 'Green', pink: 'Red', purple: 'Purple', cyan: 'Blue',
  orange: 'Orange',
};

async function applyTabGroupsVivaldi(groups) {
  console.log('[TabOrganizer BG] Applying Vivaldi tab stacks:', groups);

  for (const group of groups) {
    if (!group.tabIds || group.tabIds.length === 0) continue;

    const stackId = crypto.randomUUID();
    const vivaldiColor = VIVALDI_COLOR_MAP[group.color] || 'Default';
    console.log(`[TabOrganizer BG] Creating Vivaldi stack "${group.groupName}" color=${vivaldiColor} (${stackId})`);

    for (const tabId of group.tabIds) {
      try {
        const tab = await chrome.tabs.get(tabId);
        const vivExtData = tab.vivExtData ? JSON.parse(tab.vivExtData) : {};
        vivExtData.group = stackId;
        vivExtData.fixedGroupTitle = group.groupName;
        vivExtData.tabGroupColor = vivaldiColor;
        console.log(`[TabOrganizer BG] Tab ${tabId} writing vivExtData:`, JSON.stringify(vivExtData));
        await chrome.tabs.update(tabId, { vivExtData: JSON.stringify(vivExtData) });
      } catch (err) {
        console.warn(`[TabOrganizer BG] Skipping missing tab ${tabId}:`, err.message);
      }
    }
  }

  console.log('[TabOrganizer BG] All Vivaldi stacks applied successfully');

  // DEBUG: Dump all tabs after stacking to see what Vivaldi stores
  const allTabs = await chrome.tabs.query({ currentWindow: true });
  for (const t of allTabs) {
    // Log every non-standard property (anything not in the base Chrome tab type)
    const standard = new Set(['active','audible','autoDiscardable','discarded','favIconUrl','groupId','height','highlighted','id','incognito','index','mutedInfo','openerTabId','pendingUrl','pinned','selected','status','title','url','width','windowId']);
    const extra = {};
    for (const key of Object.keys(t)) {
      if (!standard.has(key)) extra[key] = t[key];
    }
    if (Object.keys(extra).length > 0) {
      console.log(`[DEBUG] Tab ${t.id} extra props:`, JSON.stringify(extra));
    }
    // Also log vivExtData specifically
    console.log(`[DEBUG] Tab ${t.id} vivExtData:`, t.vivExtData);
  }
  // Dump storage
  chrome.storage.local.get(null, (all) => {
    console.log('[DEBUG] Storage keys:', Object.keys(all));
    for (const [k, v] of Object.entries(all)) {
      console.log(`[DEBUG] storage["${k}"]:`, typeof v === 'string' ? v : JSON.stringify(v).slice(0, 500));
    }
  });
}

async function applyTabGroups(groups) {
  if (!groupingStrategy) await detectStrategy();
  console.log('[TabOrganizer BG] Applying groups (strategy: ' + groupingStrategy + '):', groups);

  if (groupingStrategy === 'vivaldi-stacks') {
    return applyTabGroupsVivaldi(groups);
  }

  if (groupingStrategy === 'chrome-groups') {
    // Filter out tabs that no longer exist before grouping
    const existingTabs = await chrome.tabs.query({ currentWindow: true });
    const existingIds = new Set(existingTabs.map(t => t.id));

    for (const group of groups) {
      const validIds = (group.tabIds || []).filter(id => existingIds.has(id));
      if (validIds.length === 0) continue;
      console.log(`[TabOrganizer BG] Creating group "${group.groupName}" with tabs:`, validIds);
      try {
        const groupId = await chrome.tabs.group({ tabIds: validIds });
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
