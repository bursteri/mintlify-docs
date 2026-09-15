"""Offline response mutations; never fetch public or product endpoints."""
import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
import check

URL = check.DOCS + "/quickstart"
PAGES = {URL: {"title": "Quickstart", "description": "Set up your workspace."}}
LINK = ", ".join(f'<{path}>; rel="{rel}"' for rel, path in check.DISCOVERY.items())
HTML = ('<html><head><title>Quickstart - Plainrouter</title>'
        '<meta name="description" content="Set up your workspace.">'
        f'<link rel="canonical" href="{URL}"></head><body><h1>Quickstart</h1></body></html>')


def response(body=HTML, content_type="text/html", status=200, **headers):
    return {"status": status, "body": body,
            "headers": {"content-type": content_type, "link": LINK, **headers}}


class LiveChecks(unittest.TestCase):
    def test_authored_mount_and_operation_scope(self):
        self.assertEqual(check.public_url("index"), check.DOCS)
        self.assertEqual(check.public_url("/sdk/python"), check.DOCS + "/sdk/python")
        self.assertEqual(check.public_url(check.CATALOG), check.CATALOG)
        for url in ("https://evil.example/docs/quickstart", check.ORIGIN + "/events",
                    check.ORIGIN + "/mcp", check.DOCS + "?token=secret", "http://plainrouter.com/docs",
                    check.DOCS + "/../events", check.DOCS + "/%2e%2e/events"):
            with self.subTest(url=url), patch("check.subprocess.run") as run:
                with self.assertRaises(ValueError):
                    check.fetch(url)
                run.assert_not_called()
        config, pages, operations = check.source_inventory()
        self.assertGreater(len(pages), 0)
        # Authored OpenAPI wrappers are checked as pages, not extra sitemap URLs.
        self.assertIn(check.public_url("api/events/create"), pages)
        self.assertTrue(all(check.safe_url(task["url"]) for task in check.initial_tasks(config, pages)))

    def test_inventory_distinguishes_wrapped_and_generated_operations(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "docs.json").write_text(json.dumps({"navigation": {"pages": ["event", "GET /events"]}}))
            (root / "event.mdx").write_text('---\ntitle: "Send event"\ndescription: "Submit a conversion."\nopenapi: "POST /events"\n---\n')
            _, pages, operations = check.source_inventory(root)
            self.assertEqual(pages, {check.DOCS + "/event": {"title": "Send event", "description": "Submit a conversion."}})
            self.assertEqual(operations, ["GET /events"])

    def test_html_control_and_mutations(self):
        task = {"kind": "html", "url": URL}
        check.validate(task, response(), PAGES, 0)
        for body in (HTML.replace(URL, check.DOCS + "/wrong"),
                     HTML.replace("</head>", f'<link rel="canonical" href="{URL}"></head>'),
                     HTML.replace("</head>", '<meta name="robots" content="noindex"></head>'),
                     HTML.replace("</head>", '<meta name="googlebot" content="none"></head>'),
                     HTML.replace("<h1>", "<h2>"),
                     HTML.replace("Set up your workspace.", "Stale description."),
                     HTML.replace("Quickstart - Plainrouter", "Old title - Plainrouter")):
            with self.subTest(body=body), self.assertRaises(ValueError):
                check.validate(task, response(body), PAGES, 0)
        for headers in ({"x-robots-tag": "noindex"}, {"link": LINK.replace("/docs/llms.txt", "/llms.txt")}):
            with self.subTest(headers=headers), self.assertRaises(ValueError):
                check.validate(task, response(**headers), PAGES, 0)

    def test_markdown_noindex_is_expected_but_html_is_not(self):
        task = {"kind": "markdown", "url": URL + ".md", "source_url": URL}
        check.validate(task, response("# Quickstart\n\nContent", "text/markdown", **{"x-robots-tag": "noindex, nofollow"}), PAGES, 0)
        for body, content_type in ((HTML, "text/html"), ("<html># Quickstart", "text/markdown"),
                                   ("# Old title", "text/markdown")):
            with self.subTest(body=body), self.assertRaises(ValueError):
                check.validate(task, response(body, content_type), PAGES, 0)

    def test_redirect_status_and_exact_target(self):
        task = {"kind": "redirect", "url": check.DOCS + "/.well-known/api-catalog", "destination": check.CATALOG}
        check.validate(task, response("", status=308, location=check.CATALOG), PAGES, 0)
        for status, target in ((404, check.CATALOG), (200, check.CATALOG), (307, check.CATALOG),
                               (308, check.DOCS + "/.well-known/api-catalog")):
            with self.subTest(status=status, target=target), self.assertRaises(ValueError):
                check.validate(task, response("", status=status, location=target), PAGES, 0)
        # Mintlify's existing Markdown redirects are temporary; keep this visible exception.
        task["url"] = check.DOCS + "/guides/meta-capi/python.md"
        task["destination"] = check.DOCS + "/sdk/python.md#send-a-meta-conversion"
        warnings = []
        check.validate(task, response("", status=307, location=check.DOCS + "/sdk/python#send-a-meta-conversion"), PAGES, 0, warnings)
        self.assertEqual(len(warnings), 1)
        with self.assertRaises(ValueError):
            check.validate(task, response("", status=307, location=check.CATALOG), PAGES, 0)

    def test_aggregate_staleness_warns_but_missing_pages_fail(self):
        task = {"kind": "llms-full", "url": check.DOCS + "/llms-full.txt"}
        warnings = []
        check.validate(task, response(f"# Old title\nSource: {URL}", "text/plain"), PAGES, 0, warnings)
        self.assertEqual(len(warnings), 1)
        with self.assertRaises(ValueError):
            check.validate(task, response("# Quickstart", "text/plain"), PAGES, 0)

    def test_sitemap_missing_duplicate_and_unsafe_pages(self):
        generated = check.DOCS + "/api/send-event"
        def sitemap(urls):
            return '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + ''.join(f'<url><loc>{url}</loc></url>' for url in urls) + '</urlset>'
        task = {"kind": "sitemap", "url": check.DOCS + "/sitemap.xml"}
        self.assertEqual(check.validate(task, response(sitemap([URL, generated])), PAGES, 1), [generated])
        for urls in ([generated], [URL, URL, generated], [URL], [URL, check.ORIGIN + "/events"]):
            with self.subTest(urls=urls), self.assertRaises(ValueError):
                check.validate(task, response(sitemap(urls)), PAGES, 1)

    def test_robots_crawler_block_and_missing_sitemap(self):
        task = {"kind": "robots", "url": check.ORIGIN + "/robots.txt"}
        body = f'User-agent: *\nAllow: /\nSitemap: {check.DOCS}/sitemap.xml\n'
        check.validate(task, response(body, "text/plain"), PAGES, 0)
        for broken in (body.replace("Allow: /", "Disallow: /docs"), body.split("Sitemap:")[0],
                       "User-agent: OAI-SearchBot\nDisallow: /docs\n\n" + body):
            with self.subTest(body=broken), self.assertRaises(ValueError):
                check.validate(task, response(broken, "text/plain"), PAGES, 0)

    def test_discovery_stays_docs_scoped(self):
        cases = [
            ("mcp", {"url": "https://plainrouter.subdirectory-docs.mintlify.me/docs/mcp", "authentication": "none", "tools": [{"name": "search_plainrouter"}]},
             {"url": check.ORIGIN + "/mcp", "authentication": "bearer"}),
            ("agent", {"documentationUrl": check.DOCS + "/"}, {"documentationUrl": check.ORIGIN}),
            ("skills", {"skills": [{"url": "/docs/.well-known/agent-skills/plainrouter/skill.md"}]}, {"skills": [{"url": "/.well-known/agent-skills/plainrouter/skill.md"}]})]
        for kind, good, bad in cases:
            with self.subTest(kind=kind):
                task = {"kind": kind, "url": URL}
                check.validate(task, response(check.json.dumps(good), "application/json"), PAGES, 0)
                with self.assertRaises(ValueError):
                    check.validate(task, response(check.json.dumps(bad), "application/json"), PAGES, 0)
        with self.assertRaises(ValueError):
            check.validate({"kind": "catalog", "url": check.CATALOG}, response('{"linkset": []}', "application/linkset+json"), PAGES, 0)

    def test_transport_error_becomes_reported_failure(self):
        with patch("check.fetch", side_effect=ValueError("network unavailable")):
            result = check.run_check({"kind": "html", "url": URL}, PAGES, 0)
        self.assertFalse(result["ok"])
        self.assertIn("network unavailable", result["error"])

    def test_retries_only_failures_and_saves_final_report(self):
        calls = []
        tasks = [{"kind": "html", "url": URL}, {"kind": "markdown", "url": URL + ".md"}]
        def fake_check(task, *_):
            calls.append(task["url"])
            ok = task["kind"] == "html" or calls.count(task["url"]) == 2
            return {**task, "ok": ok, "warnings": [], "error": "Not published yet" if not ok else None}
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "report.json"
            with patch("sys.argv", ["check.py", "--attempts", "2", "--retry-delay", "0", "--report", str(report)]), \
                    patch("check.source_inventory", return_value=({}, PAGES, [])), \
                    patch("check.initial_tasks", return_value=tasks), \
                    patch("check.run_check", side_effect=fake_check), patch("builtins.print"):
                self.assertEqual(check.main(), 0)
            self.assertEqual(calls.count(URL), 1)
            self.assertEqual(calls.count(URL + ".md"), 2)
            self.assertEqual(check.json.loads(report.read_text())["failed"], 0)

    def test_post_deployment_mode_fails_on_known_warnings(self):
        task = {"kind": "llms-full", "url": check.DOCS + "/llms-full.txt"}
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "report.json"
            with patch("sys.argv", ["check.py", "--fail-on-warnings", "--report", str(report)]), \
                    patch("check.source_inventory", return_value=({}, PAGES, [])), \
                    patch("check.initial_tasks", return_value=[task]), \
                    patch("check.run_check", return_value={**task, "ok": True, "warnings": ["Stale aggregate"]}), \
                    patch("builtins.print"):
                self.assertEqual(check.main(), 1)
            result = check.json.loads(report.read_text())
            self.assertEqual(result["failed"], 1)
            self.assertEqual(result["rows"][0]["error"], "Stale aggregate")


if __name__ == "__main__":
    unittest.main()
