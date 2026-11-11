export const portalViews = [
  { id: "overview", label: "Overview", href: "#overview" },
  { id: "interests", label: "Applicant Interests", href: "#applicant-interests" },
  { id: "profile", label: "My Profile", href: "#profile" },
  { id: "matchmaker", label: "Matchmaker Matching", href: "#matchmaker-matching" },
] as const;
export type PortalView = (typeof portalViews)[number]["id"];
export const portalHashes = ["#overview", "#events", "#applicant-interests", "#inbound-interests", "#outbound-interests", "#private-documented-interests", "#profile", "#matchmaker-matching"];
export function portalView(hash: string, search = ""): PortalView {
  if (hash === "#profile") return "profile";
  if (hash === "#matchmaker-matching") return "matchmaker";
  if (["#applicant-interests", "#inbound-interests", "#outbound-interests", "#private-documented-interests"].includes(hash)) return "interests";
  if (hash === "#overview" || hash === "#events") return "overview";
  return new URLSearchParams(search).has("connection") ? "interests" : "overview";
}
