"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

/**
 * Form layout primitives (shadcn "field" pattern).
 *
 *   <FieldSet>
 *     <FieldLegend>Ticket details</FieldLegend>
 *     <FieldGroup className="sm:grid-cols-2">
 *       <Field>
 *         <FieldLabel htmlFor="subject" required>Subject</FieldLabel>
 *         <Input id="subject" />
 *         <FieldDescription>Short summary of the issue</FieldDescription>
 *         <FieldError>{errors.subject}</FieldError>
 *       </Field>
 *     </FieldGroup>
 *   </FieldSet>
 */

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn("flex min-w-0 flex-col gap-5", className)}
      {...props}
    />
  )
}

function FieldLegend({
  className,
  description,
  children,
  ...props
}: React.ComponentProps<"legend"> & { description?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <legend
        data-slot="field-legend"
        className={cn(
          "text-base font-semibold text-gray-900 dark:text-white",
          className
        )}
        {...props}
      >
        {children}
      </legend>
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
      )}
    </div>
  )
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn("grid grid-cols-1 gap-5", className)}
      {...props}
    />
  )
}

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & {
  orientation?: "vertical" | "horizontal"
}) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(
        "group/field flex min-w-0 gap-2",
        orientation === "vertical"
          ? "flex-col"
          : "flex-row items-center justify-between gap-3",
        className
      )}
      {...props}
    />
  )
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn("flex min-w-0 flex-1 flex-col gap-1", className)}
      {...props}
    />
  )
}

function FieldLabel({
  className,
  required,
  children,
  ...props
}: React.ComponentProps<typeof Label> & { required?: boolean }) {
  return (
    <Label
      data-slot="field-label"
      className={cn("text-gray-700 dark:text-gray-300", className)}
      {...props}
    >
      {children}
      {required && <span className="text-red-500">*</span>}
    </Label>
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-xs text-gray-500 dark:text-gray-400", className)}
      {...props}
    />
  )
}

function FieldError({
  className,
  children,
  ...props
}: React.ComponentProps<"p">) {
  if (!children) return null
  return (
    <p
      role="alert"
      data-slot="field-error"
      className={cn("text-xs font-medium text-red-600 dark:text-red-400", className)}
      {...props}
    >
      {children}
    </p>
  )
}

export {
  FieldSet,
  FieldLegend,
  FieldGroup,
  Field,
  FieldContent,
  FieldLabel,
  FieldDescription,
  FieldError,
}
