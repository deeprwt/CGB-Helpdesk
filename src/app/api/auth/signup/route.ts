import { NextResponse } from "next/server"

export const runtime = "nodejs"

/**
 * Self sign-up is switched off. People join a tenant only when an admin of that
 * tenant (or a super admin) invites them: POST /api/users/invite.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Self sign-up is turned off. Ask your IT administrator to invite you." },
    { status: 410 }
  )
}
