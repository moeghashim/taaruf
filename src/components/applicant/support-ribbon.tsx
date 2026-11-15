import styles from "./support-ribbon.module.css";

/** Presentational only: no session access, event handlers or network effects. */
export function SupportRibbon() {
  return (
    <footer className={styles.ribbon} aria-label="Portal support">
      <p><strong>Need a hand?</strong>{" "}If you run into any issues, email{" "}<a href="mailto:1plus1@plus1htx.org">1plus1@plus1htx.org</a>.</p>
    </footer>
  );
}
