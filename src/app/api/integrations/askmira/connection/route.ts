import { connectionsRoute, disconnectRoute } from "@/lib/askmira/handlers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = connectionsRoute
export const DELETE = disconnectRoute
