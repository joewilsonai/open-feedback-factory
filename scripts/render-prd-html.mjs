import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const inputPath = resolve(root, "docs/feedback-to-feature-platform-prd.md");
const outputPath = resolve(root, "docs/feedback-to-feature-platform-prd.html");

const source = readFileSync(inputPath, "utf8");
const contentSource = source.replace(
  /^# [^\n]+\n\n(?:(?:\*\*[^:\n]+:\*\*.*\n)+)\n---\n\n/,
  "",
);

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function inlineMarkdown(value) {
  let html = escapeHtml(value);

  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    const safeHref = escapeHtml(href);
    return `<a href="${safeHref}">${text}</a>`;
  });

  return html;
}

function parseMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  const toc = [];
  const usedIds = new Map();

  let inCode = false;
  let codeLanguage = "";
  let codeLines = [];
  let paragraph = [];
  let listType = null;
  let skippedFirstH1 = false;

  function uniqueId(text) {
    const base = slugify(text) || "section";
    const count = usedIds.get(base) || 0;
    usedIds.set(base, count + 1);
    return count ? `${base}-${count + 1}` : base;
  }

  function closeParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function closeList() {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  }

  function closeCode() {
    const languageClass = codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : "";
    html.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
    codeLanguage = "";
    inCode = false;
  }

  for (const line of lines) {
    const fence = line.match(/^```([^`]*)\s*$/);

    if (fence) {
      if (inCode) {
        closeCode();
      } else {
        closeParagraph();
        closeList();
        inCode = true;
        codeLanguage = fence[1].trim();
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      closeParagraph();
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeParagraph();
      closeList();

      const level = heading[1].length;
      const text = heading[2].trim();

      if (level === 1 && !skippedFirstH1) {
        skippedFirstH1 = true;
        continue;
      }

      const id = uniqueId(text);
      if (level === 2 || level === 3) toc.push({ level, text, id });

      html.push(
        `<h${level} id="${id}"><a class="heading-anchor" href="#${id}" aria-label="Link to ${escapeHtml(
          text,
        )}">#</a>${inlineMarkdown(text)}</h${level}>`,
      );
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeParagraph();
      closeList();
      html.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      closeParagraph();
      const desiredType = unordered ? "ul" : "ol";
      if (listType && listType !== desiredType) closeList();
      if (!listType) {
        listType = desiredType;
        html.push(`<${listType}>`);
      }
      html.push(`<li>${inlineMarkdown((unordered || ordered)[1])}</li>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  closeParagraph();
  closeList();
  if (inCode) closeCode();

  return { body: html.join("\n"), toc };
}

function metadataValue(label) {
  const pattern = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, "m");
  return source.match(pattern)?.[1]?.trim() || "";
}

const { body, toc } = parseMarkdown(contentSource);
const coreLoopId = toc.find((item) => /core product loop/i.test(item.text))?.id || "main";

const tocHtml = toc
  .map(
    (item) =>
      `<a class="toc-link level-${item.level}" href="#${item.id}" data-for="${item.id}">${inlineMarkdown(
        item.text,
      )}</a>`,
  )
  .join("\n");

const product = metadataValue("Product") || "Open Feedback Factory";
const audience = metadataValue("Audience") || "Indie developers and small teams";
const category = metadataValue("Working category") || "Feedback-to-feature infrastructure";
const status = metadataValue("Status") || "Draft";
const distribution = metadataValue("Distribution thesis") || "Open-source first";

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(product)} PRD</title>
  <meta name="description" content="A polished HTML version of the Open Feedback Factory product requirements document.">
  <style>
    :root {
      --paper: #f4f5f1;
      --paper-strong: #ffffff;
      --ink: #171a1f;
      --muted: #5c6470;
      --line: #d9ddd5;
      --line-strong: #b8c0b1;
      --green: #0f6b4f;
      --blue: #255bc7;
      --coral: #c84f3b;
      --amber: #a36a00;
      --shadow: 0 18px 55px rgba(23, 26, 31, 0.12);
      --radius: 8px;
      --mono: "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", monospace;
      --sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --serif: Charter, "Bitstream Charter", "Iowan Old Style", "Palatino Linotype", serif;
    }

    * { box-sizing: border-box; }

    html {
      scroll-behavior: smooth;
      background: var(--paper);
      color: var(--ink);
    }

    body {
      margin: 0;
      font-family: var(--sans);
      line-height: 1.58;
      background:
        linear-gradient(90deg, rgba(23, 26, 31, 0.045) 1px, transparent 1px) 0 0 / 48px 48px,
        linear-gradient(0deg, rgba(23, 26, 31, 0.035) 1px, transparent 1px) 0 0 / 48px 48px,
        radial-gradient(circle at 18% 8%, rgba(37, 91, 199, 0.12), transparent 34rem),
        radial-gradient(circle at 84% 16%, rgba(15, 107, 79, 0.12), transparent 32rem),
        var(--paper);
    }

    a {
      color: inherit;
      text-decoration-color: rgba(37, 91, 199, 0.45);
      text-decoration-thickness: 1px;
      text-underline-offset: 0.18em;
    }

    a:hover { color: var(--blue); }

    .skip-link {
      position: absolute;
      left: 1rem;
      top: -5rem;
      z-index: 20;
      padding: 0.75rem 1rem;
      background: var(--ink);
      color: white;
      border-radius: var(--radius);
    }

    .skip-link:focus { top: 1rem; }

    .progress {
      position: fixed;
      inset: 0 0 auto;
      height: 4px;
      z-index: 30;
      background: linear-gradient(90deg, var(--green), var(--blue), var(--coral));
      transform-origin: left;
      transform: scaleX(0);
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: center;
      max-width: 1220px;
      margin: 0 auto;
      padding: 1.25rem clamp(1rem, 3vw, 2rem);
      color: var(--muted);
      font-size: 0.85rem;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 0.65rem;
      color: var(--ink);
      font-weight: 750;
      letter-spacing: 0;
    }

    .brand-mark {
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      border: 1px solid var(--ink);
      border-radius: 7px;
      background: linear-gradient(135deg, var(--ink) 0 49%, var(--paper-strong) 50% 100%);
      box-shadow: 4px 4px 0 rgba(23, 26, 31, 0.14);
    }

    .top-links {
      display: flex;
      gap: 1rem;
      align-items: center;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .hero {
      max-width: 1220px;
      margin: 0 auto;
      padding: clamp(2rem, 6vw, 5.5rem) clamp(1rem, 3vw, 2rem) 3rem;
    }

    .hero-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
      gap: clamp(1.5rem, 4vw, 4rem);
      align-items: end;
    }

    .eyebrow,
    .kicker {
      margin: 0 0 0.85rem;
      font-family: var(--mono);
      font-size: 0.77rem;
      color: var(--green);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 800;
    }

    h1 {
      margin: 0;
      max-width: 11ch;
      font-family: var(--serif);
      font-size: clamp(3.8rem, 10vw, 8.75rem);
      line-height: 0.86;
      letter-spacing: 0;
    }

    .hero-copy {
      max-width: 820px;
    }

    .lede {
      max-width: 66ch;
      margin: 1.5rem 0 0;
      color: #303640;
      font-size: clamp(1.08rem, 2vw, 1.34rem);
    }

    .hero-actions {
      display: flex;
      gap: 0.85rem;
      flex-wrap: wrap;
      margin-top: 1.65rem;
    }

    .button {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      padding: 0.78rem 1rem;
      border: 1px solid var(--ink);
      border-radius: 7px;
      background: var(--ink);
      color: white;
      font-weight: 760;
      text-decoration: none;
      box-shadow: 5px 5px 0 rgba(23, 26, 31, 0.16);
      transition: transform 180ms ease, box-shadow 180ms ease;
    }

    .button.secondary {
      background: var(--paper-strong);
      color: var(--ink);
    }

    .button:hover,
    .button:focus-visible {
      color: white;
      transform: translate(-2px, -2px);
      box-shadow: 7px 7px 0 rgba(23, 26, 31, 0.17);
    }

    .button.secondary:hover,
    .button.secondary:focus-visible { color: var(--ink); }

    .hero-panel {
      border: 1px solid var(--line-strong);
      border-radius: var(--radius);
      background: rgba(255, 255, 255, 0.74);
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .panel-row {
      display: grid;
      grid-template-columns: 8.5rem 1fr;
      gap: 1rem;
      padding: 1rem 1.1rem;
      border-bottom: 1px solid var(--line);
    }

    .panel-row:last-child { border-bottom: 0; }

    .panel-label {
      font-family: var(--mono);
      color: var(--muted);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .panel-value {
      font-weight: 720;
    }

    .summary-band {
      border-block: 1px solid var(--line-strong);
      background: rgba(255, 255, 255, 0.46);
    }

    .summary-grid {
      max-width: 1220px;
      margin: 0 auto;
      padding: 1.2rem clamp(1rem, 3vw, 2rem);
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1px;
      background: var(--line-strong);
      border-inline: 1px solid var(--line-strong);
    }

    .summary-item {
      min-height: 11rem;
      padding: 1.15rem;
      background: var(--paper-strong);
    }

    .summary-number {
      font-family: var(--mono);
      color: var(--blue);
      font-size: 0.78rem;
      font-weight: 850;
    }

    .summary-title {
      margin: 1rem 0 0.35rem;
      font-weight: 820;
      font-size: 1.05rem;
    }

    .summary-text {
      margin: 0;
      color: var(--muted);
      font-size: 0.94rem;
    }

    .layout {
      max-width: 1220px;
      margin: 0 auto;
      padding: 3rem clamp(1rem, 3vw, 2rem) 5rem;
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
      gap: clamp(2rem, 4vw, 4.5rem);
      align-items: start;
    }

    .toc {
      position: sticky;
      top: 1.4rem;
      max-height: calc(100vh - 2.8rem);
      overflow: auto;
      padding: 1rem;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: rgba(244, 245, 241, 0.82);
      backdrop-filter: blur(16px);
    }

    .toc-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin: 0 0 0.75rem;
      font-family: var(--mono);
      font-size: 0.78rem;
      font-weight: 850;
      color: var(--green);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .toc-link {
      display: block;
      padding: 0.45rem 0.55rem;
      border-left: 3px solid transparent;
      border-radius: 0 6px 6px 0;
      color: var(--muted);
      font-size: 0.88rem;
      text-decoration: none;
      line-height: 1.25;
    }

    .toc-link.level-3 {
      padding-left: 1.15rem;
      font-size: 0.8rem;
    }

    .toc-link:hover,
    .toc-link.active {
      background: rgba(37, 91, 199, 0.08);
      border-left-color: var(--blue);
      color: var(--ink);
    }

    .content {
      min-width: 0;
    }

    .doc-intro {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(220px, 0.42fr);
      gap: 1rem;
      margin-bottom: 2.2rem;
      align-items: stretch;
    }

    .intro-statement,
    .intro-note {
      padding: 1.25rem;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: rgba(255, 255, 255, 0.62);
    }

    .intro-statement p,
    .intro-note p {
      margin: 0;
      color: #333942;
    }

    .intro-note {
      background:
        repeating-linear-gradient(-45deg, rgba(15, 107, 79, 0.075), rgba(15, 107, 79, 0.075) 1px, transparent 1px, transparent 8px),
        rgba(255, 255, 255, 0.72);
    }

    .prd-body {
      background: rgba(255, 255, 255, 0.78);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: clamp(1.25rem, 4vw, 3.25rem);
    }

    .prd-body h2,
    .prd-body h3,
    .prd-body h4 {
      position: relative;
      scroll-margin-top: 1.5rem;
      letter-spacing: 0;
    }

    .prd-body h2 {
      margin: 3.5rem 0 1rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--line-strong);
      font-family: var(--serif);
      font-size: clamp(2rem, 4vw, 3.05rem);
      line-height: 1.02;
    }

    .prd-body h2:first-child {
      margin-top: 0;
      border-top: 0;
      padding-top: 0;
    }

    .prd-body h3 {
      margin: 2.2rem 0 0.75rem;
      color: var(--green);
      font-size: clamp(1.25rem, 2vw, 1.55rem);
    }

    .prd-body h4 {
      margin: 1.5rem 0 0.5rem;
      color: var(--coral);
      font-size: 1.02rem;
      text-transform: uppercase;
      font-family: var(--mono);
      letter-spacing: 0.06em;
    }

    .heading-anchor {
      position: absolute;
      left: -1.45rem;
      color: var(--blue);
      opacity: 0;
      text-decoration: none;
      font-family: var(--mono);
      font-size: 1rem;
    }

    .prd-body h2:hover .heading-anchor,
    .prd-body h3:hover .heading-anchor,
    .prd-body h4:hover .heading-anchor,
    .heading-anchor:focus-visible {
      opacity: 1;
    }

    .prd-body p {
      max-width: 76ch;
      color: #2d333d;
      margin: 0.72rem 0;
    }

    .prd-body ul,
    .prd-body ol {
      max-width: 78ch;
      padding-left: 1.3rem;
      margin: 0.8rem 0 1rem;
    }

    .prd-body li {
      margin: 0.34rem 0;
      color: #2d333d;
    }

    .prd-body li::marker {
      color: var(--green);
      font-weight: 800;
    }

    .prd-body blockquote {
      max-width: 70ch;
      margin: 1.4rem 0;
      padding: 1rem 1.2rem;
      border-left: 5px solid var(--coral);
      background: rgba(200, 79, 59, 0.08);
      border-radius: 0 var(--radius) var(--radius) 0;
      font-family: var(--serif);
      font-size: 1.2rem;
      line-height: 1.45;
    }

    code {
      font-family: var(--mono);
      font-size: 0.88em;
      background: rgba(37, 91, 199, 0.09);
      color: #183b82;
      padding: 0.1rem 0.3rem;
      border-radius: 5px;
    }

    pre {
      max-width: 100%;
      margin: 1.3rem 0;
      padding: 1rem;
      overflow: auto;
      border: 1px solid #252b34;
      border-radius: var(--radius);
      background:
        linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px) 0 0 / 34px 34px,
        #11161d;
      color: #f4f5f1;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
    }

    pre code {
      display: block;
      padding: 0;
      background: transparent;
      color: inherit;
      font-size: 0.86rem;
      line-height: 1.55;
    }

    .footer {
      max-width: 1220px;
      margin: 0 auto;
      padding: 2rem clamp(1rem, 3vw, 2rem) 4rem;
      color: var(--muted);
      font-size: 0.9rem;
    }

    .footer a { color: var(--blue); }

    :focus-visible {
      outline: 3px solid rgba(37, 91, 199, 0.36);
      outline-offset: 3px;
    }

    @media (max-width: 980px) {
      .hero-grid,
      .layout,
      .doc-intro {
        grid-template-columns: 1fr;
      }

      .toc {
        position: relative;
        top: 0;
        max-height: none;
      }

      .summary-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .heading-anchor {
        position: static;
        opacity: 1;
        margin-right: 0.45rem;
      }
    }

    @media (max-width: 620px) {
      .topbar {
        align-items: flex-start;
        flex-direction: column;
      }

      .summary-grid {
        grid-template-columns: 1fr;
      }

      .panel-row {
        grid-template-columns: 1fr;
        gap: 0.25rem;
      }

      .prd-body {
        padding: 1rem;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        scroll-behavior: auto !important;
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
      }
    }

    @media print {
      body { background: white; }
      .topbar,
      .hero-actions,
      .summary-band,
      .toc,
      .progress { display: none; }
      .hero,
      .layout,
      .footer {
        max-width: none;
        padding: 0;
      }
      .hero-grid,
      .layout,
      .doc-intro { display: block; }
      .hero-panel,
      .prd-body,
      .intro-statement,
      .intro-note {
        box-shadow: none;
        border-color: #bbb;
      }
      .prd-body h2 { break-after: avoid; }
      pre { white-space: pre-wrap; }
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to PRD</a>
  <div class="progress" aria-hidden="true"></div>

  <header>
    <div class="topbar" aria-label="Document header">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <span>${escapeHtml(product)}</span>
      </div>
      <div class="top-links">
        <a href="./feedback-to-feature-platform-prd.md">Markdown source</a>
        <a href="./superpowers/specs/2026-06-19-open-feedback-factory-v1-design.md">V1 design</a>
      </div>
    </div>

    <section class="hero" aria-labelledby="page-title">
      <div class="hero-grid">
        <div class="hero-copy">
          <p class="eyebrow">Product Requirements Document</p>
          <h1 id="page-title">Open Feedback Factory</h1>
          <p class="lede">
            A feedback-to-feature control plane for turning user requests into
            safe GitHub issues, agent work, cost records, shipped outcomes, and
            usage-backed product learning.
          </p>
          <div class="hero-actions">
            <a class="button" href="#main">Read the PRD</a>
            <a class="button secondary" href="#${coreLoopId}">Jump to loop</a>
          </div>
        </div>

        <aside class="hero-panel" aria-label="Document metadata">
          <div class="panel-row">
            <div class="panel-label">Category</div>
            <div class="panel-value">${inlineMarkdown(category)}</div>
          </div>
          <div class="panel-row">
            <div class="panel-label">Audience</div>
            <div class="panel-value">${inlineMarkdown(audience)}</div>
          </div>
          <div class="panel-row">
            <div class="panel-label">Status</div>
            <div class="panel-value">${inlineMarkdown(status)}</div>
          </div>
          <div class="panel-row">
            <div class="panel-label">Distribution</div>
            <div class="panel-value">${inlineMarkdown(distribution)}</div>
          </div>
        </aside>
      </div>
    </section>
  </header>

  <section class="summary-band" aria-label="V1 anchors">
    <div class="summary-grid">
      <article class="summary-item">
        <div class="summary-number">01</div>
        <h2 class="summary-title">User feedback becomes work</h2>
        <p class="summary-text">Signals are sanitized, clustered, routed, and either built or answered honestly.</p>
      </article>
      <article class="summary-item">
        <div class="summary-number">02</div>
        <h2 class="summary-title">Agents work inside policy</h2>
        <p class="summary-text">Codex runs on sanitized context with cost caps, protected paths, and review gates.</p>
      </article>
      <article class="summary-item">
        <div class="summary-number">03</div>
        <h2 class="summary-title">Safe changes can ship</h2>
        <p class="summary-text">Auto-merge exists only for narrow, explicitly enabled, low-risk work.</p>
      </article>
      <article class="summary-item">
        <div class="summary-number">04</div>
        <h2 class="summary-title">Usage closes the loop</h2>
        <p class="summary-text">The system tracks whether shipped features actually get used.</p>
      </article>
    </div>
  </section>

  <div class="layout">
    <aside class="toc" aria-label="Table of contents">
      <p class="toc-title">Contents <span>${toc.length}</span></p>
      ${tocHtml}
    </aside>

    <main id="main" class="content" tabindex="-1">
      <section class="doc-intro" aria-label="Document framing">
        <div class="intro-statement">
          <p><strong>Read this as the product spine.</strong> The PRD below is intentionally expansive: it captures the full product vision before V1 is reduced into implementation slices.</p>
        </div>
        <div class="intro-note">
          <p><strong>V1 posture:</strong> internal dogfood first, standalone open-source architecture, no HeyTelli coupling.</p>
        </div>
      </section>

      <article class="prd-body">
        ${body}
      </article>
    </main>
  </div>

  <footer class="footer">
    Generated from <a href="./feedback-to-feature-platform-prd.md">docs/feedback-to-feature-platform-prd.md</a>.
  </footer>

  <script>
    const progress = document.querySelector(".progress");
    const tocLinks = [...document.querySelectorAll(".toc-link")];
    const headings = tocLinks
      .map((link) => document.getElementById(link.dataset.for))
      .filter(Boolean);

    function updateProgress() {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = docHeight > 0 ? scrollTop / docHeight : 0;
      progress.style.transform = "scaleX(" + Math.min(1, Math.max(0, ratio)) + ")";
    }

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

      if (!visible) return;
      tocLinks.forEach((link) => {
        link.classList.toggle("active", link.dataset.for === visible.target.id);
      });
    }, { rootMargin: "-15% 0px -70% 0px", threshold: [0, 1] });

    headings.forEach((heading) => observer.observe(heading));
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
  </script>
</body>
</html>
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, html);
console.log(`Rendered ${outputPath}`);
