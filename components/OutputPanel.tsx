"use client";

import { useState } from "react";
import QRCode from "./QRCode";

interface GenerateResult {
  id: number;
  description: string;
  copy: string;
  musicPrompt: string;
  videoUrl: string;
  audioUrl: string;
}

interface OutputPanelProps {
  result: GenerateResult;
  onShowDeploy: () => void;
}

export default function OutputPanel({ result, onShowDeploy }: OutputPanelProps) {
  const [copy, setCopy] = useState(result.copy);
  const [copied, setCopied] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [showDescription, setShowDescription] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(copy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePost = async () => {
    setPosting(true);
    try {
      const res = await fetch("/api/linkedin/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: result.id, copy }),
      });
      const data = await res.json();
      if (data.success) {
        setPosted(true);
      }
    } catch {
      // Silent fallback — manual posting UI is always visible
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Video player */}
      <div className="rounded-xl overflow-hidden border border-gray-700 bg-black">
        <video
          src={result.videoUrl}
          className="w-full"
          controls
          autoPlay
          playsInline
        />
      </div>

      {/* Scene description (collapsible) */}
      <div>
        <button
          onClick={() => setShowDescription(!showDescription)}
          className="text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1"
        >
          <svg
            className={`w-3 h-3 transition-transform ${showDescription ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
          Scene analysis
        </button>
        {showDescription && (
          <p className="mt-2 text-sm text-gray-400 bg-gray-900 rounded-lg p-3">
            {result.description}
          </p>
        )}
      </div>

      {/* Editable copy */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Post copy</label>
        <textarea
          value={copy}
          onChange={(e) => setCopy(e.target.value)}
          rows={5}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Music prompt (collapsible, for transparency) */}
      <div>
        <button
          onClick={() => setShowDescription(!showDescription)}
          className="text-xs text-gray-500 hover:text-gray-400"
        >
          Music: {(result.musicPrompt ?? "").slice(0, 60)}...
        </button>
      </div>

      {/* Action buttons */}
      <div className="space-y-2">
        {!posted ? (
          <button
            onClick={handlePost}
            disabled={posting}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold transition-colors disabled:opacity-50"
          >
            {posting ? "Posting..." : "Post to LinkedIn"}
          </button>
        ) : (
          <div className="w-full py-3 rounded-xl bg-green-600/20 border border-green-600/40 text-center font-semibold text-green-400">
            Posted to LinkedIn
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium transition-colors"
          >
            {copied ? "Copied!" : "Copy Text"}
          </button>
          <a
            href={result.videoUrl}
            download="scene-sense-video.mp4"
            className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium transition-colors text-center"
          >
            Download Video
          </a>
        </div>
      </div>

      {/* QR Code */}
      <div className="pt-4 border-t border-gray-800">
        <QRCode />
      </div>

      {/* Deploy 2026 CTA */}
      <button
        onClick={onShowDeploy}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-700 hover:from-blue-500 hover:to-purple-600 font-semibold transition-all text-white shadow-lg shadow-purple-500/20"
      >
        Show Deploy 2026 Registration
      </button>
    </div>
  );
}
