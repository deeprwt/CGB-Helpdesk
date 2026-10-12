"use client"

import * as React from "react"
import {
  type Column,
  type ColumnDef,
  type OnChangeFn,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SearchInput } from "@/components/ui/search-input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Extra classes for every body cell in this column */
    className?: string
    /** Extra classes for the header cell */
    headerClassName?: string
  }
}

/** Page size used for the "All" choice in the rows-per-page selector. */
export const DATA_TABLE_ALL_ROWS = Number.MAX_SAFE_INTEGER

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 50, 100, 500, 1000]

/** Server-side pagination. When passed, the table stops paging/filtering rows itself. */
export type DataTablePagination = {
  /** 0-based page index */
  pageIndex: number
  pageSize: number
  /** Total row count, when the backend reports it */
  totalRows?: number
  /** Used instead of `totalRows` when the total is unknown */
  hasNextPage?: boolean
  onPageChange: (pageIndex: number) => void
  /** Enables the rows-per-page selector; receives `DATA_TABLE_ALL_ROWS` for "All" */
  onPageSizeChange?: (pageSize: number) => void
}

export interface DataTableProps<TData, TValue = unknown> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  loading?: boolean
  /** Card header, left side */
  title?: React.ReactNode
  description?: React.ReactNode
  /**
   * Show the search box. Uncontrolled it filters rows client-side; pass
   * `search` + `onSearchChange` to control it (e.g. for server-side search).
   */
  searchable?: boolean
  searchPlaceholder?: string
  search?: string
  onSearchChange?: (value: string) => void
  /** Filter controls rendered before the search box (Selects, toggles…) */
  filters?: React.ReactNode
  /** Buttons rendered after the search box (Export, Add…) */
  toolbarActions?: React.ReactNode
  /** Slot between the toolbar and the table (tabs, bulk-action bar…) */
  subHeader?: React.ReactNode
  /** Initial client-side page size (default 10) */
  pageSize?: number
  /** "Rows per page" choices (an "All" choice is always added); pass `[]` to hide the selector */
  pageSizeOptions?: number[]
  pagination?: DataTablePagination
  /** Noun used in the footer: "Showing 1–10 of 42 tickets" */
  entityName?: string
  emptyIcon?: LucideIcon
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
  onRowClick?: (row: TData) => void
  getRowId?: (row: TData, index: number) => string
  rowSelection?: RowSelectionState
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  initialSorting?: SortingState
  columnVisibility?: VisibilityState
  className?: string
  /** Drop the card chrome when the table already sits inside a Card */
  bare?: boolean
}

const INTERACTIVE_SELECTOR =
  "button, a, input, select, textarea, label, [role=checkbox], [role=menuitem], [role=combobox], [data-no-row-click]"

