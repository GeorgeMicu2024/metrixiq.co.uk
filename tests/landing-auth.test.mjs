import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("homepage sign-in authenticates directly instead of forwarding to a second login", () => {
  const landing = read("components/Landing.jsx");
  const card = read("components/LandingSignInCard.jsx");

  assert.ok(landing.includes('import LandingSignInCard from "./LandingSignInCard"'));
  assert.ok(landing.includes("<LandingSignInCard/>"));
  assert.equal(landing.includes("function SignInCard"), false);

  assert.ok(card.includes("signInWithPassword"));
  assert.ok(card.includes('window.location.replace("/app")'));
  assert.ok(card.includes("signInWithOAuth"));
  assert.ok(card.includes("resetPasswordForEmail"));
  assert.equal(card.includes('className="mk-signin" href="/login"'), false);
  assert.equal(card.includes('className="mk-google" href="/login"'), false);
});
