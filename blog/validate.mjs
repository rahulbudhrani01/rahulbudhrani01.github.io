import fs from "node:fs";
import path from "node:path";
import {
  BLOG_DIR,
  ROOT,
  SITE_URL,
  articleSourcePath,
  decodeEntities,
  extractArticleParts,
  normalizeWhitespace,
  publishedArticles,
  readRegistry,
  rewriteArticleBody,
  stripTags
} from "./lib.mjs";

const failures = [];
const checks = [];

function check(condition, message) {
  checks.push(message);
  if (!condition) failures.push(message);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function unique(values) {
  return new Set(values).size === values.length;
}

function matches(html, regex) {
  return [...html.matchAll(regex)];
}

function getMeta(html, attribute, value) {
  const regex = new RegExp(
    `<meta\\b[^>]*\\b${attribute}="${value.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    )}"[^>]*\\bcontent="([^"]*)"`,
    "i"
  );
  const match = html.match(regex);
  return match ? decodeEntities(match[1]) : "";
}

function getTitle(html) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  return match ? normalizeWhitespace(stripTags(match[1])) : "";
}

function getCanonical(html) {
  const match = html.match(
    /<link\b[^>]*\brel="canonical"[^>]*\bhref="([^"]+)"/i
  );
  return match ? match[1] : "";
}

function getH1Count(html) {
  return matches(html, /<h1\b[^>]*>/gi).length;
}

function getJsonLd(html) {
  return matches(
    html,
    /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  ).map((match) => {
    try {
      return JSON.parse(match[1]);
    } catch (error) {
      failures.push(`Invalid JSON-LD: ${error.message}`);
      return null;
    }
  }).filter(Boolean);
}

function getMarkerBody(html) {
  const start = html.indexOf("<!-- article-body:start -->");
  const end = html.indexOf("<!-- article-body:end -->");
  if (start === -1 || end === -1) return "";
  return html.slice(start + "<!-- article-body:start -->".length, end);
}

function localTarget(pagePath, value) {
  const clean = value.split("#")[0].split("?")[0];
  if (!clean) return null;
  if (/^(?:https?:)?\/\//i.test(clean)) return null;
  if (/^(?:mailto|tel|data):/i.test(clean)) return null;
  if (clean.startsWith("/")) {
    return path.join(ROOT, clean.slice(1));
  }
  return path.join(path.dirname(pagePath), clean);
}

function checkLocalReferences(pagePath, html) {
  const refs = matches(html, /(?:href|src|poster)="([^"]+)"/gi).map(
    (match) => match[1]
  );
  for (const ref of refs) {
    if (ref.startsWith("#") || ref.startsWith("//")) continue;
    const target = localTarget(pagePath, ref);
    if (!target) continue;

    let resolved = target;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      resolved = path.join(resolved, "index.html");
    }
    check(
      fs.existsSync(resolved),
      `${path.relative(ROOT, pagePath)} references missing local file: ${ref}`
    );
  }
}

function checkToc(pagePath, html) {
  const anchors = matches(html, /<a\b[^>]*\bhref="#([^"]+)"[^>]*>/gi);
  for (const match of anchors) {
    const id = match[1];
    check(
      new RegExp(`\\bid="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(
        html
      ),
      `${path.relative(ROOT, pagePath)} TOC link #${id} has no target id`
    );
  }
}

function checkImages(pagePath, html) {
  const images = matches(html, /<img\b[^>]*>/gi).map((match) => match[0]);
  for (const image of images) {
    if (/\bclass="[^"]*\bsocial-icon\b/.test(image)) continue;
    check(
      /\balt="/.test(image),
      `${path.relative(ROOT, pagePath)} has an image without alt text`
    );
    check(
      /\bwidth="\d+"/.test(image) && /\bheight="\d+"/.test(image),
      `${path.relative(ROOT, pagePath)} has an image without width/height`
    );
  }
}

function checkVideos(pagePath, html) {
  const videos = matches(html, /<video\b[\s\S]*?<\/video>/gi).map(
    (match) => match[0]
  );
  for (const video of videos) {
    check(
      /\bposter="/.test(video),
      `${path.relative(ROOT, pagePath)} has a video without a poster`
    );
    check(
      /<source\b[^>]*\bsrc="/.test(video),
      `${path.relative(ROOT, pagePath)} has a video without a source`
    );
  }
}

function checkGa4(pagePath, html) {
  const asyncTags = matches(
    html,
    /<script\b[^>]*src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-VW2S0SK06N"[^>]*>/gi
  ).length;
  const configCalls = matches(
    html,
    /gtag\('config', 'G-VW2S0SK06N'\)/g
  ).length;
  check(
    asyncTags === 1,
    `${path.relative(ROOT, pagePath)} must initialise GA4 exactly once`
  );
  check(
    configCalls === 1,
    `${path.relative(ROOT, pagePath)} must configure GA4 exactly once`
  );
}

