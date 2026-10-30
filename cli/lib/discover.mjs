// Finds SKILL.md files: under local paths, in the places agents install
// skills, or inside a GitHub repository fetched to a temporary directory.

import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { homedir, tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { diskSource } from "./source.mjs";

const SKIP = new Set([".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", "target", ".next", ".cache"]);
const MAX_DEPTH = 10;

// A SKILL.md that opens with a frontmatter block declares a skill of its own.
function hasFrontmatter(file, source) {
  try {
    return source.readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/, 1)[0].trim() === "---";
  } catch {
    return false;
  }
}

export function findSkillFiles(root, { source = diskSource } = {}) {
  return walkSkills(root, source);
}

function walkSkills(root, source, depth = 0, out = [], insideSkill = false) {
  let st;
  try {
    st = source.statSync(root);
  } catch {
    return out;
  }
  if (st.isFile()) {
    if (basename(root) === "SKILL.md") out.push(resolve(root));
    return out;
  }
  if (!st.isDirectory() || depth > MAX_DEPTH) return out;
  let entries;
  try {
    entries = source.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  // Inside a skill, a SKILL.md without frontmatter is one of the parent's
  // files (scanned with the parent). One with frontmatter is a sub-skill and
  // gets its own spec checks.
  const skillFile = entries.find((e) => e.isFile() && e.name === "SKILL.md");
  const path = skillFile && resolve(join(root, skillFile.name));
  if (path && (!insideSkill || hasFrontmatter(path, source))) out.push(path);
  for (const e of entries) {
    if (e.isDirectory() && !SKIP.has(e.name)) walkSkills(join(root, e.name), source, depth + 1, out, insideSkill || !!skillFile);
  }
  return out;
}

// Installed Claude Code plugins. `marketplaces/` holds whole catalogs, most of
// which isn't installed, so read the install record instead and fall back to
// the plugin cache.
function claudePluginPaths(h) {
  const record = join(h, ".claude", "plugins", "installed_plugins.json");
  const paths = new Set();
  if (existsSync(record)) {
    try {
      (function collect(v) {
        if (Array.isArray(v)) v.forEach(collect);
        else if (v && typeof v === "object")
          for (const [k, x] of Object.entries(v)) {
            if (k === "installPath" && typeof x === "string") paths.add(x);
            else collect(x);
          }
      })(JSON.parse(readFileSync(record, "utf8")));
    } catch {
      // unreadable record: fall through to the cache directory
    }
  }
  if (!paths.size) paths.add(join(h, ".claude", "plugins", "cache"));
  return [...paths].map((p) => ({ agent: "Claude Code plugins", scope: "user", path: p }));
}

// Where agents look for skills. Project paths are relative to the cwd.
export function installedLocations(cwd = process.cwd()) {
  const h = homedir();
  return [
    { agent: "Claude Code", scope: "user", path: join(h, ".claude", "skills") },
    { agent: "Claude Code", scope: "project", path: join(cwd, ".claude", "skills") },
    ...claudePluginPaths(h),
    // Shared by Codex, Amp, and Zed: https://zed.dev/docs/ai/skills
    { agent: "Shared .agents (Codex / Amp / Zed)", scope: "user", path: join(h, ".agents", "skills") },
    { agent: "Shared .agents (Codex / Amp / Zed)", scope: "project", path: join(cwd, ".agents", "skills") },
    { agent: "Codex", scope: "user", path: join(h, ".codex", "skills") },
    // https://docs.devin.ai/desktop/cascade/skills
    { agent: "Windsurf / Cascade", scope: "user", path: join(h, ".codeium", "windsurf", "skills") },
    { agent: "Windsurf / Cascade", scope: "user", path: join(h, ".config", "devin", "skills") },
    { agent: "Windsurf / Cascade", scope: "project", path: join(cwd, ".devin", "skills") },
    { agent: "Windsurf / Cascade", scope: "project", path: join(cwd, ".windsurf", "skills") },
    // https://kiro.dev/docs/skills/
    { agent: "Kiro", scope: "user", path: join(h, ".kiro", "skills") },
    { agent: "Kiro", scope: "project", path: join(cwd, ".kiro", "skills") },
    // https://github.com/cline/cline/blob/main/docs/customization/skills.mdx
    { agent: "Cline", scope: "user", path: join(h, ".cline", "skills") },
    { agent: "Cline", scope: "project", path: join(cwd, ".cline", "skills") },
    { agent: "Cline", scope: "project", path: join(cwd, ".clinerules", "skills") },
    // https://ampcode.com/docs/customize/skills
    { agent: "Amp", scope: "user", path: join(h, ".config", "agents", "skills") },
    { agent: "Amp", scope: "user", path: join(h, ".config", "amp", "skills") },
    { agent: "Cursor", scope: "user", path: join(h, ".cursor", "skills") },
    { agent: "Cursor", scope: "project", path: join(cwd, ".cursor", "skills") },
    { agent: "Gemini CLI", scope: "user", path: join(h, ".gemini", "skills") },
    { agent: "Gemini CLI", scope: "project", path: join(cwd, ".gemini", "skills") },
    { agent: "OpenCode", scope: "user", path: join(h, ".config", "opencode", "skills") },
    { agent: "OpenCode", scope: "project", path: join(cwd, ".opencode", "skills") },
    { agent: "GitHub Copilot", scope: "project", path: join(cwd, ".github", "skills") },
  ].filter((l) => existsSync(l.path));
}

const GH_SHORT = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:@([\w./-]+))?$/;
const GH_URL = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([\w./-]+?))?\/?$/;

// Returns { owner, repo, ref } when `arg` names a GitHub repo rather than a
// local path that exists.
export function parseRemote(arg) {
  if (existsSync(arg)) return null;
  const m = arg.match(GH_URL) || arg.match(GH_SHORT);
  if (!m) return null;
  return { owner: m[1], repo: m[2], ref: m[3] };
}

export function fetchRemote({ owner, repo, ref }) {
  const dir = mkdtempSync(join(tmpdir(), "vetted-"));
  const url = `https://github.com/${owner}/${repo}.git`;
  const args = ["clone", "--depth", "1", "--quiet", "--no-tags"];
  if (ref) args.push("--branch", ref);
  args.push(url, dir);
  try {
    execFileSync("git", args, {
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_LFS_SKIP_SMUDGE: "1" },
      timeout: 120_000,
    });
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    const detail = String(err.stderr || err.message).trim().split("\n").pop();
    throw new Error(`could not fetch ${owner}/${repo}${ref ? "@" + ref : ""}: ${detail}`);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
