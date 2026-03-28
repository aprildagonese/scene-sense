import { query } from "@/lib/db";
import { NextResponse } from "next/server";
import { getRequiredUser } from "@/lib/session";

export async function GET() {
  try {
    const user = await getRequiredUser();
    const result = await query(
      "SELECT * FROM posts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [user.userId]
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
