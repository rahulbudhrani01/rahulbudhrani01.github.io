import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
export const BLOG_DIR = path.join(ROOT, "blog");
export const SITE_URL = "https://www.pixle.pro";

const BLOG_SLUG_MAP = {
  "ai-animated-youtube-series": "animated-youtube-series",
  "consistent-ai-characters": "consistent-characters",
  "recurring-animated-characters": "recurring-animated-characters",
  "script-to-animated-video": "script-to-animated-video"
};

export function readRegistry() {
  const registryPath = path.join(BLOG_DIR, "articles.json");
  const articles = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  if (!Array.isArray(articles)) {
    throw new Error("blog/articles.json must contain an array of articles.");
  }
  return articles.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function publishedArticles(articles) {
  return articles.filter((article) => !article.draft);
}

export function articleSourcePath(article) {
  return path.join(ROOT, article.sourceDir, article.sourceIndex);
}

export function sourceFolderName(article) {
  return path.basename(article.sourceDir);
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function decodeEntities(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " "
  };

  return String(value).replace(
    /&(#x?[0-9a-f]+|[a-z]+);/gi,
    (match, entity) => {
      if (entity[0] === "#") {
        const isHex = entity[1] === "x" || entity[1] === "X";
        const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
        if (!Number.isNaN(code)) return String.fromCodePoint(code);
        return match;
      }
      return named[entity.toLowerCase()] ?? match;
    }
  );
}

export function stripTags(value) {
  return decodeEntities(
    String(value)
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

export function normalizeWhitespace(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

export function extractArticleParts(sourceHtml, headerEnd) {
  const articleStart = sourceHtml.indexOf("<article");
  if (articleStart === -1) {
    throw new Error("Could not find an <article> element.");
  }

  const innerStart = sourceHtml.indexOf(">", articleStart) + 1;
  const articleEnd = sourceHtml.indexOf("</article>", innerStart);
  if (articleEnd === -1) {
    throw new Error("Could not find the closing </article> element.");
  }

  if (headerEnd !== "</header>" && headerEnd !== "first-figure") {
    throw new Error(
      'headerEnd must be either "</header>" or "first-figure".'
    );
  }

  const marker = headerEnd === "first-figure" ? "</figure>" : "</header>";
  const markerStart = sourceHtml.indexOf(marker, innerStart);
  if (markerStart === -1 || markerStart > articleEnd) {
    throw new Error(`Could not find the header marker ${marker}.`);
  }

  const headerEndIndex = markerStart + marker.length;
  return {
    header: sourceHtml.slice(innerStart, headerEndIndex).trim(),
    body: sourceHtml.slice(headerEndIndex, articleEnd).trim()
  };
}

export function extractHeaderContent(header) {
  const eyebrowMatch = header.match(
    /<([a-z0-9]+)\b[^>]*class="[^"]*\beyebrow\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/i
  );
  const h1Match = header.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);

  let dek = "";
  let byline = "";

  if (h1Match) {
    const h1End = header.indexOf("</h1>", h1Match.index) + 5;
    const paragraphs = [
      ...header.slice(h1End).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)
    ].map((match) => match[1].trim());
    dek = paragraphs[0] ?? "";
    byline = paragraphs[1] ?? "";
  }

  return {
    eyebrow: eyebrowMatch ? eyebrowMatch[2].trim() : "",
    h1: h1Match ? h1Match[1].trim() : "",
    dek,
    byline
  };
}

export function rewriteArticleBody(body, article) {
  const folder = sourceFolderName(article);
  const assetBase = `/assets/blog/${folder}/assets/`;
  const fileBase = `/assets/blog/${folder}/`;
  let output = body;

  output = output.replace(
    /(\b(?:src|poster|href))="assets\//g,
    `$1="${assetBase}`
  );
  output = output.replace(
    /(\b(?:src|poster|href))='assets\//g,
    `$1='${assetBase}`
  );
  output = output.replace(
    /(\b(?:src|poster|href))="\.\/assets\//g,
    `$1="${assetBase}`
  );

  output = output.replace(
    /(\bhref)="(?:\.\/)?([^"#?/]+\.(?:csv|zip|pdf|mp4|jpg|jpeg|png|webp|gif))"/gi,
    (match, attr, file) => {
      const diskPath = path.join(ROOT, article.sourceDir, file);
      return fs.existsSync(diskPath)
        ? `${attr}="${fileBase}${file}"`
        : match;
    }
  );

  output = output.replace(
    /(?:https?:\/\/www\.pixle\.pro)?\/blog\/(ai-animated-youtube-series|consistent-ai-characters|recurring-animated-characters|script-to-animated-video)\/?(?=["'#?]|$)/g,
    (match, slug) => `/blog/${BLOG_SLUG_MAP[slug]}/`
  );
  output = output.replaceAll(
    "https://www.pixle.pro/blog/",
    "/blog/"
  );
  output = output.replaceAll("http://www.pixle.pro/blog/", "/blog/");

  output = output.replace(
    /<a\b(?![^>]*\bdata-blog-cta\b)([^>]*\bhref="https?:\/\/app\.pixle\.pro[^"]*"[^>]*)>/gi,
    (match, attrs) => `<a${attrs} data-blog-cta="article_inline">`
  );

  output = output.replace(
    /<img\b(?![^>]*\bloading=)(?![^>]*\bfetchpriority="high")([^>]*)>/gi,
    (match, attrs) => `<img loading="lazy"${attrs}>`
  );

  return output.trim();
}

export function extractToc(body) {
  const toc = [];
  const seen = new Set();
  const headingPattern = /<h2\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/gi;
  let match;

  while ((match = headingPattern.exec(body)) !== null) {
    const id = match[1];
    const text = normalizeWhitespace(stripTags(match[2]));
    if (id && text && !seen.has(id)) {
      seen.add(id);
      toc.push({ id, text });
    }
  }

  return toc;
}

export function estimateReadingTime(body) {
  const text = normalizeWhitespace(stripTags(body));
  const words = text ? text.split(" ").filter(Boolean).length : 0;
  return Math.max(1, Math.ceil(words / 225));
}

export function formatDate(isoDate) {
  if (!isoDate) return "";
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${isoDate}`);
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

export function absoluteUrl(value) {
  if (/^https?:\/\//i.test(value)) return value;
  return `${SITE_URL}${value.startsWith("/") ? value : `/${value}`}`;
}

export function jsonLdScript(value) {
  return `<script type="application/ld+json">${JSON.stringify(value).replace(
    /</g,
    "\\u003c"
  )}</script>`;
}

export function extractChrome(indexHtml, isBlog) {
  const navStart = indexHtml.indexOf('<nav aria-label="Primary navigation">');
  const navEnd = indexHtml.indexOf("</nav>", navStart);
  if (navStart === -1 || navEnd === -1) {
    throw new Error("Could not find the primary navigation in index.html.");
  }

  const footerStart = indexHtml.lastIndexOf("<footer>");
  const footerEnd = indexHtml.indexOf("</footer>", footerStart);
  if (footerStart === -1 || footerEnd === -1) {
    throw new Error("Could not find the footer in index.html.");
  }

  let nav = indexHtml.slice(navStart, navEnd + 6);
  let footer = indexHtml.slice(footerStart, footerEnd + 9);

  nav = nav.replace(/href="#top"/g, 'href="/"');
  nav = nav.replace(/href="#([^"]+)"/g, 'href="/#$1"');
  nav = nav.replace(/src="\.\//g, 'src="/');
  nav = nav.replace(/href="\.\//g, 'href="/');

  footer = footer.replace(/src="\.\//g, 'src="/');
  footer = footer.replace(/href="\.\//g, 'href="/');

  if (isBlog) {
    nav = nav.replace(
      /https:\/\/app\.pixle\.pro\/signup(?:\?[^"]*)?/g,
      "https://app.pixle.pro/signup?utm_source=blog&amp;utm_medium=nav&amp;utm_campaign=signup"
    );
    nav = nav.replace('href="/blog/"', 'href="/blog/" aria-current="page"');
  }

  return { nav, footer };
}

export function formatTocList(toc, className = "") {
  const classAttr = className ? ` class="${className}"` : "";
  const items = toc
    .map((item) => `<li><a href="#${escapeHtml(item.id)}">${escapeHtml(item.text)}</a></li>`)
    .join("\n");
  return `<ol${classAttr}>\n${items}\n</ol>`;
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}
