// Server-only: create people inside a tenant and send them a "set your password" link.
//
// Self sign-up is off. A super admin creates a tenant and its first admin; that
// tenant's admins invite engineers and users. The account is created with the
// tenant and role in app_metadata (browsers cannot write app_metadata), the
// profile row is written here, and the person gets a one-time recovery link
// that signs them in on /update-password.

import type { SupabaseClient } from "@supabase/supabase-js"
import { sendInviteEmail } from "@/lib/email"
import type { AppRole, Person, Tenant } from "@/lib/ticket-server"

export type InviteRole = Exclude<AppRole, "superadmin">
export const INVITE_ROLES: readonly InviteRole[] = ["user", "engineer", "admin"]

export class InviteError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")
}

/** One-time sign-in link that lands on the "set your password" page. */
async function setPasswordLink(db: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await db.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${appUrl()}/update-password` },
  })
  if (error || !data?.properties?.action_link) {
    throw new InviteError(502, `Could not make the sign-in link: ${error?.message ?? "no link"}`)
  }
  return data.properties.action_link
}

export type InviteResult = {
  user: { id: string; email: string; full_name: string; role: InviteRole; tenant_id: string }
  /** False when the account was made but the email could not be sent */
  emailed: boolean
  emailError?: string
}

export async function invitePerson(
  db: SupabaseClient,
  params: {
    email: string
    fullName: string
    role: InviteRole
    tenant: Pick<Tenant, "id" | "name">
    organizationId?: string | null
    inviter: Pick<Person, "id" | "full_name" | "email">
  }
): Promise<InviteResult> {
  const email = params.email.trim().toLowerCase()

  // One tenant per person: an address already in use anywhere is refused
  const { data: existing } = await db.from("users").select("id, tenant_id").eq("email", email).maybeSingle()
  if (existing) {
    throw new InviteError(
      409,
      existing.tenant_id === params.tenant.id
        ? "This person is already a member. Use “Resend invitation” if they never signed in."
        : "This email address already belongs to another organisation."
    )
  }

  if (params.organizationId) {
    const { data: org } = await db
      .from("organizations")
      .select("id")
      .eq("id", params.organizationId)
      .eq("tenant_id", params.tenant.id)
      .maybeSingle()
    if (!org) throw new InviteError(400, "That company does not belong to this organisation")
  }

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: params.fullName },
    app_metadata: { tenant_id: params.tenant.id, role: params.role },
  })
  if (createError || !created?.user) {
    const msg = createError?.message ?? "no user"
    throw new InviteError(/already/i.test(msg) ? 409 : 500, `Could not create the account: ${msg}`)
  }
  const id = created.user.id

  // The sign-up trigger normally makes this row; write it anyway so it is exact.
  const { error: profileError } = await db.from("users").upsert(
    {
      id,
      email,
      full_name: params.fullName,
      role: params.role,
      tenant_id: params.tenant.id,
      organization_id: params.organizationId ?? null,
    },
    { onConflict: "id" }
  )
  if (profileError) {
    await db.auth.admin.deleteUser(id).catch(() => {})
    throw new InviteError(500, `Could not save the profile: ${profileError.message}`)
  }

  const user = { id, email, full_name: params.fullName, role: params.role, tenant_id: params.tenant.id }
  try {
    await sendInviteEmail({
      to: email,
      recipientName: params.fullName,
      tenantName: params.tenant.name,
      inviterName: params.inviter.full_name?.trim() || params.inviter.email || "Your administrator",
      role: params.role,
      actionUrl: await setPasswordLink(db, email),
    })
    return { user, emailed: true }
  } catch (err) {
    console.error("[invite] email failed:", err)
    return { user, emailed: false, emailError: err instanceof Error ? err.message : "Email failed" }
  }
}

/** Sends a fresh "set your password" link to a member who has not signed in yet. */
export async function resendInvite(
  db: SupabaseClient,
  params: { userId: string; tenant: Pick<Tenant, "id" | "name">; inviter: Pick<Person, "full_name" | "email"> }
): Promise<void> {
  const { data: person } = await db
    .from("users")
    .select("id, email, full_name, role, tenant_id")
    .eq("id", params.userId)
    .maybeSingle()
  if (!person || person.tenant_id !== params.tenant.id) throw new InviteError(404, "Member not found")

  const { data: auth } = await db.auth.admin.getUserById(person.id)
  if (auth?.user?.last_sign_in_at) {
    throw new InviteError(409, "This person has already signed in. They can use “Forgot password” instead.")
  }

  await sendInviteEmail({
    to: person.email,
    recipientName: person.full_name ?? "",
    tenantName: params.tenant.name,
    inviterName: params.inviter.full_name?.trim() || params.inviter.email || "Your administrator",
    role: person.role,
    actionUrl: await setPasswordLink(db, person.email),
  })
}
