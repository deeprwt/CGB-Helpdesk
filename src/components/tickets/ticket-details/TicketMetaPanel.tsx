"use client"

import * as React from "react"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Calendar,
  Paperclip,
  Link2,
  Clock,
  User,
} from "lucide-react"

/* -----------------------------------
   Types (PURE UI)
----------------------------------- */

type Attachment = {
  id: string
  file_name: string
  file_path: string
}

type Props = {
  ticketId: string
  subject: string
  priority: "low" | "medium" | "high"
  requesterName: string
  requesterAvatar?: string | null

  /** Assignee text from tickets.assignee */
  assigneeText?: string | null

  createdAt: string
  assignedAt?: string | null
  attachments: Attachment[]
  link?: string | null
}

/* -----------------------------------
   Helpers
----------------------------------- */
function formatTicketId(id: string) {
  return `TCK-${id.slice(0, 6).toUpperCase()}`
}

function addDays(date: string, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toDateString()
}

function hoursDiff(from: string) {
  const diff = Date.now() - new Date(from).getTime()
  return Math.floor(diff / 36e5)
}

/* -----------------------------------
   Component
----------------------------------- */
export default function TicketMetaPanel({
  ticketId,
  subject,
  priority,
  requesterName,
  requesterAvatar,
  assigneeText,
  createdAt,
  assignedAt,
  attachments,
  link,
}: Props) {
  const timeLogged = assignedAt ? hoursDiff(assignedAt) : 0
  const estimateHours = 72
  const progress = Math.min((timeLogged / estimateHours) * 100, 100)

  return (
    <Card className="p-6 space-y-6">

      {/* Ticket ID */}
      <div>
        <p className="text-sm text-muted-foreground">Ticket ID</p>
        <p className="text-lg font-semibold">
          {formatTicketId(ticketId)}
        </p>
      </div>

      {/* Subject */}
      <div>
        <p className="text-sm text-muted-foreground">Description</p>
        <p className="text-base font-medium">{subject}</p>
      </div>

      {/* Reporter */}
      <div>
        <p className="text-sm text-muted-foreground mb-1">User</p>
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={requesterAvatar ?? undefined} />
            <AvatarFallback>
              {requesterName?.[0] ?? "U"}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">
            {requesterName}
          </span>
        </div>
      </div>

      {/* Assignee (TEXT ONLY – NO MESS) */}
      <div>
        <p className="text-sm text-muted-foreground mb-1">Assignee</p>

        {assigneeText ? (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{assigneeText}</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            Not assigned
          </span>
        )}
      </div>

      {/* Priority */}
      <div>
        <p className="text-sm text-muted-foreground mb-1">Priority</p>
        <Badge
          variant={
            priority === "high"
              ? "destructive"
              : priority === "medium"
              ? "default"
              : "secondary"
          }
        >
          {priority.toUpperCase()}
        </Badge>
      </div>

      {/* Deadline */}
      <div>
        <p className="text-sm text-muted-foreground mb-1">Deadline</p>
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4" />
          {addDays(createdAt, 2)}
        </div>
      </div>

      {/* Time Tracking */}
      {assignedAt && (
        <Card className="p-4 bg-muted/40 space-y-3">
          <p className="text-sm font-medium">Time tracking</p>

          <div className="text-sm">{timeLogged}h logged</div>

          <Progress value={progress} />

          <p className="text-xs text-muted-foreground">
            Original Estimate {estimateHours}h
          </p>

          <Button size="sm" className="w-full">
            <Clock className="h-4 w-4 mr-1" />
            Log time
          </Button>
        </Card>
      )}

      {/* Created Date */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        Created {new Date(createdAt).toDateString()}
      </div>

      {/* Attachments + Link */}
      <div className="flex gap-2">
        {attachments.length > 0 && (
          <Button variant="secondary" size="icon">
            <Paperclip className="h-4 w-4" />
          </Button>
        )}

        {link && (
          <Button variant="secondary" size="icon">
            <Link2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Card>
  )
}
