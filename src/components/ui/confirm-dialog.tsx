"use client";

import React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Trash2, Info } from "lucide-react";

type ConfirmVariant = "danger" | "warning" | "info";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  onConfirm: () => void;
  loading?: boolean;
}

const variantConfig: Record<
  ConfirmVariant,
  { icon: React.ReactNode; actionClass: string; iconBg: string }
> = {
  danger: {
    icon: <Trash2 className="w-5 h-5 text-red-600" />,
    actionClass: "bg-red-600 text-white hover:bg-red-700",
    iconBg: "bg-red-100",
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
    actionClass: "bg-amber-600 text-white hover:bg-amber-700",
    iconBg: "bg-amber-100",
  },
  info: {
    icon: <Info className="w-5 h-5 text-blue-600" />,
    actionClass: "bg-blue-600 text-white hover:bg-blue-700",
    iconBg: "bg-blue-100",
  },
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  loading = false,
}: ConfirmDialogProps) {
  const config = variantConfig[variant];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-start gap-4">
            <div
              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${config.iconBg}`}
            >
              {config.icon}
            </div>
            <div className="flex-1">
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription className="mt-1">
                {description}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={config.actionClass}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Please wait..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
