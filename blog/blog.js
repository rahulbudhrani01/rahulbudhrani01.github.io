(function () {
  "use strict";

  function getArticle() {
    return {
      slug: document.body.getAttribute("data-article-slug") || "",
      title: document.body.getAttribute("data-article-title") || ""
    };
  }

  function gtagAvailable() {
    return typeof window.gtag === "function";
  }

  function sendEvent(name, params) {
    if (!gtagAvailable()) return;
    window.gtag("event", name, params);
  }

  function navigate(link) {
    if (!link.href) return;
    if (link.target === "_blank") {
      window.open(link.href, "_blank", "noopener");
      return;
    }
    window.location.href = link.href;
  }

  function trackAndNavigate(event, link, name, params) {
    if (!gtagAvailable()) return;

    event.preventDefault();
    var navigated = false;

    function go() {
      if (navigated) return;
      navigated = true;
      navigate(link);
    }

    window.gtag(
      "event",
      name,
      Object.assign({}, params, {
        destination: link.href,
        event_callback: go,
        event_timeout: 1000
      })
    );

    window.setTimeout(go, 1200);
  }

  function onReady() {
    var article = getArticle();

    if (
      document.body.classList.contains("article-page") &&
      document.body.getAttribute("data-draft") !== "true"
    ) {
      sendEvent("blog_article_view", {
        article_slug: article.slug,
        article_title: article.title
      });
    }

    document.addEventListener("click", function (event) {
      if (!event.target || typeof event.target.closest !== "function") return;

      var cta = event.target.closest("[data-blog-cta]");
      if (cta) {
        var ctaParams = {};
        if (article.slug) ctaParams.article_slug = article.slug;
        if (article.title) ctaParams.article_title = article.title;
        ctaParams.cta_location = cta.getAttribute("data-blog-cta") || "unknown";
        trackAndNavigate(event, cta, "blog_cta_click", ctaParams);
        return;
      }

      var related = event.target.closest("[data-related-article]");
      if (related) {
        var relatedParams = {};
        if (article.slug) relatedParams.article_slug = article.slug;
        if (article.title) relatedParams.article_title = article.title;
        relatedParams.cta_location = "related_articles";
        relatedParams.destination_slug =
          related.getAttribute("data-related-slug") || "";
        trackAndNavigate(
          event,
          related,
          "blog_related_article_click",
          relatedParams
        );
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }
})();
