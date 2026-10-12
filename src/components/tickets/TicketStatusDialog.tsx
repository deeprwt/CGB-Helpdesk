"use client";

import * as React from "react";
import { CheckCircle2, Loader2, PauseCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

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

  const HeaderIcon = showHoldDuration ? PauseCircle : CheckCircle2;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span
              className={
                showHoldDuration
                  ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20"
                  : "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20"
              }
            >
              <HeaderIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0 text-left">
              <DialogTitle className="text-base font-semibold text-gray-900 dark:text-white">
                {title}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {showHoldDuration
                  ? "Pause this ticket for a while and let the requester know why."
                  : "Wrap up this ticket with a short note for the requester."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <FieldGroup className="gap-4">
          {showHoldDuration && (
            <Field>
              <FieldLabel htmlFor="ticket-hold-duration">Hold duration</FieldLabel>
              <Select
                value={String(holdDuration)}
                onValueChange={(v) => setHoldDuration(Number(v))}
              >
                <SelectTrigger id="ticket-hold-duration" className="w-full">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  {HOLD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                How long the ticket stays on hold.
              </FieldDescription>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="ticket-status-comment" required={showHoldDuration}>
              {showHoldDuration ? "Reason" : "Comment"}
            </FieldLabel>
            <Textarea
              id="ticket-status-comment"
              placeholder={
                showHoldDuration
                  ? "Reason for holding this ticket (required)"
                  : "Add some description of the request"
              }
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-[120px] resize-none"
            />
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || (showHoldDuration && !comment.trim())}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Submitting..." : title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
