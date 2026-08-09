const form = document.getElementById("search-form");
const wordInput = document.getElementById("word");
const langSelect = document.getElementById("lang");
const submitBtn = document.getElementById("submit");
const statusBox = document.getElementById("status");
const resultBox = document.getElementById("result");
const recentBlock = document.getElementById("recent-block");
const recentBox = document.getElementById("recent");
const savedList = document.getElementById("saved-list");
const exportLink = document.getElementById("export");

let current = null;

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );

function setStatus(message, isError = false) {
  if (!message) {
    statusBox.hidden = true;
    return;
  }
  statusBox.hidden = false;
  statusBox.textContent = message;
  statusBox.classList.toggle("is-error", isError);
}

// --- Diller -----------------------------------------------------------------

async function loadLanguages() {
  const res = await fetch("/api/languages");
  const { languages, default: fallback } = await res.json();
  const saved = localStorage.getItem("lang");

  langSelect.innerHTML = Object.entries(languages)
    .map(([code, meta]) => `<option value="${code}">${meta.name}</option>`)
    .join("");

  langSelect.value = saved && languages[saved] ? saved : fallback;
  syncExportLink();
}

function syncExportLink() {
  exportLink.href = `/api/saved/export?lang=${langSelect.value}`;
}

langSelect.addEventListener("change", () => {
  localStorage.setItem("lang", langSelect.value);
  syncExportLink();
  loadSaved();
  wordInput.focus();
});

// --- Arama ------------------------------------------------------------------

form.addEventListener("submit", (event) => {
  event.preventDefault();
  search(wordInput.value);
});

async function search(word, { refresh = false } = {}) {
  word = word.trim();
  if (!word) return;

  wordInput.value = word;
  submitBtn.disabled = true;
  resultBox.hidden = true;
  setStatus("Aranıyor…");

  const params = new URLSearchParams({ word, lang: langSelect.value });
  if (refresh) params.set("refresh", "true");

  try {
    const res = await fetch(`/api/lookup?${params}`);
    const data = await res.json();

    if (!res.ok) {
      setStatus(data.detail || "Bir şeyler ters gitti.", true);
      return;
    }

    setStatus("");
    render(data);
  } catch (err) {
    setStatus(`Sunucuya ulaşılamadı: ${err.message}`, true);
  } finally {
    submitBtn.disabled = false;
    loadRecent();
  }
}

function termList(items) {
  return items
    .map(
      (item) => `
      <div class="term">
        <button type="button" data-lookup="${escapeHtml(item.word)}">${escapeHtml(item.word)}</button>
        ${item.note ? `<span>${escapeHtml(item.note)}</span>` : ""}
      </div>`,
    )
    .join("");
}

function block(title, inner) {
  return inner ? `<div class="block"><h3>${title}</h3>${inner}</div>` : "";
}

