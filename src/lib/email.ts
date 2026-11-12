import nodemailer from "nodemailer"

/* ──────────────────────────────────────
   Transporter (reused across calls)
   ────────────────────────────────────── */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

/* ──────────────────────────────────────
   Types
   ────────────────────────────────────── */
export type EmailAction =
  | "acquired"
  | "closed"
  | "hold"
  | "message"
  | "reopened"
  | "reassigned"
  | "created"
  | "sla_warning"
  | "sla_breach"
  | "status_changed"
  | "assigned"

/**
 * Who reads the email. "requester" is the person who raised the ticket
 * ("your ticket"); "staff" is an engineer or admin ("ticket #ABC").
 */
export type EmailAudience = "requester" | "staff"

/** Ticket facts shown in the email body (used for new-ticket emails). */
export type TicketEmailDetails = {
  requesterName?: string | null
  description?: string | null
  category?: string | null
  subCategory?: string | null
  priority?: string | null
  location?: string | null
  contact?: string | null
}

type SendTicketEmailParams = {
  to: string
  recipientName: string
  actorName: string
  ticketId: string
  /** e.g. INC0001012; the short id is shown when missing */
  ticketNumber?: string | null
  ticketSubject: string
  action: EmailAction
  comment?: string | null
  ticketUrl?: string
  audience?: EmailAudience
  details?: TicketEmailDetails
}

