"use client"

import * as React from "react"
import { Building2, Link2, Loader2, Unplug } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabaseClient"
import RoleGate from "@/components/auth/RoleGate"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState } from "@/components/common/empty-state"
import { StatusBadge } from "@/components/common/status-badge"

type Company = {
  id: string
  name: string
  domain: string
  connected: boolean
  askmira_workspace: string | null
  askmira_origin: string | null
  connected_at: string | null
}

async function call(method: "GET" | "DELETE", query = "") {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(`/api/integrations/askmira/connection${query}`, {
    method,
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? "Could not reach the helpdesk.")
  return body as { organizations: Company[] }
}

/**
 * AskMira — which of the admin's companies are connected to an AskMira
 * workspace (the HRMS), and a way to disconnect. Connecting starts in
 * AskMira: Settings → Connectors → Connect.
 */
export default function AskMiraPage() {
  const [companies, setCompanies] = React.useState<Company[] | null>(null)
  const [removing, setRemoving] = React.useState<Company | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    call("GET")
      .then((r) => setCompanies(r.organizations))
      .catch((err: Error) => {
        toast.error(err.message)
        setCompanies([])
      })
  }, [])

  const disconnect = async () => {
    if (!removing) return
    setBusy(true)
    try {
      const r = await call("DELETE", `?organization_id=${encodeURIComponent(removing.id)}`)
      setCompanies(r.organizations)
      toast.success(`${removing.name} is disconnected from AskMira`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disconnect.")
    } finally {
      setBusy(false)
      setRemoving(null)
    }
  }

  return (
    <RoleGate allowedRoles={["admin", "superadmin"]}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="AskMira"
          description="Companies connected to AskMira, the HRMS. AskMira sends their people here, signs them in without a second password, and shows them their tickets and assets."
        />

        <Card>
          <CardHeader>
            <CardTitle>How to connect</CardTitle>
            <CardDescription>
              An admin of the company&apos;s AskMira workspace opens Settings → Connectors there and presses
              Connect on CGB Helpdesk. You then sign in here, choose the company and press Allow.
            </CardDescription>
          </CardHeader>
        </Card>

        {companies === null ? (
          <Skeleton className="h-40 w-full rounded-2xl" />
        ) : companies.length === 0 ? (
          <Card>
            <EmptyState icon={Building2} title="No companies" description="You don't look after any company here." />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {companies.map((company) => (
              <Card key={company.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate">{company.name}</CardTitle>
                      <CardDescription>@{company.domain}</CardDescription>
                    </div>
                    <StatusBadge tone={company.connected ? "green" : "gray"} dot>
                      {company.connected ? "Connected" : "Not connected"}
                    </StatusBadge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-300">
                  {company.connected ? (
                    <>
                      <p className="flex items-center gap-2">
                        <Link2 className="size-4 text-gray-400" />
                        AskMira workspace “{company.askmira_workspace ?? "—"}”
                        {company.askmira_origin ? ` at ${company.askmira_origin}` : ""}
                      </p>
                      {company.connected_at ? (
                        <p className="text-xs text-gray-400">
                          Since {new Date(company.connected_at).toLocaleString()}
                        </p>
                      ) : null}
                      <div>
                        <Button variant="outline" size="sm" onClick={() => setRemoving(company)}>
                          {busy && removing?.id === company.id ? <Loader2 className="animate-spin" /> : <Unplug />}
                          Disconnect
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p>Not connected to AskMira.</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <ConfirmDialog
          open={removing !== null}
          onOpenChange={(open) => !open && setRemoving(null)}
          title={`Disconnect ${removing?.name ?? ""} from AskMira?`}
          description="AskMira stops sending people, signing them in and showing their tickets and assets at once. Accounts, tickets and assets here stay as they are. An AskMira admin can connect again later."
          confirmLabel="Disconnect"
          variant="warning"
          loading={busy}
          onConfirm={disconnect}
        />
      </div>
    </RoleGate>
  )
}
