import { randomUUID } from "crypto";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";
import { analyzeImage, generateCopyAndMusicPrompt, generateMusic, generateVideoFromImage, generatePromoFrames } from "@/lib/gradient";
import { composePromoVideo, extractFrame } from "@/lib/ffmpeg";
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
        send("step", { step: "vision", status: "started" });

        let imageBuffer: Buffer;
        let imagePath: string;
        if (mediaType === "video") {
          const framePath = path.join(workDir, "frame.jpg");
          await extractFrame(inputPath, framePath);
          imageBuffer = await readFile(framePath);
          imagePath = framePath;
        } else {
          imageBuffer = buffer;
          imagePath = inputPath;
        }
        const imageBase64 = imageBuffer.toString("base64");

        const description = await analyzeImage(imageBase64);
        send("step", { step: "vision", status: "completed", description });

        // --- Step 2: Copy + music prompt + video overlays ---
        send("step", { step: "copy", status: "started" });

        const { copy, musicPrompt, videoOverlays } = await generateCopyAndMusicPrompt({
          description,
          platform,
          goal,
          vibe,
        });
        send("step", { step: "copy", status: "completed", copy, musicPrompt });

        // --- Step 3: Music + SVD + Flux frames — all in parallel ---
        send("step", { step: "audio", status: "started" });
        send("step", { step: "frames", status: "started" });

        let musicBuffer: Buffer | null = null;
        let svdVideoBuffer: Buffer | null = null;
        let fluxFrameBuffers: Buffer[] = [];
        const audioPath = path.join(workDir, "music.wav");

        const musicPromise = generateMusic(musicPrompt).then(async (buf) => {
          musicBuffer = buf;
          await writeFile(audioPath, buf);
          send("step", { step: "audio", status: "completed" });
        }).catch((err) => {
          console.warn("Music generation failed:", err.message);
          send("step", { step: "audio", status: "completed" });
        });

        const svdPromise = generateVideoFromImage(imageBuffer).then((buf) => {
          svdVideoBuffer = buf;
        }).catch((err) => {
          console.warn("GPU video generation failed, will use Ken Burns fallback:", err.message);
        });

        const fluxPromise = generatePromoFrames({ description, vibe, goal }).then((buffers) => {
          fluxFrameBuffers = buffers;
        }).catch((err) => {
          console.warn("Flux frame generation failed:", err.message);
        });

        await Promise.all([musicPromise, svdPromise, fluxPromise]);
        send("step", { step: "frames", status: "completed" });

        // --- Step 4: Compose promo video ---
        send("step", { step: "video", status: "started" });

        // Write assets to disk
        let svdVideoPath: string | null = null;
        if (svdVideoBuffer) {
          svdVideoPath = path.join(workDir, "svd-video.mp4");
          await writeFile(svdVideoPath, svdVideoBuffer);
        }

        const fluxFramePaths: string[] = [];
        for (let i = 0; i < fluxFrameBuffers.length; i++) {
          const fp = path.join(workDir, `flux-frame-${i}.png`);
          await writeFile(fp, fluxFrameBuffers[i]);
          fluxFramePaths.push(fp);
        }

        const outputPath = path.join(workDir, "output.mp4");

        await composePromoVideo({
          inputImagePath: imagePath,
          svdVideoPath,
          fluxFramePaths,
          audioPath: musicBuffer ? audioPath : null,
          overlayTexts: videoOverlays,
          workDir,
          outputPath,
        });

        send("step", { step: "video", status: "completed" });

        // --- Step 5: Save to DB ---
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
