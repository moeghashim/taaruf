import { portalHashes } from "./applicant-portal-view";
export function applicantDestination(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || /[\\%]/.test(value) || [...value].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return "/me";
  const hashIndex = value.indexOf("#");
  const hash = hashIndex < 0 ? "" : value.slice(hashIndex);
  if (hash && (!value.startsWith("/me") || !portalHashes.includes(hash))) return "/me";
  const destination = hashIndex < 0 ? value : value.slice(0, hashIndex);
  const separator = destination.indexOf("?");
  const path = separator < 0 ? destination : destination.slice(0, separator);
  if (path !== "/me" && path !== "/dashboard") return "/me";
  const params = new URLSearchParams(separator < 0 ? "" : destination.slice(separator + 1));
  const key = path === "/me" && !params.has("femaleReview") ? "connection" : "femaleReview";
  if (!params.has(key)) return path + hash;
  const ids = params.getAll(key);
  if (ids.length !== 1 || !/^[a-zA-Z0-9_-]{1,128}$/.test(ids[0])) return "/me";
  return `${path}?${key}=${ids[0]}${hash}`;
}

export function applicantLoginHref(destination: unknown): string {
  const next = applicantDestination(destination);
  return next === "/me" ? "/login" : "/login?" + new URLSearchParams({ next });
}
