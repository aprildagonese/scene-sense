import { NextResponse } from "next/server";
import { getRequiredUser } from "@/lib/session";
import { query } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/linkedin";

export async function POST() {
  try {
    const user = await getRequiredUser();

    const result = await query(
      `SELECT linkedin_refresh_token FROM user_credentials WHERE user_id = $1`,
      [user.userId]
    );
    const refreshTokenEncrypted = result.rows[0]?.linkedin_refresh_token;
    if (!refreshTokenEncrypted) {
      return NextResponse.json({ success: false, error: "No refresh token" }, { status: 400 });
    }

    const refreshToken = decrypt(refreshTokenEncrypted);
    const refreshed = await refreshAccessToken(refreshToken);

    await query(
      `UPDATE user_credentials SET
        linkedin_access_token = $1,
        linkedin_refresh_token = $2,
        linkedin_token_expires = $3,
        updated_at = NOW()
       WHERE user_id = $4`,
      [
        encrypt(refreshed.accessToken),
        encrypt(refreshed.refreshToken),
        new Date(Date.now() + refreshed.expiresIn * 1000),
        user.userId,
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Token refresh failed:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
