"use client";

interface Step {
  key: string;
  label: string;
  status: "pending" | "active" | "completed";
}

interface ProgressOverlayProps {
  steps: Step[];
}

export default function ProgressOverlay({ steps }: ProgressOverlayProps) {
  return (
    <div className="space-y-3 py-8">
      {steps.map((step) => (
        <div key={step.key} className="flex items-center gap-3">
          {/* Status indicator */}
          <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
            {step.status === "completed" ? (
              <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : step.status === "active" ? (
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <div className="w-3 h-3 rounded-full bg-gray-700" />
            )}
          </div>

          {/* Label */}
          <span
            className={`text-sm font-medium transition-colors ${
              step.status === "completed"
                ? "text-gray-400"
                : step.status === "active"
                ? "text-white"
                : "text-gray-600"
            }`}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
