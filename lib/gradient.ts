import OpenAI from "openai";

const GRADIENT_BASE_URL = "https://inference.do-ai.run/v1";
const API_KEY = () => process.env.DIGITAL_OCEAN_MODEL_ACCESS_KEY!;

let _openai: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      baseURL: GRADIENT_BASE_URL,
      apiKey: API_KEY(),
    });
  }
  return _openai;
}

// --- Vision: Analyze images and determine optimal order for promo video ---

export async function analyzeImages(base64Images: string[]): Promise<{ description: string; order: number[] }> {
  const imageContent = base64Images.map((img, i) => {
    const dataUrl = img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`;
    return [
      { type: "text" as const, text: `Image ${i + 1}:` },
      { type: "image_url" as const, image_url: { url: dataUrl } },
    ];
  }).flat();

  const response = await getClient().chat.completions.create({
    model: "openai-gpt-4.1",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are sequencing images for a professional social media promo video. You have ${base64Images.length} images.

Analyze all images and respond with valid JSON containing:
1. "description" — A vivid, evocative description of the overall scene/event across all images. Focus on people, energy, environment, and context. This will be used to generate post copy.
2. "order" — An array of image numbers (1-indexed) in the optimal order for a promo video. The FIRST image should be the most visually striking/hero-worthy shot. Then sequence the rest for maximum narrative flow and visual variety. Consider: wide shots before close-ups, building energy, alternating compositions.

Example response: {"description": "A vibrant hackathon...", "order": [3, 1, 2, 4]}

Respond ONLY with valid JSON.`,
          },
          ...imageContent,
        ],
      },
    ],
    max_tokens: 800,
  });

  const raw = response.choices[0]?.message?.content ?? "";

  try {
    const parsed = JSON.parse(raw);
    return {
      description: parsed.description ?? "A scene captured in the moment.",
      order: Array.isArray(parsed.order) ? parsed.order : base64Images.map((_, i) => i + 1),
    };
  } catch {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      const parsed = JSON.parse(match[1].trim());
      return {
        description: parsed.description ?? "A scene captured in the moment.",
        order: Array.isArray(parsed.order) ? parsed.order : base64Images.map((_, i) => i + 1),
      };
    }
    return {
      description: raw,
      order: base64Images.map((_, i) => i + 1),
    };
  }
}

// --- Text: Generate LinkedIn copy + music prompt ---

