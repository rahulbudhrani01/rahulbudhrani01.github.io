import fs from "node:fs";
import path from "node:path";
import {
  ROOT,
  BLOG_DIR,
  SITE_URL,
  absoluteUrl,
  assert,
  articleSourcePath,
  escapeHtml,
  estimateReadingTime,
  extractArticleParts,
  extractChrome,
  extractHeaderContent,
  extractToc,
  formatDate,
  formatTocList,
  jsonLdScript,
  normalizeWhitespace,
  publishedArticles,
  readRegistry,
  rewriteArticleBody,
  stripTags
} from "./lib.mjs";

const BLOG_TITLE = "Pixle Blog — Guides for Animated Storytelling";
const BLOG_DESCRIPTION =
  "Practical guides from Pixle on creating animated characters, series and video workflows with AI-assisted animation.";

const GA4_HEAD = `
<script async src="https://www.googletagmanager.com/gtag/js?id=G-VW2S0SK06N"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', 'G-VW2S0SK06N');

  function trackSignupClick(event, buttonLocation) {
    var link = event.currentTarget;
    var destination = link.href;

    if (typeof gtag !== 'function') return;

    event.preventDefault();
    var navigated = false;
    function continueToSignup() {
      if (navigated) return;
      navigated = true;
      window.location.href = destination;
    }

    gtag('event', 'signup_cta_click', {
      button_location: buttonLocation,
      event_callback: continueToSignup,
      event_timeout: 1000
    });

    window.setTimeout(continueToSignup, 1200);
  }
</script>`;

function signupUrl(campaign, medium = "article") {
  const params = new URLSearchParams({
    utm_source: "blog",
    utm_medium: medium,
    utm_campaign: campaign
  });
  return `https://app.pixle.pro/signup?${params.toString()}`;
}

