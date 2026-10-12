import * as React from "react"
import { Inbox, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-white/5">
        <Icon className="h-6 w-6 text-gray-400" />
      </span>
      <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
