import { query } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const result = await query(
      "SELECT * FROM posts ORDER BY created_at DESC LIMIT 50"
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch posts:", error);
    return NextResponse.json(
      { error: "Failed to fetch posts" },
      { status: 500 }
    );
  }
}
