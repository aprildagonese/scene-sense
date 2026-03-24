import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
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

  // Exchange code for tokens
  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: "http://localhost:3000/api/linkedin/callback",
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
  const expiresIn = tokens.expires_in;

  // Update .env file with the real tokens
  try {
    const envPath = path.join(process.cwd(), ".env");
    const { readFile } = await import("fs/promises");
    let envContent = await readFile(envPath, "utf-8");
    envContent = envContent.replace(/LINKEDIN_ACCESS_TOKEN=.*/, `LINKEDIN_ACCESS_TOKEN=${accessToken}`);
    envContent = envContent.replace(/LINKEDIN_REFRESH_TOKEN=.*/, `LINKEDIN_REFRESH_TOKEN=${refreshToken}`);
    await writeFile(envPath, envContent);
  } catch {
    // Non-fatal — tokens are shown on screen as fallback
  }

  // Also set in process.env for immediate use (no restart needed)
  process.env.LINKEDIN_ACCESS_TOKEN = accessToken;
  process.env.LINKEDIN_REFRESH_TOKEN = refreshToken;

  return new NextResponse(
    `<html><body style="background:#0a0a0a;color:white;font-family:system-ui;padding:40px;max-width:600px">
      <h1 style="color:#4ade80">LinkedIn Connected!</h1>
      <p>Tokens have been saved to your .env file and are active immediately.</p>
      <p style="color:#9ca3af">Access token expires in ${Math.round(expiresIn / 86400)} days.</p>
      ${refreshToken ? `<p style="color:#9ca3af">Refresh token also saved.</p>` : `<p style="color:#fbbf24">No refresh token returned — you may need to re-authorize later.</p>`}
      <br>
      <a href="/" style="color:#60a5fa;text-decoration:underline">Back to Scene Sense</a>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
