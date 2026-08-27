import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const errors = [];

function fail(message) {
  errors.push(message);
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if ([".git", ".github", ".mintlify", "node_modules"].includes(entry.name)) {
        return [];
      }

      return walk(path);
    }

    return extname(entry.name) === ".mdx" ? [path] : [];
  });
}

function navigationPages(value, pages = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && !item.includes(" ")) {
        pages.push(item);
      } else {
        navigationPages(item, pages);
      }
    }
  } else if (value && typeof value === "object") {
    for (const nested of Object.values(value)) {
      navigationPages(nested, pages);
    }
  }

  return pages;
}

function frontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) return null;

  const fields = {};
  for (const line of match[1].split("\n")) {
    const field = line.match(/^([a-zA-Z][\w-]*):\s*["']?(.*?)["']?\s*$/);
    if (field) fields[field[1]] = field[2];
  }

  return { fields, body: source.slice(match[0].length) };
}

function headingSlug(text) {
  return text
    .toLowerCase()
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const docsPath = join(root, "docs.json");
let config;

try {
  config = JSON.parse(readFileSync(docsPath, "utf8"));
} catch (error) {
  fail(`docs.json is not valid JSON: ${error.message}`);
  config = {};
}

if (!config.description?.trim()) {
  fail("docs.json must include a non-empty site description for generated llms.txt metadata");
}

const tabs = config.navigation?.tabs;
if (!Array.isArray(tabs) || tabs.at(-1)?.tab !== "Changelog") {
  fail("The Changelog tab must be last in docs.json navigation");
}

const configuredPages = new Set(navigationPages(config.navigation));
const mdxFiles = walk(root);
const mdxPages = new Set(
  mdxFiles.map((file) => relative(root, file).replace(/\.mdx$/, "")),
);

for (const page of configuredPages) {
  if (!existsSync(join(root, `${page}.mdx`))) {
    fail(`Navigation page does not exist: ${page}.mdx`);
  }
}

for (const page of mdxPages) {
  if (!configuredPages.has(page)) {
    fail(`Public MDX page is missing from navigation: ${page}.mdx`);
  }
}

const requiredAgentPages = new Map([
  ["auth", "title: \"PlainRouter auth docs\""],
  [
    "reference/api-resource-index",
    "https://plainrouter.com/api/llms.txt",
  ],
  [
    "reference/api-catalog",
    "https://plainrouter.com/.well-known/api-catalog",
  ],
]);

for (const [page, requiredMarker] of requiredAgentPages) {
  if (!configuredPages.has(page)) {
    fail(`Required agent page is missing from navigation: ${page}.mdx`);
    continue;
  }

  const source = readFileSync(join(root, `${page}.mdx`), "utf8");
  if (!source.includes(requiredMarker)) {
    fail(`${page}.mdx is missing its required agent-facing marker`);
  }
}

const anchorsByPage = new Map();

for (const file of mdxFiles) {
  const page = relative(root, file).replace(/\.mdx$/, "");
  const source = readFileSync(file, "utf8");
  const parsed = frontmatter(source);

  if (!parsed) {
    fail(`${page}.mdx is missing YAML frontmatter`);
    continue;
  }

  for (const field of ["title", "description"]) {
    if (!parsed.fields[field]?.trim()) {
      fail(`${page}.mdx is missing a non-empty ${field}`);
    }
  }

  if ((parsed.fields.description?.length ?? 0) > 300) {
    fail(`${page}.mdx description exceeds Mintlify's 300-character llms.txt limit`);
  }

  let previousLevel = 1;
  let fenceOpen = false;
  const anchors = new Set();
  const lines = parsed.body.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(/^```(.*)$/);

    if (fence) {
      if (!fenceOpen && !fence[1].trim()) {
        fail(`${page}.mdx:${index + 1} has an unlabelled opening code fence`);
      }
      fenceOpen = !fenceOpen;
      continue;
    }

    if (fenceOpen) continue;

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      if (level === 1) {
        fail(`${page}.mdx:${index + 1} uses H1; the frontmatter title supplies the page H1`);
      }
      if (level > previousLevel + 1) {
        fail(`${page}.mdx:${index + 1} skips from H${previousLevel} to H${level}`);
      }
      previousLevel = level;
      anchors.add(headingSlug(heading[2]));
    }

    for (const image of line.matchAll(/!\[([^\]]*)\]\([^)]+\)/g)) {
      if (!image[1].trim()) {
        fail(`${page}.mdx:${index + 1} has an image without descriptive alt text`);
      }
    }

    if (/<img\b/i.test(line) && !/\balt=(?:"[^"]+"|'[^']+')/i.test(line)) {
      fail(`${page}.mdx:${index + 1} has an img element without descriptive alt text`);
    }
  }

  if (fenceOpen) {
    fail(`${page}.mdx has an unclosed code fence`);
  }

  anchorsByPage.set(page, anchors);
}

for (const file of mdxFiles) {
  const page = relative(root, file).replace(/\.mdx$/, "");
  const source = readFileSync(file, "utf8");

  for (const link of source.matchAll(/\[[^\]]+\]\((\/[^)\s]+)\)/g)) {
    const [path, anchor] = link[1].slice(1).split("#", 2);
    const targetPage = path || page;

    if (!mdxPages.has(targetPage)) {
      fail(`${page}.mdx links to missing internal page: ${link[1]}`);
      continue;
    }

    if (anchor && !anchorsByPage.get(targetPage)?.has(anchor)) {
      fail(`${page}.mdx links to missing heading anchor: ${link[1]}`);
    }
  }
}

const agentReadinessFiles = [
  ".mintlify/AGENTS.md",
  ".mintlify/skills/plainrouter/SKILL.md",
];

for (const required of agentReadinessFiles) {
  if (!existsSync(join(root, required))) {
    fail(`Missing agent-readiness file: ${required}`);
  }
}

const skillPath = join(root, ".mintlify/skills/plainrouter/SKILL.md");
if (existsSync(skillPath)) {
  const skillSource = readFileSync(skillPath, "utf8");

  for (const link of skillSource.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
    const target = link[1];

    if (target.startsWith("/")) {
      fail(`PlainRouter skill link must be an absolute URL: ${target}`);
      continue;
    }

    if (!target.startsWith("https://plainrouter.com/docs")) continue;

    const url = new URL(target);
    const targetPage = url.pathname === "/docs"
      ? "index"
      : url.pathname.slice("/docs/".length).replace(/\.md$/, "");

    if (!mdxPages.has(targetPage)) {
      fail(`PlainRouter skill links to missing documentation page: ${target}`);
    }
  }
}

const mintignore = readFileSync(join(root, ".mintignore"), "utf8")
  .split("\n")
  .map((line) => line.trim());
if (!mintignore.includes("AGENTS.md")) {
  fail("Root AGENTS.md must be excluded in .mintignore to avoid public serving");
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Documentation structure is valid (${mdxFiles.length} pages).`);
