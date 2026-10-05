import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Article schema includes an image for rich-result eligibility", () => {
  const resources = read("lib/seo/resources.js");
  assert.ok(resources.includes('image: `${SITE_URL}/opengraph-image`'));
});

test("key hub pages use descriptive commercial titles", () => {
  const solutions = read("app/solutions/page.jsx");
  const resources = read("app/resources/page.jsx");
  const useCases = read("app/use-cases/page.jsx");

  assert.ok(solutions.includes('title: "Fleet & Driver Performance Software Solutions"'));
  assert.ok(resources.includes('title: "Delivery Operations Performance Resources"'));
  assert.ok(useCases.includes('title: "Delivery Operations Software Use Cases"'));
});

test("previously overlong descriptions have been tightened", () => {
  const solutionDefs = read("lib/seo/solutionPages.js");
  const useCases = read("lib/seo/useCasePages.js");
  const home = read("app/page.jsx");

  const strings = [
    ...solutionDefs.matchAll(/description:\s*\n?\s*"([^"]+)"/g),
    ...useCases.matchAll(/description:\s*\n?\s*"([^"]+)"/g),
  ].map((match) => match[1]);

  for (const description of strings) {
    assert.ok(description.length <= 160, description + " (" + description.length + ")");
  }

  const homepageDescription = home.match(/description:\s*\n?\s*"([^"]+)"/)?.[1] || "";
  assert.ok(homepageDescription.length <= 160);
});
