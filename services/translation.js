const SYSTEM_PROMPT = `You translate dishes from the daily lunch menu of a Flemish (Belgian Dutch) restaurant into natural English.
Rules:
- Translate culinary terms as a chef would (for example "kaassaus" is "cheese sauce", "zuurkool" is "sauerkraut").
- Keep the " - " separators between components exactly as in the input.
- Keep puns, brand names and dishes without an English equivalent as they are, e.g. "hutsepot".
- Reply with the translation only: no quotes, notes or explanations.`

const translate = async (text, env) => {
  try {
    const response = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      // A one-line translation needs no reasoning; this keeps it fast and cheap.
      chat_template_kwargs: { enable_thinking: false },
      max_tokens: 200,
    })

    // Newer models answer in the OpenAI shape; older ones use `response`.
    const translated =
      response?.choices?.[0]?.message?.content ?? response?.response
    return translated?.trim() || text
  } catch (e) {
    console.log(e)
    // Fall back to the Dutch original so the RSS feed still has a description.
    return text
  }
}

export { translate }
