"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { profileSearchHref } from "@/lib/admin-profile-filters";
import { Ico } from "@/components/admin/primitives/icons";

type Props = {
  /** Current page label shown after the "Taaruf › Admin ›" prefix. */
  crumb: string;
  /** Hamburger handler. Toggles desktop collapse / mobile drawer. */
  onMenu: () => void;
};

export function Topbar({ crumb, onMenu }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");

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
      <form className="search" role="search" onSubmit={(event) => {
        event.preventDefault();
        router.push(profileSearchHref(search));
      }}>
        <span className="glass">{Ico.search}</span>
        <input type="search" aria-label="Search profiles" placeholder="Search profiles by name, email, or phone…" value={search} onChange={(event) => setSearch(event.target.value)} />
        <button type="submit" className="btn btn-sm">Search</button>
      </form>
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
