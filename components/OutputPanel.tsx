"use client";

import { useState } from "react";

interface GenerateResult {
  id: number;
  description: string;
  copy: string;
  musicPrompt: string;
  videoUrl: string;
  audioUrl: string;
  posted?: boolean;
}

interface OutputPanelProps {
  result: GenerateResult;
}

export default function OutputPanel({ result }: OutputPanelProps) {
  const [copy, setCopy] = useState(result.copy);
  const [copied, setCopied] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(result.posted ?? false);
  const [postError, setPostError] = useState<string | null>(null);
  const [showDescription, setShowDescription] = useState(false);
  const [confirmPost, setConfirmPost] = useState<{ testMode: boolean } | null>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(copy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePost = async (testMode = false) => {
    setPosting(true);
    setPostError(null);
    try {
      const res = await fetch("/api/linkedin/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: result.id, copy, testMode }),
      });
      const data = await res.json();
      if (data.success) {
        setPosted(true);
      } else {
        setPostError(data.error ?? "Post failed — use Copy Text as a fallback");
      }
    } catch {
      setPostError("Could not reach LinkedIn — use Copy Text as a fallback");
    } finally {
      setPosting(false);
      setConfirmPost(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Video player */}
      <div className="rounded-xl overflow-hidden border border-gray-700 bg-black">
        <video
          key={result.videoUrl}
          className="w-full"
          controls
          preload="auto"
          playsInline
        >
          <source src={result.videoUrl} type="video/mp4" />
        </video>
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
          rows={6}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm resize-y focus:outline-none focus:border-blue-500"
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

      {/* Confirmation dialog */}
      {confirmPost && (
        <div className="bg-gray-900 border border-gray-600 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium">
            {confirmPost.testMode
              ? "Post to LinkedIn? (visible to connections only)"
              : "Post publicly to LinkedIn?"}
          </p>
          <p className="text-xs text-gray-400 line-clamp-2">{copy.slice(0, 120)}...</p>
          <div className="flex gap-2">
            <button
              onClick={() => handlePost(confirmPost.testMode)}
              disabled={posting}
              className={`flex-1 py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 ${
                confirmPost.testMode
                  ? "bg-gray-600 hover:bg-gray-500"
                  : "bg-blue-600 hover:bg-blue-500"
              }`}
            >
              {posting ? "Posting..." : "Confirm"}
            </button>
            <button
              onClick={() => setConfirmPost(null)}
              className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-2">
        {!posted && !confirmPost ? (
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmPost({ testMode: false })}
              disabled={posting}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold transition-colors disabled:opacity-50"
            >
              Post to LinkedIn
            </button>
            <button
              onClick={() => setConfirmPost({ testMode: true })}
              disabled={posting}
              className="py-3 px-4 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm font-medium transition-colors disabled:opacity-50"
              title="Post visible only to your connections (for testing)"
            >
              Test
            </button>
          </div>
        ) : posted ? (
          <div className="w-full py-3 rounded-xl bg-green-600/20 border border-green-600/40 text-center font-semibold text-green-400">
            Posted to LinkedIn
          </div>
        ) : null}

        {postError && (
          <p className="text-xs text-red-400">{postError}</p>
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

    </div>
  );
}
