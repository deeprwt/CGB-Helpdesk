import UpdatePswdForm from "@/components/auth/UpdatePswdForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Set your password | Help Desk 360° CGB Solutions ",
  description: "CGB Solutions | A One-Stop Solution for Your Business",
};

export default function UpdatePassword() {
  return <UpdatePswdForm />;
}
