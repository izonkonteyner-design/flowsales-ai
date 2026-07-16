import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

void (async () => {
  const testsDir = dirname(fileURLToPath(import.meta.url));

  const testFiles = (await readdir(testsDir))
    .filter((file) => file.endsWith(".test.ts") && file !== "all.test.ts")
    .sort()
    .map((file) => pathToFileURL(join(testsDir, file)).href);

  await Promise.all(testFiles.map((fileUrl) => import(fileUrl)));
})();
