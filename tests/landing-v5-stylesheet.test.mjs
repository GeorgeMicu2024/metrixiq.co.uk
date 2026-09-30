import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=(p)=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("homepage V5 styles are loaded by the public layout",()=>{const l=read("app/layout.jsx"),c=read("app/marketing-base.css"),g=read("app/globals.css");assert.ok(l.includes('import "./marketing-base.css"'));assert.ok(c.includes("MetrixIQ Homepage V5 · photographic fleet login"));assert.ok(c.includes(".mk-hero-photo{position:absolute"));assert.ok(c.includes(".mk-network-strip{background:#071725"));assert.equal(g.includes("MetrixIQ Homepage V5 · photographic fleet login"),false)});
test("approved desktop composition keeps photo and login in one hero row",()=>{const c=read("app/marketing-base.css");assert.ok(c.includes("grid-template-columns:minmax(500px,1.05fr) minmax(220px,.45fr) minmax(370px,.7fr)"));assert.ok(c.includes(".mk-hero-copy,.mk-hero-signals,.mk-login-card{position:relative;z-index:2;align-self:center}"))});
test("mobile login remains above the fold",()=>{const c=read("app/marketing-base.css");assert.ok(c.includes("min-height:calc(100svh - 58px)!important"));assert.ok(c.includes(".mk-actions,.mk-benefits,.mk-hero-signals{display:none!important}"));assert.ok(c.includes(".mk-signin{height:43px!important}"))});
