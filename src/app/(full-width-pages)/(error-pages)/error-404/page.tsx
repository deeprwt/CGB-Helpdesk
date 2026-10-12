import GridShape from "@/components/common/GridShape";
import { Button } from "@/components/ui/button";
import { House, SearchX } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";
import React from "react";

export const metadata: Metadata = {
  title: "Error 404 | Help Desk 360° CGB Solutions ",
  description:
    "CGB Solutions | A One-Stop Solution for Your Business",
};

export default function Error404() {
  return (
    <div className="relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden bg-white p-6 dark:bg-gray-900">
      <GridShape />
      {/* Soft glow blobs */}
      <div className="pointer-events-none absolute -right-24 -top-24 -z-1 h-80 w-80 rounded-full bg-brand-200/50 blur-3xl dark:bg-brand-500/10" />
      <div className="pointer-events-none absolute -bottom-28 -left-20 -z-1 h-80 w-80 rounded-full bg-blue-light-200/50 blur-3xl dark:bg-blue-light-500/10" />

      <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-600 ring-1 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/20">
          <SearchX className="h-3.5 w-3.5" />
          Error
        </span>

        <h1 className="mt-6 bg-gradient-to-br from-brand-500 via-brand-600 to-blue-light-500 bg-clip-text text-8xl font-extrabold leading-none tracking-tighter text-transparent sm:text-9xl dark:from-brand-400 dark:via-brand-300 dark:to-blue-light-400">
          404
        </h1>

        <p className="mt-6 text-lg font-semibold text-gray-900 dark:text-white">
          Page not found
        </p>
        <p className="mt-2 text-sm text-gray-500 sm:text-base dark:text-gray-400">
          We can’t seem to find the page you are looking for!
        </p>

        <Button asChild className="mt-8">
          <Link href="/">
            <House />
            Back to Home
          </Link>
        </Button>
      </div>
      {/* <!-- Footer --> */}
      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center text-sm text-gray-500 dark:text-gray-400">
        &copy; {new Date().getFullYear()} - CGB Solutions
      </p>
    </div>
  );
}
