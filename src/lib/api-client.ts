"use client"

import { supabase } from "@/lib/supabaseClient"

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message)
  }
}

/**
 * Calls one of this app's API routes as the signed-in user.
 * Sends JSON, returns the parsed JSON, throws ApiError with the server's message.
 *
 *   const { id } = await apiFetch<{ id: string }>("/api/assets", { method: "POST", body: {...} })
 */
export async function apiFetch<T = unknown>(
  path: string,
  opts: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {}
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new ApiError(401, "Your session has expired. Sign in again.")

  const res = await fetch(path, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`, (data as { code?: string }).code)
  }
  return data as T
}
