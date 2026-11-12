// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import ts from "typescript";

// Inspect the actual page rather than a duplicate visibility helper. Browser
// coverage additionally checks visual order and archived-user navigation.
const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const page = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const archives: ts.JsxSelfClosingElement[] = [];
function visit(node: ts.Node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(page) === "ArchiveParticipant") archives.push(node);
  ts.forEachChild(node, visit);
}
visit(page);
test("archive is rendered only on My Profile, for both active and archived profiles", () => {
  expect(archives).toHaveLength(1);
  const condition = archives[0].parent;
  expect(ts.isBinaryExpression(condition)).toBe(true);
  if (!ts.isBinaryExpression(condition)) throw new Error("Missing archive visibility condition");
  expect(condition.left.getText(page)).toBe('view === "profile" && profile');
});
test("archive follows normal profile fields/actions and remains outside its disabled fieldset", () => {
  const archive = archives[0];
  expect(archive.getStart(page)).toBeGreaterThan(source.indexOf("Save Profile"));
  expect(archive.getStart(page)).toBeGreaterThan(source.lastIndexOf("</form>"));
  let parent: ts.Node | undefined = archive.parent;
  while (parent) {
    if (ts.isJsxElement(parent)) expect(parent.openingElement.tagName.getText(page)).not.toBe("fieldset");
    parent = parent.parent;
  }
});
