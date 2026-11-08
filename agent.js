
const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: "https://integrate.api.nvidia.com/v1"
});

const MODEL = process.env.NEMOTRON_MODEL;

if (!MODEL) {
  throw new Error("NEMOTRON_MODEL is missing in .env");
}

const SYSTEM = `
You are Finn, a friendly Financial Analyst NPC
inside an interactive financial education game.

PERSONALITY:
- Friendly, intelligent, and encouraging.
- Speak naturally.
- Keep answers to 1-3 short sentences.
- Ask one follow-up question at a time.

FINANCIAL RESPONSIBILITIES:
- Discuss income, expenses, savings, debt and mortgages.
- Help users understand their financial health.
- Explain home affordability.
- Never invent financial information.
- Never guarantee mortgage approval.
- Do not present estimates as verified facts.

HOUSE DESIGNER:
A separate House Designer application can create
AI-generated floor plans and 3D houses.

When a player wants to buy or build a home:
1. Discuss their finances and goals.
2. Ask about the intended house budget.
3. Help collect bedrooms, bathrooms, style,
   garage preferences, and other requirements.
4. Offer to open the House Designer.
5. Wait for the player to accept.

Do not claim you created a design or navigated
to another page.
`;

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(
      m =>
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

function wantsDesigner(message, history) {
  const text = message.trim().toLowerCase();

  const directRequest =
    /\b(open|visit|go to|take me to|show me|launch)\b.*\b(house designer|home designer|designer)\b/i
      .test(text);

  const acceptance =
    /^(yes|yeah|yep|sure|okay|ok|let's go|take me there|show me|i'd like that|i want to|please do)[.! ]*$/i
      .test(text);

  const previousReply = [...history]
    .reverse()
    .find(m => m.role === "assistant")?.content || "";

  const offeredDesigner =
    /\b(visit|explore|go to|meet|try|open)\b.{0,120}\b(house designer|home designer)\b/i
      .test(previousReply);

  return directRequest || (acceptance && offeredDesigner);
}

function extractHousePreferences(message, history) {
  const messages = [
    ...cleanHistory(history),
    { role: "user", content: message }
  ];

  const preferences = {};

  // Process messages in order so later user
  // corrections replace earlier preferences.
  for (const item of messages) {
    if (item.role !== "user") continue;

    const text = item.content;

    const bedrooms = text.match(
      /\b(\d+)\s*(?:bedrooms?|beds?)\b/i
    );

    if (bedrooms) {
      preferences.bedrooms = Number(bedrooms[1]);
    }

    const bathrooms = text.match(
      /\b(\d+)\s*(?:bathrooms?|baths?)\b/i
    );

    if (bathrooms) {
      preferences.bathrooms = Number(bathrooms[1]);
    }

    const style = text.match(
      /\b(modern|farmhouse|traditional|minimalist)\b/i
    );

    if (style) {
      preferences.style = style[1].toLowerCase();
    }

    // Match explicitly stated house budgets.
    // Do not confuse savings or income with
    // a construction budget.
    const budgetPatterns = [
      /\b(?:house|home|construction|building)\s+budget\s*(?:is|of|:|around|about)?\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|million|m)?\b/i,
      /\bbudget\s+(?:for\s+(?:the|my|a)\s+(?:house|home)\s+)?(?:is|of|around|about)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|million|m)?\b/i,
      /\b(?:spend|spending)\s+\$?\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|million|m)?\s+(?:on|for)\s+(?:a|my|the)?\s*(?:house|home)\b/i
    ];

    for (const pattern of budgetPatterns) {
      const match = text.match(pattern);
      if (!match) continue;

      let amount = Number(
        match[1].replace(/,/g, "")
      );

      const unit = (match[2] || "").toLowerCase();

      if (unit === "k" || unit === "thousand") {
        amount *= 1000;
      } else if (unit === "m" || unit === "million") {
        amount *= 1000000;
      }

      if (Number.isFinite(amount)) {
        preferences.budget = amount;
      }

      break;
    }

    const width = text.match(
      /\blot\s+width\s*(?:is|of|:)?\s*(\d+(?:\.\d+)?)\s*(?:m|meters?)?\b/i
    );

    if (width) {
      preferences.lotWidth = Number(width[1]);
    }

    const depth = text.match(
      /\blot\s+depth\s*(?:is|of|:)?\s*(\d+(?:\.\d+)?)\s*(?:m|meters?)?\b/i
    );

    if (depth) {
      preferences.lotDepth = Number(depth[1]);
    }

    const floors = text.match(
      /\b(\d+)\s*(?:floors?|stories|storeys)\b/i
    );

    if (floors) {
      preferences.maxFloors = Number(floors[1]);
    }

    if (/\b(no garage|without a garage)\b/i.test(text)) {
      preferences.garage = false;
    } else if (
      /\b(?:with|want|include|need)\s+(?:a\s+)?garage\b/i
        .test(text)
    ) {
      preferences.garage = true;
    }

    const wishes = text.match(
      /\b(open kitchen|home office|large living room|balcony|patio|walk-in closet|garden)\b/gi
    );

    if (wishes) {
      const existing = preferences.notes
        ? preferences.notes.split(", ")
        : [];

      preferences.notes = [
        ...new Set([
          ...existing,
          ...wishes.map(w => w.toLowerCase())
        ])
      ].join(", ");
    }
  }

  // Validate against House Designer limits.
  const limits = {
    bedrooms: [0, 8],
    bathrooms: [1, 6],
    budget: [50000, Infinity],
    lotWidth: [8, 100],
    lotDepth: [8, 100],
    maxFloors: [1, 3]
  };

  for (const [name, [min, max]] of Object.entries(limits)) {
    if (preferences[name] === undefined) continue;

    const value = preferences[name];

    if (
      !Number.isFinite(value) ||
      value < min ||
      value > max
    ) {
      delete preferences[name];
    }
  }

  return preferences;
}

async function chatWithFinn(message, history = []) {
  const safeHistory = cleanHistory(history);

  if (wantsDesigner(message, safeHistory)) {
    const housePreferences = extractHousePreferences(
      message,
      safeHistory
    );

    return {
      reply:
        "Great! Let's open the House Designer. " +
        "I've transferred the home preferences you shared. " +
        "Please review the details and budget before generating your house.",
      action: "open_house_designer",
      housePreferences
    };
  }

  console.log("Using Nemotron model:", MODEL);

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      ...safeHistory,
      { role: "user", content: message }
    ],
    max_tokens: 2048,
    stream: false
  });

  const choice = response.choices?.[0];

  const reply = choice?.message?.content?.trim();

  console.log(
    "Nemotron finish reason:",
    choice?.finish_reason
  );

  console.log("Nemotron reply:", reply);

  if (!reply) {
    throw new Error(
      "Nemotron did not produce a final answer. " +
      "Finish reason: " + choice?.finish_reason
    );
  }

  return {
    reply,
    action: null
  };
}

module.exports = {
  chatWithFinn
};
