"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";

import TicketMetaPanel from "@/components/tickets/ticket-details/TicketMetaPanel";
import TicketChat from "@/components/tickets/ticket-details/TicketChat";
import TicketActivityTrail, {
  ActivityItem,
  ActivityStatus,
} from "@/components/tickets/ticket-details/TicketActivityTrail";
import TicketStatusDialog from "@/components/tickets/TicketStatusDialog";
import { sendNotification } from "@/lib/notify";
import { getUserAccessibleDomains, getOrgUserIdsByDomains } from "@/lib/org";

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

/* -----------------------------------
   Access control
----------------------------------- */
async function checkTicketAccess(
  role: Role,
  userId: string,
  email: string,
  ticket: Ticket
): Promise<boolean> {
  // superadmin can see everything
  if (role === "superadmin") return true;

  // user can only see their own tickets
  if (role === "user") return ticket.requester_id === userId;

  // engineer / admin — can only see:
  //   1. Tickets assigned to themselves
  //   2. Unassigned tickets in their org (queue)
  if (role === "engineer" || role === "admin") {
    // Assigned to this user → allow
    if (ticket.assignee === userId) return true;

    // Unassigned (in queue) + same org → allow
    if (ticket.assignee === null) {
      const domains = await getUserAccessibleDomains(supabase, userId, email, role);
      const orgUserIds = await getOrgUserIdsByDomains(supabase, domains);
      return orgUserIds.includes(ticket.requester_id);
    }

    // Assigned to another engineer → deny
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

  /* ── Load Ticket + Messages + Role ── */
  React.useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);

      const [
        { data: ticketData },
        { data: chatData },
        { data: roleData },
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
      ]);

      const currentRole: Role = roleData?.role ?? "user";

      if (!ticketData) {
        router.replace("/ticket");
        return;
      }

      /* ── Authorization check ── */
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
      setLoading(false);
    };

    loadData();
  }, [id, router]);

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
    role: role === "engineer" ? "engineer" : "user",
  };

  const engineerProfile: ChatProfile = {
    id: ticket.assignee ?? "engineer",
    name: "Support Engineer",
    avatar_url: null,
    role: "engineer",
  };

  /* ── Activity Trail ─────────────── */
  const activityItems: ActivityItem[] = [
    {
      label: "Ticket Created",
      date: fmtDate(new Date(ticket.created_at)),
      status: "done",
    },
    {
      label: "Ticket Acquired",
      date: ticket.assigned_at
        ? fmtDate(new Date(ticket.assigned_at))
        : undefined,
      status: ticket.assignee ? "done" : "pending",
    },
    {
      label: "Engineer is working on ticket",
      status: mapTicketStatusToActivity(ticket.status),
    },

    ...(ticket.status === "hold"
      ? ([{
          label: "Ticket On Hold",
          date: fmtDate(new Date()),
          status: "hold",
          comment: ticket.hold_comment ?? null,
        }] satisfies ActivityItem[])
      : []),

    ...(ticket.status === "closed"
      ? ([{
          label: "Ticket Closed",
          date: fmtDate(new Date()),
          status: "closed",
          comment: ticket.closed_comment ?? null,
        }] satisfies ActivityItem[])
      : []),
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl font-semibold">Ticket Details</h2>
      </div>

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
            messages={messages}
            setMessages={setMessages}
            currentUser={currentUserProfile}
            otherUser={engineerProfile}
            activityItems={activityItems}
            onSend={async (text) => {
              await supabase.from("ticket_messages").insert({
                ticket_id: id,
                sender_id: userId,
                sender_role: role === "engineer" ? "engineer" : "user",
                message: text,
              });
            }}
          />
        </Card>

        {/* RIGHT */}
        <Card className="p-5 space-y-5">
          <h3 className="text-lg font-bold">Activity Log</h3>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              Ticket ID
            </p>
            <p className="text-xl font-extrabold tracking-tight">
              {`PN${ticket.id.replace(/-/g, "").slice(0, 7).toUpperCase()}`}
            </p>
          </div>

          <div className="border-t border-border/60" />

          <TicketActivityTrail items={activityItems} />

          {role !== "user" && ticket.status !== "closed" && (
            <div className="space-y-3">
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
            </div>
          )}
        </Card>

        {/* Close Dialog */}
        <TicketStatusDialog
          open={closeOpen}
          onClose={() => setCloseOpen(false)}
          title="Close Ticket Comment"
          onSubmit={async (comment) => {
            if (role === "user") return;

            await supabase
              .from("tickets")
              .update({ status: "closed", closed_comment: comment })
              .eq("id", ticket.id);

            /* Notify the ticket requester */
            await sendNotification({
              user_id: ticket.requester_id,
              actor_id: userId,
              ticket_id: ticket.id,
              type: "closed",
              message: `closed your ticket #${ticket.id.slice(0, 8).toUpperCase()}`,
            });

            setCloseOpen(false);
            setTicket({ ...ticket, status: "closed", closed_comment: comment });
          }}
        />

        {/* Hold Dialog */}
        <TicketStatusDialog
          open={holdOpen}
          onClose={() => setHoldOpen(false)}
          title="Hold Ticket Comment"
          onSubmit={async (comment) => {
            if (role === "user") return;

            await supabase
              .from("tickets")
              .update({ status: "hold", hold_comment: comment })
              .eq("id", ticket.id);

            /* Notify the ticket requester */
            await sendNotification({
              user_id: ticket.requester_id,
              actor_id: userId,
              ticket_id: ticket.id,
              type: "hold",
              message: `put your ticket #${ticket.id.slice(0, 8).toUpperCase()} on hold`,
            });

            setHoldOpen(false);
            setTicket({ ...ticket, status: "hold", hold_comment: comment });
          }}
        />
      </div>
    </div>
  );
}