export async function generateCopyAndMusicPrompt(params: {
  description: string;
  platform: string;
  goal: string;
  vibe: string;
}): Promise<{ copy: string; musicPrompt: string; videoOverlays: string[] }> {
  const { description, platform, goal, vibe } = params;

  const response = await getClient().chat.completions.create({
    model: "openai-gpt-4.1",
    messages: [
      {
        role: "system",
        content: `You are an expert social media strategist and music director. You will be given a scene description, target platform, post goal, and desired vibe. You must produce THREE outputs as valid JSON:

1. "copy" — The post caption/message text for ${platform}. This is what appears as the text accompanying a video post. It must achieve the stated goal while sounding like a REAL HUMAN wrote it.

VOICE GUIDELINES (this is critical):
- Write like April — straightforward, factual, genuinely happy but never over-the-top
- NO corporate buzzwords. Never say: "electrifying," "game-changer," "synergy," "leverage," "unlock," "dive in," "brilliant minds," "shaping tomorrow," "innovation unleashed," or similar LinkedIn clichés
- NO motivational poster energy. No "Ready to join the movement?" No "This is where breakthroughs are born."
- Use emojis sparingly (1-3 max) and make them clever/specific, not generic clapping/rocket/fire spam
- Write like you're texting a smart friend about something cool you saw, not like you're writing a press release
- Short sentences. Say what happened, why it's cool, and move on.
- Hashtags: 2-3 max, always include #DigitalOcean, and only add others if they're actually useful, not performative
- When mentioning companies by name, @ them (e.g. @DigitalOcean, @Anthropic, @NVIDIA) so they get tagged in the post
- If you catch yourself writing something that sounds like every other LinkedIn post, delete it and try again

2. "musicPrompt" — A detailed text prompt for an AI music generator (Meta's MusicGen) to create a 10-15 second background music track. This music will be the soundtrack for a short promo video being posted to ${platform} as social media content. The music must sound professional and production-ready — think TV commercial, Instagram Reel, or LinkedIn promotional video. Describe the genre, tempo (100-130 BPM), instruments, mood, and energy. ALWAYS include: a strong beat/kick drum, a clear melody, and full instrumentation. Never request ambient, quiet, minimal, or atmospheric music. The track should grab attention in the first second and match the vibe of the promo video.

3. "videoOverlays" — Exactly 3 ultra-short phrases (3-8 words each) for on-screen text overlays in a promo video. These will be displayed one at a time over dynamic visuals, so they must be punchy and scannable at a glance. First should be an attention-grabbing headline, second a key insight or point, third a call-to-action or hashtag line. Do NOT use special characters like colons or quotes.

Examples of good music prompts:
- "Upbeat electronic pop, 120 BPM, loud punchy kick drum, bright synth lead, warm pads, claps on every beat, energetic and inspiring, building to a powerful drop, radio-ready production, full master volume"
- "Driving indie rock, 110 BPM, distorted electric guitar riff, tight snare, bass groove, confident and bold energy, sounds like a Nike commercial, loud and polished"
- "Epic cinematic orchestral hit, 100 BPM, booming taiko drums, soaring brass fanfare, massive string section, timpani rolls, triumphant and powerful, blockbuster trailer energy, maximum intensity"

Examples of good video overlays:
- ["Innovation Starts Here", "Built by Builders", "#TechForward"]
- ["The Future is Now", "One Platform Does It All", "Join the Movement"]

Respond ONLY with valid JSON: {"copy": "...", "musicPrompt": "...", "videoOverlays": ["...", "...", "..."]}`,
      },
      {
        role: "user",
        content: `Scene description: ${description}

Target platform: ${platform}
Post goal: ${goal}
Vibe: ${vibe}`,
      },
    ],
    max_tokens: 1000,
  });

  const raw = response.choices[0]?.message?.content ?? "";

  try {
    const parsed = JSON.parse(raw);
    return {
      copy: parsed.copy ?? raw,
      musicPrompt: parsed.musicPrompt ?? `${vibe} background music for a social media promo video, polished and energetic`,
      videoOverlays: Array.isArray(parsed.videoOverlays) ? parsed.videoOverlays.slice(0, 3) : ["The Moment", "The Vision", "#MakeItReal"],
    };
  } catch {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      const parsed = JSON.parse(match[1].trim());
      return {
        copy: parsed.copy ?? raw,
        musicPrompt: parsed.musicPrompt ?? `${vibe} background music for a social media promo video, polished and energetic`,
        videoOverlays: Array.isArray(parsed.videoOverlays) ? parsed.videoOverlays.slice(0, 3) : ["The Moment", "The Vision", "#MakeItReal"],
      };
    }
    return {
      copy: raw,
      musicPrompt: `${vibe} background music for a social media promo video, polished and energetic`,
      videoOverlays: ["The Moment", "The Vision", "#MakeItReal"],
    };
  }
}

// --- Audio: Generate music via Stable Audio on Gradient (async invoke) ---

const ASYNC_BASE = `${GRADIENT_BASE_URL}/async-invoke`;

