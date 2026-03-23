import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Create a promo-style slideshow video from multiple image frames + music.
 * Each frame gets a Ken Burns (zoom/pan) effect and crossfade transitions.
 */
export async function framesToPromoVideo(
  framePaths: string[],
  audioPath: string | null,
  outputPath: string
): Promise<void> {
  const frameDuration = 4; // seconds per frame
  const fadeDuration = 1;  // crossfade duration

  // Build the ffmpeg filter graph for crossfade transitions with Ken Burns
  const inputs: string[] = [];
  const filterParts: string[] = [];

  // Add input flags and scale+zoompan each frame
  for (let i = 0; i < framePaths.length; i++) {
    inputs.push("-loop", "1", "-t", String(frameDuration), "-i", framePaths[i]);

    // Each frame: scale to 1920x1080, apply subtle zoom, set fps
    // Alternate between zoom-in and zoom-out for variety
    const zoomExpr = i % 2 === 0
      ? "min(zoom+0.0008,1.2)"   // slow zoom in
      : "if(eq(on,1),1.2,max(zoom-0.0008,1.0))"; // slow zoom out
    const xExpr = "iw/2-(iw/zoom/2)";
    const yExpr = "ih/2-(ih/zoom/2)";

    filterParts.push(
      `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${frameDuration * 30}:s=1920x1080:fps=30,format=yuv420p[v${i}]`
    );
  }

  // Chain xfade transitions between frames
  if (framePaths.length === 1) {
    filterParts.push(`[v0]null[outv]`);
  } else {
    let prevLabel = "v0";
    for (let i = 1; i < framePaths.length; i++) {
      const outLabel = i === framePaths.length - 1 ? "outv" : `xf${i}`;
      const offset = i * frameDuration - i * fadeDuration;
      filterParts.push(
        `[${prevLabel}][v${i}]xfade=transition=fade:duration=${fadeDuration}:offset=${offset}[${outLabel}]`
      );
      prevLabel = outLabel;
    }
  }

  // Add audio input if available
  if (audioPath) {
    inputs.push("-i", audioPath);
  }

  const filterComplex = filterParts.join("; ");

  const outputArgs = [
    "-map", "[outv]",
    ...(audioPath
      ? ["-map", `${framePaths.length}:a`, "-c:a", "aac", "-b:a", "192k", "-shortest"]
      : []),
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-movflags", "+faststart",
  ];

  await execFileAsync("ffmpeg", [
    "-y",
    ...inputs,
    "-filter_complex", filterComplex,
    ...outputArgs,
    outputPath,
  ], { timeout: 120_000 });
}

/**
 * Create a video from a still image + audio track.
 * Applies a subtle Ken Burns (slow zoom) effect for visual interest.
 */
export async function imageToVideo(
  imagePath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-y",
    "-loop", "1",
    "-i", imagePath,
    "-i", audioPath,
    "-c:v", "libx264",
    "-tune", "stillimage",
    "-c:a", "aac",
    "-b:a", "192k",
    "-pix_fmt", "yuv420p",
    "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.0005,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30",
    "-preset", "ultrafast",
    "-shortest",
    "-movflags", "+faststart",
    outputPath,
  ], { timeout: 60_000 });
}

/**
 * Replace the audio track of an existing video with a new audio file.
 */
export async function videoWithNewAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-y",
    "-i", videoPath,
    "-i", audioPath,
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-shortest",
    "-movflags", "+faststart",
    outputPath,
  ], { timeout: 60_000 });
}

/**
 * Extract a single frame from a video (at 1 second) for vision analysis.
 */
export async function extractFrame(
  videoPath: string,
  outputPath: string
): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-y",
    "-i", videoPath,
    "-ss", "00:00:01",
    "-frames:v", "1",
    "-q:v", "2",
    outputPath,
  ], { timeout: 15_000 });
}