/** Escape user-typed text before it goes into the HTML email. */
function esc(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Escape, then keep line breaks. */
function escMultiline(value: string | null | undefined): string {
  return esc(value).replace(/\r?\n/g, "<br />")
}

/* ──────────────────────────────────────
   Action copy
   ────────────────────────────────────── */

/** Copy for engineers and admins. Returns null to fall back to the shared copy. */
function staffActionDetails(action: EmailAction, actorName: string, ticketShortId: string) {
  switch (action) {
    case "created":
      return {
        subject: `New ticket #${ticketShortId} has been raised`,
        heading: `New ticket raised by ${actorName}`,
        description: `A new support ticket <strong>#${ticketShortId}</strong> has been raised and is waiting to be acquired.`,
        statusLabel: "NEW TICKET",
        statusColor: "#2563eb",
        statusBg: "#dbeafe",
      }
    case "assigned":
      return {
        subject: `Ticket #${ticketShortId} has been assigned to you`,
        heading: `${actorName} assigned a ticket to you`,
        description: `Ticket <strong>#${ticketShortId}</strong> is now yours to work on.`,
        statusLabel: "ASSIGNED TO YOU",
        statusColor: "#2563eb",
        statusBg: "#dbeafe",
      }
    case "acquired":
      return {
        subject: `Ticket #${ticketShortId} has been acquired`,
        heading: `${actorName} acquired ticket #${ticketShortId}`,
        description: `Ticket <strong>#${ticketShortId}</strong> has been picked up by ${actorName}.`,
        statusLabel: "ACQUIRED",
        statusColor: "#2563eb",
        statusBg: "#dbeafe",
      }
    case "closed":
      return {
        subject: `Ticket #${ticketShortId} has been closed`,
        heading: `${actorName} closed ticket #${ticketShortId}`,
        description: `Ticket <strong>#${ticketShortId}</strong> has been resolved and closed.`,
        statusLabel: "CLOSED",
        statusColor: "#16a34a",
        statusBg: "#dcfce7",
      }
    case "hold":
      return {
        subject: `Ticket #${ticketShortId} is on hold`,
        heading: `${actorName} put ticket #${ticketShortId} on hold`,
        description: `Ticket <strong>#${ticketShortId}</strong> has been temporarily placed on hold.`,
        statusLabel: "ON HOLD",
        statusColor: "#d97706",
        statusBg: "#fef3c7",
      }
    case "reopened":
      return {
        subject: `Ticket #${ticketShortId} has been reopened`,
        heading: `${actorName} reopened ticket #${ticketShortId}`,
        description: `Ticket <strong>#${ticketShortId}</strong> is active again.`,
        statusLabel: "REOPENED",
        statusColor: "#2563eb",
        statusBg: "#dbeafe",
      }
    case "reassigned":
      return {
        subject: `Ticket #${ticketShortId} has been transferred`,
        heading: `${actorName} transferred ticket #${ticketShortId}`,
        description: `Ticket <strong>#${ticketShortId}</strong> has been transferred to a different engineer.`,
        statusLabel: "TRANSFERRED",
        statusColor: "#7c3aed",
        statusBg: "#ede9fe",
      }
    case "message":
      return {
        subject: `New message on Ticket #${ticketShortId}`,
        heading: `${actorName} replied on ticket #${ticketShortId}`,
        description: `There is a new message on ticket <strong>#${ticketShortId}</strong>.`,
        statusLabel: "NEW MESSAGE",
        statusColor: "#7c3aed",
        statusBg: "#ede9fe",
      }
    default:
      return null
  }
}

function getActionDetails(
  action: EmailAction,
  rawActorName: string,
  ticketShortId: string,
  audience: EmailAudience = "requester"
) {
  const actorName = esc(rawActorName)

  if (audience === "staff") {
    const staffCopy = staffActionDetails(action, actorName, ticketShortId)
    if (staffCopy) return staffCopy
  }

  switch (action) {
    case "acquired":
      return {
        subject: `Ticket #${ticketShortId} has been acquired`,
        heading: `${actorName} has acquired your ticket`,
        description: `Your ticket <strong>#${ticketShortId}</strong> has been picked up and an engineer is now assigned to work on it.`,
        statusLabel: "ACQUIRED",
        statusColor: "#2563eb",
        statusBg: "#dbeafe",
      }
    case "closed":
      return {
        subject: `Ticket #${ticketShortId} has been closed`,
        heading: `${actorName} has closed your ticket`,
        description: `Your ticket <strong>#${ticketShortId}</strong> has been resolved and closed.`,
        statusLabel: "CLOSED",
        statusColor: "#16a34a",
        statusBg: "#dcfce7",
      }
    case "hold":
      return {
        subject: `Ticket #${ticketShortId} is on hold`,
        heading: `${actorName} put your ticket on hold`,
        description: `Your ticket <strong>#${ticketShortId}</strong> has been temporarily placed on hold.`,
        statusLabel: "ON HOLD",
        statusColor: "#d97706",
        statusBg: "#fef3c7",
      }
    case "message":
      return {
        subject: `New message on Ticket #${ticketShortId}`,
        heading: `${actorName} sent you a message`,
        description: `You have a new message on your ticket <strong>#${ticketShortId}</strong>.`,
        statusLabel: "NEW MESSAGE",
        statusColor: "#7c3aed",
        statusBg: "#ede9fe",
      }
    case "reopened":
      return {
        subject: `Ticket #${ticketShortId} has been reopened`,
        heading: `${actorName} reopened your ticket`,
        description: `Your ticket <strong>#${ticketShortId}</strong> has been reopened and is now active again.`,
        statusLabel: "REOPENED",
        statusColor: "#2563eb",
        statusBg: "#dbeafe",
      }
    case "reassigned":
      return {
        subject: `Ticket #${ticketShortId} has been reassigned`,
        heading: `${actorName} reassigned your ticket`,
        description: `Your ticket <strong>#${ticketShortId}</strong> has been reassigned to a different engineer.`,
        statusLabel: "REASSIGNED",
        statusColor: "#7c3aed",
        statusBg: "#ede9fe",
      }
    case "created":
      return {
        subject: `We've received your ticket #${ticketShortId}`,
        heading: `Your ticket has been raised`,
        description: `Your support ticket <strong>#${ticketShortId}</strong> has been logged. An engineer will pick it up shortly, and you will get an email as soon as that happens.`,
        statusLabel: "NEW TICKET",
        statusColor: "#2563eb",
        statusBg: "#dbeafe",
      }
    case "sla_warning":
      return {
        subject: `⚠️ SLA Warning — Ticket #${ticketShortId}`,
        heading: `SLA Warning for Ticket #${ticketShortId}`,
        description: `Ticket <strong>#${ticketShortId}</strong> is approaching its SLA deadline. Immediate attention required.`,
        statusLabel: "SLA WARNING",
        statusColor: "#d97706",
        statusBg: "#fef3c7",
      }
    case "sla_breach":
      return {
        subject: `🚨 SLA Breach — Ticket #${ticketShortId}`,
        heading: `SLA Breach on Ticket #${ticketShortId}`,
        description: `Ticket <strong>#${ticketShortId}</strong> has breached its SLA deadline. Immediate action required.`,
        statusLabel: "SLA BREACH",
        statusColor: "#dc2626",
        statusBg: "#fef2f2",
      }
    default:
      return {
        subject: `Ticket #${ticketShortId} status updated`,
        heading: `${actorName} updated your ticket`,
        description: `Your ticket <strong>#${ticketShortId}</strong> status has been updated.`,
        statusLabel: "UPDATED",
        statusColor: "#6b7280",
        statusBg: "#f3f4f6",
      }
  }
}

/* ──────────────────────────────────────
   HTML Template
   ────────────────────────────────────── */
/** Label for the "who did it" row in the ticket card. */
function actorLabel(action: EmailAction, audience: EmailAudience): string {
  if (action === "created") return "Raised By"
  if (action === "acquired") return "Assigned Engineer"
  if (action === "assigned" || action === "reassigned") return "Transferred By"
  if (action === "message") return audience === "staff" ? "From" : "Engineer"
  return "Updated By"
}

/** Extra ticket facts (description, category, …) as rows of the ticket card. */
function detailRows(details: TicketEmailDetails | undefined): string {
  if (!details) return ""
  const category = [details.category, details.subCategory].filter(Boolean).join(" / ")
  const rows: [string, string | null | undefined][] = [
    ["Requester", details.requesterName],
    ["Category", category],
    ["Priority", details.priority ? details.priority.charAt(0).toUpperCase() + details.priority.slice(1) : null],
    ["Location", details.location],
    ["Contact", details.contact],
    ["Description", details.description],
  ]
  return rows
    .filter(([, value]) => value && String(value).trim())
    .map(
      ([label, value]) => `
                      <tr>
                        <td style="padding:14px 0;border-top:1px solid #e5e7eb;">
                          <p style="margin:0;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">${label}</p>
                          <p style="margin:4px 0 0;font-size:14px;color:#111827;line-height:1.5;">${escMultiline(value)}</p>
                        </td>
                      </tr>`
    )
    .join("")
}

function buildEmailHtml(params: SendTicketEmailParams): string {
  const ticketShortId = params.ticketNumber || params.ticketId.slice(0, 8).toUpperCase()
  const audience = params.audience ?? "requester"
  const details = getActionDetails(params.action, params.actorName, ticketShortId, audience)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const ticketUrl = params.ticketUrl ?? `${appUrl}/ticket/${params.ticketId}`
  const logoUrl = `${appUrl}/images/logo/logo-icon.svg`
  const year = new Date().getFullYear()

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${details.subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">

        <!-- Main Card -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background-color:#1a1a2e;padding:28px 40px;text-align:center;">
              <img src="${logoUrl}" alt="CGB Solutions" height="40" style="height:40px;margin-bottom:8px;" />
              <p style="margin:0;color:#ffffff;font-size:14px;font-weight:600;letter-spacing:1px;">CGB Solutions Helpdesk</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">

              <!-- Status Badge -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background-color:${details.statusBg};color:${details.statusColor};font-size:11px;font-weight:700;letter-spacing:1.5px;padding:6px 14px;border-radius:20px;">
                    ${details.statusLabel}
                  </td>
                </tr>
              </table>

              <!-- Greeting -->
              <p style="margin:0 0 6px;font-size:14px;color:#6b7280;">Hello${params.recipientName ? ` ${esc(params.recipientName)}` : ""},</p>
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">
                ${details.heading}
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:#4b5563;line-height:1.6;">
                ${details.description}
              </p>

              <!-- Ticket Details Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom:14px;border-bottom:1px solid #e5e7eb;">
                          <p style="margin:0;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Ticket ID</p>
                          <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#111827;">#${ticketShortId}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:14px 0;border-bottom:1px solid #e5e7eb;">
                          <p style="margin:0;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Subject</p>
                          <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#111827;">${esc(params.ticketSubject)}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:14px 0 ${params.details ? "14px" : "0"};">
                          <p style="margin:0;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">${actorLabel(params.action, audience)}</p>
                          <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#111827;">${esc(params.actorName)}</p>
                        </td>
                      </tr>${detailRows(params.details)}
                    </table>
                  </td>
                </tr>
              </table>

              ${params.comment ? `
              <!-- Comment -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">Comment</p>
                    <p style="margin:0;font-size:14px;color:#78350f;line-height:1.5;">${escMultiline(params.comment)}</p>
                  </td>
                </tr>
              </table>
              ` : ""}

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${ticketUrl}" style="display:inline-block;background-color:#1a1a2e;color:#ffffff;font-size:14px;font-weight:600;padding:14px 36px;border-radius:8px;text-decoration:none;letter-spacing:0.5px;">
                      View Ticket Details
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">
                You received this email because a ticket update was made on your helpdesk account.
              </p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                &copy; ${year} CGB Solutions. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
        <!-- End Main Card -->

      </td>
    </tr>
  </table>
</body>
</html>`
}

/* ──────────────────────────────────────
   Send email
   ────────────────────────────────────── */
export async function sendTicketEmail(params: SendTicketEmailParams): Promise<void> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn("SMTP not configured — skipping email")
    return
  }

  const ticketShortId = params.ticketNumber || params.ticketId.slice(0, 8).toUpperCase()
  const details = getActionDetails(params.action, params.actorName, ticketShortId, params.audience)

  await transporter.sendMail({
    from: `"CGB Solutions Helpdesk" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
    to: params.to,
    subject: details.subject,
    html: buildEmailHtml(params),
  })
}

