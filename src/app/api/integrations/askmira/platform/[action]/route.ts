// AskMiraa's platform: check the key, find an organization, create or attach one (src/lib/askmira/platform.ts).
import { platformRoute } from "@/lib/askmira/platform"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params
  return platformRoute(req, action)
}
