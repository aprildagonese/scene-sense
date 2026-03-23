import { randomUUID } from "crypto";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";
import { analyzeImage, generateCopyAndMusicPrompt, generateMusic, generateVideoFromImage, generatePromoFrames } from "@/lib/gradient";
import { framesToPromoVideo, videoWithNewAudio, extractFrame } from "@/lib/ffmpeg";
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

        let imageBuffer: Buffer;
        if (mediaType === "video") {
          const framePath = path.join(workDir, "frame.jpg");
          await extractFrame(inputPath, framePath);
          imageBuffer = await readFile(framePath);
        } else {
          imageBuffer = buffer;
        }
        const imageBase64 = imageBuffer.toString("base64");

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

        // --- Step 3: Music + Video generation in parallel ---
        send("step", { step: "audio", status: "started", label: "Generating music..." });
        send("step", { step: "frames", status: "started", label: "Creating promo visuals..." });

        // Run music and video in parallel, reporting progress independently
        let useGpuVideo = true;
        let musicBuffer: Buffer | null = null;
        let videoOrFrames: Buffer | Buffer[] | null = null;
        const audioPath = path.join(workDir, "music.wav");

        const musicPromise = generateMusic(musicPrompt).then(async (buf) => {
          musicBuffer = buf;
          await writeFile(audioPath, buf);
          send("step", { step: "audio", status: "completed" });
        }).catch((err) => {
          console.warn("Music generation failed, video will have no audio:", err.message);
          send("step", { step: "audio", status: "completed" });
        });

        const videoPromise = generateVideoFromImage(imageBuffer)
          .catch((err) => {
            console.warn("GPU video generation failed, falling back to image frames:", err.message);
            useGpuVideo = false;
            return generatePromoFrames({ description, vibe, goal });
          })
          .then((result) => {
            videoOrFrames = result;
            send("step", { step: "frames", status: "completed" });
          });

        await Promise.all([musicPromise, videoPromise]);

        // --- Step 4: Video composition ---
        send("step", { step: "video", status: "started", label: "Compositing video..." });

        const outputPath = path.join(workDir, "output.mp4");

        const hasAudio = musicBuffer !== null;

        if (useGpuVideo) {
          const gpuVideoPath = path.join(workDir, "gpu-video.mp4");
          await writeFile(gpuVideoPath, videoOrFrames as Buffer);
          if (hasAudio) {
            await videoWithNewAudio(gpuVideoPath, audioPath, outputPath);
          } else {
            // No audio — just copy the GPU video as-is
            await writeFile(outputPath, videoOrFrames as Buffer);
          }
        } else {
          const frames = videoOrFrames as Buffer[];
          const framePaths: string[] = [];
          for (let i = 0; i < frames.length; i++) {
            const fp = path.join(workDir, `promo-frame-${i}.png`);
            await writeFile(fp, frames[i]);
            framePaths.push(fp);
          }
          if (hasAudio) {
            await framesToPromoVideo(framePaths, audioPath, outputPath);
          } else {
            // No audio — create silent video from frames
            await framesToPromoVideo(framePaths, null, outputPath);
          }
        }

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
