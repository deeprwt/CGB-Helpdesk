import AssetForm from "@/components/asset/AssetForm";
import RoleGate from "@/components/auth/RoleGate";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Next.js Blank Page | Help Desk 360° CGB Solutions ",
  description: "This is Next.js Blank Page TailAdmin Dashboard Template",
};

export default function BlankPage() {
  return (
    <div>
      <RoleGate allowedRoles={["engineer", "admin"]}>
        <PageBreadcrumb pageTitle="Blank Page" />
        <div className="min-h-screen rounded-2xl border border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-white/[0.03] xl:px-10 xl:py-12">

          <AssetForm mode="create" />

        </div>
      </RoleGate>
    </div>
  );
}
