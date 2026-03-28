import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { query } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: { hd: "digitalocean.com", prompt: "select_account" },
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ profile }) {
      // Only allow @digitalocean.com emails
      return profile?.email?.endsWith("@digitalocean.com") ?? false;
    },
    async jwt({ token, profile, trigger }) {
      if (trigger === "signIn" && profile?.email) {
        // Upsert user in DB
        const result = await query(
          `INSERT INTO users (email, name, image)
           VALUES ($1, $2, $3)
           ON CONFLICT (email) DO UPDATE SET name = $2, image = $3
           RETURNING id`,
          [profile.email, profile.name ?? null, profile.picture ?? null]
        );
        token.userId = result.rows[0].id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        (session as any).userId = token.userId;
      }
      return session;
    },
  },
});
