import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Tab, TabGroupProposal, GroupingResponse } from '../types';

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    groups: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          groupName: {
            type: Type.STRING,
            description: "A short, descriptive name for the tab stack, preferably with an emoji prefix (e.g., '💻 Dev', 'video Media')."
          },
          color: {
            type: Type.STRING,
            description: "A color for the tab group. Must be one of: grey, blue, red, yellow, green, pink, purple, cyan.",
            enum: ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan']
          },
          tabIds: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description: "The list of tab IDs belonging to this group."
          }
        },
        required: ["groupName", "color", "tabIds"]
      }
    }
  }
};

export const categorizeTabs = async (tabs: Tab[]): Promise<TabGroupProposal[]> => {
  if (!tabs.length) return [];

  // Simplify payload to save tokens
  const tabData = tabs.map(t => ({ id: t.id, title: t.title, url: t.url }));
  const prompt = `Analyze the following browser tabs and group them into logical stacks based on their content, task, or domain. 
  
  Tabs:
  ${JSON.stringify(tabData)}
  
  Rules:
  1. Every tab ID must be assigned to exactly one group.
  2. Create a 'Miscellaneous' group for tabs that don't fit elsewhere if necessary, but try to avoid it.
  3. Use specific names (e.g., "Project A", "Social", "Docs") with an Emoji.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.3, // Low temperature for deterministic grouping
      }
    });

    const result = JSON.parse(response.text || '{}') as GroupingResponse;
    return result.groups || [];
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to categorize tabs via Gemini.");
  }
};
