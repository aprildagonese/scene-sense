const LINKEDIN_API = "https://api.linkedin.com/v2";

export interface LinkedInTokens {
  accessToken: string;
  refreshToken?: string;
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
    }),
  });

  if (!res.ok) {
    throw new Error(`LinkedIn token refresh failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresIn: data.expires_in ?? 5184000,
  };
}

export async function getAuthorUrn(accessToken: string): Promise<string> {
  const res = await fetch(`${LINKEDIN_API}/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`LinkedIn userinfo failed: ${res.status}`);
  const data = await res.json();
  return `urn:li:person:${data.sub}`;
}

export async function registerVideoUpload(
  authorUrn: string,
  accessToken: string,
): Promise<{ uploadUrl: string; assetUrn: string }> {
  const res = await fetch(
    `${LINKEDIN_API}/assets?action=registerUpload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-video"],
          owner: authorUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
    }
  );

  if (!res.ok) throw new Error(`LinkedIn register upload failed: ${res.status}`);
  const data = await res.json();
  const uploadUrl =
    data.value.uploadMechanism[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ].uploadUrl;
  const assetUrn = data.value.asset;
  return { uploadUrl, assetUrn };
}

export async function uploadVideoToLinkedIn(
  uploadUrl: string,
  videoBuffer: Buffer,
  accessToken: string,
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(videoBuffer),
  });

  if (!res.ok) throw new Error(`LinkedIn video upload failed: ${res.status}`);
}

export async function createVideoPost(params: {
  authorUrn: string;
  copy: string;
  assetUrn: string;
  accessToken: string;
  testMode?: boolean;
}): Promise<string> {
  const visibility = params.testMode ? "CONNECTIONS" : "PUBLIC";
  const res = await fetch(`${LINKEDIN_API}/ugcPosts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: params.authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: params.copy },
          shareMediaCategory: "VIDEO",
          media: [
            {
              status: "READY",
              media: params.assetUrn,
            },
          ],
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": visibility,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LinkedIn post failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  return data.id;
}
