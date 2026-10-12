"use client";
import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "onSubmit"> {
  /** Optional keyboard shortcut (e.g. `"⌘K"` or `"/"`). When provided, pressing Cmd/Ctrl+<key> or "/" focuses the input. */
  shortcut?: string;
  /** When present, renders an `×` clear button and fires this when clicked. */
  onClear?: () => void;
  /** Fires when the user presses Enter while focused. */
  onSubmit?: (value: string) => void;
  /** Density of the field. Defaults to `default` (h-11). */
  size?: "sm" | "default";
  /** Extra wrapper styling (for grid/flex layouts). */
  wrapperClassName?: string;
}

/**
 * Unified app-wide search input:
 *   [🔍  Search or type command…              ⌘K ]
 *
 * • Rounded, bordered, matches the header search styling.
 * • Optional `shortcut` (focuses on Cmd/Ctrl+<key> or "/").
 * • Optional `onClear` clears the input and swaps ⌘K for an `×`.
 * • Forwarded ref so parents can focus it too.
 */
const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      className,
      wrapperClassName,
      shortcut,
      onClear,
      onSubmit,
      size = "default",
      placeholder = "Search or type command…",
      value,
      onChange,
      onKeyDown,
      ...props
    },
    forwardedRef,
  ) => {
    const localRef = React.useRef<HTMLInputElement | null>(null);
    const setRefs = (node: HTMLInputElement | null) => {
      localRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    };

    // Global keyboard shortcut: Cmd/Ctrl+<last-char> OR "/" (when not in another input)
    React.useEffect(() => {
      if (!shortcut) return;
      const handler = (event: KeyboardEvent) => {
        const lastChar = shortcut.trim().slice(-1).toLowerCase();
        const isComboShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === lastChar;
        const target = event.target as HTMLElement | null;
        const isTypingInField =
          target &&
          (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
        const isSlashShortcut = event.key === "/" && !isTypingInField && shortcut.includes("/");
        if (isComboShortcut || isSlashShortcut) {
          event.preventDefault();
          localRef.current?.focus();
          localRef.current?.select();
        }
      };
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }, [shortcut]);

    const hasValue = typeof value === "string" ? value.length > 0 : false;
    const showClear = Boolean(onClear) && hasValue;

    return (
      <div className={cn("relative w-full", wrapperClassName)}>
        {/* Leading search icon */}
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
          <Search className={cn(size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]")} />
        </span>

        <input
          ref={setRefs}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onSubmit && typeof value === "string") {
              e.preventDefault();
              onSubmit(value);
            }
            onKeyDown?.(e);
          }}
          className={cn(
            "w-full rounded-xl border border-gray-200 bg-white text-sm text-gray-800 shadow-sm placeholder:text-gray-400 transition-colors",
            "focus:border-indigo-300 focus:outline-none focus:ring-4 focus:ring-indigo-500/10",
            "dark:border-white/10 dark:bg-gray-900/60 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-indigo-500/50",
            size === "sm" ? "h-9 pl-10 pr-14 py-2" : "h-11 pl-12 pr-16 py-2.5",
            className,
          )}
          {...props}
        />

        {/* Trailing: clear button (preferred) or keyboard shortcut pill */}
        {showClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : shortcut ? (
          <span
            className={cn(
              "pointer-events-none absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 text-xs font-medium -tracking-[0.2px] text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400",
              size === "sm" ? "px-1.5 py-[3px] text-[11px]" : "px-[7px] py-[4.5px]",
            )}
          >
            {shortcut.split("").map((ch, i) => (
              <span key={i}>{ch}</span>
            ))}
          </span>
        ) : null}
      </div>
    );
  },
);
SearchInput.displayName = "SearchInput";

export { SearchInput };
