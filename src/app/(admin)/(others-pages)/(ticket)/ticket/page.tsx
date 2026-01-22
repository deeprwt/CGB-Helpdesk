import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import RoleBasedTickets from "@/components/user-role/RoleBasedTickets";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Tickets | Help Desk 360° CGB Solutions ",
  description: "Tickets",
};

export default function BlankPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Latest Tickets" />
      <div className="min-h-screen rounded-2xl border border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-white/[0.03] xl:px-10 xl:py-12">
        <RoleBasedTickets />
      </div>
    </div>
  );
}
