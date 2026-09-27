import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Concessions remains usable when global site scope is All Sites", () => {
  const view = read("components/operations/ConcessionsSimpleView.jsx");

  assert.ok(view.includes('const [localSite, setLocalSite] = useState("")'));
  assert.ok(view.includes('globalSite !== "ALL"'));
  assert.ok(view.includes("availableSites.includes(localSite)"));
  assert.ok(view.includes('globalSite === "ALL" && ('));
  assert.ok(view.includes("<span>Site</span>"));
  assert.equal(view.includes("Cross-site concession totals are intentionally disabled"), false);
});

test("Concessions hooks are declared before loading and error returns", () => {
  const view = read("components/operations/ConcessionsSimpleView.jsx");

  const filteredHook = view.indexOf("const filtered = useMemo");
  const loadingReturn = view.indexOf('if (load.loading) return <Loading');
  const errorReturn = view.indexOf('if (load.error) return <ErrorBox');

  assert.ok(filteredHook >= 0);
  assert.ok(loadingReturn > filteredHook);
  assert.ok(errorReturn > filteredHook);
});
