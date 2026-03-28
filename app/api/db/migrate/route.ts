import { query } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS posts (
        id          SERIAL PRIMARY KEY,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        platform    TEXT NOT NULL,
        goal        TEXT NOT NULL,
        vibe        TEXT NOT NULL,
        description TEXT NOT NULL,
        copy        TEXT NOT NULL,
        narration   TEXT,
        audio_url   TEXT,
        video_url   TEXT,
        media_url   TEXT,
        posted      BOOLEAN NOT NULL DEFAULT FALSE
      );
    `);

    // Multi-user tables
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id          SERIAL PRIMARY KEY,
        email       TEXT NOT NULL UNIQUE,
        name        TEXT,
        image       TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS user_credentials (
        user_id                 INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        do_api_key_encrypted    TEXT,
        linkedin_access_token   TEXT,
        linkedin_refresh_token  TEXT,
        linkedin_token_expires  TIMESTAMPTZ,
        linkedin_author_urn     TEXT,
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Add user_id to posts (nullable for existing rows)
    await query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);`);

    return NextResponse.json({ success: true, message: "Migration complete" });
  } catch (error) {
    console.error("Migration failed:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
