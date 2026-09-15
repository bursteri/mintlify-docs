#!/usr/bin/env python3
"""Read-only checks of Plainrouter's published documentation (Python 3.9+, curl)."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import tempfile
import time
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
ORIGIN = "https://plainrouter.com"
DOCS = ORIGIN + "/docs"
CATALOG = ORIGIN + "/.well-known/api-catalog"
DISCOVERY = {
    "llms-txt": "/docs/llms.txt",
    "llms-full-txt": "/docs/llms-full.txt",
    "api-catalog": "/docs/.well-known/api-catalog",
    "mcp-server-card": "/docs/.well-known/mcp/server-card.json",
    "agent-card": "/docs/.well-known/agent-card.json",
    "agent-skills": "/docs/.well-known/agent-skills/index.json",
}
# Observed Mintlify Markdown handler behavior, 2026-09-12. These exact aliases
# return 307 to the corresponding HTML destination despite .md redirect rules.
LEGACY_MARKDOWN_ALIASES = {
    DOCS + path for path in (
        "/signals/why-numbers-differ-meta.md", "/signals/compare-meta-clicks.md",
        "/signals/why-numbers-differ-ga4.md", "/signals/compare-ga4.md",
        "/signals/why-numbers-differ-plausible.md", "/signals/compare-plausible.md",
        "/guides/meta-capi/typescript.md", "/guides/meta-capi/python.md", "/guides/meta-capi/go.md",
    )
}


def public_url(path):
    """Resolve an authored docs path exactly once; absolute targets stay absolute."""
    if path.startswith("https://"):
        return path
    if path in ("index", "/index", "/"):
        return DOCS
    return DOCS + "/" + path.lstrip("/")


def navigation(value):
    if isinstance(value, list):
        for item in value:
            if isinstance(item, str):
                yield item
            else:
                yield from navigation(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            if key in ("pages", "groups", "tabs"):
                yield from navigation(item)


def source_inventory(root=ROOT):
    config = json.loads((root / "docs.json").read_text())
    pages, operations = {}, []
    for path in navigation(config["navigation"]):
        if re.match(r"^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /", path):
            operations.append(path)
            continue
        source = (root / (path + ".mdx")).read_text()
        frontmatter = source.split("---", 2)[1]
        fields = {}
        for key in ("title", "description"):
            match = re.search(r"^" + key + r":\s*(.+)$", frontmatter, re.M)
            if not match:
                raise ValueError(f"Missing {key}: {path}")
            fields[key] = match[1].strip().strip('"\'')
        pages[public_url(path)] = fields
    return config, pages, operations


def safe_url(url):
    """Never follow arbitrary remote links or call a product API."""
    parsed = urlsplit(url)
    return (parsed.scheme == "https" and parsed.netloc == "plainrouter.com"
            and not parsed.query and not parsed.fragment
            and "%" not in parsed.path and ".." not in parsed.path.split("/")
            and (parsed.path in ("/docs", "/docs.md", "/robots.txt", "/.well-known/api-catalog")
                 or parsed.path.startswith("/docs/")))


def fetch(url, method="GET"):
    if not safe_url(url) or method not in ("GET", "HEAD"):
        raise ValueError(f"Outside public docs read-only scope: {method} {url}")
    with tempfile.TemporaryDirectory() as directory:
        headers = Path(directory) / "headers"
        body = Path(directory) / "body"
        command = ["curl", "--silent", "--show-error", "--proto", "=https",
                   "--connect-timeout", "10", "--max-time", "25",
                   "--max-filesize", "10000000", "--user-agent", "PlainrouterDocsCheck/1.0",
                   "--dump-header", str(headers), "--output", str(body),
                   "--write-out", "%{http_code}"]
        if method == "HEAD":
            command.append("--head")
        # Deliberately no --location: validate Location without following it.
        result = subprocess.run(command + [url], capture_output=True, text=True, timeout=30)
        if result.returncode:
            raise ValueError(f"curl {result.returncode}: {result.stderr.strip()}")
        blocks = re.split(r"\r?\n\r?\n", headers.read_text())
        block = [part for part in blocks if part.startswith("HTTP/")][-1]
        parsed = {}
        for line in block.splitlines()[1:]:
            if ":" in line:
                key, value = line.split(":", 1)
                parsed[key.lower()] = parsed.get(key.lower(), "") + value.strip() + ", "
        return {"status": int(result.stdout),
                "headers": {key: value.removesuffix(", ") for key, value in parsed.items()},
                "body": body.read_text(errors="replace")}


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonicals, self.descriptions, self.robots = [], [], []
        self.h1, self.title, self.in_title = 0, "", False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "h1":
            self.h1 += 1
        if tag == "title":
            self.in_title = True
        if tag == "link" and "canonical" in attrs.get("rel", "").split():
            self.canonicals.append(attrs.get("href"))
        if tag == "meta":
            name = attrs.get("name", "").lower()
            if name == "description":
                self.descriptions.append(attrs.get("content"))
            if name in ("robots", "googlebot", "bingbot"):
                self.robots.append(attrs.get("content", ""))

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate(task, response, pages, operation_count, warnings=None):
    """Validate one response. Returned sitemap URLs seed generated-page checks."""
    kind, url = task["kind"], task["url"]
    headers, body = response["headers"], response["body"]
    warnings = warnings if warnings is not None else []
    if kind == "redirect":
        allowed = (301, 308)
        actual = urljoin(url, headers.get("location", ""))
        if url in LEGACY_MARKDOWN_ALIASES and response["status"] == 307:
            html_destination = re.sub(r"\.md(?=#|$)", "", task["destination"])
            require(actual in (task["destination"], html_destination), f"Wrong legacy redirect Location: {actual}")
            warnings.append("Known Mintlify legacy Markdown redirect: temporary 307" +
                            (" to HTML" if actual == html_destination else "") + "; configured permanent Markdown redirect is not honored.")
            return None
        require(response["status"] in allowed, f"Expected redirect {allowed}, got {response['status']}")
        require(actual == task["destination"],
                f"Wrong redirect Location: {headers.get('location')}")
        return None
    require(response["status"] == 200, f"Expected 200, got {response['status']}")
    require(bool(body.strip()), "Empty response")
    content_type = headers.get("content-type", "").lower()
    if kind == "html":
        require("text/html" in content_type, "Expected HTML content type")
        page = Page()
        page.feed(body)
        require(page.canonicals == [url], f"Wrong/duplicate canonical: {page.canonicals}")
        require(page.h1 == 1, f"Expected one H1, got {page.h1}")
        directives = " ".join(page.robots + [headers.get("x-robots-tag", "")]).lower()
        require(not re.search(r"\b(noindex|none)\b", directives), "HTML disallows indexing")
        require(bool(page.title.strip()) and len(page.descriptions) == 1 and bool(page.descriptions[0]),
                "Missing/duplicate title or description")
        if url in pages:
            require(page.title == pages[url]["title"] + " - Plainrouter", "Title differs from checked-out source")
            require(page.descriptions == [pages[url]["description"]], "Description differs from checked-out source")
        links = dict((rel, target) for target, rel in
                     re.findall(r'<([^>]+)>;\s*rel="([^"]+)"', headers.get("link", "")))
        for rel, target in DISCOVERY.items():
            require(urljoin(url, links.get(rel, "")) == ORIGIN + target,
                    f"Missing/wrong discovery Link: {rel}")
    elif kind == "markdown":
        require("text/markdown" in content_type, "Expected Markdown content type")
        require(not re.search(r"<!doctype html|<html\b", body, re.I), "Markdown returned HTML")
        require(bool(re.search(r"^# .+", body, re.M)), "Markdown missing page heading")
        source_url = task.get("source_url")
        if source_url in pages:
            require("# " + pages[source_url]["title"] in body.splitlines(), "Markdown title differs from source")
        # Mintlify intentionally noindexes Markdown twins. That is not an HTML failure.
    elif kind == "sitemap":
        document = ET.fromstring(body)
        urls = [node.text for node in document.findall("{*}url/{*}loc")]
        require(len(urls) == len(set(urls)), "Duplicate sitemap URLs")
        require(set(pages).issubset(urls), "Authored pages missing from sitemap: " + str(sorted(set(pages) - set(urls))))
        generated = set(urls) - set(pages)
        require(len(generated) == operation_count, f"Expected {operation_count} generated API pages, got {len(generated)}")
        require(all(safe_url(item) and item.startswith(DOCS + "/api/") for item in generated),
                "Unexpected sitemap URL outside API docs")
        return sorted(generated)
    elif kind == "robots":
        require("<html" not in body.lower(), "robots.txt returned HTML")
        robots = RobotFileParser()
        robots.parse(body.splitlines())
        require(DOCS + "/sitemap.xml" in (robots.site_maps() or []), "Docs sitemap not advertised in robots.txt")
        for agent in ("Googlebot", "Bingbot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot"):
            require(all(robots.can_fetch(agent, page) for page in pages), f"robots.txt blocks docs for {agent}")
    elif kind == "llms":
        require("text/plain" in content_type or "text/markdown" in content_type, "Expected text discovery content")
        for page in pages:
            markdown = DOCS + "/index.md" if page == DOCS else page + ".md"
            require(markdown in body, f"Missing llms index entry: {markdown}")
    elif kind == "llms-full":
        require("text/plain" in content_type or "text/markdown" in content_type, "Expected full Markdown content")
        sources = set(re.findall(r"^Source: (\S+)", body, re.M))
        sources = {DOCS if item == DOCS + "/index" else item for item in sources}
        require(set(pages).issubset(sources), "Full docs missing authored page Source entries")
        missing = [url for url, meta in pages.items() if meta["title"] not in body]
        if missing:
            warnings.append("Aggregate docs titles differ from source for " + ", ".join(missing) +
                            "; inspect cached freshness separately from HTML/Markdown twins.")
    elif kind in ("catalog", "mcp", "agent", "skills"):
        require("json" in content_type, "Expected JSON content type")
        data = json.loads(body)
        require(isinstance(data, dict), "Expected a JSON object")
        if kind == "catalog":
            require("application/linkset+json" in content_type, "Expected API catalog linkset content type")
            require(isinstance(data.get("linkset"), list) and bool(data["linkset"]), "Empty/invalid API catalog")
        elif kind == "mcp":
            require(data.get("authentication") == "none", "Docs MCP unexpectedly requires product authentication")
            require(urlsplit(data.get("url", "")).path == "/docs/mcp", "Docs MCP points outside docs endpoint")
            require(any(tool.get("name", "").startswith("search_") for tool in data.get("tools", [])), "Missing docs search tool")
        elif kind == "agent":
            require(data.get("documentationUrl", "").rstrip("/") == DOCS, "Agent card is not docs scoped")
        else:
            require(any(urljoin(DOCS + "/", item.get("url", "")).startswith(DOCS + "/.well-known/agent-skills/")
                        for item in data.get("skills", [])), "No docs-scoped skill")
    return None


def initial_tasks(config, pages):
    tasks = []
    for url in pages:
        tasks += [{"kind": "html", "url": url},
                  {"kind": "markdown", "url": DOCS + "/index.md" if url == DOCS else url + ".md", "source_url": url}]
    for rule in config.get("redirects", []):
        tasks.append({"kind": "redirect", "url": public_url(rule["source"]),
                      "destination": public_url(rule["destination"])})
    tasks += [{"kind": "redirect", "url": DOCS + "/.well-known/api-catalog", "method": "HEAD", "destination": CATALOG},
              {"kind": "markdown", "url": DOCS + ".md", "source_url": DOCS}]
    for kind, path in (("sitemap", "/docs/sitemap.xml"), ("robots", "/robots.txt"),
                       ("llms", DISCOVERY["llms-txt"]), ("llms-full", DISCOVERY["llms-full-txt"]),
                       ("catalog", "/.well-known/api-catalog"), ("mcp", DISCOVERY["mcp-server-card"]),
                       ("agent", DISCOVERY["agent-card"]), ("skills", DISCOVERY["agent-skills"]),
                       ("markdown", "/docs/.well-known/agent-skills/plainrouter/skill.md")):
        tasks.append({"kind": kind, "url": ORIGIN + path})
    return tasks


def run_check(task, pages, operation_count):
    row = {**task, "checked_at": datetime.now(timezone.utc).isoformat(), "ok": False}
    try:
        response = fetch(task["url"], task.get("method", "GET"))
        row.update(status=response["status"], content_type=response["headers"].get("content-type"),
                   x_robots_tag=response["headers"].get("x-robots-tag"), warnings=[],
                   cache_control=response["headers"].get("cache-control"),
                   age=response["headers"].get("age"), location=response["headers"].get("location"),
                   last_modified=response["headers"].get("last-modified"))
        discovered = validate(task, response, pages, operation_count, row["warnings"])
        row.update(ok=True, discovered=discovered)
    except (ValueError, TypeError, AttributeError, OSError, subprocess.SubprocessError, ET.ParseError) as error:
        row["error"] = str(error)
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--attempts", type=int, default=1, choices=range(1, 11))
    parser.add_argument("--retry-delay", type=int, default=30, choices=range(0, 61))
    parser.add_argument("--fail-on-warnings", action="store_true", help="Require known discovery warnings to be resolved, for post-Worker-deployment verification")
    parser.add_argument("--report", type=Path, default=Path("/tmp/plainrouter-docs-live.json"))
    args = parser.parse_args()
    config, pages, operations = source_inventory()
    tasks = initial_tasks(config, pages)
    results, generated_added = {}, False
    for attempt in range(1, args.attempts + 1):
        pending = [task for task in tasks if not results.get((task["url"], task.get("method", "GET")), {}).get("ok")]
        with ThreadPoolExecutor(max_workers=3) as pool:
            rows = list(pool.map(lambda task: run_check(task, pages, len(operations)), pending))
            for row in rows:
                results[(row["url"], row.get("method", "GET"))] = row
                if row["kind"] == "sitemap" and row["ok"] and not generated_added:
                    generated_added = True
                    for url in row["discovered"]:
                        tasks += [{"kind": "html", "url": url}, {"kind": "markdown", "url": url + ".md"}]
            new_tasks = [task for task in tasks if (task["url"], task.get("method", "GET")) not in results]
            for row in pool.map(lambda task: run_check(task, pages, len(operations)), new_tasks):
                results[(row["url"], row.get("method", "GET"))] = row
        if args.fail_on_warnings:
            for row in results.values():
                if row.get("warnings"):
                    row.update(ok=False, error="; ".join(row["warnings"]))
        failed = [row for row in results.values() if not row["ok"]]
        warning_count = sum(len(row.get("warnings", [])) for row in results.values())
        report = {"observed_at": datetime.now(timezone.utc).isoformat(), "attempt": attempt,
                  "authored_pages": len(pages), "api_operations": len(operations),
                  "checks": len(results), "failed": len(failed), "warnings": warning_count, "rows": list(results.values()),
                  "limitations": "Public response checks only; no proof of exact deployed commit, indexing, rankings, AI citations, or product behavior. Passed resources are not fetched again during retries."}
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n")
        print(f"Attempt {attempt}: {len(results) - len(failed)}/{len(results)} checks passed, {warning_count} warnings; report: {args.report}", flush=True)
        for row in failed:
            print(f"FAIL {row.get('method', 'GET')} {row['url']}: {row['error']}", flush=True)
        if not failed:
            return 0
        if attempt < args.attempts:
            time.sleep(args.retry_delay)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
