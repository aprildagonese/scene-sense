import { NextRequest, NextResponse } from "next/server";
import { stat, open } from "fs/promises";
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
    const fileStat = await stat(filePath);
    const fileSize = fileStat.size;
    const contentType = CONTENT_TYPES[type] ?? "application/octet-stream";
    const range = req.headers.get("range");

    if (range) {
      // Parse range header
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        return new NextResponse("Invalid range", { status: 416 });
      }

      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const fileHandle = await open(filePath, "r");
      const buffer = Buffer.alloc(chunkSize);
      await fileHandle.read(buffer, 0, chunkSize, start);
      await fileHandle.close();

      return new NextResponse(buffer, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": chunkSize.toString(),
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // No range — serve full file
    const fileHandle = await open(filePath, "r");
    const buffer = Buffer.alloc(fileSize);
    await fileHandle.read(buffer, 0, fileSize, 0);
    await fileHandle.close();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": fileSize.toString(),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }
}