function main() {
  const registry = readRegistry();
  const published = publishedArticles(registry);
  const drafts = registry.filter((article) => article.draft);

  const articlePages = registry.map((article) => ({
    article,
    file: path.join(BLOG_DIR, article.slug, "index.html")
  }));
  const blogIndexFile = path.join(BLOG_DIR, "index.html");

  check(fs.existsSync(blogIndexFile), "Missing blog/index.html");
  check(published.length > 0, "No published articles in the registry");

  const titles = [];
  const descriptions = [];
  const canonicals = [];

  for (const { article, file } of articlePages) {
    check(fs.existsSync(file), `Missing generated page for ${article.slug}`);
    if (!fs.existsSync(file)) continue;

    const html = read(file);
    const pagePath = file;
    const title = getTitle(html);
    const description = getMeta(html, "name", "description");
    const canonical = getCanonical(html);
    const h1Count = getH1Count(html);
    const jsonLd = getJsonLd(html);

    titles.push(title);
    descriptions.push(description);
    canonicals.push(canonical);

    check(title === article.seoTitle, `${article.slug}: title mismatch`);
    check(
      description === article.description,
      `${article.slug}: meta description mismatch`
    );
    check(
      canonical === article.canonicalUrl,
      `${article.slug}: canonical mismatch`
    );
    check(canonical.startsWith(`${SITE_URL}/blog/`), `${article.slug}: canonical must use ${SITE_URL}`);
    check(h1Count === 1, `${article.slug}: expected exactly one h1`);
    check(
      getMeta(html, "property", "og:title") !== "",
      `${article.slug}: missing og:title`
    );
    check(
      getMeta(html, "property", "og:description") !== "",
      `${article.slug}: missing og:description`
    );
    check(
      /^https:\/\//.test(getMeta(html, "property", "og:image")),
      `${article.slug}: og:image must be absolute`
    );
    check(
      getMeta(html, "name", "twitter:card") === "summary_large_image",
      `${article.slug}: twitter card missing`
    );
    if (article.draft) {
      check(
        /noindex/.test(getMeta(html, "name", "robots")),
        `${article.slug}: draft robots meta must use noindex`
      );
      check(
        html.includes('data-draft="true"'),
        `${article.slug}: draft page must expose data-draft`
      );
    } else {
      check(
        /index,i?follow/.test(getMeta(html, "name", "robots")),
        `${article.slug}: robots meta must allow indexing`
      );
    }
    check(
      html.includes(`data-article-slug="${article.slug}"`),
      `${article.slug}: missing article slug data attribute`
    );
    check(
      html.includes("data-blog-cta="),
      `${article.slug}: missing blog CTA tracking attributes`
    );
    check(
      html.includes("data-related-article"),
      `${article.slug}: missing related article tracking attributes`
    );

    const blogPosting = jsonLd.find((item) => item["@type"] === "BlogPosting");
    const breadcrumbs = jsonLd.find(
      (item) => item["@type"] === "BreadcrumbList"
    );
    check(Boolean(blogPosting), `${article.slug}: missing BlogPosting JSON-LD`);
    check(Boolean(breadcrumbs), `${article.slug}: missing BreadcrumbList JSON-LD`);
    if (blogPosting) {
      check(
        blogPosting.headline !== undefined,
        `${article.slug}: BlogPosting missing headline`
      );
      check(
        blogPosting.author && blogPosting.author["@type"] === "Organization",
        `${article.slug}: BlogPosting author must be an Organization`
      );
      check(
        blogPosting.aggregateRating === undefined,
        `${article.slug}: BlogPosting must not include aggregateRating`
      );
      check(
        Boolean(article.publishedAt) === Boolean(blogPosting.datePublished),
        `${article.slug}: datePublished must match the registry`
      );
      check(
        Boolean(article.updatedAt) === Boolean(blogPosting.dateModified),
        `${article.slug}: dateModified must match the registry`
      );
    }

    checkToc(pagePath, html);
    checkImages(pagePath, html);
    checkVideos(pagePath, html);
    checkLocalReferences(pagePath, html);
    checkGa4(pagePath, html);

    check(
      !html.includes("consistent-ai-characters") &&
        !html.includes("ai-animated-youtube-series"),
      `${article.slug}: contains an old blog slug`
    );
    check(
      !/(?:href|src|poster)="assets\//.test(html),
      `${article.slug}: contains an unresolved relative asset path`
    );

    const sourceHtml = read(articleSourcePath(article));
    const sourceParts = extractArticleParts(sourceHtml, article.headerEnd);
    const expectedBodyText = normalizeWhitespace(
      stripTags(rewriteArticleBody(sourceParts.body, article))
    );
    const actualBodyText = normalizeWhitespace(stripTags(getMarkerBody(html)));
    check(
      expectedBodyText === actualBodyText,
      `${article.slug}: article body text differs from the supplied source`
    );

    const relatedExpected = Math.min(
      3,
      article.draft ? published.length : published.length - 1
    );
    const relatedLinks = matches(
      html,
      /data-related-article/g
    ).length;
    check(
      relatedLinks >= relatedExpected,
      `${article.slug}: expected at least ${relatedExpected} related links`
    );
    for (const draft of drafts) {
      check(
        !html.includes(`data-related-slug="${draft.slug}"`),
        `${article.slug}: related links must not include draft ${draft.slug}`
      );
    }
  }

  check(unique(titles), "Article title tags must be unique");
  check(unique(descriptions), "Article meta descriptions must be unique");
  check(unique(canonicals), "Article canonical URLs must be unique");

  if (fs.existsSync(blogIndexFile)) {
    const indexHtml = read(blogIndexFile);
    check(getH1Count(indexHtml) === 1, "Blog index: expected exactly one h1");
    check(
      getCanonical(indexHtml) === `${SITE_URL}/blog/`,
      "Blog index: canonical mismatch"
    );
    check(
      getMeta(indexHtml, "property", "og:image").startsWith("https://"),
      "Blog index: og:image must be absolute"
    );
    checkGa4(blogIndexFile, indexHtml);
    checkLocalReferences(blogIndexFile, indexHtml);
    checkImages(blogIndexFile, indexHtml);

    const indexJsonLd = getJsonLd(indexHtml);
    check(
      indexJsonLd.some((item) => item["@type"] === "Blog"),
      "Blog index: missing Blog JSON-LD"
    );

    for (const article of published) {
      check(
        indexHtml.includes(`/blog/${article.slug}/`),
        `Blog index: missing link to ${article.slug}`
      );
    }
  }

  const sitemapFile = path.join(ROOT, "sitemap.xml");
  check(fs.existsSync(sitemapFile), "Missing root sitemap.xml");
  if (fs.existsSync(sitemapFile)) {
    const sitemap = read(sitemapFile);
    const locs = matches(sitemap, /<loc>([^<]+)<\/loc>/gi).map(
      (match) => match[1]
    );
    check(
      locs.every((loc) => loc.startsWith(SITE_URL)),
      "Sitemap URLs must be absolute on the canonical host"
    );
    check(locs.includes(`${SITE_URL}/`), "Sitemap missing the homepage");
    check(locs.includes(`${SITE_URL}/blog/`), "Sitemap missing /blog/");
    for (const article of published) {
      check(
        locs.includes(article.canonicalUrl),
        `Sitemap missing ${article.canonicalUrl}`
      );
    }
    for (const article of drafts) {
      check(
        !locs.includes(article.canonicalUrl),
        `Sitemap must exclude draft ${article.slug}`
      );
    }
  }

  const robotsFile = path.join(ROOT, "robots.txt");
  check(fs.existsSync(robotsFile), "Missing root robots.txt");
  if (fs.existsSync(robotsFile)) {
    const robots = read(robotsFile);
    check(/^Allow: \/$/m.test(robots), "robots.txt must allow the site");
    check(
      robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`),
      "robots.txt must reference the sitemap"
    );
    check(
      !/^Disallow: \/blog/m.test(robots),
      "robots.txt must not block the blog"
    );
  }

  const blogJsFile = path.join(BLOG_DIR, "blog.js");
  check(fs.existsSync(blogJsFile), "Missing blog/blog.js");
  if (fs.existsSync(blogJsFile)) {
    const blogJs = read(blogJsFile);
    for (const eventName of [
      "blog_article_view",
      "blog_cta_click",
      "blog_related_article_click"
    ]) {
      check(blogJs.includes(eventName), `blog.js missing event ${eventName}`);
    }
  }

  for (const draft of drafts) {
    const draftFile = path.join(BLOG_DIR, draft.slug, "index.html");
    check(fs.existsSync(draftFile), `Draft ${draft.slug} must have a noindex preview page`);
    if (fs.existsSync(draftFile)) {
      check(
        /noindex/.test(getMeta(read(draftFile), "name", "robots")),
        `Draft ${draft.slug} must use noindex`
      );
    }
    if (fs.existsSync(blogIndexFile)) {
      check(
        !read(blogIndexFile).includes(`/blog/${draft.slug}/`),
        `Blog index must not link to draft ${draft.slug}`
      );
    }
    if (fs.existsSync(path.join(ROOT, "sitemap.xml"))) {
      check(
        !read(path.join(ROOT, "sitemap.xml")).includes(draft.canonicalUrl),
        `Sitemap must not include draft ${draft.slug}`
      );
    }
  }

  console.log(
    `Validation: ${checks.length - failures.length}/${checks.length} checks passed.`
  );
  if (failures.length) {
    console.log("\nFailures:");
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log("All checks passed.");
  }
}

main();
