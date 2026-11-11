# Pixle Blog Publishing Guide

This site is a static GitHub Pages site. The blog is generated from the article HTML files in `assets/blog/` plus a central registry at `blog/articles.json`. Generated pages are committed and served directly by GitHub Pages, so no server or build service is required at runtime.

## URLs

| Source folder | Public URL |
|---|---|
| `assets/blog/pixle-blog-animated-youtube-series/` | `/blog/animated-youtube-series/` |
| `assets/blog/pixle-blog-consistent-characters/` | `/blog/consistent-characters/` |
| `assets/blog/pixle-blog-recurring-animated-characters/` | `/blog/recurring-animated-characters/` |
| `assets/blog/pixle-blog-script-to-animated-video/` | `/blog/script-to-animated-video/` |
| Blog index | `/blog/` |

Canonical host: `https://www.pixle.pro`.

## Commands

```bash
node blog/build.mjs
node blog/validate.mjs
python3 -m http.server 8000
```

Then open:

- http://localhost:8000/blog/
- http://localhost:8000/blog/animated-youtube-series/
- http://localhost:8000/blog/consistent-characters/
- http://localhost:8000/blog/recurring-animated-characters/
- http://localhost:8000/blog/script-to-animated-video/

Always serve from the repository root. The pages use root-relative paths such as `/assets/...` and `/blog/blog.css`, so opening the HTML files directly from the filesystem will not load assets correctly.

Node 18 or newer is required. There are no npm dependencies and no `npm install` step.

## How the system works

`blog/build.mjs`:

1. Reads `blog/articles.json`.
2. Reads each article's source `index.html`.
3. Extracts the article header (eyebrow, `<h1>`, deck, byline, hero) and body.
4. Preserves the body HTML and rewrites only asset paths and known internal blog URLs.
5. Generates a table of contents from `<h2 id="...">` headings.
6. Calculates reading time from the actual body text.
7. Generates the blog listing, article pages, sitemap and robots file.
8. Reuses the primary navigation and footer from the site's root `index.html`.
9. Removes generated folders for articles no longer present in the registry.

Do not edit generated `blog/index.html` or `blog/<slug>/index.html` files by hand. Edit the source article, the registry, or the templates/build script, then rebuild.

## Required source article structure

The generator expects the source article to contain:

- An `<article>` element.
- An eyebrow element with `class="eyebrow"` near the top.
- One `<h1>`.
- A deck paragraph immediately after the `<h1>`.
- A byline paragraph immediately after the deck.
- A hero image or hero figure.
- The body content after the hero.

Two header modes are supported through the `headerEnd` registry field:

| `headerEnd` | Use when |
|---|---|
| `</header>` | The title/deck/byline/hero are wrapped in a `<header>` element. |
| `first-figure` | The article starts with an eyebrow, `<h1>`, deck, byline and hero `<figure>`, without a `<header>` element. |

The build extracts the eyebrow, title, first two paragraphs and body. The title in the registry must match the source `<h1>` text exactly apart from surrounding whitespace.

## Add a fifth article

### 1. Create the source folder

Add the article package under `assets/blog/`:

```text
assets/blog/pixle-blog-my-new-article/
  index.html
  assets/
    hero.jpg
    screenshot.jpg
  my-download.csv
```

Keep assets inside the article folder and reference them with relative paths in the source article, for example:

```html
<img src="assets/hero.jpg" alt="Description of the image" width="1536" height="1024">
<a href="my-download.csv">Download the worksheet</a>
```

The build rewrites these to `/assets/blog/pixle-blog-my-new-article/...`.

### 2. Follow the content structure

Use an existing article as a template. Each table-of-contents section must have a unique ID:

```html
<h2 id="choose-a-format">Choose a format</h2>
```

Images should include `alt`, `width` and `height`. Below-the-fold images should use `loading="lazy"`. Videos should include a poster and a `<source>`.

### 3. Add a registry entry

Edit `blog/articles.json` and add an entry. Example:

```json
{
  "slug": "my-new-article",
  "sourceDir": "assets/blog/pixle-blog-my-new-article",
  "sourceIndex": "index.html",
  "headerEnd": "</header>",
  "order": 5,
  "title": "The exact source H1 text",
  "seoTitle": "The unique browser title | Pixle",
  "description": "The supplied meta description. Do not invent one.",
  "category": "Supplied category",
  "author": "Pixle Team",
  "publishedAt": null,
  "updatedAt": null,
  "featuredImage": "/assets/blog/pixle-blog-my-new-article/assets/hero.jpg",
  "featuredImageAlt": "Description of the featured image",
  "featuredImageWidth": 1536,
  "featuredImageHeight": 1024,
  "draft": true,
  "canonicalUrl": "https://www.pixle.pro/blog/my-new-article/"
}
```

### 4. Set the draft state

- `"draft": true`: generates a preview page at the normal URL with `noindex,nofollow`, excludes it from the blog listing, related-article sections and sitemap.
- `"draft": false`: publishes the page, lists it, links it from related sections and adds it to the sitemap.

Start with `true`, preview the article, then switch to `false` and rebuild.

If you remove an article entirely, delete its registry entry and source folder, then rebuild. The build removes generated folders that are no longer in the registry.

### 5. Set dates

Use ISO `YYYY-MM-DD` values:

