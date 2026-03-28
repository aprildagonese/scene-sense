import { cookies } from "next/headers";
import { decode } from "next-auth/jwt";

export interface SessionUser {
  userId: number;
  email: string;
  name: string;
}

/**
 * Get the authenticated user or throw.
 * Uses direct JWT decoding to avoid consuming the request body
 * (which breaks FormData parsing in routes like /api/generate).
 */
export async function getRequiredUser(): Promise<SessionUser> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("authjs.session-token")?.value;

  if (!sessionToken) {
    throw new Error("Unauthorized");
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not set");

  const token = await decode({ token: sessionToken, secret, salt: "authjs.session-token" });

  if (!token?.email || !token?.userId) {
    throw new Error("Unauthorized");
  }

  return {
    userId: token.userId as number,
    email: token.email as string,
    name: (token.name as string) ?? "",
  };
}
