"use client";

import { useEffect, useRef } from "react";
import QRCodeLib from "qrcode";

interface QRCodeProps {
  url?: string;
  size?: number;
  darkOnLight?: boolean;
  label?: string;
}

export default function QRCode({
  url = process.env.NEXT_PUBLIC_LINKEDIN_PROFILE_URL ?? "https://www.linkedin.com/in/aprildagonese/",
  size = 160,
  darkOnLight = false,
  label = "Connect with me on LinkedIn",
}: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCodeLib.toCanvas(canvasRef.current, url, {
        width: size,
        margin: 2,
        color: darkOnLight
          ? { dark: "#000000FF", light: "#FFFFFFFF" }
          : { dark: "#ffffffFF", light: "#00000000" },
      });
    }
  }, [url, size, darkOnLight]);

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={canvasRef} />
      {label && <p className="text-xs text-gray-500">{label}</p>}
    </div>
  );
}