/* ──────────────────────────────────────
   Verification Email
   ────────────────────────────────────── */
type VerificationEmailParams = {
  to: string
  recipientName: string
  verificationUrl: string
}

function buildVerificationEmailHtml(params: VerificationEmailParams): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const logoUrl = `${appUrl}/images/logo/logo-icon.svg`
  const year = new Date().getFullYear()

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify Your Email</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">

        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background-color:#1a1a2e;padding:28px 40px;text-align:center;">
              <img src="${logoUrl}" alt="CGB Solutions" height="40" style="height:40px;margin-bottom:8px;" />
              <p style="margin:0;color:#ffffff;font-size:14px;font-weight:600;letter-spacing:1px;">CGB Solutions Helpdesk</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">

              <!-- Icon -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="background-color:#dbeafe;border-radius:50%;width:64px;height:64px;text-align:center;vertical-align:middle;">
                    <span style="font-size:28px;">✉️</span>
                  </td>
                </tr>
              </table>

              <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111827;line-height:1.3;text-align:center;">
                Verify Your Email Address
              </h1>
              <p style="margin:0 0 8px;font-size:15px;color:#4b5563;line-height:1.6;text-align:center;">
                Hi <strong>${esc(params.recipientName)}</strong>,
              </p>
              <p style="margin:0 0 32px;font-size:15px;color:#4b5563;line-height:1.6;text-align:center;">
                Thank you for signing up! Please verify your email address by clicking the button below.
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${params.verificationUrl}" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:15px;font-weight:600;padding:14px 48px;border-radius:8px;text-decoration:none;letter-spacing:0.5px;">
                      Verify Email
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry notice -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px;margin-bottom:28px;">
                <tr>
                  <td style="padding:14px 20px;">
                    <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">
                      ⏰ This verification link will expire in <strong>30 minutes</strong>. If it expires, you can request a new one from the login page.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Fallback link -->
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
                If the button doesn't work, copy and paste this link into your browser:<br />
                <a href="${params.verificationUrl}" style="color:#2563eb;word-break:break-all;">${params.verificationUrl}</a>
              </p>

            </td>
          </tr>

          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">
                If you didn't create an account, you can safely ignore this email.
              </p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                &copy; ${year} CGB Solutions. All rights reserved.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendVerificationEmail(params: VerificationEmailParams): Promise<void> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn("SMTP not configured — skipping verification email")
    return
  }

  await transporter.sendMail({
    from: `"CGB Solutions Helpdesk" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
    to: params.to,
    subject: "Verify Your Email — CGB Solutions Helpdesk",
    html: buildVerificationEmailHtml(params),
  })
}

/* ──────────────────────────────────────
   Invitation Email (admin added you to a tenant)
   ────────────────────────────────────── */
type InviteEmailParams = {
  to: string
  recipientName: string
  tenantName: string
  inviterName: string
  role: string
  /** One-time link that signs the person in and opens "set your password" */
  actionUrl: string
}

const ROLE_LABEL: Record<string, string> = {
  user: "User",
  engineer: "Engineer",
  admin: "Admin",
  superadmin: "Super Admin",
}

function buildInviteEmailHtml(params: InviteEmailParams): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const logoUrl = `${appUrl}/images/logo/logo-icon.svg`
  const year = new Date().getFullYear()
  const url = esc(params.actionUrl)

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're invited</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background-color:#1a1a2e;padding:28px 40px;text-align:center;">
              <img src="${logoUrl}" alt="" height="40" style="height:40px;margin-bottom:8px;" />
              <p style="margin:0;color:#ffffff;font-size:14px;font-weight:600;letter-spacing:1px;">${esc(params.tenantName)} · IT Service Desk</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111827;line-height:1.3;text-align:center;">
                You've been invited
              </h1>
              <p style="margin:0 0 8px;font-size:15px;color:#4b5563;line-height:1.6;text-align:center;">
                Hi${params.recipientName ? ` <strong>${esc(params.recipientName)}</strong>` : ""},
              </p>
              <p style="margin:0 0 32px;font-size:15px;color:#4b5563;line-height:1.6;text-align:center;">
                ${esc(params.inviterName)} added you to <strong>${esc(params.tenantName)}</strong>'s IT service desk
                as <strong>${esc(ROLE_LABEL[params.role] ?? params.role)}</strong>. Set your password to get started.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${url}" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:15px;font-weight:600;padding:14px 48px;border-radius:8px;text-decoration:none;letter-spacing:0.5px;">
                      Set your password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px;font-size:13px;color:#92400e;line-height:1.5;text-align:center;">
                This link works once and expires soon. If it has expired, ask your administrator to resend the invitation.
              </p>
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
                If the button doesn't work, copy and paste this link into your browser:<br />
                <a href="${url}" style="color:#2563eb;word-break:break-all;">${url}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                If you weren't expecting this, you can ignore this email. &copy; ${year}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Sends the invitation. Throws when SMTP is not configured, because without
 * the email the person cannot get in — the caller should report that.
 */
export async function sendInviteEmail(params: InviteEmailParams): Promise<void> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    throw new Error("Email (SMTP) is not configured on this server, so the invitation could not be sent")
  }

  await transporter.sendMail({
    from: `"${params.tenantName.replace(/["\r\n]/g, "")} Service Desk" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
    to: params.to,
    subject: `You're invited to ${params.tenantName}'s IT service desk`,
    html: buildInviteEmailHtml(params),
  })
}
