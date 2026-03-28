import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { query } from "@/lib/db";
import { getRequiredUser } from "@/lib/session";
import { decrypt, encrypt } from "@/lib/crypto";
import {
  refreshAccessToken,
  getAuthorUrn,
  registerVideoUpload,
  uploadVideoToLinkedIn,
  createVideoPost,
} from "@/lib/linkedin";

async function getUserLinkedInTokens(userId: number): Promise<{
  accessToken: string;
  refreshToken?: string;
  authorUrn?: string;
}> {
  const result = await query(
    `SELECT linkedin_access_token, linkedin_refresh_token, linkedin_author_urn, linkedin_token_expires
     FROM user_credentials WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row?.linkedin_access_token) {
    throw new Error("LinkedIn not connected — go to Settings to connect your account");
  }

  let accessToken = decrypt(row.linkedin_access_token);
  let refreshTokenVal = row.linkedin_refresh_token ? decrypt(row.linkedin_refresh_token) : undefined;

  // Proactively refresh if token is expired or expiring soon (within 1 day)
  const expiresAt = row.linkedin_token_expires ? new Date(row.linkedin_token_expires) : null;
  if (expiresAt && refreshTokenVal && expiresAt.getTime() < Date.now() + 86400_000) {
    try {
      const refreshed = await refreshAccessToken(refreshTokenVal);
      accessToken = refreshed.accessToken;
      refreshTokenVal = refreshed.refreshToken;
      // Save refreshed tokens
      await query(
        `UPDATE user_credentials SET
          linkedin_access_token = $1,
          linkedin_refresh_token = $2,
          linkedin_token_expires = $3,
          updated_at = NOW()
         WHERE user_id = $4`,
        [
          encrypt(accessToken),
          encrypt(refreshTokenVal),
          new Date(Date.now() + refreshed.expiresIn * 1000),
          userId,
        ]
      );
    } catch {
      // Use existing token if refresh fails
    }
  }

  return { accessToken, refreshToken: refreshTokenVal, authorUrn: row.linkedin_author_urn };
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequiredUser();
    const { postId, copy, testMode } = await req.json();

    // Get the post from DB — verify ownership
    const result = await query("SELECT * FROM posts WHERE id = $1 AND user_id = $2", [postId, user.userId]);
    const post = result.rows[0];
    if (!post) {
      return NextResponse.json({ success: false, error: "Post not found" }, { status: 404 });
    }

    // Get user's LinkedIn tokens
    const tokens = await getUserLinkedInTokens(user.userId);

    // Resolve author URN
    const authorUrn = tokens.authorUrn || await getAuthorUrn(tokens.accessToken);

    // Read the video file
    const jobIdMatch = post.video_url?.match(/\/api\/media\/([^?]+)/);
    if (!jobIdMatch) {
      return NextResponse.json({ success: false, fallback: true });
    }

    const videoPath = `/tmp/scene-sense-${jobIdMatch[1]}/output.mp4`;
    const videoBuffer = await readFile(videoPath);

    // Register upload
    const { uploadUrl, assetUrn } = await registerVideoUpload(authorUrn, tokens.accessToken);

    // Upload video binary
    await uploadVideoToLinkedIn(uploadUrl, Buffer.from(videoBuffer), tokens.accessToken);

    // Wait for LinkedIn to process the video
    await new Promise((r) => setTimeout(r, 3000));

    // Create the post
    const postUrn = await createVideoPost({
      authorUrn,
      copy: copy ?? post.copy,
      assetUrn,
      accessToken: tokens.accessToken,
      testMode: !!testMode,
    });

    // Mark as posted in DB
    await query("UPDATE posts SET posted = true WHERE id = $1", [postId]);

    return NextResponse.json({ success: true, postUrn });
  } catch (error) {
    console.error("LinkedIn post failed:", error);
    return NextResponse.json({ success: false, fallback: true });
  }
}
