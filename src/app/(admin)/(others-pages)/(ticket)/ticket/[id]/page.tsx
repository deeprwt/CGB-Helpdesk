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

/* -----------------------------------
   Types
----------------------------------- */
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
  requester_name: string;
  assignee: string | null;
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
   Status Mapper (CRITICAL FIX)
----------------------------------- */
function mapTicketStatusToActivity(
  status: TicketStatus
): ActivityStatus {
  switch (status) {
    case "in_progress":
      return "processing";
    case "hold":
      return "hold";
    case "closed":
      return "closed";
    case "open":
    case "new":
    default:
      return "pending";
  }
}

export default function TicketDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [ticket, setTicket] = React.useState<Ticket | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [closeOpen, setCloseOpen] = React.useState(false);
  const [holdOpen, setHoldOpen] = React.useState(false);

  /* -----------------------------------
     Load Ticket + Messages
  ----------------------------------- */
  React.useEffect(() => {
    const loadData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      setUserId(user.id);

      const [{ data: ticketData }, { data: chatData }] =
        await Promise.all([
          supabase
            .from("tickets")
            .select("*")
            .eq("id", id)
            .single(),
          supabase
            .from("ticket_messages")
            .select("*")
            .eq("ticket_id", id)
            .order("created_at"),
        ]);

      setTicket(ticketData);
      setMessages(chatData ?? []);
      setLoading(false);
    };

    loadData();
  }, [id]);

  if (loading || !ticket || !userId) {
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
    role: "user",
  };

  const engineerProfile: ChatProfile = {
    id: ticket.assignee ?? "engineer",
    name: "Support Engineer",
    avatar_url: null,
    role: "engineer",
  };

  /* -----------------------------------
     Activity Trail (FIXED & SAFE)
  ----------------------------------- */
  const activityItems: ActivityItem[] = [
    {
      label: "Ticket Created",
      date: new Date(ticket.created_at).toDateString(),
      status: "done",
    },
    {
      label: "Ticket Assigned",
      date: new Date(ticket.created_at).toDateString(),
      status: ticket.assignee ? "done" : "pending",
    },
    {
      label: "Engineer Working",
      status: mapTicketStatusToActivity(ticket.status),
    },
...(ticket.status === "hold"
  ? ([
      {
        label: "Ticket On Hold",
        date: new Date().toDateString(),
        status: "hold",
        comment: ticket.hold_comment ?? null,
      },
    ] satisfies ActivityItem[])
  : []),

...(ticket.status === "closed"
  ? ([
      {
        label: "Ticket Closed",
        date: new Date().toDateString(),
        status: "closed",
        comment: ticket.closed_comment ?? null,
      },
    ] satisfies ActivityItem[])
  : []),

  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl font-semibold">
          Ticket Details
        </h2>
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
          attachments={[]}
          link={ticket.link}
        />

        {/* CENTER */}
        <Card className="p-5">
          <TicketChat
            ticketId={id}
            messages={messages}
            setMessages={setMessages}
            currentUser={currentUserProfile}
            otherUser={engineerProfile}
            onSend={async (text) => {
              await supabase
                .from("ticket_messages")
                .insert({
                  ticket_id: id,
                  sender_id: userId,
                  sender_role: "user",
                  message: text,
                });
            }}
          />
        </Card>

        {/* RIGHT */}
        <Card className="p-5 space-y-6">
          <h3 className="font-semibold">Activity Log</h3>

          <TicketActivityTrail items={activityItems} />

          {engineerProfile.role === "engineer" &&
            ticket.status !== "closed" && (
              <div className="space-y-3">
                <Button
                  className="w-full"
                  onClick={() => setCloseOpen(true)}
                >
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
            await supabase
              .from("tickets")
              .update({
                status: "closed",
                closed_comment: comment,
              })
              .eq("id", ticket.id);

            setTicket({
              ...ticket,
              status: "closed",
              closed_comment: comment,
            });
          }}
        />

        {/* Hold Dialog */}
        <TicketStatusDialog
          open={holdOpen}
          onClose={() => setHoldOpen(false)}
          title="Hold Ticket Comment"
          onSubmit={async (comment) => {
            await supabase
              .from("tickets")
              .update({
                status: "hold",
                hold_comment: comment,
              })
              .eq("id", ticket.id);

            setTicket({
              ...ticket,
              status: "hold",
              hold_comment: comment,
            });
          }}
        />
      </div>
    </div>
  );
}
