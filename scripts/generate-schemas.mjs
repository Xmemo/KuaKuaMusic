import fs from "node:fs/promises";
import { contracts } from "../music-learning/contracts.mjs";
for (const [name, value] of Object.entries(contracts)) {
  await fs.writeFile(
    new URL("../schemas/" + name + ".schema.json", import.meta.url),
    JSON.stringify(value, null, 2) + "\n",
  );
}
