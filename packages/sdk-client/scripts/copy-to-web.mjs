import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url)); // packages/sdk-client/
const targetDir = join(here, "../../apps/web/public/sdk");
mkdirSync(targetDir, { recursive: true });
copyFileSync(join(here, "dist/index.global.js"), join(targetDir, "pushpanel-sdk.js"));
console.log("[sdk-client] copied dist/index.global.js → apps/web/public/sdk/pushpanel-sdk.js");