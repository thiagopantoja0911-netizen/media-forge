import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { attachLocalGsap } from "../src/project-normalizer.mjs";

const gsap = await readFile(new URL("../assets/gsap.min.js", import.meta.url));

test("GSAP CDN projects receive the bundled local asset and no network dependency", () => {
  const files = [
    { path: "index.html", content: '<html><head><script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script></head><body><script>gsap.to("#x",{x:10})</script></body></html>' },
    { path: "compositions/scene.html", content: "<div>Scene</div>" }
  ];
  const result = attachLocalGsap(files, gsap);
  const index = result.find((file) => file.path === "index.html");
  const asset = result.find((file) => file.path === "assets/gsap.min.js");
  assert.match(index.content, /src="assets\/gsap\.min\.js"/);
  assert.doesNotMatch(index.content, /cdnjs\.cloudflare/);
  assert.ok(asset);
  assert.equal(Buffer.byteLength(asset.content), gsap.length);
});

test("projects without GSAP remain unchanged", () => {
  const files = [{ path: "index.html", content: "<html><body><h1>Hello</h1></body></html>" }];
  assert.deepEqual(attachLocalGsap(files, gsap), files);
});

test("existing local GSAP asset is reused and CDN reference is normalized", () => {
  const files = [
    { path: "index.html", content: '<html><head><script src="https://cdn.example/gsap.min.js"></script></head><body>gsap</body></html>' },
    { path: "assets/gsap.min.js", content: gsap.toString("utf8") }
  ];
  const result = attachLocalGsap(files, gsap);
  assert.equal(result.filter((file) => file.path === "assets/gsap.min.js").length, 1);
  assert.match(result[0].content, /src="assets\/gsap\.min\.js"/);
});

test("base64 index.html is decoded before rewriting", () => {
  const html = '<html><head></head><body><script>gsap.to("#x",{x:1})</script></body></html>';
  const files = [{ path: "index.html", contentBase64: Buffer.from(html).toString("base64") }];
  const result = attachLocalGsap(files, gsap);
  assert.match(result[0].content, /assets\/gsap\.min\.js/);
  assert.equal(typeof result[0].contentBase64, "undefined");
});
