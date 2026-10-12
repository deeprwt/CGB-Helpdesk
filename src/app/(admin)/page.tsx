import type { Metadata } from "next";
import React from "react";

import DashboardHeader from "@/components/dashboard/DashboardHeader";
import TicketOverviewCards from "@/components/tickets/TicketOverviewCards";
import RoleBasedTickets from "@/components/user-role/RoleBasedTickets";
import TeammatesCard from "@/components/user-role/TeammatesCard";
import { PieChartTable } from "@/components/user-role/PieChartTable";

export const metadata: Metadata = {
  title:
    "Dashboard | Help Desk 360° CGB Solutions ",
  description: "CGB Solutions | A One-Stop Solution for Your Business",
};

export default function Dashboard() {
  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader />

      <TicketOverviewCards />

      {/* Staff-only widgets: both render nothing for end users, so the row collapses */}
      <div className="grid grid-cols-12 gap-4 md:gap-6 [&:not(:has(>div:not(:empty)))]:hidden">
        <div className="col-span-12 empty:hidden xl:col-span-5">
          <TeammatesCard />
        </div>
        <div className="col-span-12 empty:hidden xl:col-span-7">
          <PieChartTable />
        </div>
      </div>

      <RoleBasedTickets />
    </div>
  );
}
