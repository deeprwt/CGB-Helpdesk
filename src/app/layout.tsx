import { Fraunces, Inter } from "next/font/google"
import "./globals.css"
import "flatpickr/dist/flatpickr.css"
import { SidebarProvider } from "@/context/SidebarContext"
import { ThemeProvider } from "@/context/ThemeContext"
import AuthGate from "@/components/auth/AuthGate"
import { Toaster } from "@/components/ui/sonner"

// AskMiraa's pairing: Inter for the UI, Fraunces for page titles.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", axes: ["SOFT", "opsz"] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className={`${inter.className} dark:bg-gray-900`}>
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
