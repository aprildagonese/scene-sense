import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

/**
 * Generate a transparent PNG text overlay using sharp + SVG.
 * Position options: "lower-third" (default), "center", "upper-third"
 */
async function renderTextOverlay(
  text: string,
  outputPath: string,
  opts?: {
    fontSize?: number;
    width?: number;
    height?: number;
    position?: "lower-third" | "center" | "upper-third";
    subtext?: string;
    subtextSize?: number;
  }
): Promise<void> {
  const width = opts?.width ?? 1920;
  const height = opts?.height ?? 1080;
  const fontSize = opts?.fontSize ?? 64;
  const position = opts?.position ?? "lower-third";

  // Position mapping
  const yPos =
    position === "center" ? height * 0.5
    : position === "upper-third" ? height * 0.3
    : height * 0.72; // lower-third — above typical video controls

  // Word-wrap long text into multiple lines
  const maxCharsPerLine = Math.floor(width / (fontSize * 0.55));
  const lines = wrapText(text, maxCharsPerLine);

  // Escape XML entities
  const escape = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const lineHeight = fontSize * 1.3;
  const totalTextHeight = lines.length * lineHeight;
  const startY = yPos - totalTextHeight / 2 + fontSize * 0.35;

  const textLines = lines.map((line, i) =>
    `<text x="${width / 2}" y="${startY + i * lineHeight}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="white" text-anchor="middle" filter="url(#shadow)">${escape(line)}</text>`
  ).join("\n    ");

  let subtextSvg = "";
  if (opts?.subtext) {
    const subSize = opts?.subtextSize ?? 32;
    subtextSvg = `<text x="${width / 2}" y="${startY + lines.length * lineHeight + subSize * 0.5}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${subSize}" font-weight="400" fill="rgba(255,255,255,0.85)" text-anchor="middle" filter="url(#shadow)">${escape(opts.subtext)}</text>`;
  }

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="black" flood-opacity="0.9"/>
      </filter>
    </defs>
    ${textLines}
    ${subtextSvg}
  </svg>`;

  await sharp(Buffer.from(svg), { density: 72 })
    .ensureAlpha()
    .png()
    .toFile(outputPath);
}

/** Simple word-wrap utility */
function wrapText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && (current + " " + word).length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
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
    filter += `,drawbox=x=0:y=0:w=iw:h=ih:color=black@0.55:t=fill`;
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

/**
 * Normalize audio loudness and apply a fade-out at the end.
 * -18 LUFS = background music level (not overpowering).
 */
async function normalizeAudio(
  inputPath: string,
  outputPath: string,
  videoDuration: number
): Promise<void> {
  // Fade out over last 2.5 seconds
  const fadeStart = Math.max(0, videoDuration - 3);
  await execFileAsync("ffmpeg", [
    "-y",
    "-i", inputPath,
    "-af", `loudnorm=I=-18:TP=-2:LRA=11,afade=t=out:st=${fadeStart}:d=2.5`,
    "-ar", "44100",
    "-c:a", "pcm_s16le",
    outputPath,
  ], { timeout: 15_000 });
}

/** Concatenate segment videos + normalized audio into final output */
async function concatSegments(
  segmentPaths: string[],
  audioPath: string | null,
  workDir: string,
  videoDuration: number,
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
    // Normalize audio and fade out near end of video
    const normalizedAudio = path.join(workDir, "music-normalized.wav");
    await normalizeAudio(audioPath, normalizedAudio, videoDuration);

    args.push("-i", normalizedAudio);
    args.push(
      "-c:v", "copy",
      "-c:a", "aac", "-b:a", "192k",
      "-map", "0:v:0", "-map", "1:a:0",
      // Do NOT use -shortest — let the video run its full length.
      // If the music is shorter than the video, the last segments
      // play in silence (music already has a fade-out, so this is clean).
    );
  } else {
    args.push("-c:v", "copy");
  }

  args.push("-movflags", "+faststart", outputPath);

  await execFileAsync("ffmpeg", args, { timeout: 30_000 });
}

/** Calculate total video duration for a given number of images */
export function calculateVideoDuration(numImages: number): number {
  const contentDuration = Math.max(8, 13 - 4.5);
  const perImageDuration = Math.max(2.5, Math.min(3.5, contentDuration / numImages));
  const heroDuration = Math.min(perImageDuration + 0.5, 3.5);
  const otherImagesDuration = (numImages - 1) * perImageDuration;
  const ctaDuration = 2.5;
  const brandDuration = 2;
  return heroDuration + otherImagesDuration + ctaDuration + brandDuration;
}

// --- Main promo video composition ---

export interface PromoVideoParams {
  imagePaths: string[];
  audioPath: string | null;
  overlayTexts: string[];
  workDir: string;
  outputPath: string;
}

export async function composePromoVideo(params: PromoVideoParams): Promise<void> {
  const { imagePaths, audioPath, overlayTexts, workDir, outputPath } = params;

  const headline = overlayTexts[0] ?? "The Moment";
  const keyPoint = overlayTexts[1] ?? "The Vision";
  const cta = overlayTexts[2] ?? "#MakeItReal";

  // Pre-render text overlays as PNGs
  const overlayDir = path.join(workDir, "overlays");
  const { mkdir } = await import("fs/promises");
  await mkdir(overlayDir, { recursive: true });

  const headlineOverlay = path.join(overlayDir, "headline.png");
  const keyPointOverlay = path.join(overlayDir, "keypoint.png");
  const ctaOverlay = path.join(overlayDir, "cta.png");
  const brandOverlay = path.join(overlayDir, "brand.png");

  await Promise.all([
    renderTextOverlay(headline, headlineOverlay, { fontSize: 72, position: "lower-third" }),
    renderTextOverlay(keyPoint, keyPointOverlay, { fontSize: 56, position: "lower-third" }),
    renderTextOverlay(cta, ctaOverlay, { fontSize: 64, position: "center" }),
    renderTextOverlay("Powered by DigitalOcean", brandOverlay, {
      fontSize: 56, position: "center",
    }),
  ]);

  const segmentPaths: string[] = [];
  const numImages = imagePaths.length;

  // Calculate per-image duration to hit ~12-14s total
  // Reserve 2.5s for CTA + 2s for brand = 4.5s
  const contentDuration = Math.max(8, 13 - 4.5);
  const perImageDuration = Math.max(2.5, Math.min(3.5, contentDuration / numImages));

  // Assign overlays: first image = no overlay (hero), then headline, keypoint, cycle
  const overlayAssignments: (string | null)[] = [
    null,                // Hero — clean, audience recognizes their photo
    headlineOverlay,     // Second image — headline
    keyPointOverlay,     // Third image — key point
  ];

  for (let i = 0; i < numImages; i++) {
    const segPath = path.join(workDir, `seg${i}-img.mp4`);
    const overlay = overlayAssignments[i] ?? null;
    const zoomDir: "in" | "out" = i % 2 === 0 ? "in" : "out";
    // Hero gets slightly longer
    const duration = i === 0 ? Math.min(perImageDuration + 0.5, 3.5) : perImageDuration;

    await generateImageSegment(imagePaths[i], duration, segPath, {
      overlayPath: overlay ?? undefined,
      zoomDirection: zoomDir,
    });
    segmentPaths.push(segPath);
  }

  // --- CTA: first image darkened with CTA text (2.5s) ---
  const segCta = path.join(workDir, "seg-cta.mp4");
  await generateImageSegment(imagePaths[0], 2.5, segCta, {
    darken: true,
    overlayPath: ctaOverlay,
    zoomDirection: "out",
  });
  segmentPaths.push(segCta);

  // --- Brand outro (2s) ---
  const segBrand = path.join(workDir, "seg-brand.mp4");
  await generateColorSegment("0x0a0a0a", 2, segBrand, { overlayPath: brandOverlay });
  segmentPaths.push(segBrand);

  // --- Final: Concatenate all segments + audio ---
  const totalDuration = calculateVideoDuration(imagePaths.length);
  await concatSegments(segmentPaths, audioPath, workDir, totalDuration, outputPath);
}
