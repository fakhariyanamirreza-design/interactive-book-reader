/* خواننده‌ی تعاملی کتاب — داشبورد مطالعه‌ی تعاملی
   معماری: manifest.json → book.json → chapters.json (آمار) + chapterIndex.json (ساختار) → ch{N}.json + part files
*/
'use strict';

const DATA_ROOT = 'data/books';
const STORE_KEY = 'kt.progress.v1';
const NOTES_KEY = 'kt.notes.v1';
const LAST_KEY = 'kt.last.v1';

/* ---------------- State & store ---------------- */

const store = {
  load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  },
  save(all) { localStorage.setItem(STORE_KEY, JSON.stringify(all)); },

  progress(bookId) {
    const all = this.load();
    if (!all[bookId]) { all[bookId] = {}; this.save(all); }
    return all[bookId];
  },

  doneSecs(bookId, chapterId) {
    return new Set(this.progress(bookId)[chapterId] || []);
  },

  isDone(bookId, chapterId, secKey) {
    return this.doneSecs(bookId, chapterId).has(secKey);
  },

  mark(bookId, chapterId, secKey) {
    const all = this.load();
    all[bookId] = all[bookId] || {};
    all[bookId][chapterId] = all[bookId][chapterId] || [];
    if (!all[bookId][chapterId].includes(secKey)) all[bookId][chapterId].push(secKey);
    this.save(all);
  },

  unmark(bookId, chapterId, secKey) {
    const all = this.load();
    const arr = all[bookId] && all[bookId][chapterId];
    if (arr) {
      const i = arr.indexOf(secKey);
      if (i >= 0) { arr.splice(i, 1); this.save(all); }
    }
  },

  resetAll() {
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem(LAST_KEY);
    localStorage.removeItem(NOTES_KEY);
  }
};

const notes = {
  key(bookId, chapterId, secKey) { return `${bookId}:${chapterId}:${secKey}`; },
  get(bookId, chapterId, secKey) {
    try { const j = JSON.parse(localStorage.getItem(NOTES_KEY)) || {}; return j[this.key(bookId, chapterId, secKey)] || ''; } catch (e) { return ''; }
  },
  set(bookId, chapterId, secKey, text) {
    try {
      const j = JSON.parse(localStorage.getItem(NOTES_KEY)) || {};
      j[this.key(bookId, chapterId, secKey)] = text;
      localStorage.setItem(NOTES_KEY, JSON.stringify(j));
    } catch (e) {}
  }
};

const lastRead = {
  get(bookId) {
    try { const j = JSON.parse(localStorage.getItem(LAST_KEY)) || {}; return j[bookId] || null; } catch (e) { return null; }
  },
  set(bookId, chapterId, secKey) {
    try {
      const j = JSON.parse(localStorage.getItem(LAST_KEY)) || {};
      j[bookId] = { chapterId, secKey };
      localStorage.setItem(LAST_KEY, JSON.stringify(j));
    } catch (e) {}
  }
};

/* ---------------- Data loading ---------------- */

const cache = {};
async function loadJSON(url) {
  if (cache[url]) return cache[url];
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`خطا در بارگذاری ${url} (${res.status})`);
  const data = await res.json();
  cache[url] = data;
  return data;
}

async function loadManifest() { return loadJSON(`${DATA_ROOT}/manifest.json`); }
async function loadBook(bookId) { return loadJSON(`${DATA_ROOT}/${bookId}/book.json`); }
async function loadChapters(bookId) { return loadJSON(`${DATA_ROOT}/${bookId}/chapters.json`); }
async function loadChapter(bookId, chId) { return loadJSON(`${DATA_ROOT}/${bookId}/chapters/${chId}.json`); }
async function loadPart(bookId, chId, part) { return loadJSON(`${DATA_ROOT}/${bookId}/chapters/${part.file}`); }
async function loadChapterIndex(bookId) { return loadJSON(`${DATA_ROOT}/${bookId}/chapterIndex.json`); }

/* ---------------- Utils ---------------- */

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const faNum = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if (!h || parts.length === 0) return { route: 'home' };
  if (parts[0] === 'book') {
    if (parts.length >= 2) return { route: 'book', bookId: parts[1] };
    return { route: 'home' };
  }
  if (parts[0] === 'ch') {
    return {
      route: 'chapter',
      arr: parts,             // [ch, bookId, chapterId] or [ch, bookId, chapterId, read, ...]
      read: parts[3] === 'read',
      secKey: parts[4] || null
    };
  }
  return { route: 'home' };
}

