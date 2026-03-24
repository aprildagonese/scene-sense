"use client";

import { useRouter, usePathname } from "next/navigation";

export default function ResetButton() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <button
      onClick={() => {
        if (pathname === "/") {
          // Already on home — dispatch reset event to clear state
          window.dispatchEvent(new CustomEvent("scene-sense-reset"));
        } else {
          // Navigate home first, then reset
          router.push("/");
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("scene-sense-reset"));
          }, 100);
        }
      }}
      className="text-lg font-bold tracking-tight cursor-pointer"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <span
        className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent inline-block hover:scale-105 hover:brightness-125 transition-transform duration-150"
      >
        Scene Sense
      </span>
    </button>
  );
}
