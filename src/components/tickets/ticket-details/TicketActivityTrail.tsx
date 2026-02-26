"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/* -----------------------------------
   Types (EXPORTED)
----------------------------------- */
export type ActivityStatus =
  | "done"
  | "processing"
  | "pending"
  | "hold"
  | "closed";

export type ActivityItem = {
  label: string;
  date?: string;
  status: ActivityStatus;
  comment?: string | null;
};

type Props = {
  items: ActivityItem[];
};

/* -----------------------------------
   Component
----------------------------------- */
export default function TicketActivityTrail({ items }: Props) {
  return (
    <ol className="space-y-0">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const isDone = item.status === "done" || item.status === "closed";
        const isProcessing = item.status === "processing";
        const isHold = item.status === "hold";
        const isPending = item.status === "pending";

        /* Line below this step is green when this step is completed */
        const lineGreen = isDone;

        return (
          <li key={index} className="relative flex gap-3">
            {/* ── Left: circle + connector line ─── */}
            <div className="flex flex-col items-center">

              {/* Circle */}
              <div
                className={cn(
                  "relative z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full",
                  isDone && "bg-green-500",
                  isProcessing && "bg-green-500",
                  isHold && "bg-orange-400",
                  isPending && "border-2 border-muted-foreground/30 bg-background"
                )}
              >
                {/* Checkmark for done/closed */}
                {isDone && (
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                )}

                {/* Solid inner dot for processing */}
                {isProcessing && (
                  <span className="h-2.5 w-2.5 rounded-full bg-white" />
                )}
              </div>

              {/* Vertical connector line */}
              {!isLast && (
                <div
                  className={cn(
                    "w-px flex-1 my-1",
                    lineGreen
                      ? "bg-green-500"
                      : "bg-muted-foreground/20"
                  )}
                  style={{ minHeight: "40px" }}
                />
              )}
            </div>

            {/* ── Right: label + date + comment ─── */}
            <div
              className={cn(
                "flex-1 min-w-0",
                isLast ? "pb-0" : "pb-1"
              )}
            >
              <p
                className={cn(
                  "text-sm font-semibold leading-none pt-0.5",
                  isPending
                    ? "text-muted-foreground"
                    : "text-foreground"
                )}
              >
                {item.label}
              </p>

              {item.date && (
                <p className="text-xs text-muted-foreground mt-1">
                  {item.date}
                </p>
              )}

              {isProcessing && !item.date && (
                <p className="text-xs text-green-600 mt-1 font-medium">
                  In progress…
                </p>
              )}

              {item.comment && (
                <p
                  className={cn(
                    "mt-2 text-xs rounded-md px-2.5 py-1.5 leading-relaxed",
                    isDone
                      ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
                      : isHold
                      ? "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {item.comment}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