function go(h) { location.hash = h; }

/* ---------------- Page data helpers ---------------- */

function loadDoneSet(bookId, chId) { return store.doneSecs(bookId, chId); }

/* ---------------- Router ---------------- */

async function route() {
  const r = parseHash();
  const view = $('#view');
  window.scrollTo({ top: 0 });

  try {
    const manifest = await loadManifest();
    if (!manifest.books || !manifest.books.length) { renderEmpty(view, 'هنوز کتابی اضافه نشده است.'); return; }

    if (r.route === 'home') { await renderHome(view, manifest); return; }
    if (r.route === 'book') { await renderBook(view, r.bookId); return; }
    if (r.route === 'chapter') { await renderChapterRoute(view, r); return; }
  } catch (e) {
    if (isFileProtocol()) { renderFetchHelp(view); return; }
    renderEmpty(view, `خطا: ${esc(e.message)}`);
  }
}

function isFileProtocol() { return location.protocol === 'file:'; }

function renderEmpty(view, title, desc) {
  view.innerHTML = `
    <div class="empty">
      <div class="big">🗂</div>
      <h2>${esc(title || 'چیزی برای نمایش نیست')}</h2>
      <p style="margin-top:8px">${esc(desc || '')}</p>
    </div>`;
}

function renderFetchHelp(view) {
  view.innerHTML = `
    <div class="empty">
      <div class="big">📚</div>
      <h2>برای ورق‌زدن در خواننده‌ی تعاملی، یک وب‌سرور کوچک لازم است</h2>
      <p style="margin-top:10px">مرورگر اجازه‌ی بارگذاری فایل‌ها را از مسیر مستقیم نمی‌دهد. از پوشه‌ی پروژه یکی از این دو دستور را اجرا کن:</p>
      <p style="direction:ltr; font-family:monospace; background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:10px; margin:14px auto; display:inline-block">python -m http.server 8000</p>
      <p style="direction:ltr; font-family:monospace; background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:10px; margin:0 auto; display:inline-block">npx serve .</p>
      <p style="margin-top:14px">سپس در مرورگر: <b style="direction:ltr">http://localhost:8000</b></p>
    </div>`;
}

/* ---------------- Home ---------------- */

async function renderHome(view, manifest) {
  const books = [];
  for (const id of manifest.books) books.push(await loadBook(id));

  const cards = el('div', 'books-grid');
  for (const b of books) {
    cards.appendChild(await bookCard(b));
  }
  cards.appendChild(el('div', 'add-book-card',
    `<div><div style="font-size:34px;margin-bottom:8px">➕</div>کتاب بعدی این‌جا اضافه می‌شود<br><span style="font-size:12.5px;opacity:.7">کافی است یک پوشه در data/books بسازی</span></div>`));

  view.innerHTML = '';
  view.appendChild(el('div', 'sec-title',
    `<span class="bar"></span><h2>خواننده‌ی تعاملی کتاب</h2><span class="count">${faNum(books.length)} کتاب</span>`));
  view.appendChild(cards);
}

async function bookCard(book) {
  const card = el('a', 'book-card', '');
  card.href = `#/book/${book.id}`;
  const [pct, chapters] = await Promise.all([bookProgress(book.id), loadChapters(book.id)]);
  const nch = chapters.chapters.length;
  const coverLbl = book.cover?.label || book.title_en || book.title_fa;
  const cover = el('div', 'bc-cover', '');
  cover.style.background = `linear-gradient(135deg, ${book.cover?.accent_from || '#1e6b3f'}, ${book.cover?.accent_to || '#2f8f4b'})`;
  cover.innerHTML = `<span style="color:#fff;font-weight:900;font-size:20px;letter-spacing:.5px;text-transform:uppercase">${esc(coverLbl)}</span>`;
  const body = el('div', 'bc-body', `
    <h3>${esc(book.title_fa)}</h3>
    <p>${esc(book.capsule_fa || '')}</p>`);
  body.appendChild(el('div', 'bc-foot',
    `<div class="pbar"><i style="transform:scaleX(${pct})"></i></div>
     <div style="font-size:12px;color:var(--ink-soft);margin-top:6px">پیشرفت کل: <b>${faNum(Math.round(pct * 100))}٪</b> · ${faNum(nch)} فصل</div>`));
  card.appendChild(cover);
  card.appendChild(body);
  return card;
}

