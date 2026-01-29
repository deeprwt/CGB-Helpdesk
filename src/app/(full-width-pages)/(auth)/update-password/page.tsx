import SignInForm from "@/components/auth/SignInForm";
import UpdatePswdForm from "@/components/auth/UpdatePswdForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Update Password | Help Desk 360° CGB Solutions ",
  description: "CGB Solutions | A One-Stop Solution for Your Business",
};

export default function SignIn() {
  return <UpdatePswdForm />;
}
