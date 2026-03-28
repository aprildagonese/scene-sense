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
  // NextAuth uses __Secure- prefix on HTTPS (production), plain name on HTTP (localhost)
  const sessionToken =
    cookieStore.get("__Secure-authjs.session-token")?.value ??
    cookieStore.get("authjs.session-token")?.value;

  if (!sessionToken) {
    throw new Error("Unauthorized");
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not set");

  // Salt must match the cookie name used
  const isSecure = !!cookieStore.get("__Secure-authjs.session-token")?.value;
  const salt = isSecure ? "__Secure-authjs.session-token" : "authjs.session-token";
  const token = await decode({ token: sessionToken, secret, salt });

  if (!token?.email || !token?.userId) {
    throw new Error("Unauthorized");
  }

  return {
    userId: token.userId as number,
    email: token.email as string,
    name: (token.name as string) ?? "",
  };
}
