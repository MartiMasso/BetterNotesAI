"use client";

type TextShimmerLoaderProps = {
  text: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const sizeClasses: Record<NonNullable<TextShimmerLoaderProps["size"]>, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export function TextShimmerLoader({
  text,
  size = "md",
  className,
}: TextShimmerLoaderProps) {
  return (
    <>
      <span
        className={joinClasses(
          "prompt-kit-shimmer inline-flex items-center font-medium tracking-wide",
          sizeClasses[size],
          className,
        )}
        aria-live="polite"
      >
        {text}
      </span>
      <style jsx>{`
        .prompt-kit-shimmer {
          color: transparent;
          background-image: linear-gradient(
            110deg,
            rgba(255, 255, 255, 0.35) 0%,
            rgba(255, 255, 255, 0.92) 48%,
            rgba(255, 255, 255, 0.35) 100%
          );
          background-size: 220% 100%;
          background-position: 200% 0;
          -webkit-background-clip: text;
          background-clip: text;
          animation: promptKitShimmer 1.6s linear infinite;
        }
        @keyframes promptKitShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -20% 0; }
        }
      `}</style>
    </>
  );
}
