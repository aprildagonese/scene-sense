import { randomUUID } from "crypto";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";
import { analyzeImage, generateCopyAndMusicPrompt, generateMusic, generatePromoFrames } from "@/lib/gradient";
import { framesToPromoVideo, extractFrame } from "@/lib/ffmpeg";
import { query } from "@/lib/db";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        // Parse multipart form data
        const formData = await req.formData();
        const mediaFile = formData.get("media") as File | null;
        const goal = formData.get("goal") as string;
        const platform = formData.get("platform") as string;
        const vibe = formData.get("vibe") as string;
        const mediaType = formData.get("mediaType") as string;

        if (!mediaFile || !goal || !platform || !vibe) {
          send("error", { message: "Missing required fields" });
          controller.close();
          return;
        }

        // Create working directory
        const jobId = randomUUID();
        const workDir = path.join("/tmp", `scene-sense-${jobId}`);
        await mkdir(workDir, { recursive: true });

        // Save uploaded media
        const ext = mediaType === "video" ? "mp4" : "jpg";
        const inputPath = path.join(workDir, `input.${ext}`);
        const buffer = Buffer.from(await mediaFile.arrayBuffer());
        await writeFile(inputPath, buffer);

        // --- Step 1: Vision analysis ---
        send("step", { step: "vision", status: "started", label: "Analyzing your scene..." });

        let imageBase64: string;
        if (mediaType === "video") {
          const framePath = path.join(workDir, "frame.jpg");
          await extractFrame(inputPath, framePath);
          imageBase64 = (await readFile(framePath)).toString("base64");
        } else {
          imageBase64 = buffer.toString("base64");
        }

        const description = await analyzeImage(imageBase64);
        send("step", { step: "vision", status: "completed", description });

        // --- Step 2: Copy + music prompt generation ---
        send("step", { step: "copy", status: "started", label: "Crafting your post..." });

        const { copy, musicPrompt } = await generateCopyAndMusicPrompt({
          description,
          platform,
          goal,
          vibe,
        });
        send("step", { step: "copy", status: "completed", copy, musicPrompt });

        // --- Step 3 & 4: Music + promo frames in parallel ---
        send("step", { step: "audio", status: "started", label: "Generating music..." });
        send("step", { step: "frames", status: "started", label: "Creating promo visuals..." });

        const [musicBuffer, promoFrames] = await Promise.all([
          generateMusic(musicPrompt),
          generatePromoFrames({ description, vibe, goal }),
        ]);

        // Save music
        const audioPath = path.join(workDir, "music.mp3");
        await writeFile(audioPath, musicBuffer);
        send("step", { step: "audio", status: "completed" });

        // Save promo frames
        const framePaths: string[] = [];
        for (let i = 0; i < promoFrames.length; i++) {
          const fp = path.join(workDir, `promo-frame-${i}.png`);
          await writeFile(fp, promoFrames[i]);
          framePaths.push(fp);
        }
        send("step", { step: "frames", status: "completed" });

        // --- Step 5: Video composition ---
        send("step", { step: "video", status: "started", label: "Compositing video..." });

        const outputPath = path.join(workDir, "output.mp4");
        await framesToPromoVideo(framePaths, audioPath, outputPath);
        send("step", { step: "video", status: "completed" });

        // --- Step 6: Save to DB ---
        const result = await query(
          `INSERT INTO posts (platform, goal, vibe, description, copy, narration, video_url, media_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, created_at`,
          [platform, goal, vibe, description, copy, musicPrompt, `/api/media/${jobId}?type=video`, `/api/media/${jobId}?type=input`]
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
