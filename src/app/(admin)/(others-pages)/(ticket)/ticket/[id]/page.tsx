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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, type PageHeaderMetaItem } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { statusLabel } from "@/lib/ticket-utils";
import {
  ArrowLeft,
  RotateCcw,
  UserPlus,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  Eye,
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
import RequesterTicketHistory from "@/components/tickets/ticket-details/RequesterTicketHistory";
import TicketStatusDialog from "@/components/tickets/TicketStatusDialog";
import { isStaffRole, ticketPermissions } from "@/lib/ticket-access";
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
  tenant_id: string | null;
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

async function postJson(url: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: "Your session has expired. Sign in again." };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true, error: null };
    const result = await res.json().catch(() => null);
    return { ok: false, error: (result?.error as string | undefined) ?? null };
  } catch {
    return { ok: false, error: null };
  }
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
  const [myTenantId, setMyTenantId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [closeOpen, setCloseOpen] = React.useState(false);
  const [holdOpen, setHoldOpen] = React.useState(false);
  const [reassignOpen, setReassignOpen] = React.useState(false);
  const [selectedEngineerId, setSelectedEngineerId] = React.useState<string>("");
  const [engineers, setEngineers] = React.useState<EngineerOption[]>([]);
  const [reassignNote, setReassignNote] = React.useState("");
  const [reassignLoading, setReassignLoading] = React.useState(false);
  const [reopenLoading, setReopenLoading] = React.useState(false);
  const [acquireLoading, setAcquireLoading] = React.useState(false);

  // Display names for the chat and the header
  const [myName, setMyName] = React.useState<string>("You");
  const [assigneeName, setAssigneeName] = React.useState<string | null>(null);
  const [peopleNames, setPeopleNames] = React.useState<Record<string, string | null>>({});

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
      supabase.from("tickets").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("ticket_messages")
        .select("*")
        .eq("ticket_id", id)
        .order("created_at"),
      supabase
        .from("users")
        .select("role, tenant_id")
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

    // The database (RLS) decides who may open a ticket: no row, no access.
    if (!ticketData) {
      router.replace("/ticket");
      return;
    }

    setTicket(ticketData);
    setMessages(chatData ?? []);
    setRole(currentRole);
    setMyTenantId(roleData?.tenant_id ?? null);

    /* Enrich assignment history with engineer names */
    const assignmentRecords = assignmentData ?? [];
    if (assignmentRecords.length > 0) {
      const engineerIds = [...new Set(assignmentRecords.map((a: AssignmentRecord) => a.engineer_id))];
      const { data: engineerNames } = await supabase
        .from("users")
        .select("id, name:full_name")
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
        .select("id, name:full_name")
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

    /* Names for the chat and header: me, the requester, the engineer on the
       ticket, and everyone who wrote in the conversation */
    const peopleIds = [
      ...new Set(
        [
          user.id,
          ticketData.requester_id,
          ticketData.assignee,
          ...(chatData ?? []).map((m: Message) => m.sender_id),
        ].filter((v): v is string => !!v)
      ),
    ];
    const { data: peopleData } = await supabase
      .from("users")
      .select("id, name:full_name")
      .in("id", peopleIds);
    const names = new Map(
      (peopleData ?? []).map((p: { id: string; name: string | null }) => [p.id, p.name])
    );
    // Always overwrite, so values never leak over from the last ticket viewed
    setPeopleNames(Object.fromEntries(names));
    setMyName(names.get(user.id) ?? "You");
    setAssigneeName(ticketData.assignee ? names.get(ticketData.assignee) ?? "Engineer" : null);

    setLoading(false);
  }, [id, router]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── Stay current when someone else acquires, transfers or closes this
        ticket, so buttons, view-only state and the chat partner are right ── */
  React.useEffect(() => {
    const channel = supabase
      .channel(`ticket-row-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets", filter: `id=eq.${id}` },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, loadData]);

  /* ── Load who this ticket can be transferred to (the IT team of
        the ticket's tenant; worked out on the server) ── */
  const loadEngineers = async () => {
    setEngineers([]);
    if (!ticket) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const res = await fetch(`/api/tickets/reassign?ticket_id=${encodeURIComponent(ticket.id)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await res.json().catch(() => null);
      if (res.ok) setEngineers((result?.engineers ?? []) as EngineerOption[]);
      else toast.error(result?.error ?? "Couldn't load engineers");
    } catch {
      toast.error("Couldn't load engineers");
    }
  };

  /* ── Acquire (unassigned ticket) ── */
  const handleAcquire = async () => {
    if (!ticket) return;
    setAcquireLoading(true);
    const { ok, error } = await postJson("/api/tickets/acquire", { ticket_id: ticket.id });
    setAcquireLoading(false);

    if (ok) toast.success("Ticket acquired. It is now in your tasks.");
    else toast.error(error ?? "Failed to acquire ticket");
    await loadData();
  };

  /* ── Reopen ticket ── */
  const handleReopen = async () => {
    if (!ticket || !userId) return;
    setReopenLoading(true);
    const { ok, error } = await postJson("/api/tickets/reopen", { ticket_id: ticket.id });
    setReopenLoading(false);

    if (ok) {
      toast.success("Ticket reopened");
      await loadData();
    } else {
      toast.error(error ?? "Failed to reopen ticket");
    }
  };

  /* ── Transfer / escalate ticket ── */
  const handleReassign = async () => {
    if (!ticket || !userId || !selectedEngineerId) return;
    setReassignLoading(true);
    const { ok, error } = await postJson("/api/tickets/reassign", {
      ticket_id: ticket.id,
      new_engineer_id: selectedEngineerId,
      comment: reassignNote.trim() || null,
    });
    setReassignLoading(false);

    if (ok) {
      toast.success("Ticket transferred");
      setReassignOpen(false);
      setSelectedEngineerId("");
      setReassignNote("");
      await loadData();
    } else {
      toast.error(error ?? "Failed to transfer ticket");
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

  const isStaff = isStaffRole(role);
  const can = ticketPermissions({ id: userId, role, tenant_id: myTenantId }, ticket);

  // In the conversation, the requester is the "user" side (even an admin who
  // raised a ticket for themselves); everyone else is the support side.
  const currentUserProfile: ChatProfile = {
    id: userId,
    name: myName,
    avatar_url: null,
    role: can.isRequester ? "user" : "engineer",
  };

  // The other side of the conversation: for the requester, the engineer on the
  // ticket; for the engineer (or a viewer), the requester. Messages and emails
  // go to this person — never back to the sender.
  const otherProfile: ChatProfile = can.isRequester
    ? {
        id: ticket.assignee ?? "",
        name: assigneeName ?? "Support Team",
        avatar_url: null,
        role: "engineer",
      }
    : {
        id: ticket.requester_id,
        name: peopleNames[ticket.requester_id] ?? ticket.requester_name ?? "Requester",
        avatar_url: null,
        role: "user",
      };

  // Real names for every message sender
  const chatParticipants: Record<string, ChatProfile> = Object.fromEntries(
    messages.map((m) => [
      m.sender_id,
      {
        id: m.sender_id,
        name:
          peopleNames[m.sender_id] ??
          (m.sender_role === "engineer" ? "Support Engineer" : ticket.requester_name ?? "Requester"),
        avatar_url: null,
        role: m.sender_role,
      },
    ])
  );

  const chatReadOnlyMessage = can.canChat
    ? undefined
    : ticket.assignee
      ? `View only. This ticket is assigned to ${assigneeName ?? "another engineer"}; only they can reply.`
      : "Acquire this ticket to reply to the requester.";

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
      dot: "bg-brand-400",
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

            {/* Action Buttons — only for people allowed to work this ticket */}
            {isStaff && (
              <>
                {/* Acquire — unassigned ticket; it must be picked up before anyone works on it */}
                {can.canAcquire && (
                  <Button size="sm" onClick={handleAcquire} disabled={acquireLoading}>
                    {acquireLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserCheck className="h-4 w-4" />
                    )}
                    {acquireLoading ? "Acquiring..." : "Acquire Ticket"}
                  </Button>
                )}

                {/* Transfer / escalate — the assigned engineer, or an admin */}
                {can.canTransfer && (
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
                    Transfer / Escalate
                  </Button>
                )}

                {/* Reopen — closed or on-hold tickets */}
                {can.canReopen && (
                  <Button
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

                {/* Close & Hold — the assigned engineer, while the ticket is active */}
                {can.canCloseOrHold && (
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
                    <Button size="sm" onClick={() => setCloseOpen(true)}>
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
        {(hasSlaBreach || can.viewOnly) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {hasSlaBreach && (
              <StatusBadge tone="red">
                <AlertTriangle className="h-3 w-3" />
                SLA Breach
              </StatusBadge>
            )}
            {can.viewOnly && (
              <StatusBadge tone="gray">
                <Eye className="h-3 w-3" />
                {ticket.assignee
                  ? `View only · Assigned to ${assigneeName ?? "another engineer"}`
                  : "Unassigned · Acquire it to start working"}
              </StatusBadge>
            )}
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
            otherUser={otherProfile}
            participants={chatParticipants}
            activityItems={activityItems}
            readOnly={!can.canChat}
            readOnlyMessage={chatReadOnlyMessage}
            onSend={async (text, onlineUserIds) => {
              if (!can.canChat) return false;
              // The server checks this person may still write (requester or the
              // CURRENT assignee) and notifies the other side.
              const { ok, error } = await postJson("/api/tickets/message", {
                ticket_id: id,
                message: text,
                online_user_ids: onlineUserIds,
              });
              if (!ok) {
                toast.error(error ?? "Failed to send message");
                await loadData(); // e.g. the ticket was transferred meanwhile
                return false;
              }
              return true;
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
            assigneeText={ticket.assignee ? assigneeName ?? "Engineer" : null}
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

          {/* The IT team sees the requester's other tickets and their status */}
          {isStaff && (
            <RequesterTicketHistory
              requesterId={ticket.requester_id}
              requesterName={peopleNames[ticket.requester_id] ?? ticket.requester_name ?? "this user"}
              currentTicketId={ticket.id}
              currentUserId={userId}
            />
          )}
        </div>
      </div>

      {/* Close Dialog */}
      <TicketStatusDialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="Close Ticket"
        onSubmit={async (comment) => {
          if (!can.canCloseOrHold) return;

          // The server checks this person is the assigned engineer, updates
          // the ticket, and notifies the requester (web + email).
          const { ok, error } = await postJson("/api/tickets/status", {
            ticket_id: ticket.id,
            status: "closed",
            comment,
          });

          if (ok) toast.success("Ticket closed");
          else toast.error(error ?? "Failed to close ticket");

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
          if (!can.canCloseOrHold) return;

          const { ok, error } = await postJson("/api/tickets/status", {
            ticket_id: ticket.id,
            status: "hold",
            comment,
            hold_duration_hours: holdDurationHours ?? 24,
          });

          if (ok) toast.success("Ticket put on hold");
          else toast.error(error ?? "Failed to put ticket on hold");

          setHoldOpen(false);
          await loadData();
        }}
      />

      {/* Transfer / Escalate Dialog */}
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/20">
                <UserPlus className="h-4 w-4" />
              </span>
              <div className="min-w-0 text-left">
                <DialogTitle className="text-base font-semibold text-gray-900 dark:text-white">
                  Transfer / Escalate Ticket
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Hand this ticket to another engineer. They, the requester and
                  your organisation&apos;s admins are notified by email and in the app.
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

          <Field>
            <FieldLabel htmlFor="reassign-note">Note</FieldLabel>
            <Textarea
              id="reassign-note"
              placeholder="Why it is being transferred or escalated (optional)"
              value={reassignNote}
              onChange={(e) => setReassignNote(e.target.value)}
              className="min-h-[90px] resize-none"
            />
            <FieldDescription>Included in the emails.</FieldDescription>
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
              {reassignLoading ? "Transferring..." : "Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