function validateRegistry(articles) {
  const required = [
    "slug",
    "sourceDir",
    "sourceIndex",
    "headerEnd",
    "title",
    "seoTitle",
    "description",
    "category",
    "author",
    "featuredImage",
    "featuredImageAlt",
    "featuredImageWidth",
    "featuredImageHeight"
  ];
  const seen = new Set();

  assert(articles.length > 0, "blog/articles.json is empty.");
  articles.forEach((article, index) => {
    required.forEach((field) => {
      assert(
        article[field] !== undefined && article[field] !== null && article[field] !== "",
        `Article ${index + 1} is missing required field "${field}".`
      );
    });
    assert(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug),
      `Invalid slug "${article.slug}". Use lowercase words separated by hyphens.`
    );
    assert(!seen.has(article.slug), `Duplicate slug "${article.slug}".`);
    seen.add(article.slug);
    assert(
      article.headerEnd === "</header>" || article.headerEnd === "first-figure",
      `Invalid headerEnd for "${article.slug}".`
    );
    assert(
      typeof article.draft === "boolean",
      `Article "${article.slug}" must have a boolean draft field.`
    );
    assert(
      fs.existsSync(articleSourcePath(article)),
      `Source file not found for "${article.slug}": ${articleSourcePath(article)}`
    );
    assert(
      fs.existsSync(path.join(ROOT, article.featuredImage.replace(/^\//, ""))),
      `Featured image not found for "${article.slug}": ${article.featuredImage}`
    );
    if (article.publishedAt) {
      assert(
        /^\d{4}-\d{2}-\d{2}$/.test(article.publishedAt),
        `publishedAt for "${article.slug}" must use YYYY-MM-DD.`
      );
    }
    if (article.updatedAt) {
      assert(
        /^\d{4}-\d{2}-\d{2}$/.test(article.updatedAt),
        `updatedAt for "${article.slug}" must use YYYY-MM-DD.`
      );
    }
    assert(
      article.canonicalUrl ===
        `${SITE_URL}/blog/${article.slug}/` ||
        /^https:\/\/www\.pixle\.pro\//.test(article.canonicalUrl),
      `canonicalUrl for "${article.slug}" must be on ${SITE_URL}.`
    );
  });
}

function cleanupStalePages(articles) {
  const knownSlugs = new Set(articles.map((article) => article.slug));
  const removed = [];

  for (const entry of fs.readdirSync(BLOG_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (knownSlugs.has(entry.name)) continue;

    const page = path.join(BLOG_DIR, entry.name, "index.html");
    if (fs.existsSync(page)) {
      fs.rmSync(path.join(BLOG_DIR, entry.name), {
        recursive: true,
        force: true
      });
      removed.push(entry.name);
    }
  }

  return removed;
}

function renderHead({
  title,
  description,
  canonical,
  ogTitle,
  ogImage,
  ogImageWidth,
  ogImageHeight,
  ogType,
  publishedAt,
  updatedAt,
  category,
  preloadImage,
  robots,
  jsonLd
}) {
  const imageUrl = absoluteUrl(ogImage);
  const structuredData = jsonLd
    .map((item) => jsonLdScript(item))
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${robots || "index,follow,max-image-preview:large"}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="icon" href="/favicon_io/icon.svg" type="image/svg+xml">
  <link rel="preload" as="image" href="/pixle-logo.webp">
  ${preloadImage ? `<link rel="preload" as="image" href="${escapeHtml(preloadImage)}">` : ""}

  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="Pixle">
  <meta property="og:title" content="${escapeHtml(ogTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:width" content="${ogImageWidth}">
  <meta property="og:image:height" content="${ogImageHeight}">
  <meta property="og:locale" content="en_US">
  ${publishedAt ? `<meta property="article:published_time" content="${escapeHtml(publishedAt)}">` : ""}
  ${updatedAt ? `<meta property="article:modified_time" content="${escapeHtml(updatedAt)}">` : ""}
  ${category ? `<meta property="article:section" content="${escapeHtml(category)}">` : ""}

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">

  ${structuredData}

  <link rel="stylesheet" href="/blog/blog.css">
  ${GA4_HEAD}
</head>`;
}

function renderArticlePage(article, data, chrome) {
  const {
    body,
    readingTime,
    header,
    h1Text,
    toc
  } = data;
  const publishedLabel = formatDate(article.publishedAt);
  const updatedLabel = formatDate(article.updatedAt);
  const tocDesktop = toc.length
    ? `<aside class="article-toc" aria-label="On this page">
        <p class="toc-title">On this page</p>
        ${formatTocList(toc)}
      </aside>`
    : "";
  const tocMobile = toc.length
    ? `<details class="toc-mobile">
        <summary>On this page</summary>
        ${formatTocList(toc)}
      </details>`
    : "";

  const related = data.related
    .map(
      (item) => `<article class="related-card">
        <a href="/blog/${escapeHtml(item.article.slug)}/" data-related-article data-related-slug="${escapeHtml(item.article.slug)}">
          <img src="${escapeHtml(item.article.featuredImage)}" alt="${escapeHtml(item.article.featuredImageAlt)}" width="${item.article.featuredImageWidth}" height="${item.article.featuredImageHeight}" loading="lazy">
          <div class="related-card-body">
            <p class="related-category">${escapeHtml(item.article.category)}</p>
            <h3>${escapeHtml(item.article.title)}</h3>
            <p class="related-meta">${item.readingTime} min read</p>
          </div>
        </a>
      </article>`
    )
    .join("\n");

  const blogPosting = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: h1Text,
    description: article.description,
    image: [absoluteUrl(article.featuredImage)],
    author: {
      "@type": "Organization",
      name: article.author,
      url: `${SITE_URL}/`
    },
    publisher: {
      "@type": "Organization",
      name: "Pixle",
      url: `${SITE_URL}/`
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": article.canonicalUrl
    },
    url: article.canonicalUrl,
    inLanguage: "en",
    articleSection: article.category
  };
  if (article.publishedAt) blogPosting.datePublished = article.publishedAt;
  if (article.updatedAt) blogPosting.dateModified = article.updatedAt;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${SITE_URL}/`
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: `${SITE_URL}/blog/`
      },
      {
        "@type": "ListItem",
        position: 3,
        name: h1Text,
        item: article.canonicalUrl
      }
    ]
  };

  return `${renderHead({
    title: article.seoTitle,
    description: article.description,
    canonical: article.canonicalUrl,
    ogTitle: h1Text,
    ogImage: article.featuredImage,
    ogImageWidth: article.featuredImageWidth,
    ogImageHeight: article.featuredImageHeight,
    ogType: "article",
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
    category: article.category,
    preloadImage: article.featuredImage,
    robots: article.draft
      ? "noindex,nofollow"
      : "index,follow,max-image-preview:large",
    jsonLd: [blogPosting, breadcrumbJsonLd]
  })}
<body class="blog-page article-page${article.draft ? " draft-page" : ""}" data-article-slug="${escapeHtml(article.slug)}" data-article-title="${escapeHtml(h1Text)}"${article.draft ? ' data-draft="true"' : ""}>
  <a class="skip-link" href="#main">Skip to content</a>
  ${chrome.nav}

  <main id="main" class="article-main">
    ${article.draft ? `<div class="draft-banner" role="status"><strong>Draft preview.</strong> This article is not published, listed, or included in the sitemap.</div>` : ""}

    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        <li><a href="/">Home</a></li>
        <li><a href="/blog/">Blog</a></li>
        <li aria-current="page">${escapeHtml(h1Text)}</li>
      </ol>
    </nav>

    <div class="article-shell">
      <article class="article-card">
        <header class="article-header">
          ${header.eyebrow ? `<p class="article-eyebrow">${header.eyebrow}</p>` : ""}
          <h1>${header.h1}</h1>
          ${header.dek ? `<p class="article-dek">${header.dek}</p>` : ""}
          <p class="article-byline">
            ${header.byline || `By ${escapeHtml(article.author)}`}
            <span class="reading-time">· ${readingTime} min read</span>
            ${publishedLabel && !header.byline.includes(publishedLabel) ? `<span class="published-date">· Published ${escapeHtml(publishedLabel)}</span>` : ""}
            ${updatedLabel ? `<span class="updated-date">· Updated ${escapeHtml(updatedLabel)}</span>` : ""}
          </p>
          <figure class="article-hero">
            <img src="${escapeHtml(article.featuredImage)}" alt="${escapeHtml(article.featuredImageAlt)}" width="${article.featuredImageWidth}" height="${article.featuredImageHeight}" fetchpriority="high" decoding="async">
          </figure>
        </header>

        ${tocMobile}

        <!-- article-body:start -->
        <div class="article-body">
        ${body}
        </div>
        <!-- article-body:end -->
      </article>

      ${tocDesktop}
    </div>

    <section class="related-section" aria-labelledby="related-heading">
      <div class="related-header">
        <div>
          <p class="eyebrow">Keep reading</p>
          <h2 id="related-heading">Related guides</h2>
        </div>
        <a class="text-link" href="/blog/">All guides</a>
      </div>
      <div class="related-grid">
        ${related}
      </div>
    </section>

    <section class="article-cta" aria-labelledby="article-cta-heading">
      <p class="eyebrow">Start creating with Pixle</p>
      <h2 id="article-cta-heading">Build the characters once. Tell more stories.</h2>
      <p>Bring reusable characters, consistent environments and animated scenes together in one creative workspace.</p>
      <a class="button primary" href="${signupUrl(article.slug)}" data-blog-cta="article_footer">Start your free trial</a>
    </section>
  </main>

  ${chrome.footer}
  <script src="/blog/blog.js" defer></script>
</body>
</html>
`;
}

