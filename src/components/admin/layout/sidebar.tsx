"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/admin/primitives/logo-mark";
import { Ico } from "@/components/admin/primitives/icons";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
  urgent?: boolean;
};

type NavGroup = {
  heading: string;
  items: NavItem[];
};

const NAV: NavGroup[] = [
  {
    heading: "Overview",
    items: [
      { href: "/admin/dashboard", label: "Dashboard", icon: Ico.dash },
      { href: "/admin/inbox", label: "Inbox", icon: Ico.inbox },
    ],
  },
  {
    heading: "People",
    items: [
      { href: "/admin/profiles", label: "Profiles", icon: Ico.people },
      { href: "/admin/pending", label: "Pending review", icon: Ico.people },
    ],
  },
  {
    heading: "Matching",
    items: [
      { href: "/admin/workbench", label: "Match workbench", icon: Ico.match },
      { href: "/admin/pipeline", label: "Pipeline", icon: Ico.match },
      { href: "/admin/interests", label: "Interests", icon: Ico.heart },
    ],
  },
  {
    heading: "System",
    items: [
      { href: "/admin/events", label: "Events", icon: Ico.calendar },
      { href: "/admin/settings", label: "Settings", icon: Ico.settings },
    ],
  },
];

type Props = {
  /** Mobile drawer open state. */
  open: boolean;
  /** Desktop icon-rail collapsed state. */
  collapsed: boolean;
  /** Called when the user navigates or taps the backdrop on mobile. */
  onClose: () => void;
  /** Display name shown in the footer. Falls back to "Admin". */
  adminName?: string;
};

/**
 * Sidebar nav for the admin shell. On desktop the rail can collapse
 * to icon-only via the topbar hamburger. On mobile it slides in as
 * a drawer with a tappable backdrop.
 */
export function Sidebar({ open, collapsed, onClose, adminName }: Props) {
  const pathname = usePathname();
  const initials = (adminName || "Admin")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + "/");

  return (
    <>
      <div className={`side-backdrop ${open ? "open" : ""}`} onClick={onClose} />
      <aside className={`side ${open ? "open" : ""} ${collapsed ? "collapsed" : ""}`}>
        <div className="brand">
          <LogoMark />
          <div>
            <div className="brand-name">Taaruf</div>
            <div className="brand-tag">Admin</div>
          </div>
        </div>
        <div className="side-nav">
          {NAV.map((group) => (
            <div className="nav-section" key={group.heading}>
              <h5>{group.heading}</h5>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${isActive(item.href) ? "active" : ""}`}
                  onClick={onClose}
                >
                  <span className="icon">{item.icon}</span>
                  <span>{item.label}</span>
                  {typeof item.count === "number" && (
                    <span className={`count ${item.urgent ? "urgent" : ""}`}>{item.count}</span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="side-foot">
          <div className="avatar">{initials}</div>
          <div>
            <div style={{ color: "var(--ink)", fontWeight: 500, fontSize: 12 }}>{adminName || "Admin"}</div>
            <div style={{ fontSize: 10, color: "var(--mute)" }}>Admin · matchmaker</div>
          </div>
        </div>
      </aside>
    </>
  );
}
