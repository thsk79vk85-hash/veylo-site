import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const configUrl = new URL("../vercel.json", import.meta.url);

// Check our serialized deployment boundary, not Vercel's branch matcher.
function verifyDeploymentGuard(config) {
  assert.deepStrictEqual(config, {
    $schema: "https://openapi.vercel.sh/vercel.json",
    git: {
      deploymentEnabled: {
        main: false,
      },
    },
  }, "Deployment guard must contain only the approved schema and main:false rule");
}

test("required Pages deployment guard disables Git deployments for main only", () => {
  assert.ok(fs.existsSync(configUrl), "Missing required deployment guard: vercel.json");
  verifyDeploymentGuard(JSON.parse(fs.readFileSync(configUrl, "utf8")));
});

test("accepts the approved parsed deployment boundary", () => {
  assert.doesNotThrow(() => verifyDeploymentGuard(JSON.parse(
    '{"$schema":"https://openapi.vercel.sh/vercel.json","git":{"deploymentEnabled":{"main":false}}}',
  )));
});

test("accepts equivalent JSON property order and whitespace", () => {
  assert.doesNotThrow(() => verifyDeploymentGuard(JSON.parse(
    '{ "git": { "deploymentEnabled": { "main": false } }, "$schema": "https://openapi.vercel.sh/vercel.json" }',
  )));
});

const rejectedPayloads = [
  ["a null configuration", 'null'],
  ["a missing schema", '{"git":{"deploymentEnabled":{"main":false}}}'],
  ["a wrong schema", '{"$schema":"https://example.com/vercel.json","git":{"deploymentEnabled":{"main":false}}}'],
  ["missing Git configuration", '{"$schema":"https://openapi.vercel.sh/vercel.json"}'],
  ["a missing deployment rule", '{"$schema":"https://openapi.vercel.sh/vercel.json","git":{}}'],
  ["empty branch rules", '{"$schema":"https://openapi.vercel.sh/vercel.json","git":{"deploymentEnabled":{}}}'],
  ["a rule for the wrong branch", '{"$schema":"https://openapi.vercel.sh/vercel.json","git":{"deploymentEnabled":{"master":false}}}'],
  ["main enabled", '{"$schema":"https://openapi.vercel.sh/vercel.json","git":{"deploymentEnabled":{"main":true}}}'],
  ["string false for main", '{"$schema":"https://openapi.vercel.sh/vercel.json","git":{"deploymentEnabled":{"main":"false"}}}'],
  ["string true for main", '{"$schema":"https://openapi.vercel.sh/vercel.json","git":{"deploymentEnabled":{"main":"true"}}}'],
  ["a broad true override", '{"$schema":"https://openapi.vercel.sh/vercel.json","git":{"deploymentEnabled":{"main":false,"*":true}}}'],
  ["an overlapping true override", '{"$schema":"https://openapi.vercel.sh/vercel.json","git":{"deploymentEnabled":{"main":false,"m*":true}}}'],
  ["an additional disabled branch", '{"$schema":"https://openapi.vercel.sh/vercel.json","git":{"deploymentEnabled":{"main":false,"preview":false}}}'],
  ["global all-branch disable", '{"$schema":"https://openapi.vercel.sh/vercel.json","git":{"deploymentEnabled":false}}'],
  ["global all-branch enable", '{"$schema":"https://openapi.vercel.sh/vercel.json","git":{"deploymentEnabled":true}}'],
  ["wildcard all-branch disable", '{"$schema":"https://openapi.vercel.sh/vercel.json","git":{"deploymentEnabled":{"*":false}}}'],
  ["an added ignore command", '{"$schema":"https://openapi.vercel.sh/vercel.json","git":{"deploymentEnabled":{"main":false}},"ignoreCommand":"exit 0"}'],
  ["an additional Git setting", '{"$schema":"https://openapi.vercel.sh/vercel.json","git":{"deploymentEnabled":{"main":false},"requireVerifiedCommits":true}}'],
];

for (const [name, payload] of rejectedPayloads) {
  test(`rejects ${name}`, () => {
    assert.throws(() => verifyDeploymentGuard(JSON.parse(payload)), {
      code: "ERR_ASSERTION",
    });
  });
}