/* ---------------- Book dashboard ---------------- */

async function renderBook(view, bookId) {
  const [book, chapters, chIdx] = await Promise.all([loadBook(bookId), loadChapters(bookId), loadChapterIndex(bookId)]);
  book.chapterCount = chapters.chapters.length;
  const chxById = new Map((chIdx?.chapters || []).map((c) => [c.id, c]));

  const partNames = normalizePartNames(book.chapters_ui);

  const allSecs = await countChapterSections(bookId, chapters.chapters);
  const done = totalDone(bookId, chapters.chapters);
  const bookPct = allSecs.total ? done / allSecs.total : 0;
  const readyChs = chapters.chapters.filter((c) => c.status === 'ready').length;

  view.innerHTML = '';
  view.appendChild(hero(book, { ready: readyChs, done, total: allSecs.total, pct: bookPct }));
  view.appendChild(stats(book, { ready: readyChs, done, total: allSecs.total, pct: bookPct }));

  const groups = groupChapters(chapters.chapters, partNames);
  for (const g of groups) {
    view.appendChild(el('div', 'sec-title',
      `<span class="bar"></span><h2>${esc(g.name)}</h2><span class="count">${faNum(g.items.length)} فصل</span>`));
    for (const ch of g.items) {
      try {
        view.appendChild(await chapterCard(bookId, ch, partNames, chxById.get(ch.id)));
      } catch (err) {
        console.error('Error rendering chapter', ch.id, err);
      }
    }
  }
}

function normalizePartNames(ui) {
  const out = [];
  if (Array.isArray(ui)) {
    return ui.filter((g) => g && g.name);
  }
  if (ui) {
    const keys = ['part_one','part_two','part_three','part_four','part_five','part_six'];
    for (const k of keys) if (ui[k]) out.push({ name: ui[k] });
    return out;
  }
  return [];
}

function groupChapters(chapters, groups) {
  if (!groups || !groups.length) return [{ name: 'فصل‌ها', items: chapters }];
  const result = groups.map((g) => ({ name: g.name, from: g.from, to: g.to, items: [] }));
  chapters.forEach((c) => {
    const idx = parseInt(c.id.replace(/\D/g, ''), 10) || 0;
    const g = result.find((x) => (x.from == null ? true : idx >= x.from) && (x.to == null ? true : idx <= x.to));
    if (g) g.items.push(c);
    else result[result.length - 1].items.push(c);
  });
  return result.filter((g) => g.items.length);
}

