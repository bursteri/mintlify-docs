(() => {
  const isPlainRouterHost = (hostname) =>
    hostname === "plainrouter.com" || hostname.endsWith(".plainrouter.com");

  const updateLinkTarget = (link) => {
    const href = link.getAttribute("href");

    if (!href) {
      return;
    }

    let url;

    try {
      url = new URL(href, window.location.href);
    } catch {
      return;
    }

    const opensNewTab = ["http:", "https:"].includes(url.protocol)
      && url.origin !== window.location.origin
      && !isPlainRouterHost(url.hostname);

    if (!opensNewTab) {
      if (link.hasAttribute("target")) {
        link.removeAttribute("target");
      }

      return;
    }

    if (link.getAttribute("target") !== "_blank") {
      link.setAttribute("target", "_blank");
    }

    const rel = new Set((link.getAttribute("rel") || "").split(/\s+/).filter(Boolean));
    rel.add("noopener");
    link.setAttribute("rel", [...rel].join(" "));
  };

  const updateLinkTargets = (root) => {
    if (root.matches?.("a[href]")) {
      updateLinkTarget(root);
    }

    root.querySelectorAll?.("a[href]").forEach(updateLinkTarget);
  };

  updateLinkTargets(document);

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        updateLinkTargets(mutation.target);
        continue;
      }

      mutation.addedNodes.forEach(updateLinkTargets);
    }
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["href", "target"],
    childList: true,
    subtree: true,
  });
})();
