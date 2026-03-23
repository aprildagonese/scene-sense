"use client";

import { useEffect, useRef } from "react";
import QRCodeLib from "qrcode";

interface QRCodeProps {
  url?: string;
  size?: number;
}

export default function QRCode({
  url = process.env.NEXT_PUBLIC_LINKEDIN_PROFILE_URL ?? "https://www.linkedin.com/in/aprildag",
  size = 160,
}: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCodeLib.toCanvas(canvasRef.current, url, {
        width: size,
        margin: 2,
        color: { dark: "#ffffffFF", light: "#00000000" },
      });
    }
  }, [url, size]);

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={canvasRef} />
      <p className="text-xs text-gray-500">Connect on LinkedIn</p>
    </div>
  );
}
