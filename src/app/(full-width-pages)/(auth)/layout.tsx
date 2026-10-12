import GridShape from "@/components/common/GridShape";
import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";

import { ThemeProvider } from "@/context/ThemeContext";
import { Boxes, Ticket, Timer, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React from "react";

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Ticket,
    title: "Raise & track tickets",
    description: "Log issues in seconds and follow every update in real time.",
  },
  {
    icon: Timer,
    title: "SLA tracking",
    description: "Stay ahead of response and resolution deadlines.",
  },
  {
    icon: Boxes,
    title: "Asset management",
    description: "Keep every device and licence tagged and accounted for.",
  },
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative z-1 bg-white p-6 sm:p-0 dark:bg-gray-900">
      <ThemeProvider>
        <div className="relative flex h-screen w-full flex-col justify-center sm:p-0 lg:flex-row dark:bg-gray-900">
          {children}

          {/* Brand panel (lg+) */}
          <div className="relative isolate hidden h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 lg:flex lg:w-1/2 dark:from-indigo-800 dark:via-indigo-900 dark:to-purple-900">
            {/* Soft glow blobs */}
            <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-purple-400/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-indigo-400/30 blur-3xl" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-3xl" />

            {/* <!-- ===== Common Grid Shape Start ===== --> */}
            <GridShape />

            <div className="relative z-10 flex w-full max-w-sm flex-col items-center px-8 text-center">
              <Link href="/" className="mb-5 block">
                <Image
                  width={231}
                  height={48}
                  className="h-auto w-56"
                  src="/images/logo/auth-logo.svg"
                  alt="Logo"
                  priority
                />
              </Link>
              <p className="text-base font-medium text-white/80">
                CGB Solutions | A One-Stop Solution for Your Business
              </p>

              <ul className="mt-10 flex w-full flex-col gap-3 text-left">
                {FEATURES.map(({ icon: Icon, title, description }) => (
                  <li
                    key={title}
                    className="flex items-start gap-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10 backdrop-blur-sm"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{title}</p>
                      <p className="mt-0.5 text-xs text-white/70">{description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
            <ThemeTogglerTwo />
          </div>
        </div>
      </ThemeProvider>
    </div>
  );
}
