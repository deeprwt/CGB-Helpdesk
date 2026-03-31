"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** When true, shows hold duration selector (24h / 48h / 72h) */
  showHoldDuration?: boolean;
  onSubmit: (comment: string, holdDurationHours?: number) => Promise<void>;
};

const HOLD_OPTIONS = [
  { label: "24 Hours", value: 24 },
  { label: "48 Hours", value: 48 },
  { label: "72 Hours", value: 72 },
] as const;

export default function TicketStatusDialog({
  open,
  onClose,
  title,
  showHoldDuration = false,
  onSubmit,
}: Props) {
  const [comment, setComment] = React.useState("");
  const [holdDuration, setHoldDuration] = React.useState<number>(24);
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async () => {
    if (showHoldDuration && !comment.trim()) return;
    setLoading(true);
    await onSubmit(comment, showHoldDuration ? holdDuration : undefined);
    setLoading(false);
    setComment("");
    setHoldDuration(24);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {showHoldDuration && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Hold Duration</p>
            <div className="flex gap-2">
              {HOLD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setHoldDuration(opt.value)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-all",
                    holdDuration === opt.value
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 ring-1 ring-blue-500"
                      : "border-border bg-background text-muted-foreground hover:border-foreground/30"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <Textarea
          placeholder={
            showHoldDuration
              ? "Reason for holding this ticket (required)"
              : "Add some description of the request"
          }
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="min-h-[120px]"
        />

        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={loading || (showHoldDuration && !comment.trim())}
          >
            {loading ? "Submitting..." : "Done"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
