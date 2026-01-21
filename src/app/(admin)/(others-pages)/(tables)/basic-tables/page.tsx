import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";

import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Next.js Basic Table | Help Desk 360° CGB Solutions ",
  description:
    "This is Next.js Basic Table  page for TailAdmin  Tailwind CSS Admin Dashboard Template",
  // other metadata
};

export default function BasicTables() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Basic Table" />
      <div className="space-y-6">

      </div>
    </div>
  );
}
