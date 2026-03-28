import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { getAuthorUrn } from "@/lib/linkedin";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const stateParam = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return new NextResponse(
      `<html><body style="background:#0a0a0a;color:white;font-family:system-ui;padding:40px">
        <h1>LinkedIn OAuth Failed</h1>
        <p>Error: ${error ?? "No authorization code received"}</p>
        <p>${req.nextUrl.searchParams.get("error_description") ?? ""}</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  // Decode userId from state
  let userId: number;
  try {
    const stateData = JSON.parse(Buffer.from(stateParam ?? "", "base64url").toString());
    userId = stateData.userId;
  } catch {
    return new NextResponse("Invalid state parameter", { status: 400 });
  }

  // Exchange code for tokens
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${baseUrl}/api/linkedin/callback`,
      client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    return new NextResponse(
      `<html><body style="background:#0a0a0a;color:white;font-family:system-ui;padding:40px">
        <h1>Token Exchange Failed</h1>
        <p>Status: ${tokenRes.status}</p>
        <pre style="color:#ff6b6b">${body}</pre>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const tokens = await tokenRes.json();
  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token ?? "";
  const expiresIn = tokens.expires_in ?? 5184000;

  // Get the author URN while we have a fresh token
  let authorUrn = "";
  try {
    authorUrn = await getAuthorUrn(accessToken);
  } catch (e) {
    console.warn("Could not fetch author URN:", e);
  }

  // Encrypt and save to DB
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  await query(
    `INSERT INTO user_credentials (user_id, linkedin_access_token, linkedin_refresh_token, linkedin_token_expires, linkedin_author_urn, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       linkedin_access_token = $2,
       linkedin_refresh_token = $3,
       linkedin_token_expires = $4,
       linkedin_author_urn = $5,
       updated_at = NOW()`,
    [
      userId,
      encrypt(accessToken),
      refreshToken ? encrypt(refreshToken) : null,
      expiresAt,
      authorUrn,
    ]
  );

  // Redirect to settings page
  return NextResponse.redirect(`${baseUrl}/settings?linkedin=connected`);
}
