"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
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
import {
  ArrowLeft,
  RotateCcw,
  UserPlus,
  AlertTriangle,
  Clock,
  Shield,
} from "lucide-react";

import TicketMetaPanel from "@/components/tickets/ticket-details/TicketMetaPanel";
import TicketChat from "@/components/tickets/ticket-details/TicketChat";
import TicketActivityTrail, {
  ActivityItem,
  ActivityStatus,
} from "@/components/tickets/ticket-details/TicketActivityTrail";
import TicketStatusDialog from "@/components/tickets/TicketStatusDialog";
import { sendNotification, sendEmailNotification } from "@/lib/notify";
import { logActivity } from "@/lib/activity";
import { getUserAccessibleDomains, getOrgUserIdsByDomains } from "@/lib/org";
import { toast } from "sonner";

/* -----------------------------------
   Types
----------------------------------- */
type Role = "user" | "engineer" | "admin" | "superadmin";

type TicketStatus =
  | "new"
  | "open"
  | "in_progress"
  | "hold"
  | "closed";

type Ticket = {
  id: string;
  subject: string;
  description: string | null;
  status: TicketStatus;
  priority: "low" | "medium" | "high";
  requester_id: string;
  requester_name: string;
  assignee: string | null;
  assigned_at: string | null;
  created_at: string;
  link: string | null;
  closed_comment?: string | null;
  hold_comment?: string | null;
  hold_duration_hours?: number | null;
  hold_started_at?: string | null;
  hold_until?: string | null;
  sla_response_breached?: boolean;
  sla_resolution_breached?: boolean;
  sla_response_at?: string | null;
  sla_resolution_at?: string | null;
};

type Message = {
  id: string;
  message: string;
  sender_id: string;
  sender_role: "user" | "engineer";
  created_at: string;
};

type ChatProfile = {
  id: string;
  name: string;
  avatar_url: string | null;
  role: "user" | "engineer";
};

type AssignmentRecord = {
  id: string;
  engineer_id: string;
  assigned_at: string;
  unassigned_at: string | null;
  action: string;
  engineer_name?: string;
};

type ActivityRecord = {
  id: string;
  actor_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  actor_name?: string;
};

type EngineerOption = {
  id: string;
  name: string;
  email: string;
};

/* -----------------------------------
   Helpers
----------------------------------- */
function mapTicketStatusToActivity(status: TicketStatus): ActivityStatus {
  switch (status) {
    case "in_progress": return "processing";
    case "hold":        return "hold";
    case "closed":      return "closed";
    case "open":
    case "new":
    default:            return "pending";
  }
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmtDateTime(d: Date) {
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
];

const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  created: "Ticket Created",
  acquired: "Ticket Acquired",
  closed: "Ticket Closed",
  hold: "Ticket Put On Hold",
  reopened: "Ticket Reopened",
  reassigned: "Ticket Reassigned",
  sla_response_breach: "SLA Response Breach",
  sla_resolution_breach: "SLA Resolution Breach",
};

const ACTIVITY_ACTION_STATUS: Record<string, ActivityStatus> = {
  created: "done",
  acquired: "done",
  closed: "closed",
  hold: "hold",
  reopened: "done",
  reassigned: "done",
  sla_response_breach: "hold",
  sla_resolution_breach: "hold",
};

/* -----------------------------------
   Access control
----------------------------------- */
async function checkTicketAccess(
  role: Role,
  userId: string,
  email: string,
  ticket: Ticket
): Promise<boolean> {
  if (role === "superadmin") return true;
  if (role === "user") return ticket.requester_id === userId;

  if (role === "engineer" || role === "admin") {
    if (ticket.assignee === userId) return true;
    if (ticket.assignee === null) {
      const domains = await getUserAccessibleDomains(supabase, userId, email, role);
      const orgUserIds = await getOrgUserIdsByDomains(supabase, domains);
      return orgUserIds.includes(ticket.requester_id);
    }
    return false;
  }

  return false;
}

