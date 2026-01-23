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

export default function TicketActivityTrail({ items }: Props) {
  return (
    <div className="space-y-6">
      {items.map((item, index) => {
        const isDone =
          item.status === "done" || item.status === "closed";
        const isProcessing = item.status === "processing";

        return (
          <div key={index} className="flex gap-4">
            {/* LEFT ICON + LINE */}
            <div className="flex flex-col items-center">
              {/* CIRCLE */}
              <div
                className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center border",
                  isDone &&
                    "bg-green-500 border-green-500 text-white",
                  isProcessing &&
                    "border-green-500 bg-white relative",
                  item.status === "pending" &&
                    "border-muted-foreground bg-background",
                  item.status === "hold" &&
                    "bg-orange-500 border-orange-500 text-white"
                )}
              >
                {isDone && <Check className="h-4 w-4" />}

                {isProcessing && (
                  <span className="absolute h-2.5 w-2.5 rounded-full bg-green-500 animate-ping" />
                )}
              </div>

              {/* VERTICAL LINE */}
              {index !== items.length - 1 && (
                <div
                  className={cn(
                    "w-px flex-1 mt-1",
                    isDone || isProcessing
                      ? "bg-green-500"
                      : "bg-muted-foreground/40"
                  )}
                />
              )}
            </div>

            {/* RIGHT CONTENT */}
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium">{item.label}</p>

              {item.status === "processing" && (
                <p className="text-xs text-green-600">
                  Processing…
                </p>
              )}

              {item.date && (
                <p className="text-xs text-muted-foreground">
                  {item.date}
                </p>
              )}

              {item.comment && (
                <div
                  className={cn(
                    "mt-2 rounded-md px-3 py-2 text-xs",
                    item.status === "closed" &&
                      "bg-green-50 text-green-700",
                    item.status === "hold" &&
                      "bg-orange-50 text-orange-700"
                  )}
                >
                  {item.comment}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
