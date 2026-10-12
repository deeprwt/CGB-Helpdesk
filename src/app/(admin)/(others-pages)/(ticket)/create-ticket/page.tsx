import { Metadata } from "next";
import React from "react";

import { PageHeader } from "@/components/common/page-header";
import CreateTicketForm from "@/components/tickets/CreateTicketForm";

export const metadata: Metadata = {
  title: "Create New Ticket | Help Desk 360° CGB Solutions ",
  description: "CGB Solutions | A One-Stop Solution for Your Business",
};

export default function BlankPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: "Tickets", href: "/ticket" }, { label: "New Ticket" }]}
        title="Create Ticket"
        description="Describe the issue and we'll route it to the right engineer."
      />
      <CreateTicketForm />
    </div>
  );
}