export function DataTable<TData, TValue = unknown>({
  columns,
  data,
  loading = false,
  title,
  description,
  searchable = false,
  searchPlaceholder = "Search…",
  search,
  onSearchChange,
  filters,
  toolbarActions,
  subHeader,
  pageSize = 10,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  pagination,
  entityName = "results",
  emptyIcon: EmptyIcon = Inbox,
  emptyTitle = "No results found",
  emptyDescription,
  emptyAction,
  onRowClick,
  getRowId,
  rowSelection,
  onRowSelectionChange,
  initialSorting = [],
  columnVisibility,
  className,
  bare = false,
}: DataTableProps<TData, TValue>) {
  const isManual = !!pagination
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting)
  const [internalSearch, setInternalSearch] = React.useState("")
  const [internalSelection, setInternalSelection] = React.useState<RowSelectionState>({})
  const [clientPagination, setClientPagination] = React.useState({ pageIndex: 0, pageSize })

  const searchValue = search ?? internalSearch
  const setSearchValue = (value: string) => {
    if (onSearchChange) onSearchChange(value)
    else setInternalSearch(value)
    if (!isManual) setClientPagination((p) => ({ ...p, pageIndex: 0 }))
  }

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: {
      sorting,
      globalFilter: isManual ? undefined : searchValue,
      rowSelection: rowSelection ?? internalSelection,
      columnVisibility,
      pagination: isManual
        ? { pageIndex: pagination.pageIndex, pageSize: pagination.pageSize }
        : clientPagination,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: onRowSelectionChange ?? setInternalSelection,
    onPaginationChange: isManual ? undefined : setClientPagination,
    enableRowSelection: true,
    manualPagination: isManual,
    manualFiltering: isManual,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: isManual ? undefined : getPaginationRowModel(),
  })

  // Clamp the client page when data shrinks (e.g. after a delete)
  React.useEffect(() => {
    if (isManual) return
    const pageCount = table.getPageCount()
    if (pageCount > 0 && clientPagination.pageIndex > pageCount - 1) {
      setClientPagination((p) => ({ ...p, pageIndex: pageCount - 1 }))
    }
  }, [data.length, isManual, clientPagination.pageIndex, table])

  // ── Footer numbers ──────────────────────────────────────────────────────
  const rows = table.getRowModel().rows
  const pageIndex = isManual ? pagination.pageIndex : clientPagination.pageIndex
  const effectivePageSize = isManual ? pagination.pageSize : clientPagination.pageSize
  const totalRows = isManual
    ? pagination.totalRows
    : table.getFilteredRowModel().rows.length
  const totalPages =
    totalRows !== undefined ? Math.max(1, Math.ceil(totalRows / effectivePageSize)) : undefined
  const canPrev = pageIndex > 0
  const canNext = isManual
    ? totalPages !== undefined
      ? pageIndex < totalPages - 1
      : !!pagination.hasNextPage
    : table.getCanNextPage()
  const firstRow = rows.length === 0 ? 0 : pageIndex * effectivePageSize + 1
  const lastRow = pageIndex * effectivePageSize + rows.length

  const goTo = (index: number) => {
    if (isManual) pagination.onPageChange(index)
    else table.setPageIndex(index)
  }

  const showPageSize =
    pageSizeOptions.length > 0 && (!isManual || !!pagination.onPageSizeChange)
  const changePageSize = (size: number) => {
    if (isManual) pagination.onPageSizeChange?.(size)
    else setClientPagination({ pageIndex: 0, pageSize: size })
  }

  const hasToolbar = !!(title || description || searchable || filters || toolbarActions)
  const visibleColumnCount = table.getVisibleLeafColumns().length

  return (
    <div
      data-slot="data-table"
      className={cn(
        "flex min-w-0 flex-col",
        !bare &&
          "overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-gray-900/40",
        className
      )}
    >
      {hasToolbar && (
        <div
          className={cn(
            "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between",
            bare ? "pb-4" : "border-b border-gray-200 px-5 py-4 dark:border-white/10"
          )}
        >
          {(title || description) && (
            <div className="min-w-0">
              {title && (
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  {title}
                </h3>
              )}
              {description && (
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  {description}
                </p>
              )}
            </div>
          )}
          {(searchable || filters || toolbarActions) && (
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
              {filters}
              {searchable && (
                <SearchInput
                  size="sm"
                  placeholder={searchPlaceholder}
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onClear={() => setSearchValue("")}
                  wrapperClassName="w-full sm:w-64"
                />
              )}
              {toolbarActions}
            </div>
          )}
        </div>
      )}

      {subHeader && (
        <div
          className={cn(
            bare ? "pb-4" : "border-b border-gray-200 px-5 py-3 dark:border-white/10"
          )}
        >
          {subHeader}
        </div>
      )}

      <div className="glass-scrollbar w-full overflow-x-auto">
        <Table>
          <TableHeader className="bg-gray-50 dark:bg-white/[0.03]">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "h-11 px-4 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400",
                      header.column.columnDef.meta?.headerClassName
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {loading ? (
              Array.from({ length: Math.min(effectivePageSize, 6) }).map((_, i) => (
                <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                  {Array.from({ length: visibleColumnCount }).map((__, j) => (
                    <TableCell key={j} className="px-4 py-3.5">
                      <Skeleton className="h-4 w-full max-w-[160px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumnCount} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-2 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-white/5">
                      <EmptyIcon className="h-6 w-6 text-gray-400" />
                    </span>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {emptyTitle}
                    </p>
                    {emptyDescription && (
                      <p className="max-w-sm whitespace-normal text-sm text-gray-500 dark:text-gray-400">
                        {emptyDescription}
                      </p>
                    )}
                    {emptyAction && <div className="mt-2">{emptyAction}</div>}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  onClick={
                    onRowClick
                      ? (e) => {
                          const target = e.target as HTMLElement
                          if (target.closest(INTERACTIVE_SELECTOR)) return
                          onRowClick(row.original)
                        }
                      : undefined
                  }
                  className={cn(
                    "border-gray-100 hover:bg-gray-50/80 dark:border-white/5 dark:hover:bg-white/[0.02]",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "px-4 py-3 text-sm text-gray-700 dark:text-gray-300",
                        cell.column.columnDef.meta?.className
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer: counts + pagination */}
      <div
        className={cn(
          "flex flex-col items-center justify-between gap-3 sm:flex-row",
          bare ? "pt-4" : "border-t border-gray-200 px-5 py-3 dark:border-white/10"
        )}
      >
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {loading
              ? "Loading…"
              : rows.length === 0
                ? "No results"
                : totalRows !== undefined
                  ? `Showing ${firstRow}–${lastRow} of ${totalRows} ${entityName}`
                  : `Showing ${firstRow}–${lastRow} ${entityName}`}
          </p>
          {showPageSize && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Rows per page</span>
              <Select
                value={
                  effectivePageSize === DATA_TABLE_ALL_ROWS ? "all" : String(effectivePageSize)
                }
                onValueChange={(v) =>
                  changePageSize(v === "all" ? DATA_TABLE_ALL_ROWS : Number(v))
                }
              >
                <SelectTrigger size="sm" className="w-[84px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Keep the current size selectable even if it isn't a listed option */}
                  {(pageSizeOptions.includes(effectivePageSize) ||
                  effectivePageSize === DATA_TABLE_ALL_ROWS
                    ? pageSizeOptions
                    : [...pageSizeOptions, effectivePageSize].sort((a, b) => a - b)
                  ).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n.toLocaleString()}
                    </SelectItem>
                  ))}
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  if (canPrev) goTo(pageIndex - 1)
                }}
                aria-disabled={!canPrev}
                className={cn(!canPrev && "pointer-events-none opacity-50")}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="flex h-9 min-w-[72px] items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium tabular-nums">
                {pageIndex + 1}
                {totalPages !== undefined && ` / ${totalPages}`}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  if (canNext) goTo(pageIndex + 1)
                }}
                aria-disabled={!canNext}
                className={cn(!canNext && "pointer-events-none opacity-50")}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}

/** Sortable column header: `header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />` */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>
  title: string
  className?: string
}) {
  if (!column.getCanSort()) {
    return <span className={className}>{title}</span>
  }
  const sorted = column.getIsSorted()
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => column.toggleSorting(sorted === "asc")}
      className={cn(
        "-ml-3 h-8 px-3 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white",
        className
      )}
    >
      {title}
      {sorted === "desc" ? (
        <ArrowDown className="size-3.5" />
      ) : sorted === "asc" ? (
        <ArrowUp className="size-3.5" />
      ) : (
        <ChevronsUpDown className="size-3.5 opacity-60" />
      )}
    </Button>
  )
}
