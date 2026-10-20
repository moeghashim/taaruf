import { redirect } from "next/navigation";

// #38 supersedes the separate attendance editor. Historical rows remain stored.
export default function EventAttendeesPage() {
  redirect("/admin/events");
}
