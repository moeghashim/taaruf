type Props = {
  name: string;
  gender: "male" | "female";
  /** Sub-text under the name. Typically "{age} · {city}" or an email. */
  sub?: string;
  /** Optional profile thumbnail URL from Convex storage. */
  imageUrl?: string | null;
};

function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Avatar + name + sub-text used in admin tables and queue cards.
 * Avatar tints by gender and falls back to initials when no image is available.
 */
export function WhoCell({ name, gender, sub, imageUrl }: Props) {
  return (
    <div className={`who ${gender === "female" ? "f" : "m"}`}>
      <div className="av">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`${name} profile thumbnail`}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          initials(name)
        )}
      </div>
      <div>
        <div className="name">{name}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
    </div>
  );
}
