import { createElement } from "react";
import { expect, test, vi } from "vitest";
vi.mock("./support-ribbon.module.css", () => ({ default: { ribbon: "ribbon" } }));
import { renderToStaticMarkup } from "react-dom/server";
import { SupportRibbon } from "./support-ribbon";

test("renders exact gender-neutral support copy and native mailto link", () => {
 const html = renderToStaticMarkup(createElement(SupportRibbon));
 expect(html.replace(/<[^>]+>/g, "")).toBe("Need a hand? If you run into any issues, email 1plus1@plus1htx.org.");
 expect(html).toContain('href="mailto:1plus1@plus1htx.org"');
 expect(html).toContain('aria-label="Portal support"');
 expect(html).not.toMatch(/<form|<button|<input|<script|target=/);
});
