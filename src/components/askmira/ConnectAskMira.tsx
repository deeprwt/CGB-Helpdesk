"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronLeft,
  Link2,
  Loader2,
  LogIn,
  ShieldCheck,
} from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Organization = {
  id: string
  name: string
  domain: string
  connected: boolean
  askmira_workspace_id: string | null
  askmira_workspace: string | null
}

type Request = {
  tenant_id: string
  tenant_name: string
  redirect_uri: string
  state: string
  challenge: string
}

type Stage =
  | { kind: "loading" }
  | { kind: "broken" }
  | { kind: "signin" }
  | { kind: "refused"; message: string }
  | { kind: "ready"; organizations: Organization[] }

/** What AskMira will be able to do once allowed. */
const GRANTS = [
  "Send your company's people across: an account for each joiner, switched off when they leave.",
  "Open the helpdesk for your people from AskMira, without a second password.",
  "Show each person their tickets and assets in AskMira, and let them raise tickets and reply.",
  "Show your engineers and admins their queues and the company's asset register.",
]

function readRequest(): Request | null {
  const q = new URLSearchParams(window.location.search)
  const request = {
    tenant_id: q.get("tenant_id") ?? "",
    tenant_name: q.get("tenant_name") ?? "",
    redirect_uri: q.get("redirect_uri") ?? "",
    state: q.get("state") ?? "",
    challenge: q.get("challenge") ?? "",
  }
  return Object.values(request).every(Boolean) ? request : null
}

function originOf(uri: string) {
  try {
    return new URL(uri).origin
  } catch {
    return null
  }
}

async function token() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/**
 * /connect/askmira — an AskMira workspace asks to connect. A helpdesk admin
 * signs in, picks which of their companies it is, and presses Allow; AskMira
 * then gets a key that reaches that one company only.
 */
export default function ConnectAskMira() {
  const [request, setRequest] = React.useState<Request | null>(null)
  const [stage, setStage] = React.useState<Stage>({ kind: "loading" })
  const [organizationId, setOrganizationId] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const load = async () => {
      const found = readRequest()
      setRequest(found)
      if (!found) return setStage({ kind: "broken" })
      const access = await token()
      if (!access) return setStage({ kind: "signin" })
      const res = await fetch("/api/integrations/askmira/connection", {
        headers: { Authorization: `Bearer ${access}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return setStage({ kind: "refused", message: data.error ?? "Could not load your companies." })
      }
      if (!data.can_connect) {
        return setStage({
          kind: "refused",
          message: "This helpdesk is not set up to connect to AskMira yet. Ask the person who runs it.",
        })
      }
      const organizations: Organization[] = data.organizations ?? []
      if (!organizations.length) {
        return setStage({ kind: "refused", message: "You don't look after any company in the helpdesk." })
      }
      const { data: auth } = await supabase.auth.getUser()
      const domain = auth.user?.email?.split("@")[1]?.toLowerCase()
      const preferred = organizations.find((o) => o.domain === domain) ?? organizations[0]
      setOrganizationId(preferred.id)
      setStage({ kind: "ready", organizations })
    }
    load().catch(() => setStage({ kind: "refused", message: "Could not reach the helpdesk." }))
  }, [])

  const askmira = request ? originOf(request.redirect_uri) : null

  const allow = async () => {
    if (!request) return
    setBusy(true)
    setError(null)
    try {
      const access = await token()
      if (!access) return setStage({ kind: "signin" })
      const res = await fetch("/api/integrations/askmira/connect/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
        body: JSON.stringify({ ...request, organization_id: organizationId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.redirect_to) {
        setError(data.error ?? "Could not connect. Try again.")
        setBusy(false)
        return
      }
      window.location.assign(data.redirect_to)
    } catch {
      setError("Could not reach the helpdesk. Try again.")
      setBusy(false)
    }
  }

  const signInHref = () =>
    `/signin?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`

  const chosen = stage.kind === "ready" ? stage.organizations.find((o) => o.id === organizationId) : null
  // Connected to another workspace: refused until disconnected. The same one may reconnect.
  const elsewhere = Boolean(chosen?.connected && chosen.askmira_workspace_id !== request?.tenant_id.toLowerCase())

  return (
    <div className="flex w-full flex-1 flex-col overflow-y-auto no-scrollbar lg:w-1/2">
      <div className="mx-auto mb-5 w-full max-w-md sm:pt-10">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <Link href="/">
            <ChevronLeft />
            Back to dashboard
          </Link>
        </Button>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-10">
        <div className="mb-6">
          <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-white shadow-md shadow-brand-500/25">
            <Link2 className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Connect AskMira
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {request ? (
              <>
                The AskMira workspace <span className="font-medium text-gray-800 dark:text-gray-200">{request.tenant_name}</span>{" "}
                wants to connect to the helpdesk.
              </>
            ) : (
              "An AskMira workspace wants to connect to the helpdesk."
            )}
          </p>
          {askmira ? (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">From {askmira}</p>
          ) : null}
        </div>

        {stage.kind === "loading" ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="size-4 animate-spin" /> Checking…
          </div>
        ) : stage.kind === "broken" ? (
          <Notice>
            This link is not complete. Go back to AskMira (Settings → Connectors) and press Connect again.
          </Notice>
        ) : stage.kind === "signin" ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Sign in to the helpdesk as an admin of your company to allow it.
            </p>
            <Button className="h-11" onClick={() => window.location.assign(signInHref())}>
              <LogIn /> Sign in to continue
            </Button>
          </div>
        ) : stage.kind === "refused" ? (
          <div className="flex flex-col gap-4">
            <Notice>{stage.message}</Notice>
            <Button
              variant="outline"
              onClick={async () => {
                await supabase.auth.signOut().catch(() => {})
                window.location.assign(signInHref())
              }}
            >
              Sign in as someone else
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <Field>
              <FieldLabel htmlFor="askmira-org">Company in the helpdesk</FieldLabel>
              {stage.organizations.length > 1 ? (
                <Select value={organizationId} onValueChange={setOrganizationId}>
                  <SelectTrigger id="askmira-org" className="w-full">
                    <SelectValue placeholder="Choose a company" />
                  </SelectTrigger>
                  <SelectContent>
                    {stage.organizations.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name} ({o.domain})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 dark:border-white/10 dark:text-gray-200">
                  <Building2 className="size-4 text-gray-400" />
                  {stage.organizations[0].name} ({stage.organizations[0].domain})
                </div>
              )}
            </Field>

            {elsewhere ? (
              <Notice>
                {chosen?.name} is connected to the AskMira workspace “{chosen?.askmira_workspace}”. Disconnect it
                on the helpdesk&apos;s AskMira page first.
              </Notice>
            ) : null}

            <div className="rounded-xl border border-gray-200 p-4 dark:border-white/10">
              <p className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200">
                <ShieldCheck className="size-4 text-brand-500" /> AskMira will be able to
              </p>
              <ul className="flex flex-col gap-2">
                {GRANTS.map((grant) => (
                  <li key={grant} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                    {grant}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                Only for the company you choose. Disconnect at any time, here or in AskMira.
              </p>
            </div>

            {error ? <Notice>{error}</Notice> : null}

            <div className="flex gap-3">
              <Button className="h-11 flex-1" onClick={allow} disabled={busy || !organizationId || elsewhere}>
                {busy ? <Loader2 className="animate-spin" /> : <Check />} Allow
              </Button>
              <Button
                variant="outline"
                className="h-11"
                disabled={busy}
                onClick={() => window.location.assign(askmira ? `${askmira}/settings/connectors` : "/")}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}
