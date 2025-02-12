/* eslint-disable no-restricted-exports */
import fs from "fs";
import path from "path";
import { buildTypeScript } from "../../../incubator/tools-typescript/lib/index.js";

/**
 * @typedef {import("@lage-run/target-graph").Target} Target
 */

/**
 * @param {Target} target
 * @returns {Promise<void>}
 */
export default async function tsc(target) {
  const tsconfig = path.join(target.cwd, "tsconfig.json");
  if (fs.existsSync(tsconfig)) {
    return await buildTypeScript({
      target: target.cwd,
      options: {
        outDir: "dist",
      },
    });
  }
  return Promise.resolve();
}
