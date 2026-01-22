"use client";

import * as React from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { ArrowUpDown, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

type Employee = {
  id: string;
  name: string;
  role: "user" | "engineer" | "admin";
  empId: string;
  department: string;
  position: string;
  email: string;
  phone: string;
  location: string;
  avatar: string;
};

export default function EmployeeTable() {
  const [data, setData] = React.useState<Employee[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  // 🔹 Fetch users from Supabase
React.useEffect(() => {
  const fetchUsers = async () => {
    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setLoading(false);
      return;
    }

    const userId = session.user.id;

    const { data: currentUser, error: roleError } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .single();

    if (roleError || !["admin", "engineer"].includes(currentUser.role)) {
      console.error("Unauthorized access");
      setData([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from("users")
      .select(`
        id,
        full_name,
        role,
        employee_id,
        department,
        position,
        email,
        phone,
        city,
        avatar_url
      `);

    if (currentUser.role === "engineer") {
      query = query.in("role", ["user", "engineer"]);
    }

    const { data, error } = await query;

    if (!error && data) {
      setData(
        data.map((u) => ({
          id: u.id,
          name: u.full_name ?? "-",
          role: u.role ?? "user",
          empId: u.employee_id ?? "-",
          department: u.department ?? "-",
          position: u.position ?? "-",
          email: u.email ?? "-",
          phone: u.phone ?? "-",
          location: u.city ?? "-",
          avatar: u.avatar_url ?? "/images/user/user-31.jpg",
        }))
      );
    }

    setLoading(false);
  };

  fetchUsers();
}, []);


  const columns: ColumnDef<Employee>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
        />
      ),
    },
    {
      id: "avatar",
      header: "",
      cell: ({ row }) => (
        <Image
          src={row.original.avatar}
          alt={row.original.name}
          width={36}
          height={36}
          className="rounded-full"
        />
      ),
    },
    { accessorKey: "name", header: "Name" },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => (
        <span className="capitalize font-semibold">
          {row.getValue("role")}
        </span>
      ),
      filterFn: (row, id, value: string[]) =>
        value.includes(row.getValue(id)),
    },
    { accessorKey: "empId", header: "Emp ID" },
    { accessorKey: "department", header: "Department" },
    { accessorKey: "position", header: "Position" },
    {
      accessorKey: "email",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() =>
            column.toggleSorting(column.getIsSorted() === "asc")
          }
        >
          Official Email Address
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    { accessorKey: "phone", header: "Phone No." },
    { accessorKey: "location", header: "Work Location" },
  ];

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const roles = ["user", "engineer", "admin"];

  return (
    <div className="w-full">
      {/* Filters */}
      <div className="flex items-center gap-2 py-4">
        <Input
          placeholder="Search email..."
          value={(table.getColumn("email")?.getFilterValue() as string) ?? ""}
          onChange={(e) =>
            table.getColumn("email")?.setFilterValue(e.target.value)
          }
          className="max-w-sm"
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">Filter Role</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {roles.map((role) => (
              <DropdownMenuCheckboxItem
                key={role}
                checked={(
                  table.getColumn("role")?.getFilterValue() as string[]
                )?.includes(role)}
                onCheckedChange={(checked) => {
                  const prev =
                    (table.getColumn("role")?.getFilterValue() as string[]) ??
                    [];
                  table
                    .getColumn("role")
                    ?.setFilterValue(
                      checked
                        ? [...prev, role]
                        : prev.filter((r) => r !== role)
                    );
                }}
              >
                {role}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              Columns <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((c) => c.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(v) =>
                    column.toggleVisibility(!!v)
                  }
                >
                  {column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={columns.length}>
                    <Skeleton className="h-10 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="text-muted-foreground flex-1 text-sm">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
