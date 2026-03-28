import { NextRequest, NextResponse } from "next/server";
import { getRequiredUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  const user = await getRequiredUser();

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const redirectUri = `${baseUrl}/api/linkedin/callback`;
  const scope = "openid profile w_member_social";

  // Encode userId in state so callback can save tokens to the right user
  const state = Buffer.from(JSON.stringify({
    userId: user.userId,
    csrf: Math.random().toString(36).substring(7),
  })).toString("base64url");

  const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;

  return NextResponse.redirect(url);
}
