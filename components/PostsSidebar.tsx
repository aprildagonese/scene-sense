"use client";

import { useEffect, useState, useCallback } from "react";

interface Post {
  id: number;
  created_at: string;
  platform: string;
  goal: string;
  copy: string;
  video_url: string | null;
  posted: boolean;
}

interface PostsSidebarProps {
  selectedPostId: number | null;
  onSelect: (post: Post) => void;
  refreshKey: number; // increment to trigger re-fetch
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const PLATFORM_COLORS: Record<string, string> = {
  LinkedIn: "bg-blue-600",
  "Twitter/X": "bg-gray-600",
  Instagram: "bg-pink-600",
};

export default function PostsSidebar({ selectedPostId, onSelect, refreshKey }: PostsSidebarProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/posts");
      if (res.ok) {
        setPosts(await res.json());
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts, refreshKey]);

  if (loading && posts.length === 0) {
    return (
      <div className="text-xs text-gray-600 p-2">Loading...</div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-xs text-gray-600 p-2">
        No posts yet. Generate your first one!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">
        Recent Posts
      </h3>
      <div className="space-y-1.5 max-h-[calc(100vh-140px)] overflow-y-auto pr-1">
        {posts.map((post) => (
          <button
            key={post.id}
            onClick={() => onSelect(post)}
            className={`w-full text-left p-2 rounded-lg transition-colors ${
              selectedPostId === post.id
                ? "bg-blue-600/20 border border-blue-500/40"
                : "bg-gray-900/50 border border-transparent hover:bg-gray-800"
            }`}
          >
            {/* Thumbnail — small */}
            {post.video_url && (
              <div className="rounded overflow-hidden mb-1.5 bg-black aspect-video w-16">
                <video
                  src={post.video_url}
                  className="w-full h-full object-cover"
                  muted
                  preload="metadata"
                />
              </div>
            )}

            {/* Meta row */}
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium text-white ${PLATFORM_COLORS[post.platform] ?? "bg-gray-600"}`}>
                {post.platform}
              </span>
              <span className="text-[10px] text-gray-500">{timeAgo(post.created_at)}</span>
              {post.posted && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-auto" title="Posted" />
              )}
            </div>

            {/* Copy preview */}
            <p className="text-[11px] text-gray-400 line-clamp-2 leading-tight">
              {post.copy}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
