"use client";

import { Ico } from "@/components/admin/primitives/icons";

type Props = {
  /** Current page label shown after the "Taaruf › Admin ›" prefix. */
  crumb: string;
  /** Hamburger handler. Toggles desktop collapse / mobile drawer. */
  onMenu: () => void;
};

export function Topbar({ crumb, onMenu }: Props) {
  return (
    <div className="topbar">
      <button className="hamburger" onClick={onMenu} aria-label="Toggle menu">
        {Ico.hamburger}
      </button>
      <div className="crumb">
        <span>Taaruf</span>
        <span style={{ color: "var(--line)" }}>›</span>
        <span>Admin</span>
        <span style={{ color: "var(--line)" }}>›</span>
        <span className="now">{crumb}</span>
      </div>
      <div className="search">
        <span className="glass">{Ico.search}</span>
        <input placeholder="Search profiles, matches, emails…" />
      </div>
      <div className="topbar-actions">
        <button className="ibtn" aria-label="Notifications">
          {Ico.bell}
          <span className="dot" />
        </button>
        <button className="btn btn-primary">
          {Ico.plus}
          <span className="btn-label">New match</span>
        </button>
      </div>
    </div>
  );
}