function renderBlogIndex(articles, chrome) {
  const cards = articles
    .map(
      (item) => `<article class="blog-card">
        <a class="blog-card-link" href="/blog/${escapeHtml(item.article.slug)}/">
          <div class="blog-card-media">
            <img src="${escapeHtml(item.article.featuredImage)}" alt="${escapeHtml(item.article.featuredImageAlt)}" width="${item.article.featuredImageWidth}" height="${item.article.featuredImageHeight}" loading="lazy">
          </div>
          <div class="blog-card-body">
            <p class="blog-card-category">${escapeHtml(item.article.category)}</p>
            <h3 class="blog-card-title">${escapeHtml(item.article.title)}</h3>
            <p class="blog-card-description">${escapeHtml(item.article.description)}</p>
            <p class="blog-card-meta">
              ${item.article.publishedAt ? `<time datetime="${escapeHtml(item.article.publishedAt)}">${escapeHtml(formatDate(item.article.publishedAt))}</time> · ` : ""}${item.readingTime} min read
            </p>
          </div>
        </a>
      </article>`
    )
    .join("\n");

  const blogJsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Pixle Blog",
    description: BLOG_DESCRIPTION,
    url: `${SITE_URL}/blog/`,
    publisher: {
      "@type": "Organization",
      name: "Pixle",
      url: `${SITE_URL}/`
    },
    blogPost: articles.map((item) => ({
      "@type": "BlogPosting",
      headline: item.h1Text,
      url: item.article.canonicalUrl
    }))
  };

  const first = articles[0];

  return `${renderHead({
    title: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
    canonical: `${SITE_URL}/blog/`,
    ogTitle: BLOG_TITLE,
    ogImage: first.article.featuredImage,
    ogImageWidth: first.article.featuredImageWidth,
    ogImageHeight: first.article.featuredImageHeight,
    ogType: "website",
    preloadImage: "",
    jsonLd: [blogJsonLd]
  })}
<body class="blog-page blog-index">
  <a class="skip-link" href="#main">Skip to content</a>
  ${chrome.nav}

  <main id="main" class="blog-main">
    <section class="blog-hero">
      <p class="eyebrow">Pixle Blog</p>
      <h1>Guides for animated storytelling.</h1>
      <p class="blog-hero-copy">Practical guides from Pixle on animated characters, series and video workflows.</p>
      <a class="button primary" href="${signupUrl("blog_index", "blog_index")}" data-blog-cta="blog_index_hero">Start your free trial</a>
    </section>

    <section class="blog-listing" aria-labelledby="latest-guides">
      <div class="blog-listing-header">
        <h2 id="latest-guides">Latest guides</h2>
        <p>${articles.length} ${articles.length === 1 ? "guide" : "guides"}</p>
      </div>
      <div class="blog-grid">
        ${cards}
      </div>
    </section>

    <section class="blog-cta" aria-labelledby="blog-cta-heading">
      <p class="eyebrow">Get started with Pixle</p>
      <h2 id="blog-cta-heading">Ready to bring your stories to life?</h2>
      <p>Create reusable characters, animated scenes and finished videos in one workspace.</p>
      <a class="button primary" href="${signupUrl("blog_index", "blog_index")}" data-blog-cta="blog_index_footer">Start your free trial</a>
    </section>
  </main>

  ${chrome.footer}
  <script src="/blog/blog.js" defer></script>
</body>
</html>
`;
}

