import { redirect } from "next/navigation";

/** Setup was removed; redirect old links to Watch Targets. */
export default function SetupPage() {
  redirect("/targets");
}
