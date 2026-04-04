require("./helpers/setup");
const test = require("node:test");
const assert = require("node:assert");
const { parseTemplateIdArray } = require("../lib/recurringTasks");

test("parseTemplateIdArray : JSON et valeurs invalides", () => {
  assert.deepStrictEqual(parseTemplateIdArray(null), []);
  assert.deepStrictEqual(parseTemplateIdArray(""), []);
  assert.deepStrictEqual(parseTemplateIdArray('["a","b"]'), ["a", "b"]);
  assert.deepStrictEqual(parseTemplateIdArray("{"), []);
});
