"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { PageHeader, type PageHeaderMetaItem } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { statusLabel } from "@/lib/ticket-utils";
import {
  ArrowLeft,
  RotateCcw,
  UserPlus,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PauseCircle,
  Ticket as TicketIcon,
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
  category?: string | null;
  sub_category?: string | null;
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

/** Hero meta dot colour per ticket status */
const STATUS_DOT: Record<string, string> = {
  new: "bg-blue-400",
  open: "bg-amber-400",
  in_progress: "bg-orange-400",
  hold: "bg-violet-400",
  closed: "bg-emerald-400",
};

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-400",
  medium: "bg-amber-400",
  low: "bg-emerald-400",
};

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
      <div className="flex flex-col gap-6">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <Skeleton className="h-[640px] w-full rounded-2xl xl:col-span-8 xl:h-[760px]" />
          <div className="flex flex-col gap-6 xl:col-span-4">
            <Skeleton className="h-[420px] w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        </div>
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
          action: a.action,
          actor: a.actor_name,
          timestamp: a.created_at,
        };
      })
    : [
        // Fallback: build from ticket data if no DB activity yet
        {
          label: "Ticket Created",
          date: fmtDate(new Date(ticket.created_at)),
          status: "done" as ActivityStatus,
          action: "created",
          timestamp: ticket.created_at,
        },
        {
          label: "Ticket Acquired",
          date: ticket.assigned_at ? fmtDate(new Date(ticket.assigned_at)) : undefined,
          status: (ticket.assignee ? "done" : "pending") as ActivityStatus,
          action: ticket.assignee ? "acquired" : undefined,
          timestamp: ticket.assigned_at ?? undefined,
        },
        {
          label: "Engineer is working on ticket",
          status: mapTicketStatusToActivity(ticket.status),
        },
        ...(ticket.status === "hold"
          ? ([{ label: "Ticket On Hold", date: fmtDate(new Date()), status: "hold" as ActivityStatus, comment: ticket.hold_comment ?? null, action: "hold" }])
          : []),
        ...(ticket.status === "closed"
          ? ([{ label: "Ticket Closed", date: fmtDate(new Date()), status: "closed" as ActivityStatus, comment: ticket.closed_comment ?? null, action: "closed" }])
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

  /* ── Hero header facts ── */
  const shortId = ticket.id.slice(0, 8).toUpperCase();
  const categoryText = [ticket.category, ticket.sub_category].filter(Boolean).join(" / ");
  const heroMeta: PageHeaderMetaItem[] = [
    { label: statusLabel(ticket.status), dot: STATUS_DOT[ticket.status] ?? "bg-gray-400" },
    ...(ticket.priority
      ? [{ label: `${statusLabel(ticket.priority)} priority`, dot: PRIORITY_DOT[ticket.priority] ?? "bg-gray-400" }]
      : []),
    ...(categoryText ? [{ label: categoryText, dot: "bg-sky-400" }] : []),
    {
      label: (
        <>
          Requested by{" "}
          <span className="font-medium text-gray-900 dark:text-white">{ticket.requester_name}</span>
        </>
      ),
      dot: "bg-indigo-400",
    },
    { label: `Created ${fmtDateTime(new Date(ticket.created_at))}`, dot: "bg-gray-400" },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        variant="hero"
        breadcrumbs={[{ label: "Tickets", href: "/ticket" }, { label: `#${shortId}` }]}
        eyebrow="Ticket"
        eyebrowIcon={TicketIcon}
        title={<span className="break-words">{ticket.subject}</span>}
        meta={heroMeta}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.back()}
              className="bg-white/80 dark:bg-gray-900/60"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>

            {/* Action Buttons */}
            {isStaff && (
              <>
                {/* Reassign — for admin/superadmin when ticket has an assignee */}
                {(role === "admin" || role === "superadmin") && ticket.assignee && ticket.status !== "closed" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-white/80 dark:bg-gray-900/60"
                    onClick={() => {
                      loadEngineers();
                      setReassignOpen(true);
                    }}
                  >
                    <UserPlus className="h-4 w-4" />
                    Reassign Ticket
                  </Button>
                )}

                {/* Reopen — for closed or on-hold tickets */}
                {(ticket.status === "closed" || ticket.status === "hold") && (
                  <Button
                    variant="gradient"
                    size="sm"
                    onClick={handleReopen}
                    disabled={reopenLoading}
                  >
                    {reopenLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    {reopenLoading ? "Reopening..." : "Reopen Ticket"}
                  </Button>
                )}

                {/* Close & Hold — only when ticket is active */}
                {ticket.status !== "closed" && ticket.status !== "hold" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-white/80 dark:bg-gray-900/60"
                      onClick={() => setHoldOpen(true)}
                    >
                      <PauseCircle className="h-4 w-4" />
                      Hold Ticket
                    </Button>
                    <Button variant="gradient" size="sm" onClick={() => setCloseOpen(true)}>
                      <CheckCircle2 className="h-4 w-4" />
                      Close Ticket
                    </Button>
                  </>
                )}
              </>
            )}
          </>
        }
      >
        {hasSlaBreach && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge tone="red">
              <AlertTriangle className="h-3 w-3" />
              SLA Breach
            </StatusBadge>
          </div>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Conversation */}
        <div className="min-w-0 xl:col-span-8">
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
        </div>

        {/* Details & Activity */}
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-4">
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
            description={ticket.description}
            status={ticket.status}
            category={ticket.category}
            subCategory={ticket.sub_category}
            engineers={uniqueEngineers.map((a) => ({
              id: a.engineer_id,
              name: a.engineer_name ?? "Engineer",
            }))}
            sla={{
              responseAt: ticket.sla_response_at,
              resolutionAt: ticket.sla_resolution_at,
              responseBreached: slaResponseBreached,
              resolutionBreached: slaResolutionBreached,
              holdUntil: ticket.hold_until,
              holdStartedAt: ticket.hold_started_at,
              holdDurationHours: ticket.hold_duration_hours,
            }}
          />

          <TicketActivityTrail items={activityItems} />
        </div>
      </div>

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
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/20">
                <UserPlus className="h-4 w-4" />
              </span>
              <div className="min-w-0 text-left">
                <DialogTitle className="text-base font-semibold text-gray-900 dark:text-white">
                  Reassign Ticket
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Select an engineer to reassign this ticket to:
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="reassign-engineer" required>
              Engineer
            </FieldLabel>
            <Select value={selectedEngineerId} onValueChange={setSelectedEngineerId}>
              <SelectTrigger id="reassign-engineer" className="w-full">
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
          </Field>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleReassign}
              disabled={!selectedEngineerId || reassignLoading}
            >
              {reassignLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {reassignLoading ? "Reassigning..." : "Reassign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
