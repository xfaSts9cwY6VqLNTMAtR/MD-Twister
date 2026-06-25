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
  function isPdfFile(file) {
    return /\.pdf$/i.test(file.name) || file.type === "application/pdf";
  }

  function loadFile(file) {
    if (!file) return;
    if (isPdfFile(file)) { loadPdf(file); return; }
    if (!isMarkdownFile(file)) {
      alert("Please choose a Markdown (.md), text, or PDF file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => render(String(e.target.result));
    reader.onerror = () => alert("Sorry, that file could not be read.");
    reader.readAsText(file);
  }

  // ---- PDF → Markdown (in-browser, via pdf.js) ----
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
  }

  async function loadPdf(file) {
    if (!window.pdfjsLib) { alert("PDF support failed to load."); return; }
    preview.innerHTML =
      '<p style="text-align:center;opacity:.7;margin-top:2rem">Converting PDF to Markdown…</p>';
    document.body.classList.add("has-content");
    try {
      const data = await file.arrayBuffer();
      const md = await pdfToMarkdown(data);
      if (!md.trim()) {
        alert("No selectable text found — this looks like a scanned/image PDF, which needs OCR (not supported here).");
        render("");
        return;
      }
      render(md);
    } catch (err) {
      alert("Could not convert that PDF: " + (err && err.message ? err.message : err));
      render("");
    }
  }

  // Reconstruct Markdown from a PDF's text layer using simple layout heuristics:
  // font size → heading level, vertical gaps → paragraph breaks, bullet/number
  // prefixes → lists. Works on text-based PDFs; scanned PDFs have no text layer.
  async function pdfToMarkdown(data) {
    const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;

    // Pass 1: collect lines per page.
    const pages = [];
    const allSizes = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const lines = groupItemsIntoLines(content.items);
      lines.forEach((l) => { if (l.text) allSizes.push(l.size); });
      pages.push(lines);
    }
    const bodySize = median(allSizes) || 12;

    // Pass 2: turn lines into Markdown blocks.
    const blocks = [];
    let paragraph = [];
    const flushPara = () => {
      if (paragraph.length) { blocks.push(dehyphenate(paragraph.join(" "))); paragraph = []; }
    };

    pages.forEach((lines) => {
      let prevY = null, prevSize = bodySize;
      lines.forEach((line) => {
        const text = line.text;
        if (!text) return;
        const ratio = line.size / bodySize;
        const level = ratio >= 1.8 ? 1 : ratio >= 1.45 ? 2 : ratio >= 1.18 ? 3 : 0;
        const isBullet = /^[•▪◦·*‣⁃\-–]\s+/.test(text);
        const isNumbered = /^\d+[.)]\s+/.test(text);
        const gap = prevY != null ? prevY - line.y : 0;

        if (level) {
          flushPara();
          blocks.push("#".repeat(level) + " " + text);
        } else if (isBullet || isNumbered) {
          flushPara();
          const item = isBullet
            ? text.replace(/^[•▪◦·*‣⁃\-–]\s+/, "- ")
            : text.replace(/^(\d+)[.)]\s+/, "$1. ");
          blocks.push(item);
        } else {
          if (gap > prevSize * 1.7) flushPara(); // big vertical gap → new paragraph
          paragraph.push(text);
        }
        prevY = line.y;
        prevSize = line.size;
      });
      flushPara(); // page boundary always ends a paragraph
    });
    flushPara();

    return blocks.join("\n\n");
  }

  // Group text items sharing a baseline into single lines (top→bottom, left→right).
  function groupItemsIntoLines(items) {
    const its = items
      .map((it) => ({
        x: it.transform[4],
        y: it.transform[5],
        w: it.width || 0,
        size: it.height || Math.abs(it.transform[3]) || 12,
        str: it.str || "",
      }))
      .filter((it) => it.str.length);
    its.sort((a, b) => b.y - a.y || a.x - b.x);

    const lines = [];
    let cur = null;
    for (const it of its) {
      if (cur && Math.abs(it.y - cur.y) <= Math.max(2, cur.size * 0.5)) {
        cur.parts.push(it);
        if (it.size > cur.size) cur.size = it.size;
      } else {
        if (cur) lines.push(finalizeLine(cur));
        cur = { y: it.y, size: it.size, parts: [it] };
      }
    }
    if (cur) lines.push(finalizeLine(cur));
    return lines;
  }

  function finalizeLine(cur) {
    cur.parts.sort((a, b) => a.x - b.x);
    let text = "";
    let prev = null;
    for (const p of cur.parts) {
      if (prev) {
        const gap = p.x - (prev.x + prev.w);
        if (gap > cur.size * 0.25 && !/\s$/.test(text) && !/^\s/.test(p.str)) text += " ";
      }
      text += p.str;
      prev = p;
    }
    return { text: text.replace(/\s+/g, " ").trim(), y: cur.y, size: cur.size };
  }

  function dehyphenate(s) {
    // join words split across line breaks: "Wirtschafts- prüfer" → "Wirtschaftsprüfer"
    return s.replace(/(\p{L})-\s+(\p{Ll})/gu, "$1$2");
  }

  function median(arr) {
    if (!arr.length) return 0;
    const a = arr.slice().sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
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

  // ---- "Load sample" dropdown ----
  const sampleBtn = $("#sample-btn");
  const sampleList = $("#sample-list");

  function loadSample(key) { render(SAMPLES[key] || SAMPLES.default); }

  function toggleSampleMenu(open) {
    const show = open === undefined ? sampleList.hidden : open;
    sampleList.hidden = !show;
    sampleBtn.setAttribute("aria-expanded", String(show));
  }

  sampleBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleSampleMenu(); });
  sampleList.querySelectorAll(".menu-item").forEach((item) =>
    item.addEventListener("click", () => {
      loadSample(item.dataset.sample);
      toggleSampleMenu(false);
    })
  );
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".sample-menu")) toggleSampleMenu(false);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") toggleSampleMenu(false); });

  // Empty-state shortcuts
  $("#empty-sample").addEventListener("click", () => loadSample("default"));
  $("#empty-sample-de").addEventListener("click", () => loadSample("pruefbericht"));

  // ---- Export PDF (generated in-browser; downloads a .pdf directly, so it
  // works even where the print dialog has no "Save as PDF" option). ----
  $("#pdf-btn").addEventListener("click", exportPDF);

  function exportPDF() {
    if (!currentMarkdown.trim()) {
      alert("Nothing to export yet — import a file or load a sample first.");
      return;
    }

    const theme = document.body.getAttribute("data-theme") || "github";
    const isRaw = theme === "raw";

    // Render into a .markdown-body inside the active theme so the PDF inherits
    // the currently selected style (fonts, colours, background).
    const sheet = document.createElement("div");
    sheet.className = "markdown-body pdf-export";
    let filename = "document";

    if (isRaw) {
      const pre = document.createElement("pre");
      pre.className = "raw-source";
      pre.textContent = currentMarkdown;
      sheet.appendChild(pre);
    } else {
      sheet.innerHTML = DOMPurify.sanitize(marked.parse(currentMarkdown));
      const heading = sheet.querySelector("h1, h2");
      if (heading) {
        const slug = heading.textContent.trim()
          .replace(/[^\wÀ-ɏ .-]+/g, "")
          .replace(/\s+/g, "-")
          .slice(0, 60);
        if (slug) filename = slug;
      }
    }

    // A4 page proportions at ~96dpi; padding gives the document its margins so
    // the themed background fills the whole page edge-to-edge.
    const pageW = 794;
    const pageH = Math.round((pageW * 297) / 210);
    sheet.style.cssText =
      "width:" + pageW + "px;max-width:none;box-sizing:border-box;padding:54px 60px;margin:0;";

    // Match the page background to the theme's surface colour.
    const bg = getComputedStyle(dropZone).backgroundColor || "#ffffff";
    sheet.style.background = bg;

    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-10000px;top:0;";
    holder.appendChild(sheet);
    document.body.appendChild(holder);

    // Pad the sheet up to a whole number of pages so dark themes don't leave a
    // white gap at the bottom of the last page.
    const fullPages = Math.max(1, Math.ceil(sheet.scrollHeight / pageH));
    sheet.style.minHeight = fullPages * pageH + "px";

    const restore = sampleBtnBusy($("#pdf-btn"), "Exporting…");
    const cleanup = () => { holder.remove(); restore(); };

    html2pdf().set({
      margin: 0,
      filename: filename + ".pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: bg },
      jsPDF: { unit: "px", format: [pageW, pageH], orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    }).from(sheet).save().then(cleanup, cleanup);
  }

  // Briefly show a busy label on a button; returns a restore() fn.
  function sampleBtnBusy(btn, label) {
    const prev = btn.textContent;
    btn.textContent = label;
    btn.disabled = true;
    return () => { btn.textContent = prev; btn.disabled = false; };
  }

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

  // ---- Alternative sample: a German IDW-style audit report (fictional) ----
  // Structured after IDW PS 450 n.F. (Prüfungsbericht) with a Bestätigungs-
  // vermerk per IDW PS 400 n.F. All names and figures are invented.
  const SAMPLE_PRUEFBERICHT = `# Prüfungsbericht

## über die Prüfung des Jahresabschlusses zum 31. Dezember 2025 und des Lageberichts für das Geschäftsjahr 2025

**Muster Maschinenbau GmbH, Musterstadt**

> *Hinweis: Dies ist ein fiktives Musterdokument zur Veranschaulichung. Es handelt sich nicht um einen echten Prüfungsbericht. Sämtliche Namen, Zahlen und Sachverhalte sind frei erfunden.*

| | |
| --- | --- |
| **Mandant** | Muster Maschinenbau GmbH, Industriestraße 7, 12345 Musterstadt |
| **Abschlussprüfer** | Beispiel & Partner mbB Wirtschaftsprüfungsgesellschaft, Musterstadt |
| **Berichtsstandard** | IDW PS 450 n.F. |
| **Geschäftsjahr** | 1. Januar 2025 bis 31. Dezember 2025 |

---

## 1. Prüfungsauftrag

Die gesetzlichen Vertreter der **Muster Maschinenbau GmbH, Musterstadt** (nachfolgend „Gesellschaft") haben uns mit Beschluss der Gesellschafterversammlung vom 14. März 2025 zum Abschlussprüfer für das Geschäftsjahr 2025 bestellt und beauftragt, den Jahresabschluss unter Einbeziehung der Buchführung sowie den Lagebericht zu prüfen.

Dem Auftrag liegen die *Allgemeinen Auftragsbedingungen für Wirtschaftsprüfer und Wirtschaftsprüfungsgesellschaften* in der Fassung vom 1. Januar 2017 zugrunde. Die Verantwortlichkeit gegenüber Dritten richtet sich nach **Nr. 9 dieser Auftragsbedingungen**.

## 2. Grundsätzliche Feststellungen

### 2.1 Stellungnahme zur Beurteilung der Lage durch die gesetzlichen Vertreter

Die gesetzlichen Vertreter beurteilen die Lage der Gesellschaft im Lagebericht insgesamt zutreffend. Der Lagebericht steht in Einklang mit dem Jahresabschluss, vermittelt ein zutreffendes Bild von der Lage der Gesellschaft und stellt die Chancen und Risiken der künftigen Entwicklung zutreffend dar.

### 2.2 Feststellungen zur Unternehmensfortführung

Wir haben keine Sachverhalte festgestellt, die der Annahme der Fortführung der Unternehmenstätigkeit (*Going Concern*) entgegenstehen. Die Liquiditätslage ist nach unserer Beurteilung geordnet; die bestehenden Kreditlinien sind bis zum 30. Juni 2027 vertraglich zugesagt.

### 2.3 Feststellungen zu Unrichtigkeiten oder Verstößen

Im Rahmen unserer Prüfung haben wir **keine** Unrichtigkeiten oder Verstöße gegen gesetzliche Vorschriften oder den Gesellschaftsvertrag festgestellt, die für die Rechnungslegung von Bedeutung sind.

## 3. Gegenstand, Art und Umfang der Prüfung

Gegenstand unserer Prüfung waren der Jahresabschluss zum 31. Dezember 2025 — bestehend aus **Bilanz**, **Gewinn- und Verlustrechnung** sowie **Anhang** — unter Einbeziehung der Buchführung und der Lagebericht.

Wir haben unsere Prüfung nach **§ 317 HGB** unter Beachtung der vom Institut der Wirtschaftsprüfer (IDW) festgestellten deutschen Grundsätze ordnungsmäßiger Abschlussprüfung vorgenommen. Danach ist die Prüfung so zu planen und durchzuführen, dass Unrichtigkeiten und Verstöße, die sich auf die Darstellung des Bildes der Vermögens-, Finanz- und Ertragslage wesentlich auswirken, mit hinreichender Sicherheit erkannt werden.

Bei der Festlegung der Prüfungshandlungen wurden folgende Schwerpunkte gesetzt:

1. Werthaltigkeit der Vorräte und der Forderungen aus Lieferungen und Leistungen
2. Vollständigkeit und Bewertung der Rückstellungen
3. Periodengerechte Abgrenzung der Umsatzerlöse (Realisationsprinzip)
4. Ordnungsmäßigkeit des internen Kontrollsystems der Finanzbuchhaltung

## 4. Feststellungen und Erläuterungen zur Rechnungslegung

### 4.1 Ordnungsmäßigkeit der Rechnungslegung

Die Buchführung und die geprüften Unterlagen entsprechen nach unseren Feststellungen den gesetzlichen Vorschriften und den ergänzenden Bestimmungen des Gesellschaftsvertrags. Der Jahresabschluss ist aus der Buchführung ordnungsgemäß entwickelt.

### 4.2 Gesamtaussage des Jahresabschlusses

Der Jahresabschluss vermittelt unter Beachtung der Grundsätze ordnungsmäßiger Buchführung ein den tatsächlichen Verhältnissen entsprechendes Bild der Vermögens-, Finanz- und Ertragslage. Die wesentlichen Bilanzposten stellen sich verkürzt wie folgt dar:

| Aktiva | 31.12.2025 (T€) | 31.12.2024 (T€) |
| --- | ---: | ---: |
| Anlagevermögen | 18.420 | 17.110 |
| Vorräte | 9.860 | 8.940 |
| Forderungen aus L&L | 6.215 | 5.880 |
| Liquide Mittel | 3.540 | 2.970 |
| **Summe Aktiva** | **38.035** | **34.900** |

| Passiva | 31.12.2025 (T€) | 31.12.2024 (T€) |
| --- | ---: | ---: |
| Eigenkapital | 16.900 | 15.240 |
| Rückstellungen | 7.310 | 6.980 |
| Verbindlichkeiten | 13.825 | 12.680 |
| **Summe Passiva** | **38.035** | **34.900** |

Die Umsatzerlöse stiegen gegenüber dem Vorjahr um **8,7 %** auf 42,6 Mio. €; das Jahresergebnis nach Steuern beträgt 2,1 Mio. € (Vorjahr: 1,6 Mio. €).

## 5. Bestätigungsvermerk

Wir haben den Jahresabschluss geprüft und erteilen folgenden Bestätigungsvermerk:

### Prüfungsurteile

Nach unserer Beurteilung aufgrund der bei der Prüfung gewonnenen Erkenntnisse

- entspricht der beigefügte Jahresabschluss in allen wesentlichen Belangen den deutschen, für Kapitalgesellschaften geltenden handelsrechtlichen Vorschriften und vermittelt unter Beachtung der Grundsätze ordnungsmäßiger Buchführung ein den tatsächlichen Verhältnissen entsprechendes Bild der Vermögens-, Finanz- und Ertragslage der Gesellschaft zum 31. Dezember 2025;
- vermittelt der beigefügte Lagebericht insgesamt ein zutreffendes Bild von der Lage der Gesellschaft.

Gemäß **§ 322 Abs. 3 Satz 1 HGB** erklären wir, dass unsere Prüfung zu **keinen Einwendungen** gegen die Ordnungsmäßigkeit des Jahresabschlusses und des Lageberichts geführt hat.

### Grundlage für die Prüfungsurteile

Wir haben unsere Prüfung in Übereinstimmung mit § 317 HGB unter Beachtung der vom IDW festgestellten deutschen Grundsätze ordnungsmäßiger Abschlussprüfung durchgeführt. Wir sind von der Gesellschaft unabhängig und haben unsere sonstigen deutschen Berufspflichten in Übereinstimmung mit diesen Anforderungen erfüllt.

### Verantwortung der gesetzlichen Vertreter

Die gesetzlichen Vertreter sind verantwortlich für die Aufstellung des Jahresabschlusses und des Lageberichts sowie für die Vorkehrungen, die sie als notwendig erachtet haben, um die Aufstellung eines Jahresabschlusses zu ermöglichen, der frei von wesentlichen — beabsichtigten oder unbeabsichtigten — falschen Darstellungen ist.

### Verantwortung des Abschlussprüfers

Unsere Zielsetzung ist, hinreichende Sicherheit darüber zu erlangen, ob der Jahresabschluss als Ganzes frei von wesentlichen falschen Darstellungen ist, sowie einen Bestätigungsvermerk zu erteilen, der unsere Prüfungsurteile beinhaltet.

---

Musterstadt, den 12. April 2026

**Beispiel & Partner mbB**
Wirtschaftsprüfungsgesellschaft

| | |
| --- | --- |
| gez. *Dr. Erika Beispiel* | gez. *Hans Muster* |
| Wirtschaftsprüferin | Wirtschaftsprüfer |

---

### Anlagen

1. Jahresabschluss zum 31. Dezember 2025 (Bilanz, Gewinn- und Verlustrechnung, Anhang)
2. Lagebericht für das Geschäftsjahr 2025
3. Allgemeine Auftragsbedingungen für Wirtschaftsprüfer und Wirtschaftsprüfungsgesellschaften
`;

  // Samples loadable from the "Load sample" dropdown / empty-state links.
  const SAMPLES = { default: SAMPLE, pruefbericht: SAMPLE_PRUEFBERICHT };

  render(""); // start on the empty state
})();
