import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(path)=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("homepage V5 uses Amazon delivery photography and polished network wordmarks",()=>{
  const landing=read("components/Landing.jsx");
  const css=read("app/marketing-base.css");
  assert.ok(landing.includes("assets.aboutamazon.com"));
  assert.ok(landing.includes('className="mk-hero-photo"'));
  assert.ok(landing.includes("<strong>EVRi</strong>"));
  assert.ok(landing.includes("<strong>YODEL</strong>"));
  assert.ok(css.includes("MetrixIQ Homepage V5 · photographic fleet login"));
  assert.ok(css.includes(".mk-hero-photo"));
});

test("mobile homepage keeps primary sign-in controls above the fold",()=>{
  const css=read("app/marketing-base.css");
  assert.ok(css.includes("min-height:calc(100svh - 58px)!important"));
  assert.ok(css.includes(".mk-actions,.mk-benefits,.mk-hero-signals{display:none!important}"));
  assert.ok(css.includes(".mk-login-card{"));
  assert.ok(css.includes(".mk-signin{height:43px!important}"));
});

test("homepage login keeps direct authentication while using the polished card",()=>{
  const card=read("components/LandingSignInCard.jsx");
  assert.ok(card.includes("signInWithPassword"));
  assert.ok(card.includes("signInWithOAuth"));
  assert.ok(card.includes("Keep me signed in"));
  assert.ok(card.includes("mk-login-subtitle"));
  assert.ok(card.includes("mk-google-mark"));
});
