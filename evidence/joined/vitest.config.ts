import { defineConfig } from "vitest/config";
export default defineConfig({oxc:{jsx:{runtime:"automatic"}},resolve:{alias:{"@":new URL("../../src",import.meta.url).pathname}},test:{environment:"node",include:["evidence/joined/*.test.ts"]}});
