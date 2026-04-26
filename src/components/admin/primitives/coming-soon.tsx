type Props = {
  /** One-line italic lede. Defaults to "Coming soon." */
  lede?: string;
  /** Supporting copy under the lede. */
  body?: string;
};

/**
 * Visual placeholder used by sidebar surfaces that aren't yet wired
 * to real data (Workbench, Pipeline, Interests, Inbox, Events).
 */
export function ComingSoon({ lede = "Coming soon.", body = "This surface will ship after the matching pipeline is stable." }: Props) {
  return (
    <div className="panel">
      <div className="coming-soon">
        <div className="lede">{lede}</div>
        <p>{body}</p>
      </div>
    </div>
  );
}
