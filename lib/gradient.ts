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

// --- Vision: Analyze an image using GPT-4o on Gradient ---

export async function analyzeImage(base64Image: string): Promise<string> {
  const dataUrl = base64Image.startsWith("data:")
    ? base64Image
    : `data:image/jpeg;base64,${base64Image}`;

  const response = await getClient().chat.completions.create({
    model: "openai-gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Describe this scene in vivid detail. Focus on the people, their expressions and body language, the environment, the energy of the moment, and any notable objects or context clues. Be specific and evocative — this description will be used to generate social media content.",
          },
          {
            type: "image_url",
            image_url: { url: dataUrl },
          },
        ],
      },
    ],
    max_tokens: 500,
  });

  return response.choices[0]?.message?.content ?? "A scene captured in the moment.";
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
    model: "openai-gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an expert social media strategist and music director. You will be given a scene description, target platform, post goal, and desired vibe. You must produce THREE outputs as valid JSON:

1. "copy" — The post caption/message text optimized for ${platform}. This is what appears as the text accompanying a video post. It should be compelling, on-brand for the platform, and achieve the stated goal. Include relevant hashtags if appropriate for the platform.

2. "musicPrompt" — A detailed text prompt for an AI music generator to create a 10-15 second background music track for a promo-style social media video. Describe the genre, tempo, instruments, mood, and energy level. The music should match the requested vibe and feel like a polished social media ad or highlight reel. Be specific about production style.

3. "videoOverlays" — Exactly 3 ultra-short phrases (3-8 words each) for on-screen text overlays in a promo video. These will be displayed one at a time over dynamic visuals, so they must be punchy and scannable at a glance. First should be an attention-grabbing headline, second a key insight or point, third a call-to-action or hashtag line. Do NOT use special characters like colons or quotes.

Examples of good music prompts:
- "Upbeat electronic pop, 120 BPM, warm synth pads, punchy kick drum, energetic and inspiring, corporate promo feel, building to a crescendo"
- "Lo-fi chill hip hop beat, 85 BPM, mellow piano chords, vinyl crackle, relaxed and warm, perfect for a casual lifestyle brand"
- "Epic cinematic orchestral, 100 BPM, soaring strings, deep brass hits, triumphant and powerful, tech product launch energy"

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
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));

    const statusRes = await fetch(`${ASYNC_BASE}/${request_id}/status`, { headers });
    const statusData = (await statusRes.json()) as { status: string };

    if (statusData.status === "COMPLETED") { completed = true; break; }
    if (statusData.status !== "QUEUED" && statusData.status !== "IN_PROGRESS") {
      throw new Error(`Async job failed (${modelId}): ${statusData.status}`);
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

export async function generateMusic(musicPrompt: string): Promise<Buffer> {
  const result = await asyncInvoke("fal-ai/stable-audio-25/text-to-audio", {
    prompt: musicPrompt,
    seconds_total: 10,
    steps: 50,
  });

  // Extract audio URL from result — structure is output.audio.url
  const output = result?.output as Record<string, unknown> | undefined;
  const audio = output?.audio as Record<string, string> | undefined;
  const audioUrl = audio?.url;

  if (audioUrl) {
    const audioRes = await fetch(audioUrl);
    return Buffer.from(await audioRes.arrayBuffer());
  }

  throw new Error("Could not extract audio from music generation result: " + JSON.stringify(result));
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

// --- Video: Generate video from image via GPU Droplet (SVD) ---

const GPU_SERVER_URL = process.env.GPU_SERVER_URL ?? "http://159.203.31.93:8000";

export async function generateVideoFromImage(imageBuffer: Buffer): Promise<Buffer> {
  const formData = new FormData();
  formData.append("image", new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" }), "input.jpg");
  formData.append("num_frames", "25");
  formData.append("fps", "7");
  formData.append("motion_bucket_id", "127");
  formData.append("noise_aug_strength", "0.02");

  const res = await fetch(`${GPU_SERVER_URL}/generate`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`GPU video generation failed: ${res.status} ${await res.text()}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
