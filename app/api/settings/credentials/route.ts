import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getRequiredUser } from "@/lib/session";
import { encrypt, decrypt } from "@/lib/crypto";

export async function GET() {
  try {
    const user = await getRequiredUser();
    const result = await query(
      `SELECT do_api_key_encrypted, linkedin_access_token, linkedin_author_urn, linkedin_token_expires
       FROM user_credentials WHERE user_id = $1`,
      [user.userId]
    );
    const row = result.rows[0];

    let doKeyPreview = null;
    if (row?.do_api_key_encrypted) {
      try {
        const key = decrypt(row.do_api_key_encrypted);
        doKeyPreview = `${key.slice(0, 4)}...${key.slice(-4)}`;
      } catch {
        doKeyPreview = "***";
      }
    }

    return NextResponse.json({
      doApiKey: doKeyPreview,
      linkedinConnected: !!row?.linkedin_access_token,
      linkedinAuthorUrn: row?.linkedin_author_urn ?? null,
      linkedinTokenExpires: row?.linkedin_token_expires ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getRequiredUser();
    const { doApiKey } = await req.json();

    if (!doApiKey || typeof doApiKey !== "string") {
      return NextResponse.json({ error: "Invalid API key" }, { status: 400 });
    }

    const encrypted = encrypt(doApiKey.trim());
    await query(
      `INSERT INTO user_credentials (user_id, do_api_key_encrypted, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET do_api_key_encrypted = $2, updated_at = NOW()`,
      [user.userId, encrypted]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await getRequiredUser();
    await query(
      `UPDATE user_credentials SET do_api_key_encrypted = NULL, updated_at = NOW() WHERE user_id = $1`,
      [user.userId]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
