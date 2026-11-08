
const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: "https://integrate.api.nvidia.com/v1"
});

const MODEL = process.env.NEMOTRON_MODEL;

const SYSTEM = `
You are Max, a friendly AI Financial Literacy Coach
inside Nessotron Bank, an interactive pixel-art game.

YOUR PERSONALITY:
- Friendly, curious, encouraging and easy to understand.
- Speak in 1-3 short sentences.
- Explain concepts using simple everyday examples.
- Ask at most one follow-up question at a time.

YOUR PURPOSE:
Help users learn financial literacy, including:
- Saving and budgeting
- Compound and simple interest
- Credit scores and credit cards
- Debt and loans
- Investing fundamentals
- Inflation
- Emergency funds
- Financial goal setting

MONEYVERSE:
MoneyVerse is a separate interactive financial education
website with visualizations.

Your primary goal is to help users discover MoneyVerse.

When users ask about financial concepts:
1. Give a brief helpful explanation.
2. Explain that MoneyVerse can visualize the concept.
3. Offer to open MoneyVerse when appropriate.

Do not claim MoneyVerse has a specific interactive
feature unless it is confirmed.

Never invent financial facts, account balances,
investment returns or interest rates.
Do not provide guaranteed investment advice.

You are Max, not Finny.
Finny handles personalized financial planning
and house design.
`;

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(m =>
      m &&
      ["user", "assistant"].includes(m.role) &&
      typeof m.content === "string"
    )
    .slice(-12)
    .map(m => ({
      role: m.role,
      content: m.content.slice(0, 2000)
    }));
}

function wantsMoneyVerse(message, history) {
  const text = message.trim().toLowerCase();

  const direct =
    /\b(open|visit|launch|go to|take me to|show me)\b.{0,60}\b(money\s?verse)\b/i.test(text);

  const previous = [...history]
    .reverse()
    .find(m => m.role === "assistant")
    ?.content || "";

  const offered =
    /\b(money\s?verse)\b/i.test(previous) &&
    /\b(open|visit|explore|take you|go there|check it out)\b/i.test(previous);

  const accepted =
    /^(yes|yeah|yep|sure|okay|ok|let's go|take me there|open it|please do|sounds good)[.! ]*$/i
      .test(text);

  return direct || (accepted && offered);
}

async function chatWithMax(message, history = []) {
  const safeHistory = cleanHistory(history);

  if (wantsMoneyVerse(message, safeHistory)) {
    return {
      reply: "Awesome! Let's explore MoneyVerse and learn through interactive visualizations!",
      action: "open_moneyverse"
    };
  }

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      ...safeHistory,
      { role: "user", content: message }
    ],
    max_tokens: 500,
    stream: false
  });

  const reply = response.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    throw new Error("Max did not receive a valid AI response.");
  }

  return {
    reply,
    action: null
  };
}

module.exports = { chatWithMax };
