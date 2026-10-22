import { syncRoute } from "@/lib/askmira/handlers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// A first sync creates an account for everyone; give it time.
export const maxDuration = 60

export const POST = syncRoute
