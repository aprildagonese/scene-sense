import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";
import { analyzeImages, generateCopyAndMusicPrompt, generateMusic } from "@/lib/gradient";
import { composePromoVideo, calculateVideoDuration } from "@/lib/ffmpeg";
import { query } from "@/lib/db";
import { getRequiredUser } from "@/lib/session";
import { decrypt } from "@/lib/crypto";

export const maxDuration = 120;

async function getUserApiKey(userId: number): Promise<string | undefined> {
  const result = await query(
    `SELECT do_api_key_encrypted FROM user_credentials WHERE user_id = $1`,
    [userId]
  );
  const encrypted = result.rows[0]?.do_api_key_encrypted;
  if (encrypted) {
    try { return decrypt(encrypted); } catch { return undefined; }
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  // Auth + parse form data BEFORE creating the stream
  // (request body can't be read inside ReadableStream.start on some runtimes)
  let user, apiKey, formData;
  try {
    user = await getRequiredUser();
    apiKey = await getUserApiKey(user.userId);
    formData = await req.formData();
  } catch (err) {
    // Return a proper SSE error if auth/setup fails
    const encoder = new TextEncoder();
    const errStream = new ReadableStream({
      start(controller) {
        const msg = err instanceof Error ? err.message : "Setup failed";
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`));
        controller.close();
      },
    });
    return new Response(errStream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  }

  if (!apiKey) {
    const encoder = new TextEncoder();
    const errStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: "No DigitalOcean API key configured — go to Settings to add yours" })}\n\n`));
        controller.close();
      },
    });
    return new Response(errStream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const goal = formData.get("goal") as string;
        const platform = formData.get("platform") as string;
        const vibe = formData.get("vibe") as string;
        const imageCount = parseInt(formData.get("imageCount") as string, 10) || 0;

        if (imageCount === 0 || !goal || !platform || !vibe) {
          send("error", { message: "Missing required fields" });
          controller.close();
          return;
        }

        // Create working directory
        const jobId = randomUUID();
        const workDir = path.join("/tmp", `scene-sense-${jobId}`);
        await mkdir(workDir, { recursive: true });

        // Save all uploaded images
        const imagePaths: string[] = [];
        for (let i = 0; i < imageCount; i++) {
          const file = formData.get(`image_${i}`) as File | null;
          if (!file) continue;
          const imgPath = path.join(workDir, `input-${i}.jpg`);
          const buffer = Buffer.from(await file.arrayBuffer());
          await writeFile(imgPath, buffer);
          imagePaths.push(imgPath);
        }

        if (imagePaths.length === 0) {
          send("error", { message: "No valid images received" });
          controller.close();
          return;
        }

        // --- Step 1: Vision analysis (analyze all images, pick optimal order) ---
        send("step", { step: "vision", status: "started" });

        const { readFile } = await import("fs/promises");
        const imageBuffers = await Promise.all(imagePaths.map(p => readFile(p)));
        const base64Images = imageBuffers.map(buf => buf.toString("base64"));

        const { description, order } = await analyzeImages(base64Images, apiKey);

        // Reorder imagePaths based on AI-selected order
        const orderedPaths = order
          .map(idx => imagePaths[idx - 1])  // 1-indexed to 0-indexed
          .filter(Boolean);
        // Fall back to original order if AI returned bad indices
        const finalImagePaths = orderedPaths.length > 0 ? orderedPaths : imagePaths;

        send("step", { step: "vision", status: "completed", description });

        // --- Step 2: Copy + music prompt + video overlays ---
        send("step", { step: "copy", status: "started" });

        const { copy, musicPrompt, videoOverlays } = await generateCopyAndMusicPrompt({
          description,
          platform,
          goal,
          vibe,
          apiKey,
        });
        send("step", { step: "copy", status: "completed", copy, musicPrompt });

        // --- Step 3: Generate music (duration matched to video) ---
        send("step", { step: "audio", status: "started" });

        const videoDuration = calculateVideoDuration(finalImagePaths.length);
        let musicBuffer: Buffer | null = null;
        const audioPath = path.join(workDir, "music.wav");

        try {
          musicBuffer = await generateMusic(musicPrompt, videoDuration, 2);
          await writeFile(audioPath, musicBuffer);
          send("step", { step: "audio", status: "completed" });
        } catch (err) {
          console.warn("Music generation failed after retries:", (err as Error).message);
          send("step", { step: "audio", status: "completed", warning: "Music unavailable — video will be silent" });
        }

        // --- Step 4: Compose promo video from images ---
        send("step", { step: "video", status: "started" });

        const outputPath = path.join(workDir, "output.mp4");

        await composePromoVideo({
          imagePaths: finalImagePaths,
          audioPath: musicBuffer ? audioPath : null,
          overlayTexts: videoOverlays,
          workDir,
          outputPath,
        });

        send("step", { step: "video", status: "completed" });

        // --- Step 5: Save to DB ---
        const result = await query(
          `INSERT INTO posts (platform, goal, vibe, description, copy, narration, video_url, media_url, user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, created_at`,
          [platform, goal, vibe, description, copy, musicPrompt, `/api/media/${jobId}?type=video`, `/api/media/${jobId}?type=input`, user.userId]
        );

        const post = result.rows[0];

        await writeFile(
          path.join(workDir, "meta.json"),
          JSON.stringify({ postId: post.id, jobId })
        );

        send("complete", {
          id: post.id,
          createdAt: post.created_at,
          description,
          copy,
          musicPrompt,
          videoOverlays,
          videoUrl: `/api/media/${jobId}?type=video`,
          audioUrl: `/api/media/${jobId}?type=audio`,
        });
      } catch (error) {
        console.error("Generate pipeline error:", error);
        send("error", {
          message: error instanceof Error ? error.message : "Pipeline failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
