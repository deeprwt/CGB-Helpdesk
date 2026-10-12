import Link from "next/link";
import { Metadata } from "next";
import { Plus } from "lucide-react";
import React from "react";

import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import RoleBasedTickets from "@/components/user-role/RoleBasedTickets";

export const metadata: Metadata = {
  title: "Tickets | Help Desk 360° CGB Solutions ",
  description: "CGB Solutions | A One-Stop Solution for Your Business",
};

export default function BlankPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tickets"
        description="Track, pick up and resolve support requests in one place."
        actions={
          <Button variant="gradient" asChild>
            <Link href="/create-ticket">
              <Plus />
              New Ticket
            </Link>
          </Button>
        }
      />
      <RoleBasedTickets />
    </div>
  );
}
