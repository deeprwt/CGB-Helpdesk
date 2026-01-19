import { createServerClient } from "@supabase/ssr"
import { NextRequest, NextResponse } from "next/server"

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const pathname = request.nextUrl.pathname

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        get: (name) => request.cookies.get(name)?.value,
        set: (name, value, options) =>
          response.cookies.set({ name, value, ...options }),
        remove: (name, options) =>
          response.cookies.set({ name, value: "", ...options }),
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // ✅ Allow auth pages ALWAYS
  if (pathname.startsWith("/signin") || pathname.startsWith("/signup")) {
    return response
  }

  // ✅ Block protected pages
  if (!session) {
    return NextResponse.redirect(new URL("/signin", request.url))
  }

  return response
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico).*)"],
}