async function chapterCard(bookId, ch, partNames, chx) {
  const card = el('div', 'chapter', '');
  const ready = ch.status === 'ready';
  const statusCls = ready ? 'ready' : 'pending';
  const statusTxt = ready ? 'آماده' : 'به‌زودی';

  const head = el('div', 'chapter-head', `
    <div class="chapter-num">${faNum(ch.id.replace(/\D/g, ''))}</div>
    <div class="chapter-info">
      <h3>${esc(ch.title_fa)} ${ready ? '' : '<span class="tag">به‌زودی</span>'}</h3>
      <small>${esc(ch.title_en)}</small>
      <div class="meta-line">${esc(ch.author || '')}${ch.pages ? ' · ' + esc(ch.pages) : ''}</div>
    </div>
    <span class="chapter-status ${statusCls}">${statusTxt}</span>
    <span class="chapter-arrow">◀</span>`);
  card.appendChild(head);

  if (ready) {
    const body = el('div', 'chapter-body', '');
    const partsMeta = chx && chx.parts;

    if (partsMeta && partsMeta.length) {
      const doneSet = store.doneSecs(bookId, ch.id);
      const secsFlat = [];
      partsMeta.forEach((p) => (p.secs || []).forEach((s) => secsFlat.push({ key: `${p.id}_${s.id}`, s, p })));
      const doneCount = secsFlat.filter((x) => doneSet.has(x.key)).length;
      const pct = secsFlat.length ? doneCount / secsFlat.length : 0;

      body.appendChild(el('div', 'chapter-pbar', `
        <div class="pmeta"><span>پیشرفت فصل</span><b>${faNum(doneCount)} از ${faNum(secsFlat.length)} بخش</b></div>
        <div class="pbar"><i class="${pct === 1 ? 'green' : ''}" style="transform:scaleX(${pct})"></i></div>`));

      const continueBtn = el('button', 'btn btn-primary btn-sm', pct === 1 ? '✓ مرور دوباره فصل' : '▶ ادامه خواندن');
      continueBtn.style.marginTop = '12px';
      continueBtn.onclick = () => go(`#/ch/${bookId}/${ch.id}/read`);
      body.appendChild(continueBtn);

      partsMeta.forEach((p) => body.appendChild(partBlockMeta(bookId, ch.id, p, doneSet)));
    } else {
      const chapterData = await loadChapter(bookId, ch.id);
      const parts = [];
      for (const p of chapterData.parts) parts.push(await loadPart(bookId, ch.id, p));
      const doneSet = store.doneSecs(bookId, ch.id);
      const secsFlat = chaptersSections(chapterData, parts);
      const doneCount = secsFlat.filter((s) => doneSet.has(s.key)).length;
      const pct = secsFlat.length ? doneCount / secsFlat.length : 0;

      body.appendChild(el('div', 'chapter-pbar', `
        <div class="pmeta"><span>پیشرفت فصل</span><b>${faNum(doneCount)} از ${faNum(secsFlat.length)} بخش</b></div>
        <div class="pbar"><i class="${pct === 1 ? 'green' : ''}" style="transform:scaleX(${pct})"></i></div>`));

      const continueBtn = el('button', 'btn btn-primary btn-sm', pct === 1 ? '✓ مرور دوباره فصل' : '▶ ادامه خواندن');
      continueBtn.style.marginTop = '12px';
      continueBtn.onclick = () => go(`#/ch/${bookId}/${ch.id}/read`);
      body.appendChild(continueBtn);

      parts.forEach((part, pi) => body.appendChild(partBlock(bookId, ch.id, chapterData, part, doneSet)));
    }

    card.appendChild(body);
    card.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('.sec-chip')) return;
      card.classList.toggle('open');
    });
  }

  if (!ready) {
    card.addEventListener('click', () => toast('این فصل هنوز ساده‌سازی نشده است.'));
  }

  return card;
}

function partBlock(bookId, chId, chapterData, part, doneSet) {
  const block = el('div', 'part-block', '');
  const secs = part.sections.map((s) => ({ key: `${part.id}_${s.id}`, s, p: part }));
  const doneInPart = secs.filter((x) => doneSet.has(x.key)).length;
  const pct = secs.length ? doneInPart / secs.length : 0;

  block.appendChild(el('div', 'part-head', `
    <span class="part-badge">بخش ${faNum(part.id.replace(/\D/g, ''))}</span>
    <h4>${esc(part.title)}</h4>
    <span class="pcount">${faNum(doneInPart)}/${faNum(secs.length)}</span>`));

  const grid = el('div', 'sections', '');
  secs.forEach((x) => {
    const done = doneSet.has(x.key);
    const chip = el('button', 'sec-chip' + (done ? ' done' : ''), `
      <span class="dot">✓</span>
      <span class="txt">${esc(x.s.title)}</span>
      ${x.s.question ? '<span class="qbadge">؟</span>' : ''}`);
    chip.onclick = () => go(`#/ch/${bookId}/${chId}/read/${x.key}`);
    grid.appendChild(chip);
  });
  block.appendChild(grid);
  block.appendChild(el('div', 'pbar', `<i class="${pct === 1 ? 'green' : ''}" style="transform:scaleX(${pct})"></i>`));
  block.querySelector('.pbar').style.marginTop = '10px';
  return block;
}

