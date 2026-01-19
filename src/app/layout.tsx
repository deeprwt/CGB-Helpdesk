import { Outfit } from "next/font/google"
import "./globals.css"
import "flatpickr/dist/flatpickr.css"
import { SidebarProvider } from "@/context/SidebarContext"
import { ThemeProvider } from "@/context/ThemeContext"
import AuthGate from "@/components/auth/AuthGate"
import { Toaster } from "@/components/ui/sonner"

const outfit = Outfit({
  subsets: ["latin"],
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${outfit.className} dark:bg-gray-900`}>
        <ThemeProvider>
          <SidebarProvider>
            {/* ✅ PROTECT EVERYTHING BY DEFAULT */}
            <AuthGate>{children}</AuthGate>
          </SidebarProvider>
        </ThemeProvider>

        {/* Notifications */}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
