import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
test("dev script exists",()=>assert.equal(pkg.scripts.dev,"next dev"));
test("Tailwind is not a dependency",()=>{assert.equal(pkg.dependencies?.tailwindcss,undefined);assert.equal(pkg.devDependencies?.tailwindcss,undefined)});
test("global CSS exists",()=>assert.ok(fs.readFileSync("app/globals.css","utf8").includes(".app-shell")));
test("dashboard has smart import",()=>assert.ok(fs.readFileSync("components/DashboardClient.jsx","utf8").includes("Smart Import")));
test("TRID aliases exist",()=>assert.ok(fs.readFileSync("lib/analyzer.js","utf8").includes('"trid"')));