function partBlockMeta(bookId, chId, part, doneSet) {
  const block = el('div', 'part-block', '');
  const secs = (part.secs || []).map((s) => ({ key: `${part.id}_${s.id}`, s }));
  const doneInPart = secs.filter((x) => doneSet.has(x.key)).length;
  const pct = secs.length ? doneInPart / secs.length : 0;

  block.appendChild(el('div', 'part-head', `
    <span class="part-badge">بخش ${faNum(part.id.replace(/\D/g, ''))}</span>
    <h4>${esc(part.title)}</h4>
    <span class="pcount">${faNum(doneInPart)}/${faNum(secs.length)}</span>`));

  const grid = el('div', 'sections', '');
  secs.forEach((x) => {
    const done = doneSet.has(x.key);
    const chip = el('button', 'sec-chip' + (done ? ' done' : ''), `
      <span class="dot">✓</span>
      <span class="txt">${esc(x.s.title)}</span>
      ${x.s.q ? '<span class="qbadge">؟</span>' : ''}`);
    chip.onclick = () => go(`#/ch/${bookId}/${chId}/read/${x.key}`);
    grid.appendChild(chip);
  });
  block.appendChild(grid);
  block.appendChild(el('div', 'pbar', `<i class="${pct === 1 ? 'green' : ''}" style="transform:scaleX(${pct})"></i>`));
  block.querySelector('.pbar').style.marginTop = '10px';
  return block;
}

/* ---------------- Hero & stats ---------------- */

function hero(book, prog) {
  const c = book.cover || { accent_from: '#1e6b3f', accent_to: '#2f8f4b', label: 'Book' };
  const h = el('section', 'hero', '');
  const cover = el('div', 'hero-cover', `
    <div class="book-cover" style="background:linear-gradient(150deg, ${c.accent_from}, ${c.accent_to})">
      <div class="lv">${esc(c.label || book.title_en)}</div>
      <div class="tt">${esc(book.title_fa)}</div>
      <div class="au">${esc(book.title_en)}</div>
    </div>`);
  const progPct = Math.round(prog.pct * 100);
  const body = el('div', 'hero-body', `
    <div class="hero-tag"><span class="tag green">${esc(book.status || '')}</span><span class="tag">ویراست ${esc(book.edition || '')}</span><span class="tag" style="direction:ltr">${esc(book.publisher || '')} ${esc(book.year || '')}</span></div>
    <h1>${esc(book.title_fa)}<small>${esc(book.title_en)}</small></h1>
    <div class="hero-meta">
      <span>✍ <b>${esc(book.authors)}</b></span>
      <span>📄 <b>${faNum(book.pages || 0)}</b> صفحه</span>
      <span>📚 <b>${faNum(book.chapterCount || 0)}</b> فصل</span>
    </div>
    <p class="hero-desc">${esc(book.description_fa || '')}</p>
    <div style="margin-top:18px">
      <div class="pmeta" style="font-size:13px;color:var(--ink-soft);display:flex;justify-content:space-between;margin-bottom:6px">
        <span>پیشرفت کل کتاب</span><b>${faNum(progPct)}٪</b>
      </div>
      <div class="pbar"><i class="${prog.pct === 1 ? 'green' : ''}" style="transform:scaleX(${prog.pct})"></i></div>
    </div>`);
  h.appendChild(cover);
  h.appendChild(body);
  return h;
}

function stats(book, prog) {
  const s = el('div', 'stats', '');
  const items = [
    ['📗', 'c-blue', faNum(prog.ready), 'فصل آماده'],
    ['✅', 'c-green', faNum(prog.done), 'بخش خوانده‌شده'],
    ['📄', 'c-amber', faNum(prog.total), 'کل بخش‌ها'],
    ['🏁', 'c-gold', faNum(Math.round(prog.pct * 100)) + '٪', 'پیشرفت']
  ];
  items.forEach(([ico, cls, val, lbl]) => {
    s.appendChild(el('div', 'stat', `
      <div class="stat-ico ${cls}">${ico}</div>
      <div><b>${val}</b><span>${lbl}</span></div>`));
  });
  return s;
}

/* ---------------- Chapter counts ---------------- */

const bookMetaCounts = {}; // bookId -> { sections: {chId: n}, chapters: n }

async function countChapterSections(bookId, chapters) {
  let total = 0;
  const map = {};
  bookMetaCounts[bookId] = { sections: map, chapters: chapters.length };
  for (const ch of chapters) {
    if (ch.status !== 'ready') continue;
    const n = ch.sections || 0;
    map[ch.id] = n;
    total += n;
  }
  return { total, map };
}

function chaptersSections(chapter, parts) {
  const out = [];
  parts.forEach((part) => {
    part.sections.forEach((s) => out.push({ key: `${part.id}_${s.id}`, s, part }));
  });
  return out;
}

