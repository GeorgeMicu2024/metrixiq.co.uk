import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../components/sites/WavePlanView.jsx", import.meta.url), "utf8");
const helpers = source.slice(source.indexOf("const COLORS="), source.indexOf("async function imageCanvas"));
const context = vm.createContext({});
vm.runInContext(`${helpers}\nconst dcslDsp=s=>/\\b(?:DCSL|DANUBE\\s+COURIER\\s+SERVICES\\s+LTD)\\b/i.test(String(s||""));\nthis.parsers={dzm1WorkbookRows,dzm1HeaderWorkbookRows,dzm1ThreePadRows};`, context);
const { dzm1WorkbookRows, dzm1HeaderWorkbookRows, dzm1ThreePadRows } = context.parsers;

const row = (index, values, sheet = "DZM1") => {
  const cells = [];
  for (const [key, value] of Object.entries(values)) cells[Number(key)] = value;
  return { sheet, row: index, cells };
};

test("DZM1 reads DCSL routes from the second M:T table", () => {
  const rows = [
    row(1, {18:"11"}),
    row(2, {1:"Other DSP",2:"CA_A101",4:"12:30",12:"DCSL",13:"CA_A199",15:"12:40",16:"12:50",17:"A-B",19:"STG-A.12"}),
  ];
  const parsed = dzm1WorkbookRows(rows);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].cells[0], "CA_A199");
  assert.equal(parsed[0].cells[1], "12:40");
  assert.equal(parsed[0].explicitWave, "WAVE11");
  assert.equal(parsed[0].holdingLane, "A-B");
  assert.equal(parsed[0].cells[2], "STG-A.12");
});

test("DZM1 keeps wave headers independent across both Amazon tables and sheets", () => {
  const rows = [
    row(1, {7:"11",18:"12"}),
    row(2, {1:"DCSL",2:"SA_A12",4:"11:50",12:"DCSL",13:"CA_A240",15:"12:40"}),
    row(3, {7:"13",18:"14"}, "Other sheet"),
    row(4, {1:"DCSL",2:"CA_A280",4:"13:15"}, "Other sheet"),
  ];
  const parsed = dzm1WorkbookRows(rows);
  assert.deepEqual(Array.from(parsed, x=>x.explicitWave), ["WAVE11","WAVE12","WAVE13"]);
  assert.equal(parsed[2].cells[0], "CA_A280");
});

test("DZM1 accepts a named-column DCSL spreadsheet and selects loading, not parking", () => {
  const rows = [
    row(1, {0:"Route Code",1:"Wave",2:"Driver Name",3:"1st Floor Parking",4:"Holding (0 floor)",5:"Loading (staging lane)",6:"Staging Location",7:"DSP"}),
    row(2, {0:"CA_A199",1:"11",2:"Driver One",3:"12:10",4:"12:20",5:"12:35",6:"STG-A.12",7:"DCSL"}),
    row(3, {0:"CA_A200",1:"11",3:"12:10",4:"12:20",5:"12:35",6:"STG-A.13",7:"Other DSP"}),
    row(4, {0:"CA_A201",1:"12",3:"12:30",4:"12:40",5:"12:55",6:"STG-A.14",7:"DCSL"}),
  ];
  const parsed = dzm1HeaderWorkbookRows(rows);
  assert.deepEqual(Array.from(parsed, x=>x.cells[0]), ["CA_A199","CA_A201"]);
  assert.deepEqual(Array.from(parsed, x=>x.cells[1]), ["12:35","12:55"]);
  assert.equal(parsed[1].explicitWave, "WAVE12");
});

test("DZM1 refuses to invent a wave number or load time", () => {
  const rows = [row(1, {0:"Route",1:"Loading Time"}),row(2, {0:"CA_A199",1:""})];
  assert.equal(dzm1HeaderWorkbookRows(rows).length, 0);
  assert.equal(dzm1ThreePadRows(rows).length, 0);
});

test("DZM1 uses a merged loading time only within its numbered wave", () => {
  const rows = [
    row(1, {0:"Route",1:"Wave",2:"Loading Time",3:"DSP"}),
    row(2, {0:"CA_A199",1:"11",2:"12:35",3:"DCSL"}),
    row(3, {0:"CA_A200",1:"11",3:"DCSL"}),
    row(4, {0:"CA_A201",1:"12",3:"DCSL"}),
    row(5, {0:"CA_A202",1:"12",2:"12:55",3:"DCSL"}),
    row(6, {0:"CA_A203",1:"12",3:"DCSL"}),
  ];
  const parsed = dzm1HeaderWorkbookRows(rows);
  assert.deepEqual(Array.from(parsed, x=>x.cells[0]), ["CA_A199","CA_A200","CA_A202","CA_A203"]);
  assert.deepEqual(Array.from(parsed, x=>x.cells[1]), ["12:35","12:35","12:55","12:55"]);
});

test("DZM1 Smart Upload compares supported Excel layouts", () => {
  assert.match(source, /dzmCandidates\.sort\(/);
  assert.match(source, /dzm1HeaderWorkbookRows\(raw\)/);
});
