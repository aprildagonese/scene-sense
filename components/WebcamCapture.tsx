"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface WebcamCaptureProps {
  onCapture: (blob: Blob, mediaType?: "image" | "video") => void;
}

export default function WebcamCapture({ onCapture }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 1920, height: 1080 },
        audio: mode === "video",
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setActive(true);
    } catch (err) {
      console.error("Camera access failed:", err);
    }
  }, [mode]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  // Preload camera on mount
  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          setPreview(URL.createObjectURL(blob));
          onCapture(blob, "image");
          stopCamera();
        }
      },
      "image/jpeg",
      0.92
    );
  }, [onCapture, stopCamera]);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      setPreview(URL.createObjectURL(blob));
      onCapture(blob, "video");
      stopCamera();
    };

    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);

    // Auto-stop after 5 seconds
    setTimeout(() => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
        setRecording(false);
      }
    }, 5000);
  }, [onCapture, stopCamera]);

  const retake = useCallback(() => {
    setPreview(null);
    startCamera();
  }, [startCamera]);

  if (preview) {
    return (
      <div className="space-y-3">
        {mode === "video" ? (
          <video
            src={preview}
            className="w-full rounded-xl border border-gray-700"
            controls
            autoPlay
            muted
          />
        ) : (
          <img
            src={preview}
            alt="Captured"
            className="w-full rounded-xl border border-gray-700"
          />
        )}
        <button
          onClick={retake}
          className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium transition-colors"
        >
          Retake
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex gap-1 p-1 bg-gray-800 rounded-lg w-fit">
        <button
          onClick={() => setMode("photo")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            mode === "photo" ? "bg-gray-600 text-white" : "text-gray-400"
          }`}
        >
          Photo
        </button>
        <button
          onClick={() => setMode("video")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            mode === "video" ? "bg-gray-600 text-white" : "text-gray-400"
          }`}
        >
          Video
        </button>
      </div>

      {/* Viewfinder */}
      <div className="relative rounded-xl overflow-hidden border border-gray-700 bg-black aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {!active && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={startCamera}
              className="px-4 py-2 bg-gray-800 rounded-lg text-sm"
            >
              Enable Camera
            </button>
          </div>
        )}
      </div>

      {/* Capture button */}
      {active && (
        <button
          onClick={mode === "photo" ? capturePhoto : startRecording}
          disabled={recording}
          className={`w-full py-4 rounded-xl text-lg font-bold transition-all ${
            recording
              ? "bg-red-600 animate-pulse"
              : "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500 shadow-lg shadow-blue-500/25"
          }`}
        >
          {recording
            ? "Recording..."
            : mode === "photo"
            ? "Capture"
            : "Record (5s)"}
        </button>
      )}
    </div>
  );
}
