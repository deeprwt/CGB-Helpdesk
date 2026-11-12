"use client"

import * as React from "react"
import { AlertTriangle, Clock, FolderTree, Grid3x3, RefreshCw, Timer } from "lucide-react"
import RoleGate from "@/components/auth/RoleGate"
import { apiFetch } from "@/lib/api-client"
import { useCurrentUser, useTenantList } from "@/hooks/useCurrentUser"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState } from "@/components/common/empty-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CategoriesTab } from "@/components/itsm-settings/CategoriesTab"
import { PriorityMatrixTab } from "@/components/itsm-settings/PriorityMatrixTab"
import { SlaPoliciesTab } from "@/components/itsm-settings/SlaPoliciesTab"
import { BusinessHoursTab } from "@/components/itsm-settings/BusinessHoursTab"
import { errorMessage, type ItsmConfigResponse } from "@/components/itsm-settings/shared"

const TABS = [
  { value: "categories", label: "Categories", icon: FolderTree },
  { value: "matrix", label: "Priority matrix", icon: Grid3x3 },
  { value: "sla", label: "SLA policies", icon: Timer },
  { value: "hours", label: "Business hours", icon: Clock },
] as const

export default function ItsmSettingsPage() {
  const { user: me } = useCurrentUser()
  const isSuper = me?.role === "superadmin"
  const tenants = useTenantList(isSuper)

  // Super admins pick which tenant to configure; admins always configure their own
  const [tenantId, setTenantId] = React.useState("")
  React.useEffect(() => {
    if (me?.tenant_id && !tenantId) setTenantId(me.tenant_id)
  }, [me?.tenant_id, tenantId])

  const [config, setConfig] = React.useState<ItsmConfigResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tab, setTab] = React.useState<string>("categories")

  // Ignore responses for a tenant that is no longer selected
  const requestRef = React.useRef(0)

  const load = React.useCallback(async () => {
    if (!me || (isSuper && !tenantId)) return
    const id = ++requestRef.current
    setError(null)
    try {
      const qs = isSuper ? `?tenant_id=${encodeURIComponent(tenantId)}` : ""
      const data = await apiFetch<ItsmConfigResponse>(`/api/itsm/config${qs}`)
      if (id === requestRef.current) setConfig(data)
    } catch (err) {
      if (id === requestRef.current) setError(errorMessage(err, "Could not load the ITSM settings"))
    } finally {
      if (id === requestRef.current) setLoading(false)
    }
  }, [me, isSuper, tenantId])

  React.useEffect(() => {
    void load()
  }, [load])

  const changeTenant = (id: string) => {
    if (id === tenantId) return
    setConfig(null)
    setLoading(true)
    setTenantId(id)
  }

  const tenantName = isSuper ? tenants.find((t) => t.id === tenantId)?.name : me?.tenant?.name
  const callTenant = isSuper && tenantId ? tenantId : undefined
  const tabProps = { tenantId: callTenant, onSaved: load }
  // Remount a tab's draft only when its saved data (or the tenant) changes
  const keyFor = (part: unknown) => `${config?.tenant_id}:${JSON.stringify(part)}`

  const tenantPicker =
    isSuper && tenants.length > 0 ? (
      <Select value={tenantId} onValueChange={changeTenant}>
        <SelectTrigger className="w-[220px]" aria-label="Tenant">
          <SelectValue placeholder="Choose a tenant" />
        </SelectTrigger>
        <SelectContent>
          {tenants.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
              {t.status !== "active" ? " (suspended)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null

  return (
    <RoleGate allowedRoles={["admin", "superadmin"]}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="ITSM Settings"
          description={
            tenantName
              ? `Categories, priorities, SLA targets and working hours for ${tenantName}.`
              : "Categories, priorities, SLA targets and working hours for your organisation."
          }
          breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "ITSM Settings" }]}
          actions={tenantPicker}
        />

        <Tabs value={tab} onValueChange={setTab} className="gap-4">
          <TabsList className="h-auto w-full flex-wrap justify-start sm:w-fit">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="flex-none">
                <Icon className="h-4 w-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {error && !config ? (
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900/40">
              <EmptyState
                icon={AlertTriangle}
                title="Couldn't load the settings"
                description={error}
                action={
                  <Button variant="outline" size="sm" onClick={() => void load()}>
                    <RefreshCw className="h-4 w-4" />
                    Try again
                  </Button>
                }
              />
            </div>
          ) : loading || !config ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-gray-900/40">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-80" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <>
              <TabsContent value="categories" forceMount className="data-[state=inactive]:hidden">
                <CategoriesTab categories={config.categories} {...tabProps} />
              </TabsContent>
              <TabsContent value="matrix" forceMount className="data-[state=inactive]:hidden">
                <PriorityMatrixTab key={keyFor(config.matrix)} matrix={config.matrix} {...tabProps} />
              </TabsContent>
              <TabsContent value="sla" forceMount className="data-[state=inactive]:hidden">
                <SlaPoliciesTab key={keyFor(config.policies)} policies={config.policies} {...tabProps} />
              </TabsContent>
              <TabsContent value="hours" forceMount className="data-[state=inactive]:hidden">
                <BusinessHoursTab key={keyFor(config.calendar)} calendar={config.calendar} {...tabProps} />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </RoleGate>
  )
}
