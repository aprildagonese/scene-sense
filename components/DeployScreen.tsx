"use client";

import QRCode from "./QRCode";

interface DeployScreenProps {
  onClose: () => void;
}

const DEPLOY_URL =
  "https://www.digitalocean.com/deploy?utm_source=sf_events&utm_medium=devadv_lizzie&utm_campaign=deploy_2026";

export default function DeployScreen({ onClose }: DeployScreenProps) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a1a] flex flex-col items-center justify-center gap-4 p-6 overflow-hidden cursor-pointer" onClick={onClose}>
      {/* Title */}
      <div className="text-center">
        <div className="text-6xl sm:text-8xl lg:text-9xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Deploy 2026
        </div>
        <p className="text-2xl sm:text-3xl text-gray-400 mt-2">April 28, 2026</p>
      </div>

      {/* CTA */}
      <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white text-center">
        Register now!
      </h1>
      <p className="text-xl sm:text-2xl text-gray-400">
        Scan to register
      </p>

      {/* QR Code — sized for audience scanning */}
      <QRCode url={DEPLOY_URL} size={280} darkOnLight label="" />

      {/* URL fallback */}
      <p className="text-lg sm:text-xl text-gray-500 font-mono">
        digitalocean.com/deploy
      </p>
    </div>
  );
}