async function asyncInvoke(modelId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const headers = {
    Authorization: `Bearer ${API_KEY()}`,
    "Content-Type": "application/json",
  };

  // Step 1: Submit async job
  const submitRes = await fetch(ASYNC_BASE, {
    method: "POST",
    headers,
    body: JSON.stringify({ model_id: modelId, input }),
  });

  if (!submitRes.ok) {
    throw new Error(`Async invoke submit failed (${modelId}): ${submitRes.status} ${await submitRes.text()}`);
  }

  const { request_id } = (await submitRes.json()) as { request_id: string };

  // Step 2: Poll until completed (2s interval, 180s timeout)
  const deadline = Date.now() + 180_000;
  let completed = false;
  let pollErrors = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));

    try {
      const statusRes = await fetch(`${ASYNC_BASE}/${request_id}/status`, { headers });
      if (!statusRes.ok) {
        pollErrors++;
        if (pollErrors > 5) throw new Error(`Status poll failed repeatedly (${modelId}): ${statusRes.status}`);
        continue;
      }
      const statusData = (await statusRes.json()) as { status: string };
      pollErrors = 0; // reset on success

      if (statusData.status === "COMPLETED") { completed = true; break; }
      if (statusData.status !== "QUEUED" && statusData.status !== "IN_PROGRESS") {
        throw new Error(`Async job failed (${modelId}): ${statusData.status}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("Async job failed")) throw err;
      pollErrors++;
      if (pollErrors > 5) throw err;
      console.warn(`Poll error (${pollErrors}/5) for ${modelId}:`, err);
    }
  }

  if (!completed) {
    throw new Error(`Async job timed out (${modelId}) after 180s — request_id: ${request_id}`);
  }

  // Step 3: Retrieve result
  const resultRes = await fetch(`${ASYNC_BASE}/${request_id}`, { headers });
  if (!resultRes.ok) {
    throw new Error(`Async result fetch failed (${modelId}): ${resultRes.status}`);
  }

  return resultRes.json();
}

// --- Audio: Generate music via MusicGen on GPU Droplet ---

const GPU_SERVER_URL = `http://${process.env.DIGITAL_OCEAN_GPU_DROPLET_IP ?? "159.203.31.93"}:8000`;

export async function generateMusic(musicPrompt: string, durationSeconds: number = 12, retries = 1): Promise<Buffer> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${GPU_SERVER_URL}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: musicPrompt,
          duration_seconds: durationSeconds,
        }),
      });

      if (!res.ok) {
        throw new Error(`MusicGen server error: ${res.status} ${await res.text()}`);
      }

      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        console.warn(`Music generation attempt ${attempt + 1} failed, retrying:`, lastError.message);
      }
    }
  }
  throw lastError!;
}

// --- Image: Generate stylized promo frames via Flux on Gradient ---

export async function generatePromoFrames(params: {
  description: string;
  vibe: string;
  goal: string;
}): Promise<Buffer[]> {
  const { description, vibe, goal } = params;

  // Frame 1: stylized version of the actual scene (stays grounded in input)
  // Frame 2: abstract/energetic interpretation (creative freedom)
  const framePrompts = [
    `Stylized cinematic still of this exact scene: ${description}. Rendered in a ${vibe} visual style with dramatic lighting, color grading, and lens flare. Professional social media ad quality, 16:9, 4K`,
    `Abstract creative visual representing the energy of: ${goal}. ${vibe} mood, bold geometric shapes, dynamic motion blur, neon accents, modern tech aesthetic, premium brand feel, 16:9, 4K`,
  ];

  // Generate all frames in parallel
  const framePromises = framePrompts.map(async (prompt) => {
    const result = await asyncInvoke("fal-ai/flux/schnell", {
      prompt,
      image_size: "landscape_16_9",
      num_images: 1,
    });

    const output = result?.output as Record<string, unknown> | undefined;
    const images = output?.images as Array<Record<string, string>> | undefined;
    const imageUrl = images?.[0]?.url;

    if (!imageUrl) throw new Error("No image URL in flux result");

    const res = await fetch(imageUrl);
    return Buffer.from(await res.arrayBuffer());
  });

  return Promise.all(framePromises);
}

