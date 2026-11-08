// House-design agent: Claude drafts a floor plan, calls check_plan, and revises until it passes.
const Anthropic = require('@anthropic-ai/sdk');
const { validatePlan } = require('./rules');

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.CLAUDE_EFFORT || 'medium'; // low | medium | high — higher is slower but more careful
const MAX_TURNS = 10;

const ROOM_TYPES = ['living', 'kitchen', 'dining', 'bedroom', 'bathroom', 'office', 'laundry', 'hallway', 'stairs', 'garage'];

const roomSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'type', 'x', 'y', 'w', 'd'],
  properties: {
    id: { type: 'string', description: 'Unique short id, e.g. "bed1"' },
    name: { type: 'string', description: 'Label shown in the 3D view, e.g. "Main Bedroom"' },
    type: { type: 'string', enum: ROOM_TYPES },
    x: { type: 'number', description: 'Left edge in meters from the lot side' },
    y: { type: 'number', description: 'Front edge in meters from the street' },
    w: { type: 'number', description: 'Width along x, meters' },
    d: { type: 'number', description: 'Depth along y, meters' },
  },
};

const planSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'summary', 'style', 'roof', 'wallColor', 'roofColor', 'trimColor', 'floors'],
  properties: {
    name: { type: 'string', description: 'Short name for the design' },
    summary: { type: 'string', description: 'One or two sentences describing the layout' },
    style: { type: 'string', enum: ['modern', 'farmhouse', 'traditional', 'minimalist'] },
    roof: { type: 'string', enum: ['flat', 'gable', 'hip'] },
    wallColor: { type: 'string', description: 'Color of the main exterior finish as hex, e.g. "#f2efe9"' },
    roofColor: { type: 'string', description: 'Roof color as hex, e.g. "#3b3b3b"' },
    trimColor: { type: 'string', description: 'Window frames, fascia, porch posts and door casings as hex' },
    floors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['level', 'rooms'],
        properties: {
          level: { type: 'integer', description: '0 = ground floor, 1 = first upper floor' },
          rooms: { type: 'array', items: roomSchema },
        },
      },
    },
  },
};

const checkPlanTool = {
  name: 'check_plan',
  description:
    'Check a complete house plan against the lot, building rules, room counts and budget. ' +
    'Returns ok:true when the plan passes, otherwise a list of problems to fix. Call it with every draft.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['plan'],
    properties: { plan: planSchema },
  },
};

const SYSTEM = `You are a residential architect. You design single-family houses from a customer's requirements.

How plans work:
- Every room is an axis-aligned rectangle: x, y = its corner nearest the origin; w along x; d along y. Meters.
- The street runs along y = 0. Rooms must stay inside the buildable area given in the requirements.
- Rooms on the same floor must not overlap. Rooms that share a wall at least 0.9 m long get a doorway automatically, so every room must connect to the rest through shared walls. Use a hallway where needed. Avoid making bedrooms or bathrooms reachable only through the kitchen or another bedroom.
- Windows are added automatically on exterior walls. The front door goes on the living room's street-facing wall, so place the living room at the front of the buildable area. A garage also faces the street.
- Upper floors must sit fully on top of the floor below. A multi-floor house needs a "stairs" room on every floor, stacked in the same spot.
- Keep footprints compact and walls aligned. Use tidy dimensions (multiples of 0.1 m).
- The 3D view renders each style with real materials. Choose colors and a roof to match:
  modern: smooth white or light render, dark charcoal trim, flat roof (or a low gable).
  minimalist: grey board-formed concrete (e.g. #c9c7c2), near-black trim, flat roof.
  farmhouse: white or muted lap siding, white trim, dark metal gable roof.
  traditional: brick (wallColor is the brick color, e.g. #a5583f), white trim, shingle hip or gable roof.
- A two-storey main block with a single-storey garage wing reads well from the street.

Process: draft a full plan, call check_plan, fix every problem it reports, and repeat until it returns ok:true.
When it passes, reply with a short summary for the customer: plain text, no markdown, headings or bullet lists, under 80 words. Cover the layout, how it meets their needs, and the estimated cost.`;

function describeRequirements(req) {
  const s = req.setback;
  return [
    'Customer requirements:',
    `- Bedrooms: ${req.bedrooms}`,
    `- Bathrooms: ${req.bathrooms}`,
    `- Style: ${req.style}`,
    `- Budget: $${req.budget.toLocaleString()}`,
    `- Lot: ${req.lotWidth} m wide × ${req.lotDepth} m deep, setback ${s} m on every side`,
    `- Buildable area: x from ${s} to ${req.lotWidth - s}, y from ${s} to ${req.lotDepth - s}`,
    `- Maximum floors: ${req.maxFloors}`,
    `- Garage: ${req.garage ? 'yes' : 'no'}`,
    `- Other wishes: ${req.notes || 'none'}`,
  ].join('\n');
}

// Runs the agent. onEvent(type, data) reports progress; returns { plan, cost, problems, summary }.
async function designHouse(req, onEvent = () => {}) {
  const messages = [{ role: 'user', content: describeRequirements(req) }];
  let best = null; // last plan that was checked
  let summary = '';

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const message =
      turn === 1
        ? 'Claude is drafting a floor plan…'
        : best && best.problems.length === 0
          ? 'Plan passed. Writing the summary…'
          : `Revising the plan (round ${turn})…`;
    onEvent('status', { message });

    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: EFFORT },
      system: SYSTEM,
      tools: [checkPlanTool],
      messages,
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('Claude declined this request. Try rewording the requirements.');
    }

    // Keep the full content (including thinking blocks) so the conversation stays valid.
    messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    if (toolUses.length === 0) {
      if (response.stop_reason === 'max_tokens') throw new Error('Claude ran out of output space before finishing.');
      summary = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      break;
    }

    const results = toolUses.map((use) => {
      const plan = use.input && use.input.plan;
      if (use.name !== 'check_plan' || !plan || !Array.isArray(plan.floors)) {
        return { type: 'tool_result', tool_use_id: use.id, is_error: true, content: 'Invalid input: expected { plan }.' };
      }
      const { problems, cost } = validatePlan(plan, req);
      best = { plan, cost, problems };
      onEvent('check', { round: turn, ok: problems.length === 0, cost, problems, plan });
      return {
        type: 'tool_result',
        tool_use_id: use.id,
        content: JSON.stringify({ ok: problems.length === 0, estimatedCost: cost, problems }),
      };
    });
    messages.push({ role: 'user', content: results });
  }

  if (!best) throw new Error('Claude did not produce a plan.');
  return { ...best, summary };
}

module.exports = { designHouse };
