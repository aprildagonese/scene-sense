"use client";

import QRCode from "./QRCode";

interface DeployScreenProps {
  onClose: () => void;
}

const DEPLOY_URL =
  "https://www.digitalocean.com/deploy?utm_source=sf_events&utm_medium=devadv_lizzie&utm_campaign=deploy_2026";

export default function DeployScreen({ onClose }: DeployScreenProps) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a1a] flex flex-col items-center justify-center gap-4 p-6 overflow-hidden">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors z-10"
      >
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Title + date */}
      <div className="text-center">
        <div className="text-5xl sm:text-6xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Deploy 2026
        </div>
        <p className="text-lg text-gray-400 mt-1">April 28, 2026</p>
      </div>

      {/* CTA */}
      <h1 className="text-2xl sm:text-4xl font-bold text-white text-center">
        Register for Deploy 2026!
      </h1>
      <p className="text-base text-gray-400">
        Scan the QR code to register
      </p>

      {/* QR Code */}
      <QRCode url={DEPLOY_URL} size={240} darkOnLight />

      {/* URL fallback */}
      <p className="text-sm text-gray-600 font-mono">
        digitalocean.com/deploy
      </p>
    </div>
  );
}
