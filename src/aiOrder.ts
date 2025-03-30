// src/aiOrder.ts
export interface ParsedOrder {
    items: Array<{
      name: string
      quantity: number
    }>
  }
  
  export function buildSystemPrompt(): string {
    return `
  You are an AI that extracts item name and quantity from text.
  Return JSON in the format (note this is an example of the format, you must follow the format):

    {
      "items": [
        { "name": "lettuce", "quantity": 5 },
        { "name": "cola", "quantity": 3 }
      ]
    }

  If no items are found, return an empty array for items.
  Only output valid JSON and nothing else.
  `.trim();
  }
  
  /**
   * Calls OpenAI to parse the user’s free-text order and returns a ParsedOrder object.
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
    const userPrompt = `User input:\n${orderText}\n`;
  
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
    let parsed: ParsedOrder = { items: [] };
    try {
      parsed = JSON.parse(rawOutput);
    } catch (err) {
      // fallback or error out if we can't parse
      throw new Error(`Could not parse AI output: ${rawOutput}`);
    }
  
    return parsed;
  }
  