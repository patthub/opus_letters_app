// OPUS — korespondencja Henry'ego Wottona.
//
// Neo4j jest backendem: strona nie ma wlasnego serwera, rozmawia z baza po bolcie
// (WebSocket). Jesli bazy nie ma — czyta zamrozony opus.json i dziala tak samo, minus
// konsola Cypher. Dzieki temu to samo stoi lokalnie na zywym grafie i na statycznym
// hostingu bez backendu.
//
// ponytail: haslo w zrodle. Community Edition nie ma uzytkownikow read-only, wiec i tak
// nie byloby czego chowac, a wersja publiczna w ogole nie dotyka bazy. Gdyby kiedys miala:
// cienkie proxy z jednym endpointem, baza tylko na 127.0.0.1.

import { T, pickLang } from './i18n.js';
import { COAST } from './coast.js';

let LANG = pickLang();
let t = T[LANG];

// Krotkie limity, bo brak bazy to normalny stan (statyczny hosting), a nie awaria:
// domyslnie sterownik ponawia probe przez 30 s, zanim odda blad.
const DB = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'opusgraph'), {
  disableLosslessIntegers: true,
  connectionTimeout: 2000,
  maxTransactionRetryTime: 2000,
});
const cypher = (q, params = {}) =>
  DB.executeQuery(q, params).then(r => ({ keys: r.keys, rows: r.records.map(x => x.toObject()) }));

const $ = s => document.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
const dl = pairs => '<dl>' + pairs.filter(([, v]) => v != null && v !== '')
  .map(([k, v]) => `<dt>${k}</dt><dd>${
    /^https?:\/\//.test(v)
      ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(String(v).replace(/^https?:\/\//, '')).slice(0, 30)}…</a>`
      : esc(v)}</dd>`).join('') + '</dl>';

const S = {
  letters: [], places: [], people: new Map(), rec: new Map(),
  view: 'letters', find: '', tag: null, person: null, place: null, letter: null, shown: 80,
};

// ── daty ──────────────────────────────────────────────────────────────────────
// Data w bazie ma 4, 7 albo 10 znakow i to jest informacja, a nie brak porzadku:
// mowi, jak dokladnie redaktor umial ja ustalic. Nigdzie tego nie zaokraglamy w cichu.
const prec = l => (l.date ? l.date.length : 0);
const doubt = l => l.inf === 'true' || l.unc === 'true' || l.apx === 'true';
const t0 = d => Date.UTC(+d.slice(0, 4), d.length > 4 ? +d.slice(5, 7) - 1 : 0, d.length > 7 ? +d.slice(8, 10) : 1);
const t1 = d => (d.length === 10 ? t0(d) + 864e5
  : d.length === 7 ? Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 1)
  : Date.UTC(+d.slice(0, 4) + 1, 0, 1));

const precMark = l =>
  `<i class="prec${doubt(l) ? ' doubt' : ''}" data-p="${prec(l)}" title="${esc(t.precTitle[prec(l)] || '')}"></i>`;

// ── zapytania ─────────────────────────────────────────────────────────────────

const Q_LETTERS = `
MATCH (l:LetterManifestation)
OPTIONAL MATCH (l)-[:AUTHOR]->(a)
OPTIONAL MATCH (l)-[:RECIPIENT]->(r)
OPTIONAL MATCH (l)-[:LOCATION_CREATED]->(o:Place)
OPTIONAL MATCH (l)-[:DESTINATION]->(d:Place)
RETURN l.uri AS id, l.dateCreated AS date, l.dateAsMarked AS marked,
       l.dateIsInferred AS inf, l.dateIsUncertain AS unc, l.dateIsApproximate AS apx,
       l.incipit AS incipit, l.inLanguage AS lang,
       l.abstract AS abstract, l.edition AS edition,
       [(l)-[:MENTIONS]->(m) | coalesce(m.label, m.surfaceForm)] AS mentions,
       a.uri AS aid, a.label AS a,
       r.uri AS rid, coalesce(r.label, split(r.uri, '/')[-1]) AS r,
       o.label AS origin, d.label AS dest,
       [(l)-[:SUBJECT]->(s) | coalesce(s.prefLabel, s.label)] AS subjects
