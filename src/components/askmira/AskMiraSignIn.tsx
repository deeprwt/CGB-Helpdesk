"use client"

import * as React from "react"
import Link from "next/link"
import { AlertTriangle, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

/** A page of this site to land on: a plain path, never another site. */
const LANDING = /^\/(?!\/)[A-Za-z0-9._~/-]{0,200}$/

/**
 * /sso/askmira#token=…&next=… — someone opened the helpdesk from AskMira.
 * The token goes to the server once; its answer becomes a session here, and
 * the person lands where AskMira sent them, without a second password.
 */
export default function AskMiraSignIn() {
  const [error, setError] = React.useState<string | null>(null)
  // One exchange per visit, even when React runs the effect twice in development.
  const started = React.useRef(false)

  React.useEffect(() => {
    if (started.current) return
    started.current = true
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    const token = fragment.get("token")
    const next = fragment.get("next") ?? "/"
    // The token works once; keep it out of the history either way.
    window.history.replaceState(null, "", window.location.pathname)
    if (!token) {
      setError("This sign-in link is not complete. Open the helpdesk again from AskMira.")
      return
    }
    const exchange = async () => {
      const res = await fetch("/api/integrations/askmira/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.token_hash) {
        setError(data.error ?? "Could not sign you in. Open the helpdesk again from AskMira.")
        return
      }
      // Someone else may be signed in on this browser: this link is for the person AskMira sent.
      await supabase.auth.signOut({ scope: "local" }).catch(() => {})
      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: data.type ?? "magiclink",
      })
      if (otpError) {
        setError(`Could not sign you in: ${otpError.message}`)
        return
      }
      window.location.replace(LANDING.test(next) ? next : "/")
    }
    exchange().catch(() => setError("Could not reach the helpdesk. Check your connection and try again."))
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-900">
      <Card className="w-full max-w-md">
        <CardContent className="py-6">
          {error ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
              <Button variant="outline" asChild>
                <Link href="/signin">Sign in to the helpdesk instead</Link>
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3 py-6 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="size-5 animate-spin" /> Signing you in from AskMira…
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
