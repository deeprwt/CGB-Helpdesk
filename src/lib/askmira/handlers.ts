// The AskMira endpoints, one function per route (src/app/api/integrations/askmira/…).
// Kept here so they can be exercised without a running server.

import { ACTIONS } from "./actions"
import { approve, connections, disconnect, revoke, signedIn, swap } from "./connect"
import { actorIn, assertion, httpError, respond, spendOnce } from "./core"
import { launch as signIn } from "./launch"
import { syncPeople } from "./people"
import { QUERIES } from "./queries"

function paramsOf(body: Record<string, unknown>) {
  const params = body.params
  return params && typeof params === "object" && !Array.isArray(params)
    ? (params as Record<string, unknown>)
    : {}
}

async function jsonOf(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    return body && typeof body === "object" && !Array.isArray(body) ? body : {}
  } catch {
    return {}
  }
}

/** POST users/sync — the company's people (use=provision). */
export const syncRoute = (req: Request) =>
  respond(async () => {
    const { org, body } = await assertion(req, "provision")
    return syncPeople(org, body)
  })

/** POST query — read for one person (use=query). */
export const queryRoute = (req: Request) =>
  respond(async () => {
    const { org, body } = await assertion(req, "query")
    const kind = String(body.kind ?? "")
    const answer = Object.hasOwn(QUERIES, kind) ? QUERIES[kind] : null
    if (!answer) throw httpError(422, "Unknown query.")
    const me = await actorIn(org, body.actor)
    return { kind, ...(await answer({ org, me, params: paramsOf(body) })) }
  })

/** POST act — raise a ticket or reply, as one person (use=act, each token once). */
export const actRoute = (req: Request) =>
  respond(async () => {
    const { org, body, claims } = await assertion(req, "act")
    const kind = String(body.kind ?? "")
    const action = Object.hasOwn(ACTIONS, kind) ? ACTIONS[kind] : null
    if (!action) throw httpError(422, "Unknown action.")
    await spendOnce(claims, "This request was already carried out.")
    const me = await actorIn(org, body.actor)
    return { kind, ...(await action({ org, me, params: paramsOf(body) })) }
  })

/** POST connect/token — AskMira's server swaps the one-time code (no token yet: PKCE). */
export const tokenRoute = (req: Request) => respond(async () => swap(await jsonOf(req)))

/** POST connect/revoke — AskMira disconnected (use=revoke). */
export const revokeRoute = (req: Request) =>
  respond(async () => {
    const { claims } = await assertion(req, "revoke")
    return revoke(String(claims.sub))
  })

/** POST connect/approve — Allow, by a signed-in helpdesk admin. */
export const approveRoute = (req: Request) =>
  respond(async () => approve(await signedIn(req), await jsonOf(req)))

/** GET connection — the admin's companies and what each is connected to. */
export const connectionsRoute = (req: Request) => respond(async () => connections(await signedIn(req)))

/** DELETE connection?organization_id= — disconnect from this side. */
export const disconnectRoute = (req: Request) =>
  respond(async () => {
    const id = new URL(req.url).searchParams.get("organization_id")
    return disconnect(await signedIn(req), id)
  })

/** POST launch — the sign-in page hands over AskMira's link (use=launch, once). */
export const launchRoute = (req: Request) =>
  respond(async () => {
    const token = String((await jsonOf(req)).token ?? "")
    if (!token || token.length > 4000) throw httpError(401, "This AskMira link is not valid.")
    return signIn(token)
  })
