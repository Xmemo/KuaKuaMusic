import Ajv2020 from "ajv/dist/2020.js";
import { contracts } from "../music-learning/contracts.mjs";
import { v2Contracts } from "../music-learning/v2/contracts.mjs";
import { v3Contracts } from "../music-learning/v3/contracts.mjs";
import { AppError } from "./errors.mjs";
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
});
const validators = Object.fromEntries(
  Object.entries({ ...contracts, ...v2Contracts, ...v3Contracts }).map(([name, schema]) => [
    name,
    ajv.compile(schema),
  ]),
);
export function getContract(name) {
  const schema = v3Contracts[name] || v2Contracts[name] || contracts[name];
  if (!schema) throw new AppError("未知的数据契约。", "INVALID_CONTRACT", 422);
  return schema;
}
export function validateContract(name, value) {
  const validate = validators[name];
  if (!validate || !validate(value)) {
    const details = validate?.errors
      ?.slice(0, 3)
      .map((e) => (e.instancePath || "/") + " " + e.message)
      .join("; ");
    throw new AppError(
      "返回数据不符合 " + name + " 契约。" + (details || ""),
      "INVALID_CONTRACT",
      422,
    );
  }
  return value;
}
