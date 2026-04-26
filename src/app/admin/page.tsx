import { redirect } from "next/navigation";

/**
 * /admin now redirects to the new dashboard. The legacy single-page
 * dashboard lived here historically; all of its functionality has
 * been split across /admin/dashboard, /admin/profiles, and
 * /admin/settings. The cookie auth check happens inside the (shell)
 * layout that wraps every admin route.
 */
export default function AdminRoot() {
  redirect("/admin/dashboard");
}