```json
"publishedAt": "2026-11-12",
"updatedAt": null
```

Leave a value as `null` if it was not supplied. Do not invent dates.

If the supplied article byline also contains a date, keep the byline and the registry date in sync.

### 6. Build and validate

```bash
node blog/build.mjs
node blog/validate.mjs
```

The build prints generated pages, reading times, draft pages and any media warnings. The validator checks:

- All expected pages exist.
- Titles, descriptions and canonical URLs are present and unique.
- Open Graph and Twitter metadata exist.
- `BlogPosting`, `BreadcrumbList` and blog-index JSON-LD parse.
- TOC links resolve to heading IDs.
- Local links and asset paths resolve.
- Images have alt text and dimensions.
- Videos have posters and sources.
- GA4 is initialised once per page.
- Published pages are indexable and drafts are `noindex`.
- Drafts are absent from the sitemap and blog index.
- Sitemap URLs are absolute and match canonical URLs.
- `robots.txt` allows the blog.
- Article body text matches the supplied source body.

### 7. Preview locally

```bash
python3 -m http.server 8000
```

Check the new page at `http://localhost:8000/blog/my-new-article/`.

### 8. Publish

Commit and push:

- the source folder under `assets/blog/`
- `blog/articles.json`
- the generated `blog/` pages
- `sitemap.xml`
- `robots.txt`

GitHub Pages serves the committed static files. There is no separate build step in the deployment pipeline.

## Draft behaviour

A draft page is accessible at its normal URL for preview but is not published:

- `<meta name="robots" content="noindex,nofollow">`
- a visible draft banner
- excluded from `/blog/`
- excluded from related-article sections
- excluded from `sitemap.xml`
- no `blog_article_view` GA4 event on the draft preview

## Sitemap and robots

The build regenerates both files at the repository root:

- `sitemap.xml` includes the homepage, `/blog/` and every published article.
- Drafts are excluded.
- `robots.txt` allows crawling and points to `https://www.pixle.pro/sitemap.xml`.

## Internal links

Use the final public URLs in new content:

```html
<a href="/blog/consistent-characters/">Create Consistent AI Characters</a>
```

The build also rewrites the older slugs used by the supplied packages:

| Older supplied slug | Public URL |
|---|---|
| `/blog/ai-animated-youtube-series` | `/blog/animated-youtube-series/` |
| `/blog/consistent-ai-characters` | `/blog/consistent-characters/` |
| `/blog/recurring-animated-characters` | `/blog/recurring-animated-characters/` |
| `/blog/script-to-animated-video` | `/blog/script-to-animated-video/` |

## GA4 events

The existing `G-VW2S0SK06N` measurement ID is reused. GA4 is initialised once per page.

Blog events implemented in `blog/blog.js`:

| Event | Parameters |
|---|---|
| `blog_article_view` | `article_slug`, `article_title` |
| `blog_cta_click` | `article_slug`, `article_title`, `cta_location`, `destination` |
| `blog_related_article_click` | `article_slug`, `article_title`, `cta_location`, `destination` |

CTA tracking is applied to:

- template CTA buttons
- `app.pixle.pro` links inside article content
- related-article cards

The existing navigation and footer signup links continue to use the site's `signup_cta_click` event.

Homepage signup links carry:

```text
utm_source=website&utm_medium=homepage&utm_campaign=signup&utm_content=<location>
```

Blog navigation signup links carry:

```text
utm_source=blog&utm_medium=nav&utm_campaign=signup
```

Verify events in GA4 DebugView or Realtime while previewing the site. This guide cannot confirm that events were received by Google.

## Visual and layout notes

- The blog index and page chrome use the existing dark Pixle palette.
- Article pages use a light editorial reading card.
- Desktop article layout uses a sticky table of contents.
- Mobile article layout uses a collapsible table of contents.
- Wide tables scroll horizontally inside their container.
- The navigation and footer are extracted from the root `index.html`. Rebuild after changing the site header or footer.

## Files

| File | Purpose |
|---|---|
| `blog/articles.json` | Article registry and metadata |
| `blog/build.mjs` | Static page, sitemap and robots generator |
| `blog/lib.mjs` | Shared extraction and rewriting helpers |
| `blog/validate.mjs` | Validation checks |
| `blog/blog.css` | Blog index, article and shared chrome styles |
| `blog/blog.js` | GA4 blog events |
| `blog/index.html` | Generated blog homepage |
| `blog/<slug>/index.html` | Generated article pages |
| `sitemap.xml` | Generated root sitemap |
| `robots.txt` | Generated root robots file |

## Troubleshooting

**The build says the registry title does not match the source H1.**
Update `title` in `blog/articles.json` to match the source `<h1>` text exactly.

**A source asset is missing.**
Check that the file exists in the article's `assets/` folder or article folder, and that the reference uses a relative path.

**The table of contents is empty or incomplete.**
Add unique `id` attributes to the article's `<h2>` headings.

**A local link is broken.**
Run `node blog/validate.mjs`. It reports the page and the missing path.

**An old link still points to a supplied slug.**
Use the public URL in new content, or add the mapping to `BLOG_SLUG_MAP` in `blog/lib.mjs` and rebuild.

**The header or footer changed.**
The blog pages copy the header and footer from the root `index.html` at build time. Rebuild the blog.
