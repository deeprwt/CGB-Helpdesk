import DataTableDemo from "@/components/user-role/UserRoleTable";
import { Metadata } from "next";
import React from "react";
import RoleGate from "@/components/auth/RoleGate"
import { PageHeader } from "@/components/common/page-header";

export const metadata: Metadata = {
  title: "User & Role  | Help Desk 360° CGB Solutions ",
  description:
    "CGB Solutions | A One-Stop Solution for Your Business",
};

export default function Profile() {
  return (
    <RoleGate allowedRoles={["engineer", "admin", "superadmin"]}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Users & Roles"
          description="Everyone in your organisation, the role they hold, and quick access to their profiles."
          breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Users & Roles" }]}
        />
        <DataTableDemo />
      </div>
    </RoleGate>
  );
}
