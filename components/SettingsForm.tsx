"use client";

import { useEffect, useState } from "react";

interface CredentialStatus {
  doApiKey: string | null;
  linkedinConnected: boolean;
  linkedinAuthorUrn: string | null;
  linkedinTokenExpires: string | null;
}

export default function SettingsForm() {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [doApiKey, setDoApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchStatus = async () => {
    const res = await fetch("/api/settings/credentials");
    if (res.ok) setStatus(await res.json());
  };

  useEffect(() => { fetchStatus(); }, []);

  const saveApiKey = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doApiKey }),
      });
      if (res.ok) {
        setDoApiKey("");
        setMessage({ text: "API key saved", type: "success" });
        await fetchStatus();
      } else {
        setMessage({ text: "Failed to save", type: "error" });
      }
    } finally {
      setSaving(false);
    }
  };

  const removeApiKey = async () => {
    const res = await fetch("/api/settings/credentials", { method: "DELETE" });
    if (res.ok) {
      setMessage({ text: "API key removed — will use shared key", type: "success" });
      await fetchStatus();
    }
  };

  if (!status) {
    return <p className="text-gray-500">Loading...</p>;
  }

  return (
    <div className="space-y-8">
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === "success" ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"}`}>
          {message.text}
        </div>
      )}

      {/* DigitalOcean API Key */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">DigitalOcean API Key</h2>
        <p className="text-sm text-gray-400">
          Your Gradient Serverless Inference key. Required to generate posts.
        </p>

        {status.doApiKey && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono bg-gray-900 px-3 py-1 rounded">{status.doApiKey}</span>
            <button
              onClick={removeApiKey}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Remove
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="password"
            value={doApiKey}
            onChange={(e) => setDoApiKey(e.target.value)}
            placeholder={status.doApiKey ? "Replace with new key..." : "Enter your DO API key"}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={saveApiKey}
            disabled={!doApiKey || saving}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium disabled:opacity-30 transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </section>

      {/* LinkedIn Connection */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">LinkedIn</h2>

        {status.linkedinConnected ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm text-green-400">Connected</span>
            </div>
            {status.linkedinAuthorUrn && (
              <p className="text-xs text-gray-500 font-mono">{status.linkedinAuthorUrn}</p>
            )}
            {status.linkedinTokenExpires && (
              <p className="text-xs text-gray-500">
                Token expires: {new Date(status.linkedinTokenExpires).toLocaleDateString()}
              </p>
            )}
            <a
              href="/api/linkedin/auth"
              className="inline-block text-xs text-blue-400 hover:text-blue-300"
            >
              Reconnect
            </a>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-400 mb-3">
              Connect your LinkedIn account to post videos directly from the app.
            </p>
            <a
              href="/api/linkedin/auth"
              className="inline-block px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium transition-colors"
            >
              Connect LinkedIn
            </a>
          </div>
        )}
      </section>
    </div>
  );
}
