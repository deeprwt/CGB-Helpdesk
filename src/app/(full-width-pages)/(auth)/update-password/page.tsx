import SignInForm from "@/components/auth/SignInForm";
import UpdatePswdForm from "@/components/auth/UpdatePswdForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Update Password Form | Help Desk 360° CGB Solutions ",
  description: "Update Password Page",
};

export default function SignIn() {
  return <UpdatePswdForm />;
}
