"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Circle,
  Clock,
  History,
  PauseCircle,
  RotateCcw,
  Ticket,
  UserCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/ticket-utils";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";

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
  /** Optional raw action key (created, closed, hold…) — picks the icon & tone */
  action?: string;
  /** Optional actor name — shown under the label */
  actor?: string;
  /** Optional ISO timestamp — rendered as relative time */
  timestamp?: string;
};

type Props = {
  items: ActivityItem[];
};

/* -----------------------------------
   Visual config
----------------------------------- */
type Tone = "indigo" | "emerald" | "amber" | "violet" | "sky" | "rose" | "gray";

const TONE_CHIP: Record<Tone, string> = {
  indigo:
    "bg-indigo-50 text-indigo-600 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20",
  emerald:
    "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20",
  amber:
    "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20",
  violet:
    "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/20",
  sky: "bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/20",
  rose: "bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/20",
  gray: "bg-white text-gray-400 ring-gray-200 dark:bg-gray-900 dark:text-gray-500 dark:ring-white/10",
};

const TONE_COMMENT: Record<Tone, string> = {
  indigo: "border-indigo-100 bg-indigo-50/60 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200",
  emerald: "border-emerald-100 bg-emerald-50/60 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200",
  amber: "border-amber-100 bg-amber-50/60 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200",
  violet: "border-violet-100 bg-violet-50/60 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-200",
  sky: "border-sky-100 bg-sky-50/60 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200",
  rose: "border-rose-100 bg-rose-50/60 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200",
  gray: "border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300",
};

const ACTION_VISUAL: Record<string, { icon: LucideIcon; tone: Tone }> = {
  created: { icon: Ticket, tone: "indigo" },
  acquired: { icon: UserCheck, tone: "sky" },
  closed: { icon: CheckCircle2, tone: "emerald" },
  hold: { icon: PauseCircle, tone: "amber" },
  reopened: { icon: RotateCcw, tone: "violet" },
  reassigned: { icon: ArrowRightLeft, tone: "sky" },
  sla_response_breach: { icon: AlertTriangle, tone: "rose" },
  sla_resolution_breach: { icon: AlertTriangle, tone: "rose" },
};

const STATUS_VISUAL: Record<ActivityStatus, { icon: LucideIcon; tone: Tone }> = {
  done: { icon: CheckCircle2, tone: "emerald" },
  closed: { icon: CheckCircle2, tone: "emerald" },
  processing: { icon: Wrench, tone: "indigo" },
  hold: { icon: PauseCircle, tone: "amber" },
  pending: { icon: Circle, tone: "gray" },
};

function visualFor(item: ActivityItem) {
  return (item.action && ACTION_VISUAL[item.action]) || STATUS_VISUAL[item.status];
}

/** "Ticket Closed by Jane" → "Ticket Closed" when the actor is shown separately */
function headline(item: ActivityItem) {
  const suffix = item.actor ? ` by ${item.actor}` : "";
  return suffix && item.label.endsWith(suffix)
    ? item.label.slice(0, -suffix.length)
    : item.label;
}

/* -----------------------------------
   Component
----------------------------------- */
export default function TicketActivityTrail({ items }: Props) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b border-gray-100 py-4 dark:border-white/10 [.border-b]:pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20">
            <History className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold text-gray-900 dark:text-white">
              Activity
            </CardTitle>
            <CardDescription className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Everything that happened on this ticket
            </CardDescription>
          </div>
        </div>
        <CardAction className="self-center">
          <StatusBadge tone="indigo">
            {items.length} {items.length === 1 ? "event" : "events"}
          </StatusBadge>
        </CardAction>
      </CardHeader>

      <CardContent className="py-5">
        {items.length === 0 ? (
          <EmptyState
            icon={History}
            title="No activity yet"
            description="Updates to this ticket will show up here."
            className="py-8"
          />
        ) : (
          <ol className="relative space-y-5">
            {items.map((item, index) => {
              const isLast = index === items.length - 1;
              const isPending = item.status === "pending";
              const isProcessing = item.status === "processing";
              const { icon: Icon, tone } = visualFor(item);
              const relative = item.timestamp ? timeAgo(item.timestamp) : null;

              return (
                <li key={index} className="relative flex gap-3">
                  {/* Rail */}
                  {!isLast && (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-10 left-[17px] h-[calc(100%-24px)] w-px",
                        isPending
                          ? "border-l border-dashed border-gray-200 dark:border-white/10"
                          : "bg-gray-200 dark:bg-white/10"
                      )}
                    />
                  )}

                  {/* Icon chip */}
                  <span
                    className={cn(
                      "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1",
                      TONE_CHIP[tone]
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>

                  {/* Body */}
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p
                      className={cn(
                        "text-sm font-semibold leading-snug",
                        isPending
                          ? "text-gray-400 dark:text-gray-500"
                          : "text-gray-900 dark:text-white"
                      )}
                    >
                      {headline(item)}
                    </p>

                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {item.actor && (
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          {item.actor}
                        </span>
                      )}
                      {item.actor && (relative || item.date) && <span aria-hidden>·</span>}
                      {relative ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-default items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {relative}
                            </span>
                          </TooltipTrigger>
                          {item.date && <TooltipContent>{item.date}</TooltipContent>}
                        </Tooltip>
                      ) : item.date ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {item.date}
                        </span>
                      ) : null}
                      {isProcessing && !item.date && !relative && (
                        <span className="font-medium text-indigo-600 dark:text-indigo-300">
                          In progress…
                        </span>
                      )}
                    </div>

                    {item.comment && (
                      <p
                        className={cn(
                          "mt-2 whitespace-pre-line rounded-lg border px-3 py-2 text-xs leading-relaxed",
                          TONE_COMMENT[tone]
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
        )}
      </CardContent>
    </Card>
  );
}
