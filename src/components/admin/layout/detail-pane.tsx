"use client";

import type { ReactNode } from "react";
import { Ico } from "@/components/admin/primitives/icons";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Header content — typically an avatar + name + meta block. */
  header: ReactNode;
  children: ReactNode;
};

/**
 * Right-side drawer used to surface profile / match detail without
 * leaving the current list page. Backdrop dims the content; ESC and
 * click-outside both close.
 */
export function DetailPane({ open, onClose, header, children }: Props) {
  return (
    <>
      <div className={`backdrop ${open ? "open" : ""}`} onClick={onClose} />
      <aside className={`detail-pane ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="dp-head">
          <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
            {header}
          </div>
          <button className="ibtn" onClick={onClose} aria-label="Close detail pane">
            {Ico.close}
          </button>
        </div>
        <div className="dp-body">{children}</div>
      </aside>
    </>
  );
}
