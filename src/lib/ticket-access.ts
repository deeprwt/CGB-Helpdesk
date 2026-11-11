/**
 * Who may do what on a ticket. Shared by the ticket page (to show buttons)
 * and the ticket API routes (to enforce the same rules on the server).
 *
 * - The IT team (engineers, admins) can VIEW every ticket of their own tenant,
 *   whoever it is assigned to. A super admin can view every tenant's tickets.
 * - Only the ASSIGNED engineer works a ticket: close, hold, reopen, reply.
 * - An unassigned ticket must be acquired first.
 * - The assigned engineer, or an admin, can transfer (escalate) it to someone else.
 * - The requester can always see and reply on their own ticket.
 */

export const STAFF_ROLES = ["engineer", "admin", "superadmin"] as const

export function isStaffRole(role: string | null | undefined): boolean {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role)
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "superadmin"
}

export type TicketPermissionInput = {
  requester_id: string
  assignee: string | null
  status: string | null
  /** When known: staff of another tenant get no rights on the ticket */
  tenant_id?: string | null
}

export type TicketPermissions = {
  isRequester: boolean
  isAssignee: boolean
  /** Unassigned ticket the IT team can pick up */
  canAcquire: boolean
  /** Close or put on hold */
  canCloseOrHold: boolean
  /** Reopen a closed ticket, or resume one on hold */
  canReopen: boolean
  /** Hand the ticket to another engineer */
  canTransfer: boolean
  /** Write in the ticket conversation */
  canChat: boolean
  /** IT team member looking at a ticket that is not theirs */
  viewOnly: boolean
}

export function ticketPermissions(
  me: { id: string; role: string | null | undefined; tenant_id?: string | null },
  ticket: TicketPermissionInput
): TicketPermissions {
  const otherTenant =
    me.role !== "superadmin" && !!me.tenant_id && !!ticket.tenant_id && me.tenant_id !== ticket.tenant_id
  const staff = isStaffRole(me.role) && !otherTenant
  const admin = isAdminRole(me.role) && !otherTenant
  const isRequester = ticket.requester_id === me.id
  const isAssignee = staff && !!ticket.assignee && ticket.assignee === me.id
  const status = ticket.status ?? "new"
  const pausedOrDone = status === "closed" || status === "hold"

  return {
    isRequester,
    isAssignee,
    canAcquire: staff && !ticket.assignee && status !== "closed",
    canCloseOrHold: isAssignee && !pausedOrDone,
    canReopen: (isAssignee || admin) && pausedOrDone,
    canTransfer: !!ticket.assignee && status !== "closed" && (isAssignee || admin),
    canChat: isRequester || isAssignee,
    viewOnly: staff && !isAssignee && !isRequester,
  }
}
