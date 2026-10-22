import AskMiraSignIn from "@/components/askmira/AskMiraSignIn"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Signing in | Help Desk 360° CGB Solutions ",
  description: "CGB Solutions | A One-Stop Solution for Your Business",
}

export default function AskMiraSignInPage() {
  return <AskMiraSignIn />
}
