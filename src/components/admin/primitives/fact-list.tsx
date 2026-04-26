import type { ReactNode } from "react";

export type Fact = {
  label: string;
  value: ReactNode;
};

/**
 * Two-column key/value list used in the profile detail pane and the
 * match workbench. Keys render in muted small caps; values inherit
 * body text styling.
 */
export function FactList({ facts }: { facts: Fact[] }) {
  return (
    <div className="fact-list">
      {facts.map((f) => (
        <div className="fact" key={f.label}>
          <span className="k">{f.label}</span>
          <span className="v">{f.value}</span>
        </div>
      ))}
    </div>
  );
}
