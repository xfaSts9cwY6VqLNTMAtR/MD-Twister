/* MD Twister — client-side Markdown viewer with switchable styles.
   No backend: file reading, rendering and sanitizing all happen locally. */

(function () {
  "use strict";

  const THEMES = [
    { id: "github",        name: "GitHub Light" },
    { id: "github-dark",   name: "GitHub Dark" },
    { id: "raw",           name: "Raw Markdown" },
    { id: "sepia",         name: "Sepia / Book" },
    { id: "academic",      name: "Academic" },
    { id: "solarized",     name: "Solarized" },
    { id: "terminal",      name: "Terminal" },
    { id: "newspaper",     name: "Newspaper" },
    { id: "dracula",       name: "Dracula" },
  ];

  const STORAGE_KEY = "md-twister:theme";

  const $ = (sel) => document.querySelector(sel);
  const preview = $("#preview");
  const themeSelect = $("#theme-select");
  const fileInput = $("#file-input");
  const dropZone = $("#drop-zone");

  // ---- Markdown rendering ----
  marked.setOptions({ gfm: true, breaks: false });

  // Last loaded source, kept so we can re-display when the style changes
  // (e.g. switching to/from the "Raw Markdown" view).
  let currentMarkdown = "";

  function render(markdown) {
    currentMarkdown = markdown || "";
    display();
    dropZone.scrollTo({ top: 0 });
  }

  function display() {
    if (document.body.getAttribute("data-theme") === "raw") {
      // Show the unrendered source verbatim. textContent escapes it safely.
      const pre = document.createElement("pre");
      pre.className = "raw-source";
      pre.textContent = currentMarkdown;
      preview.replaceChildren(pre);
    } else {
      const dirty = marked.parse(currentMarkdown);
      preview.innerHTML = DOMPurify.sanitize(dirty);
    }
    document.body.classList.toggle("has-content", currentMarkdown.trim().length > 0);
  }

  // ---- Theme handling ----
  function buildThemeOptions() {
    THEMES.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      themeSelect.appendChild(opt);
    });
  }

  function applyTheme(id) {
    const theme = THEMES.find((t) => t.id === id) ? id : THEMES[0].id;
    document.body.setAttribute("data-theme", theme);
    themeSelect.value = theme;
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
    display(); // re-render: rendered HTML vs. raw source depends on the theme
  }

  // ---- File loading ----
  function isMarkdownFile(file) {
    return /\.(md|markdown|mdown|mkd|txt)$/i.test(file.name) ||
      file.type === "text/markdown" || file.type === "text/plain";
  }

  function loadFile(file) {
    if (!file) return;
    if (!isMarkdownFile(file)) {
      alert("Please choose a Markdown (.md) or text file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => render(String(e.target.result));
    reader.onerror = () => alert("Sorry, that file could not be read.");
    reader.readAsText(file);
  }

  // ---- Wire up the UI ----
  buildThemeOptions();
  applyTheme((function () {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  })());

  themeSelect.addEventListener("change", (e) => applyTheme(e.target.value));

  $("#import-btn").addEventListener("click", () => fileInput.click());
  $("#empty-import").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => loadFile(e.target.files[0]));

  $("#sample-btn").addEventListener("click", () => render(SAMPLE));
  $("#empty-sample").addEventListener("click", () => render(SAMPLE));

  // Drag & drop
  ["dragenter", "dragover"].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      if (evt === "dragleave" && dropZone.contains(e.relatedTarget)) return;
      dropZone.classList.remove("dragover");
    })
  );
  dropZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    loadFile(file);
  });

  // Paste markdown text directly
  document.addEventListener("paste", (e) => {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (text && text.trim()) render(text);
  });

  // ---- Sample document ----
  const SAMPLE = [
    "# MD Twister 🌀",
    "",
    "A tiny, **zero-backend** Markdown viewer. Import a file, then *twist*",
    "between styles using the picker in the top-right.",
    "",
    "> Everything runs in your browser. Nothing is uploaded anywhere.",
    "",
    "## Features",
    "",
    "- 📂 Import `.md` files (button, drag & drop, or paste)",
    "- 🎨 Switch between several hand-made styles",
    "- 💾 Your style choice is remembered",
    "",
    "## A bit of everything",
    "",
    "Here is some `inline code`, a [link](https://example.com), and a list:",
    "",
    "1. First item",
    "2. Second item",
    "3. Third item",
    "",
    "```js",
    "function greet(name) {",
    "  return `Hello, ${name}!`;",
    "}",
    "console.log(greet('world'));",
    "```",
    "",
    "| Style | Vibe |",
    "| ----- | ---- |",
    "| GitHub | Familiar |",
    "| Terminal | Hacker |",
    "| Newspaper | Classic |",
    "",
    "---",
    "",
    "Made to get a demo online *fast*.",
  ].join("\n");

  render(""); // start on the empty state
})();
