import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../supabase/functions/generate-stoic-month/index.ts", import.meta.url), "utf8");
const script = ts.transpile(source, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None });

function makeHandler(fetch) {
  let handler;
  const env = {
    SUPABASE_URL: "https://project.invalid",
    SUPABASE_ANON_KEY: "public-test-key",
    OPENAI_API_KEY: "provider-test-key"
  };
  vm.runInNewContext(script, {
    Deno: { env: { get: key => env[key] }, serve: value => { handler = value; } },
    fetch, Response, AbortSignal, console
  });
  return handler;
}

test("AI function verifies the user and quota before sending only a generic request", async () => {
  const calls = [];
  const handler = makeHandler(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/auth/v1/user")) return new Response("{}", { status: 200 });
    if (url.endsWith("/rest/v1/rpc/claim_stoic_generation")) return new Response("true", { status: 200 });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ virtue: "Patience" }) } }] }), { status: 200 });
  });
  const response = await handler(new Request("https://project.invalid/function", {
    method: "POST",
    headers: { Authorization: "Bearer user-test-token", "Content-Type": "application/json" },
    body: JSON.stringify({ answers: "private journal marker" })
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { virtue: "Patience" });
  assert.equal(calls.length, 3);
  assert.equal(calls[2].url, "https://api.openai.com/v1/chat/completions");
  assert.doesNotMatch(calls[2].options.body, /private journal marker|user-test-token/);
  assert.equal(calls[1].options.body, "{}");
});

test("AI function does not call the provider for invalid sessions or exhausted quota", async () => {
  for (const [userStatus, quota, expected] of [[401, true, 401], [200, false, 429]]) {
    const calls = [];
    const handler = makeHandler(async url => {
      calls.push(url);
      if (url.endsWith("/auth/v1/user")) return new Response("{}", { status: userStatus });
      return new Response(JSON.stringify(quota), { status: 200 });
    });
    const response = await handler(new Request("https://project.invalid/function", {
      method: "POST", headers: { Authorization: "Bearer user-test-token" }
    }));
    assert.equal(response.status, expected);
    assert.ok(calls.every(url => !url.includes("openai.com")));
  }
});
