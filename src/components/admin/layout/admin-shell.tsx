"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

const CRUMBS: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/admin/inbox": "Inbox",
  "/admin/profiles": "Profiles",
  "/admin/pending": "Pending",
  "/admin/workbench": "Match workbench",
  "/admin/pipeline": "Pipeline",
  "/admin/interests": "Interests",
  "/admin/events": "Events",
  "/admin/settings": "Settings",
};

type Props = {
  children: ReactNode;
  adminName?: string;
};

/**
 * Client-side shell that owns the sidebar / topbar interaction state
 * (mobile drawer + desktop collapse). Wraps every page rendered under
 * the admin (shell) route group.
 */
export function AdminShell({ children, adminName }: Props) {
  const pathname = usePathname();
  const [sideOpen, setSideOpen] = useState(false);
  const [sideCollapsed, setSideCollapsed] = useState(false);

  const toggleSide = () => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches) {
      setSideOpen((o) => !o);
    } else {
      setSideCollapsed((c) => !c);
    }
  };

  // Match longest prefix so nested routes inherit a sensible crumb.
  const crumb =
    Object.keys(CRUMBS)
      .sort((a, b) => b.length - a.length)
      .find((p) => pathname === p || pathname?.startsWith(p + "/")) || "/admin/dashboard";

  return (
    <div data-admin>
      <div className={`shell ${sideCollapsed ? "collapsed" : ""}`}>
        <Sidebar
          open={sideOpen}
          collapsed={sideCollapsed}
          onClose={() => setSideOpen(false)}
          adminName={adminName}
        />
        <div className="main">
          <Topbar crumb={CRUMBS[crumb] || "Dashboard"} onMenu={toggleSide} />
          <div className="content">{children}</div>
        </div>
      </div>
    </div>
  );
}
