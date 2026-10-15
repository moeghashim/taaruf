export function profileSearchHref(search: string) {
  const query = search.trim();
  return query ? "/admin/profiles?" + new URLSearchParams({ q: query }) : "/admin/profiles";
}