ORDER BY coalesce(l.dateCreated, '9999')`;

// count(DISTINCT x), nie count(*): po OPTIONAL MATCH count(*) liczy wiersz, a nie dopasowanie,
// wiec miejsca bez ani jednego listu wychodzily z liczba 1 i ladowaly na mapie
const Q_PLACES = `
MATCH (p:Place) WHERE p.location IS NOT NULL
OPTIONAL MATCH (a:LetterManifestation)-[:LOCATION_CREATED]->(p)
WITH p, count(DISTINCT a) AS sent
OPTIONAL MATCH (b:LetterManifestation)-[:DESTINATION]->(p)
WITH p, sent, count(DISTINCT b) AS got
WHERE sent > 0 OR got > 0
RETURN p.label AS label, p.location.latitude AS lat, p.location.longitude AS lon, sent, got`;

const Q_PEOPLE = `
MATCH (p:Person)
RETURN p.uri AS id, p.label AS label, p.birthDate AS birthDate, p.deathDate AS deathDate,
       p.jobTitle AS jobTitle, p.sameAs AS sameAs, p.note AS note`;

const RECIPES = [
  'MATCH (:LetterManifestation)-[:MENTIONS]->(m)\nRETURN coalesce(m.label, m.surfaceForm) AS who, labels(m)[1] AS kind, count(*) AS n\nORDER BY n DESC LIMIT 25',
  "MATCH (l:LetterManifestation)-[:SUBJECT]->(s)\nWHERE coalesce(s.prefLabel, s.label) = 'espionage'\nRETURN l.dateCreated AS date, l.incipit AS incipit ORDER BY date",
  "MATCH (a:Person {label:'Henry Wotton'}), (b:Person {label:'John Donne'})\nMATCH p = shortestPath((a)-[*..6]-(b)) RETURN p",
  'MATCH (l:LetterManifestation)-[:LOCATION_CREATED]->(o:Place)\nMATCH (l)-[:DESTINATION]->(d:Place)\nRETURN o.label AS from, d.label AS to, count(*) AS n ORDER BY n DESC LIMIT 25',
  'CALL db.schema.visualization()',
];

// ── start ─────────────────────────────────────────────────────────────────────

// Dwa zrodla, jeden ksztalt danych — reszta aplikacji nie wie, ktore z nich dostala.
async function load() {
  try {
    // Strona po HTTPS nie otworzy ws:// (mixed content) — nie ma po co probowac ani
    // straszyc odwiedzajacego bledem w konsoli.
    if (location.protocol === 'https:') throw new Error('HTTPS: bolt unavailable');
    const live = Promise.all([cypher(Q_LETTERS), cypher(Q_PLACES), cypher(Q_PEOPLE)]);
    const [L, P, O] = await Promise.race([live,
      new Promise((_, no) => setTimeout(() => no(new Error('database did not answer in 3 s')), 3000))]);
    return { src: 'db', letters: L.rows, places: P.rows, people: O.rows };
  } catch (live) {
    const res = await fetch('opus.json');
    if (!res.ok) throw live;
    const d = await res.json();
    return { src: 'snapshot', generated: d.generated, ...d };
  }
}

async function boot() {
  chrome();
  let D;
  try {
    D = await load();
  } catch (e) {
    $('#boot').innerHTML = `<p class="asmarked">${t.noData}</p>
      <span class="label">${t.noDataSub}</span>
      <p class="err">docker compose up -d\n\n${esc(e.message)}</p>`;
    return;
  }
  S.src = D.src;
  S.generated = D.generated;
  S.letters = D.letters;
  S.places = D.places;
  S.rec = new Map(D.people.map(p => [p.id, p]));

  for (const l of S.letters) {
    for (const [id, name] of [[l.aid, l.a], [l.rid, l.r]]) {
      if (!id) continue;
      const p = S.people.get(id)
        || { id, name: name || id.split('/').pop(), sent: 0, got: 0, first: Infinity, with: new Map() };
      p[id === l.aid ? 'sent' : 'got']++;
      if (l.date) p.first = Math.min(p.first, t0(l.date));
      S.people.set(id, p);
    }
    if (l.aid && l.rid) {
      const A = S.people.get(l.aid), B = S.people.get(l.rid);
      A.with.set(l.rid, (A.with.get(l.rid) || 0) + 1);
      B.with.set(l.aid, (B.with.get(l.aid) || 0) + 1);
    }
  }

  const byAuthor = {};
  for (const l of S.letters) if (l.aid) byAuthor[l.aid] = (byAuthor[l.aid] || 0) + 1;
  S.dominant = Object.entries(byAuthor).sort((x, y) => y[1] - x[1])[0]?.[0];

  counts();
  $('#boot')?.remove();
  route();
}

// ── jezyk i stale elementy ────────────────────────────────────────────────────

function chrome() {
  document.documentElement.lang = t.htmlLang;
  document.title = t.title;
  $('#subtitle').innerHTML = t.subtitle + '<span>1589–1639</span>';
  $('#find').placeholder = t.find;
  const bootLabel = $('#boot .label');       // po zaladowaniu danych #boot juz nie istnieje
  if (bootLabel) bootLabel.textContent = t.connecting;
  document.querySelectorAll('#views button').forEach(b => {
    b.firstChild.textContent = t.nav[b.dataset.view] + ' ';
  });
  $('#lang').innerHTML = ['pl', 'en']
    .map(l => `<button data-lang="${l}"${l === LANG ? ' aria-current="true"' : ''}>${l.toUpperCase()}</button>`)
    .join('<span>/</span>');
}

function counts() {
  if (!S.letters.length) return;
  $('#tally').innerHTML = [
    [t.tally.letters, S.letters.length], [t.tally.people, S.people.size],
    [t.tally.places, S.places.length], [t.tally.doubt, S.letters.filter(doubt).length],
  ].map(([k, v]) => `<div><span class="label">${esc(k)}</span><b class="num">${v}</b></div>`).join('');

  const n = S.letters.length;
  document.querySelectorAll('#views button i').forEach(i => {
    const v = i.parentElement.dataset.view;
    i.textContent = { letters: n, time: n, people: S.people.size, places: S.places.length }[v] ?? '';
  });

  $('#src').innerHTML = `<span class="label">${t.source}</span> <b class="num">${
    S.src === 'db' ? 'Neo4j' : t.snapshot + ' ' + esc(S.generated || '')}</b>`;
}

function setLang(l) {
  if (l === LANG) return;
  LANG = l; t = T[l];
  try { localStorage.setItem('opus.lang', l); } catch { /* prywatne okno */ }
  chrome(); counts(); render();
  if (S.letter) drawSheet(S.letter);
}

// ── filtrowanie ───────────────────────────────────────────────────────────────

function inScope() {
  const q = S.find.trim().toLowerCase();
  return S.letters.filter(l => {
    if (S.tag && !l.subjects.includes(S.tag)) return false;
    if (S.place && l.origin !== S.place && l.dest !== S.place) return false;
    if (S.person && l.aid !== S.person && l.rid !== S.person) return false;
    if (!q) return true;
    return [l.incipit, l.a, l.r, l.marked, l.origin, l.dest, ...l.subjects]
      .some(v => v && String(v).toLowerCase().includes(q));
  });
}

// ── widok: listy ──────────────────────────────────────────────────────────────

function viewLetters(stage, scope) {
  const wrap = el('div', 'pad');
  const draw = () => {
    wrap.textContent = '';
    if (!scope.length) {
      wrap.append(el('div', 'empty',
        `<p>${t.noMatch}</p><span>${t.noMatchSub(S.letters.length)}</span>`));
      return;
    }
    let year = null;
    for (const l of scope.slice(0, S.shown)) {
      const y = l.date ? l.date.slice(0, 4) : t.undated;
      if (y !== year) { year = y; wrap.append(el('div', 'yr', esc(y))); }
      const b = el('button', 'letter');
      b.setAttribute('aria-current', String(S.letter === l.id));
      b.innerHTML = `<span class="when">
          <time${doubt(l) ? ` class="doubt" title="${esc(t.editorDate)}"` : ''}>${esc(l.date || '—')}</time>
        </span>
        <span>
          <span class="who">${l.aid && l.aid !== S.dominant ? esc(l.a) + ' → ' : ''}${esc(l.r || '?')}</span>
          <p class="incipit">${esc(l.incipit || t.noIncipit)}</p>
          ${l.marked ? `<p class="marked">${esc(l.marked)}</p>` : ''}
          ${l.subjects.length ? `<span class="tags">${l.subjects.slice(0, 6)
            .map(s => `<span class="tag${S.tag === s ? ' on' : ''}" data-tag="${esc(s)}">${esc(s)}</span>`).join('')}</span>` : ''}
        </span>`;
      b.onclick = e => {
        const tag = e.target.closest('[data-tag]');
        if (tag) { S.tag = S.tag === tag.dataset.tag ? null : tag.dataset.tag; S.shown = 80; return render(); }
        openLetter(l.id);
      };
      wrap.append(b);
    }
    if (scope.length > S.shown) {
      const more = el('button', null, t.more(Math.min(200, scope.length - S.shown)));
      more.id = 'more';
      more.onclick = () => { S.shown += 200; draw(); };
      wrap.append(more);
    }
  };
  draw();
  stage.append(wrap);
}

// ── widok: czas ───────────────────────────────────────────────────────────────
// Sygnatura serwisu. Pion to NIE licznik — to miejsce, z ktorego list zostal wyslany,
// pasy uporzadkowane wg pierwszego listu stamtad. Wychodzi z tego itinerarium: mlody
// podroznik przez Heidelberg, Wieden i Florencje, dwadziescia lat ambasady w Wenecji,
// misja w Hadze, na koniec Eton. Szerokosc znacznika = szerokosc naszej niewiedzy
// o dacie: dzien jest kreska, sam rok pasem na caly rok.

function viewTime(stage, scope) {
  const box = el('div'); box.id = 'czas';
  const cv = el('canvas'); cv.id = 'ruler';
  const legend = el('div'); legend.id = 'legend';
  legend.innerHTML = [
    ['<i class="prec" data-p="10"></i>', t.legend.day],
    ['<i class="prec" data-p="7"></i>', t.legend.month],
    ['<i class="prec" data-p="4"></i>', t.legend.year],
    ['<i class="prec doubt" data-p="7"></i>', t.legend.editorial],
  ].map(([m, s]) => `<div>${m}<span>${esc(s)}</span></div>`).join('')
    + `<div><span>${esc(t.legend.zoom)}</span></div>`;
  box.append(cv, legend);
  stage.append(box);

  const dated = scope.filter(l => l.date);
  if (!dated.length) {
    box.innerHTML = `<div class="pad"><div class="empty">
      <p>${t.nothingDated}</p><span>${t.nothingDatedSub}</span></div></div>`;
    return;
  }
  const A = Math.min(...dated.map(l => t0(l.date))), B = Math.max(...dated.map(l => t1(l.date)));

  const NOWHERE = ' ';
  const lanes = [], laneOf = new Map();
  for (const l of dated) {
    const key = l.origin || NOWHERE;
    let lane = laneOf.get(key);
    if (!lane) { lane = { key, n: 0, first: Infinity, last: -Infinity }; laneOf.set(key, lane); lanes.push(lane); }
    lane.n++;
    lane.first = Math.min(lane.first, t0(l.date));
    lane.last = Math.max(lane.last, t1(l.date));
  }
  // pasy w kolejnosci pierwszego listu — z tego rodzi sie itinerarium; bez miejsca na dole
  lanes.sort((x, y) => (x.key === NOWHERE) - (y.key === NOWHERE) || x.first - y.first);
  lanes.forEach((l, i) => (l.i = i));

  const M = { l: 132, r: 30, t: 20, b: 32 };
  let W, H, rowH, marks = [], anim = 0, raf;
  // Wenecja 1604–1610 to lity blok — bez przyblizania nie da sie w nim niczego wskazac.
  // Zoom tylko w poziomie: pasow jest 35 i mieszcza sie zawsze, gesty jest czas.
  let v0 = A, v1 = B;
  const SPAN_MIN = 864e5 * 40;

  const X = ms => M.l + (ms - v0) / (v1 - v0) * (W - M.l - M.r);
  const unX = px => v0 + (px - M.l) / (W - M.l - M.r) * (v1 - v0);
  const clampView = () => {
    if (v1 - v0 > B - A) { v0 = A; v1 = B; return; }
    if (v0 < A) { v1 += A - v0; v0 = A; }
    if (v1 > B) { v0 -= v1 - B; v1 = B; }
  };
  const layout = () => {
    rowH = (H - M.t - M.b) / lanes.length;
    const h = Math.max(3, Math.min(rowH - 3, 11));
    marks = dated.map(l => {
      const a = X(t0(l.date)), b = Math.max(X(t1(l.date)), a + 2);
      const lane = laneOf.get(l.origin || NOWHERE);
      return { l, a, b, y: M.t + lane.i * rowH + (rowH - h) / 2, h };
    });
  };
  const paint = () => {
    const g = cv.getContext('2d'), dpr = devicePixelRatio || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    g.font = '500 10px Archivo, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const years = (v1 - v0) / 3.156e10;
    const step = years > 60 ? 10 : years > 25 ? 5 : years > 10 ? 2 : 1;
    const y0 = new Date(v0).getUTCFullYear(), y1 = new Date(v1).getUTCFullYear() + 1;
    for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
      const x = X(Date.UTC(y, 0, 1));
      if (x < M.l - 1 || x > W - M.r + 1) continue;
      g.strokeStyle = '#00000018';
      g.beginPath(); g.moveTo(x, M.t - 6); g.lineTo(x, H - M.b); g.stroke();
      g.fillStyle = '#93a0a0'; g.fillText(y, x, H - M.b + 16);
    }
    if (years < 3.2) {                       // dopiero tu miesiace maja sens
      const MON = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
      for (let y = y0; y <= y1; y++) for (let m = 1; m < 12; m++) {
        const x = X(Date.UTC(y, m, 1));
        if (x < M.l || x > W - M.r) continue;
        g.strokeStyle = '#0000000d';
        g.beginPath(); g.moveTo(x, M.t - 2); g.lineTo(x, H - M.b); g.stroke();
        // liczby rzymskie, bo tak numerowano miesiace w tych listach
        if (years < 1.6) { g.fillStyle = '#b3bcbc'; g.fillText(MON[m], x, H - M.b + 16); }
      }
    }

    g.textBaseline = 'middle';
    for (const lane of lanes) {
      const y = M.t + lane.i * rowH + rowH / 2;
      g.strokeStyle = '#00000012'; g.lineWidth = 1;
      g.beginPath();
      g.moveTo(Math.max(X(lane.first), M.l), y); g.lineTo(Math.min(X(lane.last), W - M.r), y);
      g.stroke();
      g.textAlign = 'right';
      g.fillStyle = lane.n > 3 ? '#1e2628' : '#93a0a0';
      g.font = `400 ${Math.min(13, Math.max(9, rowH * .62))}px "EB Garamond", Georgia, serif`;
      g.fillText(lane.key === NOWHERE ? t.nowhere : lane.key, M.l - 12, y);
      if (rowH > 13) {
        g.font = '400 9px "IBM Plex Mono", monospace'; g.textAlign = 'left';
        g.fillStyle = '#93a0a0'; g.fillText(lane.n, W - M.r + 6, y);
      }
    }

    // 323 z 526 dat maja zastrzezenie redaktora — czerwien musi byc cicha, inaczej
    // caly wykres krzyczy. Ton, nie alarm.
    const cut = M.l + anim * (W - M.l - M.r);
    g.save();
    g.beginPath(); g.rect(M.l, 0, W - M.l - M.r, H); g.clip();
    for (const m of marks) {
      if (m.a > cut || m.b < M.l || m.a > W - M.r) continue;
      g.fillStyle = S.letter === m.l.id ? '#1d5f58'
                  : doubt(m.l) ? 'rgba(156,58,44,.46)' : 'rgba(30,38,40,.62)';
      g.fillRect(m.a, m.y, Math.max(Math.min(m.b, cut) - m.a, .8), m.h);
    }
    g.restore();
  };
  const resize = () => {
    const dpr = devicePixelRatio || 1;
    W = cv.clientWidth; H = cv.clientHeight;
    if (!W || !H) return;
    cv.width = W * dpr; cv.height = H * dpr;
    layout(); paint();
  };

  const hit = (x, y) => marks.find(m => x >= m.a - 2 && x <= m.b + 2 && y >= m.y - 2 && y <= m.y + m.h + 2);
  let drag = null, moved = 0;

  cv.onwheel = e => {
    e.preventDefault();
    const at = unX(e.offsetX);
    const k = Math.exp(e.deltaY * 0.0016);
    let span = Math.min(B - A, Math.max(SPAN_MIN, (v1 - v0) * k));
    const f = Math.min(1, Math.max(0, (at - v0) / (v1 - v0)));
    v0 = at - span * f; v1 = v0 + span;
    clampView(); layout(); paint(); zoomUI();
  };
  cv.onmousedown = e => { drag = { x: e.offsetX, v0, v1 }; moved = 0; };
  addEventListener('mouseup', () => { drag = null; });
  cv.onmousemove = e => {
    if (drag) {
      const d = (drag.x - e.offsetX) / (W - M.l - M.r) * (drag.v1 - drag.v0);
      moved = Math.max(moved, Math.abs(drag.x - e.offsetX));
      v0 = drag.v0 + d; v1 = drag.v1 + d;
      clampView(); layout(); paint();
      cv.style.cursor = 'grabbing';
      return;
    }
    const m = hit(e.offsetX, e.offsetY);
    cv.title = m ? [m.l.marked || m.l.date, `${m.l.a} → ${m.l.r}`, m.l.origin || t.placeUnknown].join('\n') : '';
    cv.style.cursor = m ? 'pointer' : 'grab';
  };
  cv.onclick = e => {
    if (moved > 3) return;                   // przeciagniecie, nie klikniecie
    const m = hit(e.offsetX, e.offsetY);
    if (m) openLetter(m.l.id);
  };
  cv.ondblclick = () => { v0 = A; v1 = B; layout(); paint(); zoomUI(); };

  const zoomUI = () => {
    const on = v1 - v0 < (B - A) - 1;
    let btn = legend.querySelector('.go');
    if (on && !btn) {
      btn = el('button', 'go', t.resetZoom);
      btn.onclick = () => { v0 = A; v1 = B; layout(); paint(); zoomUI(); };
      legend.append(btn);
    } else if (!on && btn) btn.remove();
    else if (btn) btn.textContent = t.resetZoom;
  };

  const ro = new ResizeObserver(resize); ro.observe(cv);
  stage._cleanup = () => { ro.disconnect(); cancelAnimationFrame(raf); };

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) anim = 1;
  else {
    const start = performance.now();
    const step = now => { anim = Math.min(1, (now - start) / 950); paint(); if (anim < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  }
}

// ── widok: ludzie ─────────────────────────────────────────────────────────────
// Ten korpus nie jest siecia, tylko GWIAZDA: przy kazdym z 526 listow stoi Wotton po
// jednej ze stron, zaden list nie laczy dwoch innych osob, a na 71 osob dokladnie jedna
// (on) ma wiecej niz jednego partnera. Rysowanie "otoczenia" wybranej osoby dawaloby
// wiec jedna krawedz. Rysujemy zawsze cala gwiazde i podswietlamy wybranego promienia.
// Kat = rok pierwszego listu (pierscien jest zegarem 1589→1639), odleglosc od srodka
// = czestosc. Deterministyczne, wiec za kazdym razem ten sam obrazek.

function viewPeople(stage) {
  const box = el('div'); box.id = 'ludzie';
  const roster = el('div'); roster.id = 'roster';
  const ego = el('div'); ego.id = 'ego';
  const cv = el('canvas');
  const hint = el('div'); hint.id = 'egohint';
  ego.append(cv, hint);
  box.append(roster, ego);
  stage.append(box);

  for (const p of [...S.people.values()].sort((a, b) => (b.sent + b.got) - (a.sent + a.got))) {
    const b = el('button');
    b.setAttribute('aria-current', String(S.person === p.id));
    b.innerHTML = `<span class="nm">${esc(p.name)}</span><span class="ct">${p.sent + p.got}</span>`;
    b.onclick = () => { S.person = S.person === p.id ? null : p.id; render(); };
    roster.append(b);
  }

  const hub = S.people.get(S.dominant);
  if (!hub) return;

  const profile = () => {
    const me = S.person && S.people.get(S.person);
    if (!me || me.id === hub.id) {
      hint.innerHTML = `<p>${esc(hub.name)}</p><span class="label">${esc(t.starNote)}</span>`;
      return;
    }
    const rec = S.rec.get(me.id);
    const mine = S.letters.filter(l => (l.aid === me.id || l.rid === me.id) && l.date).map(l => l.date);
    hint.innerHTML = `<p>${esc(me.name)}</p>
      <span class="label">${[
        rec?.birthDate && `${rec.birthDate}–${rec.deathDate || ''}`,
        rec?.jobTitle,
        `${me.sent + me.got} ${t.withHub}`,
        mine.length && `${t.span} ${mine[0].slice(0, 4)}–${mine[mine.length - 1].slice(0, 4)}`,
      ].filter(Boolean).map(esc).join(' · ')}</span>
      <button class="go">${t.showLetters}</button>`;
    hint.querySelector('.go').onclick = () => { location.hash = '#/letters'; };
  };

  const dated = S.letters.filter(l => l.date);
  const A = Math.min(...dated.map(l => t0(l.date))), B = Math.max(...dated.map(l => t0(l.date)));
  const partners = [...hub.with].map(([id, n]) => ({ p: S.people.get(id), n }))
    .filter(x => x.p).sort((a, b) => b.n - a.n);
  const maxN = Math.max(...partners.map(x => x.n), 1);

  const paint = () => {
    const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 68;

    g.strokeStyle = '#00000012';
    for (const f of [.45, .72, 1]) { g.beginPath(); g.arc(cx, cy, R * f, 0, 7); g.stroke(); }
    // podzialka mowi, ze pierscien to zegar — bez niej nikt sie tego nie domysli
    g.font = '500 9.5px Archivo, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let y = 1590; y <= new Date(B).getUTCFullYear(); y += 10) {
      const ang = ((Date.UTC(y, 0, 1) - A) / (B - A || 1)) * Math.PI * 2 - Math.PI / 2;
      g.strokeStyle = '#0000001f'; g.beginPath();
      g.moveTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
      g.lineTo(cx + Math.cos(ang) * (R + 11), cy + Math.sin(ang) * (R + 11)); g.stroke();
      g.fillStyle = '#93a0a0';
      g.fillText(y, cx + Math.cos(ang) * (R + 22), cy + Math.sin(ang) * (R + 22));
    }

    const pos = partners.map(({ p, n }) => {
      const ang = ((p.first - A) / (B - A || 1)) * Math.PI * 2 - Math.PI / 2;
      const r = R * (1 - .55 * Math.sqrt(n / maxN));
      return { p, n, on: p.id === S.person, x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
    });
    for (const q of pos) {
      g.strokeStyle = q.on ? '#1d5f58' : '#1e26281a';
      g.lineWidth = q.on ? 1.6 : Math.min(3, .5 + q.n / maxN * 2.5);
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(q.x, q.y); g.stroke();
    }
    for (const q of pos) {
      const rr = 2.5 + Math.sqrt(q.n) * 1.6;
      // czerwien rubrykowa znaczy w tym serwisie WYLACZNIE niepewna date — wybor
      // zaznaczamy atramentem, nie nia
      g.fillStyle = q.on ? '#1e2628' : '#1d5f58';
      g.beginPath(); g.arc(q.x, q.y, q.on ? rr + 1.5 : rr, 0, 7); g.fill();
      if (q.on || q.n >= maxN * .12 || partners.length < 22) {
        g.fillStyle = q.on ? '#1e2628' : '#1e2628b3';
        g.font = `400 13px "EB Garamond", Georgia, serif`;
        g.textAlign = q.x < cx ? 'right' : 'left'; g.textBaseline = 'middle';
        g.fillText(q.p.name, q.x + (q.x < cx ? -rr - 6 : rr + 6), q.y);
      }
    }
    g.fillStyle = '#1e2628'; g.beginPath(); g.arc(cx, cy, 5, 0, 7); g.fill();
    g.fillStyle = '#1e2628'; g.font = '400 14px "EB Garamond", Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText(hub.name, cx, cy + 11);
    cv._pos = pos;
  };
  cv.onclick = e => {
    const q = (cv._pos || []).find(q => Math.hypot(q.x - e.offsetX, q.y - e.offsetY) < 14);
    if (q) { S.person = q.p.id === S.person ? null : q.p.id; render(); }
  };
  cv.onmousemove = e => {
    const q = (cv._pos || []).find(q => Math.hypot(q.x - e.offsetX, q.y - e.offsetY) < 14);
    cv.style.cursor = q ? 'pointer' : 'default';
    cv.title = q ? `${q.p.name} — ${q.n}` : '';
  };

  profile();
  const ro = new ResizeObserver(paint); ro.observe(cv);
  stage._cleanup = () => ro.disconnect();
}

// ── widok: miejsca ────────────────────────────────────────────────────────────
// Wlasna kanwa zamiast Leafleta z kafelkami: linia brzegowa (74 kB) jedzie z serwisem,
// wiec mapa dziala offline i na statycznym hostingu, jest w palecie strony i nie opiera sie
// o cudzy serwer kafelkow (polityka OSM nie przewiduje publicznych serwisow).
// Odwzorowanie Merkatora — dla Europy wyglada tak, jak ludzie sie spodziewaja.

const merc = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * (180 / Math.PI);

function viewPlaces(stage) {
  const box = el('div'); box.id = 'mapa';
  const roster = el('div'); roster.id = 'roster';
  const wrap = el('div'); wrap.id = 'mapwrap';
  const cv = el('canvas');
  const hint = el('div'); hint.id = 'egohint';
  wrap.append(cv, hint);
  box.append(roster, wrap);
  stage.append(box);

  const pins = S.places.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .sort((x, y) => (y.sent + y.got) - (x.sent + x.got));
  if (!pins.length) return;
  // Pole kola = wszystkie listy zwiazane z miejscem, wiec promien ~ pierwiastek.
  // Wypelniony srodek = te wyslane stad. Londyn: wielki pierscien, maly srodek (prawie
  // wszystko przychodzilo); Wenecja: kolo niemal cale wypelnione (prawie wszystko wychodzilo).
  const RAD = n => Math.sqrt(n) * 1.9;

  for (const p of pins) {
    const b = el('button');
    b.setAttribute('aria-current', String(S.place === p.label));
    b.innerHTML = `<span class="nm">${esc(p.label)}</span><span class="ct">${p.sent + p.got}</span>`;
    b.onclick = () => { S.place = S.place === p.label ? null : p.label; S.shown = 80; render(); };
    roster.append(b);
  }

  const profile = () => {
    const p = pins.find(x => x.label === S.place);
    if (!p) {
      hint.innerHTML = `<span class="label">${esc(t.mapKey)}</span>
        <span class="label" style="margin-top:7px">${esc(t.legend.zoom)}</span>`;
      return;
    }
    const mine = S.letters.filter(l => l.origin === p.label && l.date).map(l => l.date).sort();
    hint.innerHTML = `<p>${esc(p.label)}</p>
      <span class="label">${[
        p.sent && t.sentFrom(p.sent), p.got && t.arrived(p.got),
        mine.length && `${t.span} ${mine[0].slice(0, 4)}–${mine[mine.length - 1].slice(0, 4)}`,
      ].filter(Boolean).map(esc).join(' · ')}</span>
      <button class="go">${t.showLetters}</button>`;
    hint.querySelector('.go').onclick = () => { location.hash = '#/letters'; };
  };

  const bb = {
    w: Math.min(...pins.map(p => p.lon)) - 2.5, e: Math.max(...pins.map(p => p.lon)) + 2.5,
    s: Math.min(...pins.map(p => p.lat)) - 1.5, n: Math.max(...pins.map(p => p.lat)) + 1.5,
  };

  let W, H, k, ox, oy, k0 = 0, spots = [];
  const X = lon => (lon - bb.w) * k + ox;
  const Y = lat => (merc(bb.n) - merc(lat)) * k + oy;

  const fit = () => {
    k0 = Math.min((W - 60) / (bb.e - bb.w), (H - 60) / (merc(bb.n) - merc(bb.s)));
    k = k0;
    ox = (W - (bb.e - bb.w) * k) / 2;
    oy = (H - (merc(bb.n) - merc(bb.s)) * k) / 2;
  };

  const paint = () => {
    const dpr = devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const first = w !== W || h !== H;
    W = w; H = h;
    cv.width = W * dpr; cv.height = H * dpr;
    if (first || !k0) fit();
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    g.fillStyle = '#b9c4c6'; g.fillRect(0, 0, W, H);      // morze: carta azzurra
    g.fillStyle = '#dee3e3'; g.strokeStyle = '#00000018'; g.lineWidth = 1;
    for (const r of COAST) {
      g.beginPath();
      for (let i = 0; i < r.length; i += 2) {
        const x = X(r[i]), y = Y(r[i + 1]);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath(); g.fill(); g.stroke();
    }

    // przy zblizeniu w glab ladu nie ma sie czym orientowac — siatka wspolrzednych
    // pojawia sie dopiero wtedy, kiedy jest potrzebna
    if (k > k0 * 1.6) {
      const step = k > k0 * 7 ? 1 : k > k0 * 3 ? 2 : 5;
      const lonA = Math.floor(bb.w + (0 - ox) / k), lonB = Math.ceil(bb.w + (W - ox) / k);
      g.strokeStyle = '#00000010'; g.lineWidth = 1;
      g.font = '400 9px "IBM Plex Mono", monospace'; g.fillStyle = '#8fa09f';
      for (let lon = Math.ceil(lonA / step) * step; lon <= lonB; lon += step) {
        const x = X(lon);
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
        g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText(`${Math.abs(lon)}°${lon < 0 ? 'W' : 'E'}`, x + 3, 4);
      }
      for (let lat = 30; lat <= 66; lat += step) {
        const y = Y(lat);
        if (y < 0 || y > H) continue;
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
        g.textAlign = 'left'; g.textBaseline = 'bottom';
        g.fillText(`${lat}°N`, 4, y - 3);
      }
    }

    spots = pins.map(p => ({
      p, x: X(p.lon), y: Y(p.lat),
      r: Math.max(3.2, RAD(p.sent + p.got)),
      rin: p.sent ? Math.max(1.6, RAD(p.sent)) : 0,
      on: p.label === S.place,
    }));
    for (const s of spots) {
      if (s.rin) {
        g.fillStyle = s.on ? '#1e2628' : 'rgba(29,95,88,.58)';
        g.beginPath(); g.arc(s.x, s.y, Math.min(s.rin, s.r), 0, 7); g.fill();
      }
      g.strokeStyle = s.on ? '#1e2628' : '#1d5f58';
      g.lineWidth = s.on ? 2 : 1.1;
      g.beginPath(); g.arc(s.x, s.y, s.r, 0, 7); g.stroke();
    }

    // przy przyblizeniu jest miejsce na wiecej nazw; zawsze podpisujemy wybrane
    const budget = k > k0 * 2.2 ? pins.length : 12;
    g.font = '400 13px "EB Garamond", Georgia, serif';
    g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#1e2628';
    const placed = [];
    for (const s of [...spots].sort((x, y) => (y.on - x.on) || y.r - x.r)) {
      if (!s.on && placed.length >= budget) break;
      if (s.x < -40 || s.x > W + 40 || s.y < -20 || s.y > H + 20) continue;
      const lx = s.x + s.r + 5, ly = s.y;
      if (!s.on && placed.some(q => Math.abs(q.x - lx) < 70 && Math.abs(q.y - ly) < 13)) continue;
      placed.push({ x: lx, y: ly });
      g.fillStyle = s.on ? '#1e2628' : '#1e2628cc';
      g.fillText(s.p.label, lx, ly);
    }
  };

  const at = (x, y) => spots.find(s => Math.hypot(s.x - x, s.y - y) < Math.max(s.r, 7) + 3);
  let drag = null, moved = 0;

  cv.onwheel = e => {
    e.preventDefault();
    const f = Math.exp(-e.deltaY * 0.0016);
    const nk = Math.min(k0 * 12, Math.max(k0, k * f));
    const g = nk / k;
    ox = e.offsetX - (e.offsetX - ox) * g;
    oy = e.offsetY - (e.offsetY - oy) * g;
    k = nk;
    if (k === k0) fit();
    paint();
  };
  cv.onmousedown = e => { drag = { x: e.offsetX, y: e.offsetY, ox, oy }; moved = 0; };
  addEventListener('mouseup', () => { drag = null; });
  cv.onmousemove = e => {
    if (drag) {
      moved = Math.max(moved, Math.hypot(e.offsetX - drag.x, e.offsetY - drag.y));
      ox = drag.ox + (e.offsetX - drag.x);
      oy = drag.oy + (e.offsetY - drag.y);
      cv.style.cursor = 'grabbing';
      paint();
      return;
    }
    const s = at(e.offsetX, e.offsetY);
    cv.style.cursor = s ? 'pointer' : 'grab';
    cv.title = s ? [s.p.label, [s.p.sent && t.sentFrom(s.p.sent), s.p.got && t.arrived(s.p.got)]
      .filter(Boolean).join(' · ')].filter(Boolean).join('\n') : '';
  };
  cv.onclick = e => {
    if (moved > 3) return;
    const s = at(e.offsetX, e.offsetY);
    if (s) { S.place = s.p.label === S.place ? null : s.p.label; S.shown = 80; render(); }
  };
  cv.ondblclick = () => { fit(); paint(); };

  profile();
  const ro = new ResizeObserver(paint); ro.observe(cv);
  stage._cleanup = () => ro.disconnect();
}

// ── widok: zapytanie ──────────────────────────────────────────────────────────

function viewQuery(stage) {
  if (S.src !== 'db') {
    stage.append(el('div', 'pad',
      `<div class="empty"><p>${t.queryOffline}</p><span>${t.queryOfflineSub}</span></div>`));
    return;
  }
  const box = el('div'); box.id = 'zapytanie';
  box.innerHTML = `<div id="qbox">
      <textarea id="cypher" spellcheck="false">${esc(S.cypherText || RECIPES[0])}</textarea>
      <div id="qrow">
        <button id="run">${t.run}</button>
        <span class="label">⌘↵</span>
        <div id="recipes">${t.recipes.map((r, i) => `<button data-i="${i}">${esc(r)}</button>`).join('')}</div>
      </div>
    </div><div id="qout"></div>`;
  stage.append(box);

  const ta = box.querySelector('#cypher'), out = box.querySelector('#qout');
  const cell = v => {
    if (v == null) return '<span style="color:var(--ink-faint)">—</span>';
    if (Array.isArray(v)) return v.map(cell).join(', ');
    if (v.labels && v.properties) {
      const p = v.properties;
      return `<span class="node">${esc(p.label || p.prefLabel || p.surfaceForm || p.uri || '·')}<em>${
        esc([...v.labels].filter(x => x !== 'Node')[0] || 'Node')}</em></span>`;
    }
    if (v.type && v.start !== undefined) return `<span class="node"><em>${esc(v.type)}</em></span>`;
    if (v.segments) return `<span class="node">${v.segments.length + 1} ${t.nodes}<em>${t.path}</em></span>`;
    return esc(String(v)).slice(0, 320);
  };
  const run = async () => {
    S.cypherText = ta.value;
    out.innerHTML = `<span class="label">${t.running}</span>`;
    let res;
    try { res = await cypher(ta.value); }
    catch (e) { out.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    if (!res.rows.length) {
      out.innerHTML = `<div class="empty"><p>${t.zeroRows}</p><span>${t.zeroRowsSub}</span></div>`;
      return;
    }
    out.innerHTML = `<table><thead><tr>${res.keys.map(k => `<th>${esc(k)}</th>`).join('')}</tr></thead>
      <tbody>${res.rows.slice(0, 300).map(r =>
        `<tr>${res.keys.map(k => `<td>${cell(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>
      ${res.rows.length > 300 ? `<p class="label" style="margin-top:14px">${t.first300(res.rows.length)}</p>` : ''}`;
  };
  box.querySelector('#run').onclick = run;
  ta.onkeydown = e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run(); };
  box.querySelector('#recipes').onclick = e => {
    const b = e.target.closest('[data-i]');
    if (b) { ta.value = RECIPES[b.dataset.i]; run(); }
  };
  run();
}

// ── arkusz listu ──────────────────────────────────────────────────────────────

function openLetter(id) {
  S.letter = id;
  location.hash = '#/letter/' + id.split('/').pop();
}

function drawSheet(id) {
  const l = S.letters.find(x => x.id === id);
  if (!l) return closeSheet();
  S.letter = id;
  document.body.classList.add('sheet-open');

  const men = (l.mentions || []).filter(Boolean);
  const rec = S.rec.get(l.aid === S.dominant ? l.rid : l.aid);
  const person = (name, pid) => (pid
    ? `<button data-person="${esc(pid)}">${esc(name)}</button>` : esc(name || '—'));
  const flags = [l.inf === 'true' && t.inferred, l.unc === 'true' && t.uncertain,
                 l.apx === 'true' && t.approximate].filter(Boolean).join(' · ');

  $('#sheet').scrollTop = 0;
  $('#sheet').innerHTML = `<div class="in">
    <button id="close" title="${esc(t.close)}">×</button>
    <span class="label">${t.letter} · ${esc(l.id.split('/').pop())}</span>
    <p class="asmarked">${esc(l.marked || l.date || t.undated)}</p>
    <p class="norm"><time>${esc(l.date || '—')}</time>${precMark(l)}
      ${flags ? `<em>${esc(flags)}</em>` : ''}</p>
    ${l.incipit ? `<p class="quote">${esc(l.incipit)}</p>` : ''}
    ${l.abstract ? `<h3>${t.abstract}</h3><p class="abs">${esc(l.abstract)}</p>` : ''}
    <h3>${t.record}</h3>
    <dl>
      <dt>${t.from}</dt><dd>${person(l.a, l.aid)}</dd>
      <dt>${t.to}</dt><dd>${person(l.r, l.rid)}</dd>
      ${l.origin ? `<dt>${t.origin}</dt><dd>${esc(l.origin)}</dd>` : ''}
      ${l.dest ? `<dt>${t.dest}</dt><dd>${esc(l.dest)}</dd>` : ''}
      ${l.lang ? `<dt>${t.language}</dt><dd>${esc(l.lang)}</dd>` : ''}
      ${l.edition ? `<dt>${t.edition}</dt><dd>${esc(l.edition)}</dd>` : ''}
    </dl>
    ${l.subjects.length ? `<h3>${t.subjects}</h3><div class="chips">${l.subjects
      .map(s => `<span class="tag" data-tag="${esc(s)}">${esc(s)}</span>`).join('')}</div>` : ''}
    ${men.length ? `<h3>${t.mentioned} — ${men.length}</h3><div class="chips">${men
      .map(m => `<span class="tag">${esc(m)}</span>`).join('')}</div>` : ''}
    ${rec && (rec.birthDate || rec.note || rec.jobTitle) ? `<h3>${esc(rec.label)}</h3>` + dl([
      [t.born, rec.birthDate], [t.died, rec.deathDate], [t.role, rec.jobTitle],
      ['sameAs', rec.sameAs]]) + (rec.note ? `<p class="abs">${esc(clip(rec.note, 340))}</p>` : '') : ''}
    </div>`;

  $('#sheet #close').onclick = closeSheet;
  $('#sheet').onclick = e => {
    const p = e.target.closest('[data-person]'), tag = e.target.closest('[data-tag]');
    if (p) { S.person = p.dataset.person; S.view = 'people'; closeSheet(); render(); }
    else if (tag) { S.tag = tag.dataset.tag; S.view = 'letters'; S.shown = 80; closeSheet(); render(); }
  };
}

function closeSheet() {
  S.letter = null;
  document.body.classList.remove('sheet-open');
  if (location.hash.startsWith('#/letter/')) location.hash = '#/' + S.view;
}

// ── render + router ───────────────────────────────────────────────────────────

const VIEWS = { letters: viewLetters, time: viewTime, people: viewPeople, places: viewPlaces, query: viewQuery };

function render() {
  const stage = $('#stage');
  stage._cleanup?.(); stage._cleanup = null;
  stage.textContent = '';

  document.querySelectorAll('#views button')
    .forEach(b => b.setAttribute('aria-current', String(b.dataset.view === S.view)));

  const scope = inScope();
  const bits = [];
  if (S.tag) bits.push(`${t.fSubject}: ${S.tag}`);
  if (S.place) bits.push(`${t.fPlace}: ${S.place}`);
  if (S.person) bits.push(S.people.get(S.person)?.name);
  if (S.find.trim()) bits.push(`“${S.find.trim()}”`);

  $('#scope').innerHTML = S.view === 'query' || S.view === 'places'
    ? { query: S.src === 'db' ? t.cypherLive : t.cypherFrozen, places: t.placesTitle }[S.view]
    : `${esc(t.nav[S.view])} · ${scope.length}${bits.length ? ' · ' + esc(bits.join(' · ')) : ''}`
      + (bits.length ? ` <button id="clear">${t.clear}</button>` : '');
  const clear = $('#clear');
  if (clear) clear.onclick = () => {
    S.tag = S.person = S.place = null; S.find = ''; $('#find').value = ''; render();
  };

  $('#find').style.visibility = S.view === 'query' ? 'hidden' : 'visible';
  VIEWS[S.view](stage, scope);
}

const BASE = 'https://opus-project.eu/';
function route() {
  const h = location.hash.slice(2);
  if (h.startsWith('letter/')) {
    render();
    drawSheet(BASE + 'letter/' + decodeURIComponent(h.slice(7)));
    return;
  }
  if (h.startsWith('person/')) {
    S.person = BASE + 'person/' + decodeURIComponent(h.slice(7));
    S.view = 'people';
  } else if (VIEWS[h]) S.view = h;
  else S.view = 'letters';
  document.body.classList.remove('sheet-open');
  S.letter = null;
  render();
}

$('#views').onclick = e => {
  const b = e.target.closest('[data-view]');
  if (b) { S.shown = 80; location.hash = '#/' + b.dataset.view; }
};
$('#lang').onclick = e => {
  const b = e.target.closest('[data-lang]');
  if (b) setLang(b.dataset.lang);
};
$('#find').oninput = e => { S.find = e.target.value; S.shown = 80; render(); };
addEventListener('hashchange', route);
addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.letter) closeSheet();
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (e.key === '/' && !typing) { e.preventDefault(); $('#find').focus(); }
});

boot();
