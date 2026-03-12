import DataTableDemo from "@/components/user-role/UserRoleTable";
import { Metadata } from "next";
import React from "react";
import RoleGate from "@/components/auth/RoleGate"

export const metadata: Metadata = {
  title: "User & Role  | Help Desk 360° CGB Solutions ",
  description:
    "CGB Solutions | A One-Stop Solution for Your Business",
};

export default function Profile() {
  return (
    <RoleGate allowedRoles={["engineer", "admin", "superadmin"]}>
    <div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-7">
          User & Role 
        </h3>
        <div className="space-y-6">
          <DataTableDemo />
        </div>
      </div>
    </div>
    </RoleGate>
  );
}
