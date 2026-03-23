import { NextRequest, NextResponse } from "next/server";
import { readFile, access } from "fs/promises";
import path from "path";

const CONTENT_TYPES: Record<string, string> = {
  video: "video/mp4",
  audio: "audio/mpeg",
  input: "application/octet-stream",
};

const FILE_NAMES: Record<string, string> = {
  video: "output.mp4",
  audio: "music.mp3",
  input: "input.jpg",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const type = req.nextUrl.searchParams.get("type") ?? "video";
  const workDir = path.join("/tmp", `scene-sense-${id}`);
  const fileName = FILE_NAMES[type] ?? "output.mp4";
  const filePath = path.join(workDir, fileName);

  try {
    await access(filePath);
    const data = await readFile(filePath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": CONTENT_TYPES[type] ?? "application/octet-stream",
        "Content-Length": data.byteLength.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }
}
