import type { ReactNode } from "react";

type Props = {
  /**
   * Title content. Pass a string for plain text, or a ReactNode if you
   * need an italicized accent (use `<em>` for the accent word).
   */
  title: ReactNode;
  /** Subtitle / tagline below the title. */
  subtitle?: ReactNode;
  /** Action slot rendered to the right of the title (buttons, segmented controls). */
  actions?: ReactNode;
};

/**
 * Standard admin page header. Titles render in Cormorant Garamond at
 * 42px (30px on mobile); the optional `<em>` inside the title gets the
 * emerald accent color.
 */
export function PageHead({ title, subtitle, actions }: Props) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}
