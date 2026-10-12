import Calendar from "@/components/calendar/Calendar";
import { PageHeader } from "@/components/common/page-header";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Calendar | Help Desk 360° CGB Solutions ",
  description: "CGB Solutions | A One-Stop Solution for Your Business",
  // other metadata
};
export default function page() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calendar"
        description="Schedule events and keep track of what's coming up."
      />
      <Calendar />
    </div>
  );
}
