import { Tab, TabGroupProposal, GroupingResponse, Settings } from '../types';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

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
            groupName: {
              type: 'string',
              description: "A short, descriptive name for the tab stack, preferably with an emoji prefix (e.g., '💻 Dev', '🎵 Media')."
            },
            color: {
              type: 'string',
              enum: ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan']
            },
            tabIds: {
              type: 'array',
              items: { type: 'integer' }
            }
          },
          required: ['groupName', 'color', 'tabIds'],
          additionalProperties: false
        }
      }
    },
    required: ['groups'],
    additionalProperties: false
  }
};

export const categorizeTabs = async (tabs: Tab[], settings: Settings): Promise<TabGroupProposal[]> => {
  if (!tabs.length) return [];
  if (!settings.apiKey) throw new Error('No API key configured. Open settings to add your OpenRouter API key.');

  const tabData = tabs.map(t => ({ id: t.id, title: t.title, url: t.url }));

  const systemPrompt = `You are a tab organizer. Analyze browser tabs and group them into logical stacks.
Rules:
1. Every tab ID must be assigned to exactly one group.
2. Avoid a 'Miscellaneous' group when possible.
3. Use specific group names with an emoji prefix.
4. Respond ONLY with valid JSON matching the provided schema.`;

  const userPrompt = `Group these tabs:\n${JSON.stringify(tabData)}`;

  const response = await fetch(OPENROUTER_URL, {
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
      response_format: {
        type: 'json_schema',
        json_schema: jsonSchema,
      },
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('[TabOrganizer] OpenRouter error:', err);
    throw new Error(`AI request failed (${response.status}): ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No response from AI model.');

  const result = JSON.parse(content) as GroupingResponse;
  if (!result.groups || !Array.isArray(result.groups)) {
    throw new Error('Invalid response structure from AI model.');
  }
  return result.groups;
};
