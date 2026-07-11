import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { getObjectRange } from "@/lib/storage";

const CONTENT_TYPES: Record<string, string> = {
  video: "video/mp4",
  audio: "audio/wav",
  input: "image/jpeg",
};

const FILE_NAMES: Record<string, string> = {
  video: "output.mp4",
  audio: "music.wav",
  input: "input.jpg",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const type = req.nextUrl.searchParams.get("type") ?? "video";
  const fileName = FILE_NAMES[type] ?? "output.mp4";
  const contentType = CONTENT_TYPES[type] ?? "application/octet-stream";
  const range = req.headers.get("range");
  const key = `${id}/${fileName}`;

  try {
    const { body, contentLength, contentRange, status } = await getObjectRange(key, range);
    const webStream = Readable.toWeb(body) as unknown as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    };
    if (contentLength) headers["Content-Length"] = contentLength.toString();
    if (contentRange) headers["Content-Range"] = contentRange;

    return new NextResponse(webStream, { status, headers });
  } catch {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }
}
