// The scanner needs only these read-only operations. ZIP inputs provide the
// same view over memory; ordinary paths retain Node's filesystem behavior.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
export const diskSource = { readFileSync, readdirSync, statSync, existsSync };
