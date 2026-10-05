import fs from "node:fs/promises";
import { contracts } from "../music-learning/contracts.mjs";
import { v2Contracts } from "../music-learning/v2/contracts.mjs";

for (const [name, value] of Object.entries({
  ...contracts,
  ...v2Contracts,
})) {
  await fs.writeFile(
    new URL("../schemas/" + name + ".schema.json", import.meta.url),
    JSON.stringify(value, null, 2) + "\n",
  );
}