function totalDone(bookId, chapters) {
  let n = 0;
  for (const ch of chapters) {
    if (ch.status !== 'ready') continue;
    n += store.doneSecs(bookId, ch.id).size;
  }
  return n;
}

async function bookProgress(bookId) {
  const chapters = await loadChapters(bookId);
  const { total } = await countChapterSections(bookId, chapters.chapters);
  if (!total) return 0;
  return totalDone(bookId, chapters.chapters) / total;
}

/* ---------------- Reader ---------------- */

async function renderChapterRoute(view, r) {
  const bookId = r.arr[1];
  const chId = r.arr[2];
  const [book, chapters, chapterData] = await Promise.all([loadBook(bookId), loadChapters(bookId), loadChapter(bookId, chId)]);
  const meta = chapters.chapters.find((c) => c.id === chId);
  if (!meta || meta.status !== 'ready') {
    view.innerHTML = `<div class="empty"><div class="big">⏳</div>
      <h2>این فصل هنوز ساده‌سازی نشده است</h2>
      <p style="margin-top:8px">فصل‌های آماده از داشبورد کتاب در دسترس‌اند.</p>
      <a class="btn btn-primary" style="margin-top:16px" href="#/book/${bookId}">بازگشت به کتاب</a></div>`;
    return;
  }
  const parts = [];
  for (const p of chapterData.parts) parts.push(await loadPart(bookId, chId, p));
  const allSecs = chaptersSections(chapterData, parts);

  if (!r.read) {
    renderChapterView(view, { bookId, chId, book, chapterData, allSecs });
    return;
  }
  renderReader(view, { bookId, chId, book, chapterData, allSecs, startKey: r.secKey });
}

function renderChapterView(view, ctx) {
  const { bookId, chId, book, chapterData, allSecs } = ctx;
  const doneSet = store.doneSecs(bookId, chId);
  const doneCount = allSecs.filter((s) => doneSet.has(s.key)).length;
  const pct = allSecs.length ? doneCount / allSecs.length : 0;

  view.innerHTML = '';
  view.appendChild(el('div', 'reader-top', `<a href="#/book/${bookId}">→ بازگشت به ${esc(book.title_fa)}</a>`));

  const card = el('div', 'reader-card', '');
  card.appendChild(el('div', 'rc-meta', `
    <span class="rc-part">${esc(chapterData.title_fa)}</span>
    <span class="rc-idx">${faNum(doneCount)}/${faNum(allSecs.length)} بخش خوانده شده</span>`));
  card.appendChild(el('h1', '', esc(chapterData.title_fa)));
  if (chapterData.intro_fa) card.appendChild(el('p', 'para', esc(chapterData.intro_fa)));
  card.appendChild(el('div', 'chapter-pbar',
    `<div class="pbar"><i class="${pct === 1 ? 'green' : ''}" style="transform:scaleX(${pct})"></i></div>`));

  const start = allSecs.find((s) => !doneSet.has(s.key)) || allSecs[0];
  const b = el('button', 'btn btn-primary', pct === 1 ? '✓ مرور دوباره از اول' : '▶ شروع / ادامه خواندن');
  b.style.marginTop = '16px';
  b.onclick = () => go(`#/ch/${bookId}/${chId}/read/${start.key}`);
  card.appendChild(b);
  view.appendChild(card);

  // parts index
  const grouped = groupSectionsByPart(allSecs);
  const partsList = el('div', 'sections', '');
  grouped.forEach((g) => {
    const gtitle = el('div', 'part-block', '');
    gtitle.appendChild(el('div', 'part-head', `<span class="part-badge">بخش ${faNum(g.partIdx + 1)}</span><h4>${esc(g.title)}</h4>
      <span class="pcount">${faNum(g.items.filter((x) => doneSet.has(x.key)).length)}/${faNum(g.items.length)}</span>`));
    const inner = el('div', 'sections', '');
    g.items.forEach((x) => {
      const chip = el('button', 'sec-chip' + (doneSet.has(x.key) ? ' done' : ''), `
        <span class="dot">✓</span><span class="txt">${esc(x.s.title)}</span>${x.s.question ? '<span class="qbadge">؟</span>' : ''}`);
      chip.onclick = () => go(`#/ch/${bookId}/${chId}/read/${x.key}`);
      inner.appendChild(chip);
    });
    gtitle.appendChild(inner);
    partsList.appendChild(gtitle);
  });
  view.appendChild(el('div', 'sec-title', `<span class="bar"></span><h2>بخش‌های فصل</h2><span class="count">${faNum(allSecs.length)} بخش</span>`));
  view.appendChild(partsList);
}

