import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("legacy retirement is explicit, scoped and preserves old files",async()=>{
  const script=await readFile(new URL("../desktop/retire-legacy-videos-secrets.ps1",import.meta.url),"utf8");
  assert.match(script,/VideosSecretsBackgroundRenderer/);
  assert.match(script,/Videos Secrets Agent\.lnk/);
  assert.match(script,/VideosSecretsAgent/);
  assert.match(script,/-not \$VerifiedRender/);
  assert.match(script,/worker\.online -ne \$true/);
  assert.match(script,/were NOT deleted/);
  assert.doesNotMatch(script,/Remove-Item[^\r\n]*VideosSecretsAgent/);
});