function checkMediaWarnings(article, body) {
  const warnings = [];

  for (const match of body.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\balt=/.test(tag)) {
      warnings.push(`${article.slug}: image missing alt attribute`);
    }
    if (!/\bwidth=/.test(tag) || !/\bheight=/.test(tag)) {
      warnings.push(`${article.slug}: image missing width/height`);
    }
  }

  for (const match of body.matchAll(/<video\b[^>]*>/gi)) {
    if (!/\bposter=/.test(match[0])) {
      warnings.push(`${article.slug}: video missing poster`);
    }
  }

  for (const match of body.matchAll(/<video\b[\s\S]*?<\/video>/gi)) {
    if (!/<source\b[^>]*\bsrc=/.test(match[0])) {
      warnings.push(`${article.slug}: video missing <source>`);
    }
  }

  return warnings;
}

function build() {
  const registry = readRegistry();
  validateRegistry(registry);

  const published = publishedArticles(registry);
  assert(published.length > 0, "No published articles. Set draft: false to publish one.");
  const removed = cleanupStalePages(registry);
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const chrome = extractChrome(indexHtml, true);
  const warnings = [];
  const dataBySlug = new Map();

  for (const article of registry) {
    const sourceHtml = fs.readFileSync(articleSourcePath(article), "utf8");
    const { header, body } = extractArticleParts(
      sourceHtml,
      article.headerEnd
    );
    const headerContent = extractHeaderContent(header);
    const h1Text = normalizeWhitespace(stripTags(headerContent.h1));

    assert(
      h1Text === normalizeWhitespace(article.title),
      `Registry title does not match the source <h1> for "${article.slug}".\n` +
        `Registry: ${article.title}\nSource:   ${h1Text}`
    );

    const rewrittenBody = rewriteArticleBody(body, article);
    const toc = extractToc(rewrittenBody);
    const readingTime = estimateReadingTime(rewrittenBody);
    warnings.push(...checkMediaWarnings(article, rewrittenBody));

    dataBySlug.set(article.slug, {
      article,
      header: headerContent,
      body: rewrittenBody,
      h1Text,
      toc,
      readingTime,
      related: []
    });
  }

  const publishedData = [...dataBySlug.values()].filter(
    (item) => !item.article.draft
  );

  for (const data of dataBySlug.values()) {
    const explicit = Array.isArray(data.article.related)
      ? data.article.related
          .map((slug) => publishedData.find((item) => item.article.slug === slug))
          .filter(Boolean)
      : [];
    const fallback = publishedData.filter(
      (item) => item.article.slug !== data.article.slug
    );
    data.related = [...explicit, ...fallback]
      .filter(
        (item, index, list) =>
          item.article.slug !== data.article.slug &&
          list.findIndex((candidate) => candidate.article.slug === item.article.slug) === index
      )
      .slice(0, 3);
  }

  for (const data of dataBySlug.values()) {
    const page = renderArticlePage(data.article, data, chrome);
    const pageDir = path.join(BLOG_DIR, data.article.slug);
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(path.join(pageDir, "index.html"), page, "utf8");
  }

  const ordered = [...publishedData].sort(
    (a, b) => (a.article.order ?? 0) - (b.article.order ?? 0)
  );
  const indexPage = renderBlogIndex(ordered, chrome);
  fs.writeFileSync(path.join(BLOG_DIR, "index.html"), indexPage, "utf8");

  const sitemapUrls = [
    `${SITE_URL}/`,
    `${SITE_URL}/blog/`,
    ...ordered.map((item) => item.article.canonicalUrl)
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls
  .map((url) => `  <url>\n    <loc>${escapeHtml(url)}</loc>\n  </url>`)
  .join("\n")}
</urlset>
`;
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap, "utf8");

  const robots = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
  fs.writeFileSync(path.join(ROOT, "robots.txt"), robots, "utf8");

  console.log(
    `Generated ${dataBySlug.size} article pages (${ordered.length} published, ${dataBySlug.size - ordered.length} draft) and /blog/index.html.`
  );
  console.log(`Sitemap: ${sitemapUrls.length} URLs.`);
  if (removed.length) {
    console.log(`Removed stale generated directories: ${removed.join(", ")}`);
  }
  const drafts = registry.filter((article) => article.draft);
  if (drafts.length) {
    console.log(`Draft pages generated with noindex: ${drafts.map((article) => article.slug).join(", ")}`);
  }
  if (warnings.length) {
    console.log("\nWarnings:");
    for (const warning of [...new Set(warnings)]) {
      console.log(`- ${warning}`);
    }
  }
  console.log("\nArticle summary:");
  for (const item of [...dataBySlug.values()].sort(
    (a, b) => (a.article.order ?? 0) - (b.article.order ?? 0)
  )) {
    console.log(
      `- /blog/${item.article.slug}/ — ${item.readingTime} min read, ${item.toc.length} TOC items${item.article.draft ? " [draft]" : ""}`
    );
  }
}

build();
