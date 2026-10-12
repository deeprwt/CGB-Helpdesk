import UserAddressCard from "@/components/user-profile/UserAddressCard";
import UserInfoCard from "@/components/user-profile/UserInfoCard";
// import UserMetaCard from "@/components/user-profile/UserMetaCard";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Profile | Help Desk 360° CGB Solutions ",
  description:
    "CGB Solutions | A One-Stop Solution for Your Business",
};

export default function Profile() {
  return (
    // UserInfoCard renders the hero header (full width, always first) + the
    // personal-information card; the address card sits beside it on lg.
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* <UserMetaCard /> */}
      <UserInfoCard />
      <UserAddressCard />
    </div>
  );
}
