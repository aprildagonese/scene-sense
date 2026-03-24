import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

/** Generate a transparent PNG with centered text using sharp + SVG */
async function renderTextOverlay(
  text: string,
  outputPath: string,
  opts?: { fontSize?: number; width?: number; height?: number; yOffset?: number; subtext?: string; subtextSize?: number }
): Promise<void> {
  const width = opts?.width ?? 1920;
  const height = opts?.height ?? 1080;
  const fontSize = opts?.fontSize ?? 64;
  const yOffset = opts?.yOffset ?? 0;
  const yPos = height * 0.75 + yOffset; // lower quarter by default

  // Escape XML entities
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  let subtextSvg = "";
  if (opts?.subtext) {
    const subEscaped = opts.subtext
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const subSize = opts?.subtextSize ?? 32;
    subtextSvg = `<text x="${width / 2}" y="${yPos + fontSize * 0.8}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${subSize}" font-weight="400" fill="white" text-anchor="middle" filter="url(#shadow)">${subEscaped}</text>`;
  }

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="black" flood-opacity="0.8"/>
      </filter>
    </defs>
    <text x="${width / 2}" y="${yPos}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="white" text-anchor="middle" filter="url(#shadow)">${escaped}</text>
    ${subtextSvg}
  </svg>`;

  await sharp(Buffer.from(svg), { density: 72 })
    .ensureAlpha()
    .png()
    .toFile(outputPath);
}

/** Generate a segment from a still image with Ken Burns + optional text overlay PNG */
async function generateImageSegment(
  imagePath: string,
  duration: number,
  outputPath: string,
  opts?: { overlayPath?: string; darken?: boolean; zoomDirection?: "in" | "out" }
): Promise<void> {
  const zoom = opts?.zoomDirection ?? "in";
  const zoomExpr = zoom === "in"
    ? "min(zoom+0.0008,1.15)"
    : "if(eq(on,1),1.15,max(zoom-0.0008,1.0))";
  const fps = 30;
  const totalFrames = duration * fps;

  let filter = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1920x1080:fps=${fps}`;

  if (opts?.darken) {
    filter += `,drawbox=x=0:y=0:w=iw:h=ih:color=black@0.5:t=fill`;
  }

  filter += `[base]`;

  const inputs = ["-loop", "1", "-t", String(duration), "-i", imagePath];

  if (opts?.overlayPath) {
    inputs.push("-i", opts.overlayPath);
    filter += `;[base][1:v]overlay=0:0[outv]`;
  } else {
    filter += `;[base]null[outv]`;
  }

  await execFileAsync("ffmpeg", [
    "-y",
    ...inputs,
    "-filter_complex", filter,
    "-map", "[outv]",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-t", String(duration),
    "-movflags", "+faststart",
    outputPath,
  ], { timeout: 30_000 });
}

/** Generate a segment from an existing video (SVD output) — scale, pad, add text overlay */
async function generateVideoSegment(
  videoPath: string,
  outputPath: string,
  opts?: { overlayPath?: string }
): Promise<void> {
  let filter = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,fps=30[base]`;

  const inputs = ["-i", videoPath];

  if (opts?.overlayPath) {
    inputs.push("-i", opts.overlayPath);
    filter += `;[base][1:v]overlay=0:0[outv]`;
  } else {
    filter += `;[base]null[outv]`;
  }

  await execFileAsync("ffmpeg", [
    "-y",
    ...inputs,
    "-filter_complex", filter,
    "-map", "[outv]",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-an",
    "-movflags", "+faststart",
    outputPath,
  ], { timeout: 30_000 });
}

/** Generate a solid color segment with text overlay PNG */
async function generateColorSegment(
  color: string,
  duration: number,
  outputPath: string,
  opts?: { overlayPath?: string }
): Promise<void> {
  const fps = 30;

  const inputs = [
    "-f", "lavfi", "-i", `color=c=${color}:s=1920x1080:d=${duration}:r=${fps}`,
  ];

  let filter = `[0:v]null[base]`;

  if (opts?.overlayPath) {
    inputs.push("-i", opts.overlayPath);
    filter += `;[base][1:v]overlay=0:0[outv]`;
  } else {
    filter += `;[base]null[outv]`;
  }

  await execFileAsync("ffmpeg", [
    "-y",
    ...inputs,
    "-filter_complex", filter,
    "-map", "[outv]",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-t", String(duration),
    "-movflags", "+faststart",
    outputPath,
  ], { timeout: 15_000 });
}

/** Concatenate segment videos + optional audio into final output */
async function concatSegments(
  segmentPaths: string[],
  audioPath: string | null,
  outputPath: string
): Promise<void> {
  const listPath = outputPath.replace(/\.mp4$/, "-concat.txt");
  const listContent = segmentPaths.map(p => `file '${p}'`).join("\n");
  await writeFile(listPath, listContent);

  const args = [
    "-y",
    "-f", "concat", "-safe", "0", "-i", listPath,
  ];

  if (audioPath) {
    args.push("-i", audioPath);
    args.push(
      "-c:v", "copy",
      "-c:a", "aac", "-b:a", "192k",
      "-map", "0:v:0", "-map", "1:a:0",
      "-shortest",
    );
  } else {
    args.push("-c:v", "copy");
  }

  args.push("-movflags", "+faststart", outputPath);

  await execFileAsync("ffmpeg", args, { timeout: 30_000 });
}

// --- Main promo video composition ---

export interface PromoVideoParams {
  inputImagePath: string;
  svdVideoPath: string | null;
  fluxFramePaths: string[];
  audioPath: string | null;
  overlayTexts: string[];
  workDir: string;
  outputPath: string;
}

export async function composePromoVideo(params: PromoVideoParams): Promise<void> {
  const { inputImagePath, svdVideoPath, fluxFramePaths, audioPath, overlayTexts, workDir, outputPath } = params;

  const headline = overlayTexts[0] ?? "The Moment";
  const keyPoint = overlayTexts[1] ?? "The Vision";
  const cta = overlayTexts[2] ?? "#MakeItReal";

  // Pre-render all text overlays as PNGs (parallel)
  const overlayDir = path.join(workDir, "overlays");
  const { mkdir } = await import("fs/promises");
  await mkdir(overlayDir, { recursive: true });

  const headlineOverlay = path.join(overlayDir, "headline.png");
  const keyPointOverlay = path.join(overlayDir, "keypoint.png");
  const ctaOverlay = path.join(overlayDir, "cta.png");
  const ctaDarkOverlay = path.join(overlayDir, "cta-dark.png");
  const brandOverlay = path.join(overlayDir, "brand.png");

  await Promise.all([
    renderTextOverlay(headline, headlineOverlay, { fontSize: 72 }),
    renderTextOverlay(keyPoint, keyPointOverlay, { fontSize: 56 }),
    renderTextOverlay(cta, ctaOverlay, { fontSize: 56 }),
    renderTextOverlay(cta, ctaDarkOverlay, { fontSize: 64, yOffset: -270 }),
    renderTextOverlay("Made with Scene Sense", brandOverlay, {
      fontSize: 48, yOffset: -270, subtext: "Powered by DigitalOcean", subtextSize: 32
    }),
  ]);

  const segmentPaths: string[] = [];

  // --- Segment 1: Hero — original captured image (3s, no text) ---
  const seg1 = path.join(workDir, "seg1-hero.mp4");
  await generateImageSegment(inputImagePath, 3, seg1, { zoomDirection: "in" });
  segmentPaths.push(seg1);

  // --- Segment 2: AI Animation — SVD video with headline, or Ken Burns fallback ---
  const seg2 = path.join(workDir, "seg2-animation.mp4");
  if (svdVideoPath) {
    await generateVideoSegment(svdVideoPath, seg2, { overlayPath: headlineOverlay });
  } else {
    const fallbackImage = fluxFramePaths[0] ?? inputImagePath;
    await generateImageSegment(fallbackImage, 3.5, seg2, {
      overlayPath: headlineOverlay,
      zoomDirection: "out",
    });
  }
  segmentPaths.push(seg2);

  // --- Segment 3a: Flux frame 1 with key point (2s) ---
  if (fluxFramePaths[0]) {
    const seg3a = path.join(workDir, "seg3a-visual.mp4");
    await generateImageSegment(fluxFramePaths[0], 2, seg3a, {
      overlayPath: keyPointOverlay,
      zoomDirection: "out",
    });
    segmentPaths.push(seg3a);
  }

  // --- Segment 3b: Flux frame 2 with CTA (2s) ---
  if (fluxFramePaths[1]) {
    const seg3b = path.join(workDir, "seg3b-visual.mp4");
    await generateImageSegment(fluxFramePaths[1], 2, seg3b, {
      overlayPath: ctaOverlay,
      zoomDirection: "in",
    });
    segmentPaths.push(seg3b);
  }

  // --- Segment 4: CTA — original image darkened (2s) ---
  const seg4 = path.join(workDir, "seg4-cta.mp4");
  await generateImageSegment(inputImagePath, 2, seg4, {
    darken: true,
    overlayPath: ctaDarkOverlay,
    zoomDirection: "out",
  });
  segmentPaths.push(seg4);

  // --- Segment 5: Branding outro (1.5s) ---
  const seg5 = path.join(workDir, "seg5-brand.mp4");
  await generateColorSegment("0x0a0a0a", 1.5, seg5, { overlayPath: brandOverlay });
  segmentPaths.push(seg5);

  // --- Final: Concatenate all segments + audio ---
  await concatSegments(segmentPaths, audioPath, outputPath);
}

// --- Legacy helpers ---

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
