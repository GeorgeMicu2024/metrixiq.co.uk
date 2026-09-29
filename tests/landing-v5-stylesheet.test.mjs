import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(path)=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("homepage V5 styles live in the stylesheet actually imported by the public layout",()=>{
  const layout=read("app/layout.jsx");
  const marketing=read("app/marketing-base.css");
  const globals=read("app/globals.css");

  assert.ok(layout.includes('import "./marketing-base.css"'));
  assert.ok(marketing.includes("MetrixIQ Homepage V5 · photographic fleet login"));
  assert.ok(marketing.includes("V5.1 composition lock"));
  assert.ok(marketing.includes(".mk-hero-photo"));
  assert.ok(marketing.includes(".mk-network-strip"));
  assert.equal(globals.includes("MetrixIQ Homepage V5 · photographic fleet login"),false);
});

test("desktop V5 keeps hero copy, signals and login in one row",()=>{
  const css=read("app/marketing-base.css");
  assert.ok(css.includes("grid-template-columns:minmax(520px,1.05fr) minmax(250px,.48fr) minmax(390px,.72fr)!important"));
  assert.ok(css.includes(".mk-login-card{\n    align-self:center!important;"));
});

test("mobile V5 keeps the sign-in CTA compact and above the fold",()=>{
  const css=read("app/marketing-base.css");
  assert.ok(css.includes("min-height:calc(100svh - 58px)!important"));
  assert.ok(css.includes(".mk-signin{height:43px!important}"));
});
