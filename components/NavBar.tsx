"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

interface NavBarProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
}

export default function NavBar({ user }: NavBarProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
      <Link
        href="/"
        className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent"
      >
        Scene Sense
      </Link>
      <div className="flex items-center gap-1">
        <Link
          href="/"
          className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          Create
        </Link>
        <Link
          href="/history"
          className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          History
        </Link>
        {user && (
          <>
            <Link
              href="/settings"
              className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Settings
            </Link>
            <div className="flex items-center gap-2 ml-2 pl-3 border-l border-gray-800">
              {user.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt=""
                  className="w-7 h-7 rounded-full"
                />
              )}
              <span className="text-xs text-gray-400 hidden sm:inline">
                {user.name?.split(" ")[0]}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
