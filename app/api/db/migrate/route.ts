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

    return NextResponse.json({ success: true, message: "Migration complete" });
  } catch (error) {
    console.error("Migration failed:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
