"use client";

import { ThinkingBar } from "@/components/prompt-kit/thinking-bar";
import { TextShimmerLoader } from "@/components/prompt-kit/loader";
import {
  Steps,
  StepsContent,
  StepsItem,
  StepsTrigger,
} from "@/components/prompt-kit/steps";

type ChatThinkingBubbleProps = {
  text: string;
  steps?: string[];
  activeStepIndex?: number;
  className?: string;
};

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function ChatThinkingBubble({
  text,
  steps = [],
  activeStepIndex = 0,
  className,
}: ChatThinkingBubbleProps) {
  const boundedActiveIndex =
    steps.length > 0
      ? Math.min(Math.max(activeStepIndex, 0), steps.length - 1)
      : 0;

  return (
    <div className={joinClasses("space-y-2", className)}>
      <ThinkingBar text={text} />

      {steps.length > 0 && (
        <Steps defaultOpen={false}>
          <StepsTrigger>
            <TextShimmerLoader text="Show progress status" size="sm" />
          </StepsTrigger>
          <StepsContent>
            {steps.map((step, idx) => {
              const state =
                idx < boundedActiveIndex
                  ? "done"
                  : idx === boundedActiveIndex
                    ? "active"
                    : "pending";

              return (
                <StepsItem key={`${idx}-${step}`} state={state}>
                  {step}
                </StepsItem>
              );
            })}
          </StepsContent>
        </Steps>
      )}
    </div>
  );
}
