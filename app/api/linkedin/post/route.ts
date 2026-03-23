import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { query } from "@/lib/db";
import {
  refreshAccessToken,
  getAuthorUrn,
  registerVideoUpload,
  uploadVideoToLinkedIn,
  createVideoPost,
} from "@/lib/linkedin";

export async function POST(req: NextRequest) {
  try {
    const { postId, copy } = await req.json();

    // Get the post from DB
    const result = await query("SELECT * FROM posts WHERE id = $1", [postId]);
    const post = result.rows[0];
    if (!post) {
      return NextResponse.json({ success: false, error: "Post not found" }, { status: 404 });
    }

    // Refresh token proactively
    try {
      await refreshAccessToken();
    } catch {
      // Use existing token if refresh fails
    }

    // Get author URN
    const authorUrn = await getAuthorUrn();

    // Read the video file
    // video_url is like /api/media/{jobId}?type=video — extract jobId
    const jobIdMatch = post.video_url?.match(/\/api\/media\/([^?]+)/);
    if (!jobIdMatch) {
      return NextResponse.json({ success: false, fallback: true });
    }

    const videoPath = `/tmp/scene-sense-${jobIdMatch[1]}/output.mp4`;
    const videoBuffer = await readFile(videoPath);

    // Register upload
    const { uploadUrl, assetUrn } = await registerVideoUpload(authorUrn);

    // Upload video binary
    await uploadVideoToLinkedIn(uploadUrl, Buffer.from(videoBuffer));

    // Wait for LinkedIn to process the video
    await new Promise((r) => setTimeout(r, 3000));

    // Create the post
    const postUrn = await createVideoPost({
      authorUrn,
      copy: copy ?? post.copy,
      assetUrn,
    });

    // Mark as posted in DB
    await query("UPDATE posts SET posted = true WHERE id = $1", [postId]);

    return NextResponse.json({ success: true, postUrn });
  } catch (error) {
    console.error("LinkedIn post failed:", error);
    // Silent fallback — return fallback mode, no error to user
    return NextResponse.json({ success: false, fallback: true });
  }
}
