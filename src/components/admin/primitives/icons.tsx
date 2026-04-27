/**
 * Tiny inline SVG icons for the admin sidebar / topbar / actions.
 * Ported verbatim from public/admin-preview/index.html so the
 * geometry matches the prototype exactly.
 */
export const Ico = {
  dash: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  ),
  people: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="8" cy="5" r="2.5" />
      <path d="M2.5 13.5 C 3 11 5 10 8 10 S 13 11 13.5 13.5" />
    </svg>
  ),
  match: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M4 5 L8 8 L4 11 M12 5 L8 8 L12 11" />
    </svg>
  ),
  workbench: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="2.5" y="3" width="4.5" height="6" rx="1" />
      <rect x="9" y="7" width="4.5" height="6" rx="1" />
      <path d="M7 6 H 9 M7 9 H 8.2 M8.8 10 L 7.5 12 M8.8 10 L 10.2 12" />
    </svg>
  ),
  pipeline: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 4 H 6.5 M9.5 4 H 13 M3 8 H 7.5 M10.5 8 H 13 M3 12 H 5.5 M8.5 12 H 13" />
      <circle cx="8" cy="4" r="1.4" />
      <circle cx="9" cy="8" r="1.4" />
      <circle cx="7" cy="12" r="1.4" />
    </svg>
  ),
  heart: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M8 13 L2.5 7.5 A 3 3 0 0 1 8 4 A 3 3 0 0 1 13.5 7.5 Z" />
    </svg>
  ),
  calendar: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="2" y="3" width="12" height="11" rx="1" />
      <path d="M2 6 H 14 M5 2 V 4 M11 2 V 4" />
    </svg>
  ),
  inbox: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M2 3 H 14 V 11 H 2 Z M2 9 H 6 L 7 10 H 9 L 10 9 H 14" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1 V 3 M8 13 V 15 M1 8 H 3 M13 8 H 15 M2.8 2.8 L 4.2 4.2 M11.8 11.8 L 13.2 13.2 M13.2 2.8 L 11.8 4.2 M4.2 11.8 L 2.8 13.2" />
    </svg>
  ),
  bell: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M4 11 V 7 A 4 4 0 0 1 12 7 V 11 L 13 12 H 3 Z M7 13 H 9" />
    </svg>
  ),
  search: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="6" cy="6" r="4" />
      <path d="M9 9 L 12 12" />
    </svg>
  ),
  plus: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M7 2 V 12 M2 7 H 12" />
    </svg>
  ),
  close: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 3 L 11 11 M11 3 L 3 11" />
    </svg>
  ),
  more: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="3" cy="8" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="13" cy="8" r="1.3" />
    </svg>
  ),
  hamburger: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M2 5 H 16 M2 9 H 16 M2 13 H 16" />
    </svg>
  ),
};
