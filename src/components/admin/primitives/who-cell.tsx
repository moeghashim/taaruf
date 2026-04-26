type Props = {
  name: string;
  gender: "male" | "female";
  /** Sub-text under the name. Typically "{age} · {city}" or an email. */
  sub?: string;
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
 * Avatar tints by gender (rose-tinted for sisters, emerald for brothers)
 * and shows initials. Photo support lands later when storage IDs ship.
 */
export function WhoCell({ name, gender, sub }: Props) {
  return (
    <div className={`who ${gender === "female" ? "f" : "m"}`}>
      <div className="av">{initials(name)}</div>
      <div>
        <div className="name">{name}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
    </div>
  );
}