function groupSectionsByPart(allSecs) {
  const map = new Map();
  allSecs.forEach((s) => {
    const k = s.part.id;
    if (!map.has(k)) map.set(k, { partId: k, title: s.part.title, partIdx: Number(k.replace(/\D/g, '')) - 1 || 0, items: [] });
    map.get(k).items.push(s);
  });
  return [...map.values()];
}

/* ---------------- Reader flow ---------------- */

async function renderReader(view, ctx) {
  const { bookId, chId, book, chapterData, allSecs, startKey } = ctx;
  let idx = Math.max(0, allSecs.findIndex((s) => s.key === startKey));

  const doneSet = store.doneSecs(bookId, chId);

  const wrap = el('div', '', '');
  view.innerHTML = '';
  view.appendChild(wrap);

  const crumb = el('div', 'reader-top', `<a href="#/ch/${bookId}/${chId}">→ نمای فصل</a><span style="color:var(--ink-soft);font-size:13px;margin-inline-start:12px">${esc(chapterData.title_fa)}</span>`);
  wrap.appendChild(crumb);

  // chapter-done banner
  const doneBanner = el('div', 'reader-card', '');
  doneBanner.id = 'done-banner';
  doneBanner.style.display = 'none';
  doneBanner.innerHTML = `
    <div style="text-align:center;padding:10px">
      <div style="font-size:44px">🎉</div>
      <h1 style="margin:10px 0;font-size:20px">فصل «${esc(chapterData.title_fa)}» کامل شد!</h1>
      <p style="color:var(--ink-soft)">همه‌ی بخش‌ها را خوانده‌ای. می‌توانی دوباره مرور کنی یا به کتاب برگردی.</p>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:18px">
        <a class="btn btn-primary" href="#/ch/${bookId}/${chId}/read/${allSecs[0].key}">مرور از اول</a>
        <a class="btn btn-ghost" href="#/book/${bookId}">بازگشت به کتاب</a>
      </div>
    </div>`;
  wrap.appendChild(doneBanner);

  function render() {
    // sticky progress
    let rp = wrap.querySelector('.reader-progress');
    if (!rp) {
      rp = el('div', 'reader-progress', '');
      wrap.appendChild(rp);
      wrap.insertBefore(rp, wrap.children[1]);
    }
    rp.innerHTML = `
      <span class="rp-label">📖 ${esc(chapterData.title_fa)}</span>
      <div class="pbar"><i style="transform:scaleX(${allSecs.length ? idx / allSecs.length : 0})"></i></div>
      <span class="rp-counter">${faNum(idx + 1)} / ${faNum(allSecs.length)}</span>`;

    const cur = allSecs[idx];

    // mark current as done when viewed
    const mkKey = cur.key;
    if (!store.isDone(bookId, chId, mkKey)) store.mark(bookId, chId, mkKey);
    if (lastRead.get(bookId)?.secKey !== mkKey) lastRead.set(bookId, chId, mkKey);

    const card = el('div', 'reader-card', '');
    card.id = 'reader-card';
    const isDone = store.isDone(bookId, chId, cur.key);

    card.appendChild(el('div', 'rc-meta', `
      <span class="rc-part">بخش ${faNum(cur.part.id.replace(/\D/g, ''))} · ${esc(cur.part.title)}</span>
      <span class="rc-idx">بخش ${faNum(idx + 1)} از ${faNum(allSecs.length)}</span>
      ${isDone ? '<span class="rc-done">✓ خوانده شد</span>' : ''}`));

    card.appendChild(el('h1', '', esc(cur.s.title)));

    (cur.s.content || []).forEach((p) => card.appendChild(el('p', 'para', esc(p))));

    if (cur.s.example) {
      const box = el('div', 'example-box', `
        <div class="lbl">💡 مثال</div><p>${esc(cur.s.example)}</p>`);
      card.appendChild(box);
    }

    if (cur.s.question) {
      card.appendChild(questionBox(cur));
    }

    // nav buttons
    const nav = el('div', 'reader-nav', '');
    const prev = el('button', 'btn btn-ghost', '→ قبلی');
    prev.disabled = idx === 0;
    prev.onclick = () => { idx = Math.max(0, idx - 1); render(); };
    const jumpChip = el('span', 'sec-chip', `<span class="dot">✓</span><span class="txt" style="font-size:12px">${faNum(idx + 1)}/${faNum(allSecs.length)}</span>`);
    jumpChip.style.cursor = 'default';
    const next = el('button', 'btn btn-primary', idx === allSecs.length - 1 ? 'پایان فصل 🏁' : 'خواندم؛ برو به بعدی ◀');
    next.onclick = () => {
      if (!store.isDone(bookId, chId, cur.key)) store.mark(bookId, chId, cur.key);
      if (idx < allSecs.length - 1) { idx += 1; render(); }
      else { store.mark(bookId, chId, cur.key); showDone(); }
    };
    nav.appendChild(prev);
    nav.appendChild(jumpChip);
    nav.appendChild(next);
    card.appendChild(nav);

    const prevCard = wrap.querySelector('#reader-card');
    if (prevCard) prevCard.remove();
    wrap.appendChild(card);
  }

  function questionBox(curSec) {
    const q = curSec.s.question;
    const saved = notes.get(bookId, chId, curSec.key);
    const box = el('div', 'q-box', `
      <div class="lbl">🖋 ایستگاه پرسش — بعد از خواندن این بخش، در یک جمله جواب بده</div>
      <p class="qtxt">${esc(q.text)}</p>
      <textarea id="q-ta" placeholder="جوابت را این‌جا بنویس... (الزامی نیست)"></textarea>
      <div class="q-actions">
        <button class="btn btn-soft btn-sm" id="q-save">ذخیره‌ی یادداشت</button>
        <button class="btn btn-ghost btn-sm" id="q-hint-btn">نمایش پاسخ پیشنهادی 👁</button>
      </div>
      <div class="q-hint" id="q-hint"><span class="lbl">پاسخ پیشنهادی</span>${esc(q.hint || '')}</div>`);
    const ta = box.querySelector('#q-ta');
    ta.value = saved;
    ta.addEventListener('input', () => notes.set(bookId, chId, curSec.key, ta.value));
    box.querySelector('#q-save').onclick = () => { notes.set(bookId, chId, curSec.key, ta.value); toast('یادداشت ذخیره شد ✅'); };
    box.querySelector('#q-hint-btn').onclick = () => box.querySelector('#q-hint').classList.toggle('show');
    return box;
  }

  function showDone() {
    wrap.querySelector('.reader-progress').style.display = 'none';
    const card = wrap.querySelector('#reader-card');
    if (card) card.style.display = 'none';
    const b = wrap.querySelector('#done-banner');
    b.style.display = 'block';
    b.scrollIntoView({ behavior: 'smooth' });
    toast('فصل با موفقیت تمام شد 🎉');
  }

  render();
}

/* ---------------- Shell ---------------- */

function navActive() {
  const r = parseHash();
  document.querySelectorAll('#topnav a').forEach((a) => {
    const href = a.getAttribute('data-nav');
    a.classList.toggle('active', href === 'home' && r.route === 'home');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  $('#reset-btn').addEventListener('click', () => {
    const back = el('div', 'modal-back', `
      <div class="modal">
        <h3>🔄 پاک کردن همه‌ی پیشرفت‌ها؟</h3>
        <p>همه‌ی بخش‌های خوانده‌شده و یادداشت‌ها حذف می‌شوند. این کار قابل بازگشت نیست.</p>
        <div class="row">
          <button class="btn btn-ghost" id="m-cancel">انصراف</button>
          <button class="btn btn-outline" id="m-ok" style="border-color:var(--danger);color:var(--danger)">بله، پاک کن</button>
        </div>
      </div>`);
    document.body.appendChild(back);
    back.querySelector('#m-cancel').onclick = () => back.remove();
    back.querySelector('#m-ok').onclick = () => {
      store.resetAll();
      back.remove();
      toast('پیشرفت‌ها پاک شدند');
      route();
    };
    back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
  });

  window.addEventListener('hashchange', () => { route(); navActive(); });
  route();
  navActive();
});