function render(data) {
  current = data;
  resultBox.hidden = false;

  if (!data.found) {
    resultBox.innerHTML = `
      <div class="headword"><h2>${escapeHtml(data.word)}</h2></div>
      <p class="notice">${escapeHtml(data.correction_note || "Bu kelime sözlükte bulunamadı.")}</p>`;
    return;
  }

  const morphRows = [
    ["Artikel", data.morphology.article],
    ["Çoğul", data.morphology.plural],
    ["Çekimler", data.morphology.verb_forms],
    ["Diğer", data.morphology.other],
  ].filter(([, value]) => value);

  resultBox.innerHTML = `
    <div class="headword">
      <h2>${escapeHtml(data.lemma || data.word)}</h2>
      ${data.ipa ? `<span class="ipa">${escapeHtml(data.ipa)}</span>` : ""}
    </div>

    <div class="badges">
      ${data.part_of_speech ? `<span class="badge">${escapeHtml(data.part_of_speech)}</span>` : ""}
      ${data.cefr ? `<span class="badge accent">${escapeHtml(data.cefr)}</span>` : ""}
      ${data.cached ? `<span class="badge">önbellekten</span>` : ""}
    </div>

    ${data.correction_note ? `<p class="notice">${escapeHtml(data.correction_note)}</p>` : ""}

    ${block(
      "Türkçe karşılığı",
      data.turkish_meanings.length
        ? `<div class="meanings">${data.turkish_meanings
            .map((m) => `<span class="meaning">${escapeHtml(m)}</span>`)
            .join("")}</div>`
        : "",
    )}

    ${block(
      "Kullanım notu",
      data.turkish_explanation ? `<p>${escapeHtml(data.turkish_explanation)}</p>` : "",
    )}

    ${block(
      `${langSelect.selectedOptions[0].textContent} açıklaması`,
      data.native_definition
        ? `<p class="definition">${escapeHtml(data.native_definition)}</p>`
        : "",
    )}

    ${block(
      "Eş anlamlılar",
      data.synonyms.length ? `<div class="term-list">${termList(data.synonyms)}</div>` : "",
    )}

    ${block(
      "Zıt anlamlılar",
      data.antonyms.length ? `<div class="term-list">${termList(data.antonyms)}</div>` : "",
    )}

    ${block(
      "Sık kullanılan kalıplar",
      data.collocations.length
        ? `<div class="chips">${data.collocations
            .map((c) => `<span class="chip">${escapeHtml(c)}</span>`)
            .join("")}</div>`
        : "",
    )}

    ${block(
      "Örnek cümleler",
      data.examples.length
        ? `<ul class="examples">${data.examples
            .map(
              (e) =>
                `<li><b>${escapeHtml(e.sentence)}</b>${
                  e.translation ? `<span>${escapeHtml(e.translation)}</span>` : ""
                }</li>`,
            )
            .join("")}</ul>`
        : "",
    )}

    ${block(
      "Biçim bilgisi",
      morphRows.length
        ? `<dl class="morph">${morphRows
            .map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`)
            .join("")}</dl>`
        : "",
    )}

    <div class="actions">
      <button type="button" id="save-btn">Deftere ekle</button>
      <button type="button" id="refresh-btn">Yeniden sorgula</button>
    </div>`;

  document.getElementById("refresh-btn").addEventListener("click", () => {
    search(data.lemma || data.word, { refresh: true });
  });

  const saveBtn = document.getElementById("save-btn");
  saveBtn.addEventListener("click", () => toggleSave(saveBtn));
  refreshSaveButton(saveBtn);
}

// Es anlamli / zit anlamli kelimelere tiklayinca zincirleme arama yapiliyor:
// kelime agini gezmek ogrenmenin en verimli kismi.
resultBox.addEventListener("click", (event) => {
  const target = event.target.closest("[data-lookup]");
  if (target) {
    search(target.dataset.lookup);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

// --- Kelime defteri ---------------------------------------------------------

async function refreshSaveButton(button) {
  const saved = await fetch(`/api/saved?lang=${langSelect.value}`).then((r) => r.json());
  const key = (current.lemma || current.word).toLowerCase();
  const isSaved = saved.some((item) => item.word === key);
  button.classList.toggle("is-on", isSaved);
  button.textContent = isSaved ? "Defterde ✓" : "Deftere ekle";
}

async function toggleSave(button) {
  const word = current.lemma || current.word;
  const isSaved = button.classList.contains("is-on");

  if (isSaved) {
    await fetch(
      `/api/saved?word=${encodeURIComponent(word)}&lang=${langSelect.value}`,
      { method: "DELETE" },
    );
  } else {
    await fetch("/api/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        word,
        language: langSelect.value,
        turkish: current.turkish_meanings.join(", "),
      }),
    });
  }

  await refreshSaveButton(button);
  loadSaved();
}

async function loadSaved() {
  const items = await fetch(`/api/saved?lang=${langSelect.value}`).then((r) => r.json());

  if (!items.length) {
    savedList.innerHTML = `<p class="empty">Henüz kelime eklemedin. Bir kelime arayıp "Deftere ekle" de.</p>`;
    return;
  }

  savedList.innerHTML = items
    .map(
      (item) => `
      <div class="saved-row">
        <div>
          <strong>${escapeHtml(item.word)}</strong>
          ${item.turkish ? `<div class="tr">${escapeHtml(item.turkish)}</div>` : ""}
        </div>
        <button type="button" data-remove="${escapeHtml(item.word)}">Sil</button>
      </div>`,
    )
    .join("");
}

savedList.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-remove]");
  if (!target) return;
  await fetch(
    `/api/saved?word=${encodeURIComponent(target.dataset.remove)}&lang=${langSelect.value}`,
    { method: "DELETE" },
  );
  loadSaved();
});

async function loadRecent() {
  const items = await fetch("/api/recent?limit=15").then((r) => r.json());
  recentBlock.hidden = items.length === 0;
  recentBox.innerHTML = items
    .map(
      (item) =>
        `<button type="button" class="chip" data-recent="${escapeHtml(item.word)}" data-lang="${escapeHtml(item.language)}">${escapeHtml(item.word)}</button>`,
    )
    .join("");
}

recentBox.addEventListener("click", (event) => {
  const target = event.target.closest("[data-recent]");
  if (!target) return;
  langSelect.value = target.dataset.lang;
  search(target.dataset.recent);
});

// --- Sekmeler ---------------------------------------------------------------

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("is-active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("is-active"));
    tab.classList.add("is-active");
    document.getElementById(`panel-${tab.dataset.panel}`).classList.add("is-active");
    if (tab.dataset.panel === "saved") loadSaved();
  });
});

// --- Baslangic --------------------------------------------------------------

(async function init() {
  await loadLanguages();
  await Promise.all([loadRecent(), loadSaved()]);
})();
