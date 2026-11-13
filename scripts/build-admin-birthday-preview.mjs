import fs from 'node:fs/promises';import path from 'node:path';import {build} from 'esbuild';
const out=process.env.PREVIEW_DIR;if(!out)throw Error('PREVIEW_DIR is required outside source checkout');await fs.mkdir(out,{recursive:true,mode:0o700});
const js=await build({entryPoints:['scripts/admin-birthday-fixture.tsx'],bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},tsconfig:'tsconfig.json',minify:true});
const css=await build({entryPoints:['src/app/globals.css'],conditions:['style'],bundle:true,write:false,loader:{'.woff2':'dataurl'},minify:true});
await fs.writeFile(path.join(out,'preview.js'),js.outputFiles[0].text);await fs.writeFile(path.join(out,'preview.css'),css.outputFiles[0].text);
await fs.writeFile(path.join(out,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Admin birthday — synthetic preview</title><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>');
console.log('Built source-only static synthetic preview: index.html, preview.js, preview.css');
