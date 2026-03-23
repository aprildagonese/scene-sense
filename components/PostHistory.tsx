"use client";

import { useEffect, useState } from "react";

interface Post {
  id: number;
  created_at: string;
  platform: string;
  goal: string;
  vibe: string;
  description: string;
  copy: string;
  narration: string | null;
  video_url: string | null;
  posted: boolean;
}

export default function PostHistory() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/posts")
      .then((r) => r.json())
      .then((data) => {
        setPosts(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">Loading posts...</div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No posts yet. Create your first one!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <div
          key={post.id}
          className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-medium">
                {post.platform}
              </span>
              <span className="text-xs text-gray-500">
                {new Date(post.created_at).toLocaleString()}
              </span>
            </div>
            {post.posted && (
              <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                Posted
              </span>
            )}
          </div>

          {/* Video */}
          {post.video_url && (
            <video
              src={post.video_url}
              className="w-full rounded-lg border border-gray-800"
              controls
              preload="metadata"
            />
          )}

          {/* Copy preview */}
          <p className="text-sm text-gray-300 line-clamp-3">{post.copy}</p>

          {/* Meta */}
          <div className="flex gap-4 text-xs text-gray-600">
            <span>Goal: {post.goal}</span>
            <span>Vibe: {post.vibe}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
