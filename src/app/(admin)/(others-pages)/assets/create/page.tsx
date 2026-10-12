import AssetForm from "@/components/asset/AssetForm";
import RoleGate from "@/components/auth/RoleGate";
import { PageHeader } from "@/components/common/page-header";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Create Assets | Help Desk 360° CGB Solutions ",
  description: "CGB Solutions | A One-Stop Solution for Your Business",
};

export default function BlankPage() {
  return (
    <RoleGate allowedRoles={["engineer", "admin", "superadmin"]}>
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Assets", href: "/assets" }, { label: "New Asset" }]}
          title="Add Asset"
          description="Register a new asset, capture its hardware details and assign it to a user."
        />

        <AssetForm mode="create" />
      </div>
    </RoleGate>
  );
}