/* -----------------------------------
   Page
----------------------------------- */
export default function TicketDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [ticket, setTicket] = React.useState<Ticket | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [role, setRole] = React.useState<Role | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [closeOpen, setCloseOpen] = React.useState(false);
  const [holdOpen, setHoldOpen] = React.useState(false);
  const [reassignOpen, setReassignOpen] = React.useState(false);
  const [selectedEngineerId, setSelectedEngineerId] = React.useState<string>("");
  const [engineers, setEngineers] = React.useState<EngineerOption[]>([]);
  const [reassignLoading, setReassignLoading] = React.useState(false);
  const [reopenLoading, setReopenLoading] = React.useState(false);

  const [requesterEmail, setRequesterEmail] = React.useState<string | null>(null);
  const [engineerName, setEngineerName] = React.useState<string>("Support Engineer");

  // Assignment history & activity log from DB
  const [assignments, setAssignments] = React.useState<AssignmentRecord[]>([]);
  const [dbActivity, setDbActivity] = React.useState<ActivityRecord[]>([]);

  /* ── Load everything ── */
  const loadData = React.useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setUserId(user.id);

    const [
      { data: ticketData },
      { data: chatData },
      { data: roleData },
      { data: assignmentData },
      { data: activityData },
    ] = await Promise.all([
      supabase.from("tickets").select("*").eq("id", id).single(),
      supabase
        .from("ticket_messages")
        .select("*")
        .eq("ticket_id", id)
        .order("created_at"),
      supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single(),
      supabase
        .from("ticket_assignments")
        .select("*")
        .eq("ticket_id", id)
        .order("assigned_at"),
      supabase
        .from("ticket_activity")
        .select("*")
        .eq("ticket_id", id)
        .order("created_at"),
    ]);

    const currentRole: Role = roleData?.role ?? "user";

    if (!ticketData) {
      router.replace("/ticket");
      return;
    }

    const hasAccess = await checkTicketAccess(
      currentRole,
      user.id,
      user.email ?? "",
      ticketData
    );

    if (!hasAccess) {
      router.replace("/ticket");
      return;
    }

    setTicket(ticketData);
    setMessages(chatData ?? []);
    setRole(currentRole);

    /* Enrich assignment history with engineer names */
    const assignmentRecords = assignmentData ?? [];
    if (assignmentRecords.length > 0) {
      const engineerIds = [...new Set(assignmentRecords.map((a: AssignmentRecord) => a.engineer_id))];
      const { data: engineerNames } = await supabase
        .from("users")
        .select("id, name")
        .in("id", engineerIds);

      const nameMap = new Map((engineerNames ?? []).map((e: { id: string; name: string }) => [e.id, e.name]));
      setAssignments(
        assignmentRecords.map((a: AssignmentRecord) => ({
          ...a,
          engineer_name: nameMap.get(a.engineer_id) ?? "Engineer",
        }))
      );
    } else {
      setAssignments([]);
    }

    /* Enrich activity log with actor names */
    const activityRecords = activityData ?? [];
    if (activityRecords.length > 0) {
      const actorIds = [...new Set(activityRecords.map((a: ActivityRecord) => a.actor_id))];
      const { data: actorNames } = await supabase
        .from("users")
        .select("id, name")
        .in("id", actorIds);

      const nameMap = new Map((actorNames ?? []).map((e: { id: string; name: string }) => [e.id, e.name]));
      setDbActivity(
        activityRecords.map((a: ActivityRecord) => ({
          ...a,
          actor_name: nameMap.get(a.actor_id) ?? "System",
        }))
      );
    } else {
      setDbActivity([]);
    }

    /* Fetch requester email & current user's name */
    const [requesterInfo, engineerInfo] = await Promise.all([
      supabase.from("users").select("email").eq("id", ticketData.requester_id).single(),
      supabase.from("users").select("name").eq("id", user.id).single(),
    ]);
    if (requesterInfo.data?.email) setRequesterEmail(requesterInfo.data.email);
    if (engineerInfo.data?.name) setEngineerName(engineerInfo.data.name);

    setLoading(false);
  }, [id, router]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── Load available engineers for reassignment ── */
  const loadEngineers = async () => {
    const { data } = await supabase
      .from("users")
      .select("id, name, email")
      .in("role", ["engineer", "admin"]);

    setEngineers(
      (data ?? []).filter((e: EngineerOption) => e.id !== ticket?.assignee)
    );
  };

  /* ── Reopen ticket ── */
  const handleReopen = async () => {
    if (!ticket || !userId) return;
    setReopenLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/tickets/reopen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ ticket_id: ticket.id }),
      });

      if (res.ok) {
        toast.success("Ticket reopened");
        await loadData();
      } else {
        toast.error("Failed to reopen ticket");
      }
    } catch {
      toast.error("Failed to reopen ticket");
    } finally {
      setReopenLoading(false);
    }
  };

  /* ── Reassign ticket ── */
  const handleReassign = async () => {
    if (!ticket || !userId || !selectedEngineerId) return;
    setReassignLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/tickets/reassign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ticket_id: ticket.id,
          new_engineer_id: selectedEngineerId,
        }),
      });

      if (res.ok) {
        toast.success("Ticket reassigned");
        setReassignOpen(false);
        setSelectedEngineerId("");
        await loadData();
      } else {
        toast.error("Failed to reassign ticket");
      }
    } catch {
      toast.error("Failed to reassign ticket");
    } finally {
      setReassignLoading(false);
    }
  };

  if (loading || !ticket || !userId || !role) {
    return (
      <div className="p-6">
        <Skeleton className="h-6 w-40 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const currentUserProfile: ChatProfile = {
    id: userId,
    name: ticket.requester_name,
    avatar_url: null,
    role: role === "engineer" || role === "admin" || role === "superadmin" ? "engineer" : "user",
  };

  const engineerProfile: ChatProfile = {
    id: ticket.assignee ?? "engineer",
    name: engineerName,
    avatar_url: null,
    role: "engineer",
  };

  const isStaff = role !== "user";

  /* ── Build activity trail from DB records ── */
  const activityItems: ActivityItem[] = dbActivity.length > 0
    ? dbActivity.map((a) => {
        const details = a.details ?? {};
        let comment: string | null = null;

        if (a.action === "hold") {
          const dur = details.hold_duration_hours as number | undefined;
          const reason = details.reason as string | undefined;
          comment = [
            dur ? `Duration: ${dur} hours` : null,
            reason ? `Reason: ${reason}` : null,
          ].filter(Boolean).join("\n");
        } else if (a.action === "closed") {
          comment = (details.comment as string) ?? null;
        } else if (a.action === "reopened") {
          comment = `Reopened from ${details.previous_status ?? "previous"} status`;
        } else if (a.action === "reassigned") {
          comment = `${details.previous_engineer_name ?? "Previous engineer"} → ${details.new_engineer_name ?? "New engineer"}`;
        } else if (a.action === "sla_response_breach" || a.action === "sla_resolution_breach") {
          comment = (details.message as string) ?? null;
        }

        return {
          label: `${ACTIVITY_ACTION_LABELS[a.action] ?? a.action} by ${a.actor_name}`,
          date: fmtDateTime(new Date(a.created_at)),
          status: ACTIVITY_ACTION_STATUS[a.action] ?? "done",
          comment,
        };
      })
    : [
        // Fallback: build from ticket data if no DB activity yet
        {
          label: "Ticket Created",
          date: fmtDate(new Date(ticket.created_at)),
          status: "done" as ActivityStatus,
        },
        {
          label: "Ticket Acquired",
          date: ticket.assigned_at ? fmtDate(new Date(ticket.assigned_at)) : undefined,
          status: (ticket.assignee ? "done" : "pending") as ActivityStatus,
        },
        {
          label: "Engineer is working on ticket",
          status: mapTicketStatusToActivity(ticket.status),
        },
        ...(ticket.status === "hold"
          ? ([{ label: "Ticket On Hold", date: fmtDate(new Date()), status: "hold" as ActivityStatus, comment: ticket.hold_comment ?? null }])
          : []),
        ...(ticket.status === "closed"
          ? ([{ label: "Ticket Closed", date: fmtDate(new Date()), status: "closed" as ActivityStatus, comment: ticket.closed_comment ?? null }])
          : []),
      ];

  /* ── Unique engineers who worked on this ticket ── */
  const uniqueEngineers = assignments.reduce<AssignmentRecord[]>((acc, a) => {
    if (!acc.find((x) => x.engineer_id === a.engineer_id)) acc.push(a);
    return acc;
  }, []);

  /* ── SLA indicators ── */
  const slaResponseBreached = ticket.sla_response_breached ?? false;
  const slaResolutionBreached = ticket.sla_resolution_breached ?? false;
  const hasSlaBreach = slaResponseBreached || slaResolutionBreached;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-xl font-semibold">Ticket Details</h2>
          {hasSlaBreach && (
            <Badge className="bg-red-100 text-red-700 gap-1">
              <AlertTriangle className="h-3 w-3" />
              SLA Breach
            </Badge>
          )}
        </div>
      </div>

      {/* SLA Status Bar */}
      {(ticket.sla_response_at || ticket.sla_resolution_at || ticket.hold_until) && (
        <div className="flex flex-wrap gap-3">
          {ticket.status === "new" && ticket.sla_response_at && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
              slaResponseBreached
                ? "bg-red-50 text-red-700 border border-red-200"
                : "bg-blue-50 text-blue-700 border border-blue-200"
            }`}>
              <Clock className="h-4 w-4" />
              <span>Response SLA: {slaResponseBreached ? "BREACHED" : fmtDateTime(new Date(ticket.sla_response_at))}</span>
            </div>
          )}
          {ticket.sla_resolution_at && ticket.assignee && ticket.status !== "closed" && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
              slaResolutionBreached
                ? "bg-red-50 text-red-700 border border-red-200"
                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
            }`}>
              <Shield className="h-4 w-4" />
              <span>Resolution SLA: {slaResolutionBreached ? "BREACHED" : fmtDateTime(new Date(ticket.sla_resolution_at))}</span>
            </div>
          )}
          {ticket.status === "hold" && ticket.hold_until && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-amber-50 text-amber-700 border border-amber-200">
              <Clock className="h-4 w-4" />
              <span>On Hold until: {fmtDateTime(new Date(ticket.hold_until))}</span>
              {ticket.hold_duration_hours && (
                <Badge variant="outline" className="ml-1">{ticket.hold_duration_hours}h</Badge>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT */}
        <TicketMetaPanel
          ticketId={ticket.id}
          subject={ticket.subject}
          priority={ticket.priority}
          requesterName={ticket.requester_name}
          assigneeText={ticket.assignee}
          createdAt={ticket.created_at}
          assignedAt={ticket.assigned_at}
          attachments={[]}
          link={ticket.link}
        />

        {/* CENTER */}
        <Card className="p-5 flex flex-col h-[680px]">
          <TicketChat
            ticketId={id}
            ticketSubject={ticket.subject}
            messages={messages}
            setMessages={setMessages}
            currentUser={currentUserProfile}
            otherUser={engineerProfile}
            activityItems={activityItems}
            onSend={async (text) => {
              await supabase.from("ticket_messages").insert({
                ticket_id: id,
                sender_id: userId,
                sender_role: isStaff ? "engineer" : "user",
                message: text,
              });
            }}
          />
        </Card>

        {/* RIGHT — Activity & Actions */}
        <Card className="p-5 space-y-5 overflow-y-auto max-h-[720px]">
          <h3 className="text-lg font-bold">Activity Log</h3>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              Ticket ID
            </p>
            <p className="text-xl font-extrabold tracking-tight">
              {`PN${ticket.id.replace(/-/g, "").slice(0, 7).toUpperCase()}`}
            </p>
          </div>

          {/* Assignee History — Overlapping Avatars */}
          {uniqueEngineers.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Engineers ({uniqueEngineers.length})
              </p>
              <div className="flex items-center">
                {uniqueEngineers.slice(0, 4).map((a, i) => (
                  <Avatar
                    key={a.engineer_id}
                    className={`h-9 w-9 ring-2 ring-background shadow-sm ${i > 0 ? "-ml-2.5" : ""}`}
                    title={a.engineer_name}
                  >
                    <AvatarFallback
                      className={`text-xs font-bold ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
                    >
                      {(a.engineer_name ?? "E")[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {uniqueEngineers.length > 4 && (
                  <span className="-ml-2.5 flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-background bg-blue-500 text-[10px] font-bold text-white shadow-sm">
                    +{uniqueEngineers.length - 4}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="border-t border-border/60" />

          <TicketActivityTrail items={activityItems} />

          {/* Action Buttons */}
          {isStaff && (
            <div className="space-y-3 pt-2">
              {/* Close & Hold — only when ticket is active */}
              {ticket.status !== "closed" && ticket.status !== "hold" && (
                <>
                  <Button className="w-full" onClick={() => setCloseOpen(true)}>
                    Close Ticket
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setHoldOpen(true)}
                  >
                    Hold Ticket
                  </Button>
                </>
              )}

              {/* Reopen — for closed or on-hold tickets */}
              {(ticket.status === "closed" || ticket.status === "hold") && (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={handleReopen}
                  disabled={reopenLoading}
                >
                  <RotateCcw className="h-4 w-4" />
                  {reopenLoading ? "Reopening..." : "Reopen Ticket"}
                </Button>
              )}

              {/* Reassign — for admin/superadmin when ticket has an assignee */}
              {(role === "admin" || role === "superadmin") && ticket.assignee && ticket.status !== "closed" && (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => {
                    loadEngineers();
                    setReassignOpen(true);
                  }}
                >
                  <UserPlus className="h-4 w-4" />
                  Reassign Ticket
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* Close Dialog */}
        <TicketStatusDialog
          open={closeOpen}
          onClose={() => setCloseOpen(false)}
          title="Close Ticket"
          onSubmit={async (comment) => {
            if (!isStaff) return;

            await supabase
              .from("tickets")
              .update({ status: "closed", closed_comment: comment })
              .eq("id", ticket.id);

            /* Notify requester */
            await sendNotification({
              user_id: ticket.requester_id,
              actor_id: userId,
              ticket_id: ticket.id,
              type: "closed",
              message: `closed your ticket #${ticket.id.slice(0, 8).toUpperCase()}`,
            });

            if (requesterEmail) {
              sendEmailNotification({
                recipient_email: requesterEmail,
                recipient_name: ticket.requester_name,
                actor_name: engineerName,
                ticket_id: ticket.id,
                ticket_subject: ticket.subject,
                action: "closed",
                comment,
              });
            }

            /* Notify admins */
            const { data: admins } = await supabase
              .from("users")
              .select("id, email, name")
              .in("role", ["admin", "superadmin"]);

            for (const admin of admins ?? []) {
              if (admin.id === userId) continue;

              sendNotification({
                user_id: admin.id,
                actor_id: userId,
                ticket_id: ticket.id,
                type: "closed",
                message: `closed ticket #${ticket.id.slice(0, 8).toUpperCase()}`,
              });

              if (admin.email) {
                sendEmailNotification({
                  recipient_email: admin.email,
                  recipient_name: admin.name ?? "Admin",
                  actor_name: engineerName,
                  ticket_id: ticket.id,
                  ticket_subject: ticket.subject,
                  action: "closed",
                  comment,
                });
              }
            }

            logActivity({
              ticket_id: ticket.id,
              actor_id: userId,
              action: "closed",
              details: { comment, engineer_name: engineerName },
            });

            setCloseOpen(false);
            await loadData();
          }}
        />

        {/* Hold Dialog — with duration */}
        <TicketStatusDialog
          open={holdOpen}
          onClose={() => setHoldOpen(false)}
          title="Hold Ticket"
          showHoldDuration
          onSubmit={async (comment, holdDurationHours) => {
            if (!isStaff) return;

            const holdStartedAt = new Date().toISOString();
            const holdUntil = holdDurationHours
              ? new Date(Date.now() + holdDurationHours * 60 * 60 * 1000).toISOString()
              : null;

            await supabase
              .from("tickets")
              .update({
                status: "hold",
                hold_comment: comment,
                hold_duration_hours: holdDurationHours ?? null,
                hold_started_at: holdStartedAt,
                hold_until: holdUntil,
              })
              .eq("id", ticket.id);

            await sendNotification({
              user_id: ticket.requester_id,
              actor_id: userId,
              ticket_id: ticket.id,
              type: "hold",
              message: `put your ticket #${ticket.id.slice(0, 8).toUpperCase()} on hold for ${holdDurationHours ?? 24} hours`,
            });

            if (requesterEmail) {
              sendEmailNotification({
                recipient_email: requesterEmail,
                recipient_name: ticket.requester_name,
                actor_name: engineerName,
                ticket_id: ticket.id,
                ticket_subject: ticket.subject,
                action: "hold",
                comment: `Hold Duration: ${holdDurationHours ?? 24} hours\nReason: ${comment}`,
              });
            }

            /* Also notify admins about hold */
            const { data: admins } = await supabase
              .from("users")
              .select("id, email, name")
              .in("role", ["admin", "superadmin"]);

            for (const admin of admins ?? []) {
              if (admin.id !== userId) {
                sendNotification({
                  user_id: admin.id,
                  actor_id: userId,
                  ticket_id: ticket.id,
                  type: "hold",
                  message: `put ticket #${ticket.id.slice(0, 8).toUpperCase()} on hold for ${holdDurationHours ?? 24} hours`,
                });

                if (admin.email) {
                  sendEmailNotification({
                    recipient_email: admin.email,
                    recipient_name: admin.name ?? "Admin",
                    actor_name: engineerName,
                    ticket_id: ticket.id,
                    ticket_subject: ticket.subject,
                    action: "hold",
                    comment: `Hold Duration: ${holdDurationHours ?? 24} hours\nReason: ${comment}`,
                  });
                }
              }
            }

            logActivity({
              ticket_id: ticket.id,
              actor_id: userId,
              action: "hold",
              details: {
                hold_duration_hours: holdDurationHours,
                reason: comment,
                engineer_name: engineerName,
              },
            });

            setHoldOpen(false);
            await loadData();
          }}
        />

        {/* Reassign Dialog */}
        <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reassign Ticket</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Select an engineer to reassign this ticket to:
              </p>
              <Select value={selectedEngineerId} onValueChange={setSelectedEngineerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select engineer" />
                </SelectTrigger>
                <SelectContent>
                  {engineers.map((eng) => (
                    <SelectItem key={eng.id} value={eng.id}>
                      {eng.name} ({eng.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setReassignOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleReassign}
                  disabled={!selectedEngineerId || reassignLoading}
                >
                  {reassignLoading ? "Reassigning..." : "Reassign"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
