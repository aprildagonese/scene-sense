"use client";

import { useState, useRef, useCallback } from "react";
import WebcamCapture from "@/components/WebcamCapture";
import ProgressOverlay from "@/components/ProgressOverlay";
import OutputPanel from "@/components/OutputPanel";

interface GenerateResult {
  id: number;
  description: string;
  copy: string;
  musicPrompt: string;
  videoUrl: string;
  audioUrl: string;
}

const STEP_LABELS: Record<string, string> = {
  vision: "Analyzing your scene...",
  copy: "Crafting your post...",
  audio: "Generating music...",
  frames: "Creating promo visuals...",
  video: "Compositing video...",
};

const STEP_ORDER = ["vision", "copy", "audio", "frames", "video"];

export default function Home() {
  // Media state
  const [media, setMedia] = useState<Blob | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [goal, setGoal] = useState("");
  const [platform, setPlatform] = useState("LinkedIn");
  const [vibe, setVibe] = useState("");

  // Pipeline state
  const [generating, setGenerating] = useState(false);
  const [activeSteps, setActiveSteps] = useState<Set<string>>(new Set());
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCapture = useCallback((blob: Blob, type: "image" | "video") => {
    setMedia(blob);
    setMediaType(type);
    setResult(null);
    setError(null);
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = file.type.startsWith("video/") ? "video" : "image";
    setMedia(file);
    setMediaType(type);
    setResult(null);
    setError(null);
  };

  const handleGenerate = async () => {
    if (!media || !goal) return;

    setGenerating(true);
    setActiveSteps(new Set());
    setCompletedSteps(new Set());
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append("media", media);
    formData.append("goal", goal);
    formData.append("platform", platform);
    formData.append("vibe", vibe || "professional but engaging");
    formData.append("mediaType", mediaType);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (!reader) throw new Error("No response stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));

            if (eventType === "step") {
              if (data.status === "started") {
                setActiveSteps((prev) => new Set([...prev, data.step]));
              } else if (data.status === "completed") {
                setActiveSteps((prev) => {
                  const next = new Set(prev);
                  next.delete(data.step);
                  return next;
                });
                setCompletedSteps((prev) => new Set([...prev, data.step]));
              }
            } else if (eventType === "complete") {
              setResult(data);
            } else if (eventType === "error") {
              setError(data.message);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
      setActiveSteps(new Set());
    }
  };

  const steps = STEP_ORDER.map((key) => ({
    key,
    label: STEP_LABELS[key],
    status: completedSteps.has(key)
      ? ("completed" as const)
      : activeSteps.has(key)
      ? ("active" as const)
      : ("pending" as const),
  }));

  const canGenerate = media && goal && !generating;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Input */}
      <div className="space-y-5">
        <h2 className="text-xl font-semibold">Capture</h2>

        <WebcamCapture onCapture={handleCapture} />

        {/* File upload alternative */}
        <div className="text-center">
          <span className="text-xs text-gray-600">or</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="block w-full mt-1 py-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
          >
            Upload a file
          </button>
        </div>

        {/* Form inputs */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Post goal
            </label>
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Share excitement about the hackathon"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Platform
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option>LinkedIn</option>
              <option>Twitter/X</option>
              <option>Instagram</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Vibe</label>
            <input
              type="text"
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              placeholder="energetic and fun"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full py-4 rounded-xl text-lg font-bold bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25"
        >
          {generating ? "Generating..." : "Generate Post"}
        </button>

        {media && !generating && !result && (
          <p className="text-xs text-gray-600 text-center">
            {mediaType === "image" ? "Photo" : "Video"} captured — fill in the
            details and hit Generate
          </p>
        )}
      </div>

      {/* Right: Output */}
      <div>
        {generating && (
          <>
            <h2 className="text-xl font-semibold mb-2">Creating your post</h2>
            <ProgressOverlay steps={steps} />
          </>
        )}

        {result && (
          <>
            <h2 className="text-xl font-semibold mb-4">Your post is ready</h2>
            <OutputPanel result={result} />
          </>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {!generating && !result && !error && (
          <div className="flex items-center justify-center h-64 text-gray-700 text-sm">
            Your generated post will appear here
          </div>
        )}
      </div>
    </div>
  );
}
