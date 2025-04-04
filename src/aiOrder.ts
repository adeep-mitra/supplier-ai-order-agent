// src/aiOrder.ts
export interface ParsedOrder {
    useParLevel: boolean;
    items: Array<{
      name: string
      quantity: number
    }>
    expectedDeliveryDateTime?: string; // ISO string format
  }
  
  export function buildSystemPrompt(): string {
    return `
  You are an AI assistant that helps extract structured order data from natural language.
  
  🎯 Your goal:
  1. Determine if the user wants to use their Par Level (the usual weekly set of items).
  2. Extract additional item names and quantities.
  3. Extract delivery date and time if specified.
  
  📦 Return only this JSON structure:
  {
    "useParLevel": true,
    "items": [
      { "name": "Free range eggs (tray)", "quantity": 2 },
      { "name": "Tomatoes (kg)", "quantity": 1 }
    ],
    "expectedDeliveryDateTime": "2024-03-22T12:00:00Z" // ISO string, only include if specified
  }
  
  ✅ Rules:
  - If the user references their usual par level, set "useParLevel" to true, otherwise false.
  - items[] should contain **only** the extra items beyond the par level.
  - If no extra items are mentioned, just return an empty array for items.
  - For delivery date/time:
    - Use the provided current date and time as the reference point for all relative date calculations
    - Handle relative dates like:
      - "next Wednesday" → next Wednesday at 12:00 PM (relative to current date)
      - "tomorrow" → tomorrow at 12:00 PM (relative to current date)
      - "next week" → 7 days from current date at 12:00 PM
      - "in 3 days" → 3 days from current date at 12:00 PM
    - Handle specific dates like:
      - "March 22nd" → March 22nd at 12:00 PM
      - "22/03" → March 22nd at 12:00 PM
    - Handle time expressions like:
      - "by 4pm" → specified date at 4:00 PM
      - "in the morning" → specified date at 9:00 AM
      - "in the afternoon" → specified date at 2:00 PM
    - If only date is specified, assume 12:00 PM
    - If only time is specified, assume next day
    - If neither is specified, omit the field
  - Always return valid JSON, no extra commentary.
  - If no items are detected, still return "items": [].
  
  `.trim();
  }
  
  
  /**
   * Calls OpenAI to parse the user's free-text order and returns a ParsedOrder object.
   *
   * @param orderText - raw user text describing items
   * @param openAiKey - your OpenAI API key
   */
  export async function parseOrderTextWithOpenAI(
    orderText: string,
    openAiKey: string
  ): Promise<ParsedOrder> {
    // 1. Build your system + user messages
    const systemPrompt = buildSystemPrompt();
    const currentDate = new Date().toISOString();
    const userPrompt = `Current date and time: ${currentDate}\nUser input:\n${orderText}\n`;
  
    // 2. Call OpenAI chat completions
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
      }),
    });
  
    if (!response.ok) {
      throw new Error(`OpenAI call failed with status ${response.status}: ${await response.text()}`);
    }
  
    // 3. Parse AI JSON response
    const data = await response.json<{
      choices: Array<{ message: { content: string } }>
    }>();
    const rawOutput = data.choices[0]?.message?.content || '';
  
    // 4. Convert raw JSON string to object
    let parsed: ParsedOrder = { useParLevel: false, items: [] };
    try {
      parsed = JSON.parse(rawOutput);
    } catch (err) {
      // fallback or error out if we can't parse
      throw new Error(`Could not parse AI output: ${rawOutput}`);
    }
  
    // If no items found, return empty array
    if (!parsed.items || parsed.items.length === 0) {
      return {
        useParLevel: false,
        items: [],
      };
    }
  
    return parsed;
  }
  