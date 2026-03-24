"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import WebcamCapture from "@/components/WebcamCapture";
import ProgressOverlay from "@/components/ProgressOverlay";
import OutputPanel from "@/components/OutputPanel";
import DeployScreen from "@/components/DeployScreen";
import PostsSidebar from "@/components/PostsSidebar";
import QRCode from "@/components/QRCode";

function CameraToggle({ onCapture }: { onCapture: (blob: Blob) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-center">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-gray-600 cursor-pointer hover:text-gray-400"
      >
        {open ? "▾ hide camera" : "▸ or use camera"}
      </button>
      {open && (
        <div className="mt-2">
          <WebcamCapture onCapture={onCapture} />
        </div>
      )}
    </div>
  );
}

interface GenerateResult {
  id: number;
  description: string;
  copy: string;
  musicPrompt: string;
  videoUrl: string;
  audioUrl: string;
  posted?: boolean;
}

const STEP_LABELS: Record<string, string> = {
  vision: "Analyzing your scene...",
  copy: "Crafting your post...",
  audio: "Generating music...",
  video: "Compositing video...",
};

const STEP_ORDER = ["vision", "copy", "audio", "video"];

export default function Home() {
  // Media state — supports multiple images
  const [images, setImages] = useState<{ blob: Blob; previewUrl: string }[]>([]);
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
  const [showDeploy, setShowDeploy] = useState(false);

  // Sidebar state
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  // Reset everything when "Scene Sense" logo is clicked
  useEffect(() => {
    const handleReset = () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      setImages([]);
      setGoal("");
      setPlatform("LinkedIn");
      setVibe("");
      setGenerating(false);
      setActiveSteps(new Set());
      setCompletedSteps(new Set());
      setResult(null);
      setError(null);
      setSelectedPostId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    window.addEventListener("scene-sense-reset", handleReset);
    return () => window.removeEventListener("scene-sense-reset", handleReset);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addImage = useCallback((blob: Blob) => {
    const previewUrl = URL.createObjectURL(blob);
    setImages((prev) => [...prev, { blob, previewUrl }]);
  }, []);

  const removeImage = (index: number) => {
    setImages((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].previewUrl);
      next.splice(index, 1);
      return next;
    });
  };

  const handleCapture = useCallback((blob: Blob) => {
    addImage(blob);
  }, [addImage]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith("image/")) {
        addImage(file);
      }
    }
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSelectPost = (post: any) => {
    setResult({
      id: post.id,
      description: post.description ?? "",
      copy: post.copy ?? "",
      musicPrompt: post.narration ?? "",
      videoUrl: post.video_url ?? "",
      audioUrl: post.audio_url ?? "",
      posted: post.posted ?? false,
    });
    setSelectedPostId(post.id);
    setError(null);
  };

  const handleGenerate = async () => {
    if (images.length === 0 || !goal) return;

    setGenerating(true);
    setActiveSteps(new Set());
    setCompletedSteps(new Set());
    setResult(null);
    setError(null);
    setSelectedPostId(null);

    const formData = new FormData();
    images.forEach((img, i) => formData.append(`image_${i}`, img.blob));
    formData.append("imageCount", String(images.length));
    formData.append("goal", goal);
    formData.append("platform", platform);
    formData.append("vibe", vibe || "professional but engaging");

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
              setSelectedPostId(data.id);
              // Refresh sidebar to show the new post
              setSidebarRefreshKey((k) => k + 1);
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

  const canGenerate = images.length > 0 && goal && !generating;

  return (
    <div>
    {showDeploy && <DeployScreen onClose={() => setShowDeploy(false)} />}

    {/* Fixed bottom: QR code center */}
    <div className="fixed bottom-2 left-0 right-0 z-40 flex items-end justify-center pointer-events-none">
      <div className="pointer-events-auto">
        <QRCode size={140} />
      </div>
    </div>
    <button
      onClick={() => setShowDeploy(true)}
      className="fixed bottom-6 right-6 z-40 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium text-gray-300 hover:text-white transition-colors border border-gray-700"
    >
      Deploy 2026
    </button>

    <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_1fr] gap-4 lg:gap-6">
      {/* Sidebar: Recent Posts */}
      <div className="hidden lg:block">
        <PostsSidebar
          selectedPostId={selectedPostId}
          onSelect={handleSelectPost}
          refreshKey={sidebarRefreshKey}
        />
      </div>

      {/* Center: Input */}
      <div className="space-y-5">
        <h2 className="text-xl font-semibold">Images</h2>

        {/* Image thumbnails */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((img, i) => (
              <div key={img.previewUrl} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-gray-700 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.previewUrl} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                {i === 0 && (
                  <span className="absolute bottom-0 left-0 right-0 bg-blue-600/80 text-[9px] text-center text-white">Hero</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Upload button — primary action */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple={true}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`w-full py-3 text-sm rounded-lg transition-colors ${
              images.length === 0
                ? "bg-gray-800 hover:bg-gray-700 text-white border border-gray-600 hover:border-gray-500"
                : "text-gray-400 hover:text-gray-300 border border-dashed border-gray-700 hover:border-gray-500"
            }`}
          >
            {images.length === 0 ? "Upload Images" : `Add more images (${images.length} added)`}
          </button>
          {images.length === 0 && (
            <p className="text-[10px] text-gray-600 mt-1 text-center">Add 2-5 images for best results</p>
          )}
        </div>

        {/* Camera option — only show if no images yet */}
        {images.length === 0 && (
          <CameraToggle onCapture={handleCapture} />
        )}

        {/* Form inputs */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Post goal
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Share excitement about the hackathon, highlight the energy and collaboration..."
              rows={3}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-y"
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

        {images.length > 0 && !generating && !result && (
          <p className="text-xs text-gray-600 text-center">
            {images.length} {images.length === 1 ? "image" : "images"} ready — fill in the details and hit Generate
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

        {result && !generating && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Your post is ready</h2>
              <button
                onClick={() => { setResult(null); setSelectedPostId(null); }}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <OutputPanel key={result.id} result={result} />
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
    </div>
  );
}
