import { redirect } from "next/navigation";

// Scenarios now live in the Room's "Start from" row; this keeps old links and bookmarks working.
export default function FrameworksRedirect() {
  redirect("/simulate/new");
}
