import Link from "next/link"
import { ChevronLeft, MailCheck } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Self sign-up is off: people join when an administrator invites them.
 * This screen explains that to anyone who lands on /signup.
 */
export default function SignUpForm() {
  return (
    <div className="flex w-full flex-1 flex-col overflow-y-auto no-scrollbar lg:w-1/2">
      <div className="mx-auto mb-5 w-full max-w-md sm:pt-10">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <Link href="/signin">
            <ChevronLeft />
            Back to sign in
          </Link>
        </Button>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-10">
        <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-white shadow-md shadow-brand-500/25">
          <MailCheck className="h-5 w-5" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Access is by invitation
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Accounts can&apos;t be created here. Ask your IT administrator to invite you — you&apos;ll get an
          email with a link to set your password.
        </p>

        <ul className="mt-6 space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
          <li>Already invited? Open the link in your invitation email to set your password.</li>
          <li>Link expired? Ask your administrator to resend the invitation.</li>
          <li>Already set a password? Sign in below.</li>
        </ul>

        <Button asChild className="mt-6 h-12 w-full font-semibold">
          <Link href="/signin">Go to sign in</Link>
        </Button>
      </div>
    </div>
  )
}
