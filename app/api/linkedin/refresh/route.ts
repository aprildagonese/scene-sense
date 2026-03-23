import { NextResponse } from "next/server";
import { refreshAccessToken } from "@/lib/linkedin";

export async function POST() {
  try {
    const token = await refreshAccessToken();
    return NextResponse.json({ success: true, tokenLength: token.length });
  } catch (error) {
    console.error("Token refresh failed:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
