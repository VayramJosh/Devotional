// ===== Public page =====
// Today = newest post whose go-live time has passed. Older posts move to the Archive automatically.
// Readers can save any post for later (kept on their own device) and browse the Archive by list or calendar.
const app = document.getElementById('app'), tabs = document.getElementById('tabs');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = d => new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const hasOther = p => p.other && p.other.text;
const mkey = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };
const dkey = d => mkey(d) + '-' + String(new Date(d).getDate()).padStart(2, '0');
const mname = k => { const [y, m] = k.split('-'); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); };
const shift = (k, n) => { const [y, m] = k.split('-').map(Number); return mkey(new Date(y, m - 1 + n, 1)); };
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const isPlaying = () => [...document.querySelectorAll('audio')].some(a => !a.paused && !a.ended);

// saved posts live in this browser only
let saved = [];
try { saved = JSON.parse(localStorage.getItem('devo-saved') || '[]'); } catch {}
const persist = () => { try { localStorage.setItem('devo-saved', JSON.stringify(saved)); } catch {} };
const isSaved = id => saved.includes(id);

let posts = [], view = 'today', cur = null, filter = 'all', amode = 'list', cm = null, cday = null, shownKey = null, pending = false;
const live = () => posts.filter(p => new Date(p.publishAt) <= Date.now()).sort((a, b) => new Date(b.publishAt) - new Date(a.publishAt));
const keyOf = l => [view, cur, filter, amode, cm, cday, saved.join(','), ...l.map(p => [p.id, p.title, p.publishAt, p.audio, (p.english || '').length, (p.other && p.other.text || '').length].join(':'))].join('|');

const saveBtn = p => `<button class="save ${isSaved(p.id) ? 'on' : ''}" data-s="${esc(p.id)}">${isSaved(p.id) ? '🔖 Saved' : '🔖 Save for later'}</button>`;

function body(p) {
  return `<div class="post" data-id="${esc(p.id)}">
    ${p.audio ? `<audio controls preload="none" src="${esc(p.audio)}"></audio>` : ''}
    ${hasOther(p) ? `<div class="seg">
        <button class="on" data-l="en">English</button>
        <button data-l="other">🌐 Translate · ${esc(p.other.lang || 'Other language')}</button>
      </div><div class="lbl">English</div>` : ''}
    <div class="text">${esc(p.english)}</div>
  </div>`;
}
const card = p => `<article class="card"><div class="top"><div class="mut">${day(p.publishAt)}</div>${saveBtn(p)}</div><h2>${esc(p.title)}</h2>${body(p)}</article>`;
const item = p => `<button class="item" data-p="${esc(p.id)}"><span><small>${day(p.publishAt)}${sameDay(p.publishAt, Date.now() - 864e5) ? ' · Yesterday' : ''}</small>${esc(p.title)}</span><span>›</span></button>`;

function listView(older) {
  const months = [...new Set(older.map(p => mkey(p.publishAt)))];
  if (filter !== 'all' && !months.includes(filter)) filter = 'all';
  let h = older.length
    ? `<div class="chips"><button class="chip ${filter === 'all' ? 'on' : ''}" data-f="all">All</button>${months.map(m => `<button class="chip ${filter === m ? 'on' : ''}" data-f="${m}">${esc(mname(m))}</button>`).join('')}</div>`
    : '<p class="mut center" style="margin-top:30px">No earlier posts yet.</p>';
  months.forEach(m => {
    if (filter !== 'all' && filter !== m) return;
    h += `<div class="mh">${esc(mname(m))}</div>` + older.filter(p => mkey(p.publishAt) === m).map(item).join('');
  });
  return h;
}

function calendarView(l) {
  const by = {}; l.forEach(p => (by[dkey(p.publishAt)] = by[dkey(p.publishAt)] || []).push(p));
  const ks = l.map(p => mkey(p.publishAt)).sort(), min = ks[0], max = ks[ks.length - 1];
  const [y, m] = cm.split('-').map(Number), lead = new Date(y, m - 1, 1).getDay(), n = new Date(y, m, 0).getDate(), todayK = dkey(Date.now());
  let h = `<div class="cal"><div class="calh"><button class="calnav" data-c="-1" aria-label="Previous month" ${cm <= min ? 'disabled' : ''}>‹</button><b>${esc(mname(cm))}</b><button class="calnav" data-c="1" aria-label="Next month" ${cm >= max ? 'disabled' : ''}>›</button></div><div class="cgrid">`
    + ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => `<span class="dow">${x}</span>`).join('') + '<span></span>'.repeat(lead);
  for (let d = 1; d <= n; d++) {
    const k = cm + '-' + String(d).padStart(2, '0'), t = k === todayK ? ' tod' : '';
    h += by[k] ? `<button class="cd has${cday === k ? ' sel' : ''}${t}" data-day="${k}" aria-label="${esc(day(by[k][0].publishAt))}">${d}</button>` : `<span class="cd${t}">${d}</span>`;
  }
  h += '</div><p class="mut center" style="margin:10px 0 0">Days with a post are highlighted. Tap one to open it.</p></div>';
  if (cday && by[cday]) h += `<div class="mh">${esc(day(by[cday][0].publishAt))}</div>` + by[cday].map(item).join('');
  return h;
}

function render(force) {
  const l = live();
  if (!cm && l.length) cm = mkey(l[0].publishAt);
  const key = keyOf(l);
  if (!force && key === shownKey) return;                 // nothing changed
  if (!force && isPlaying()) { pending = true; return; }  // don't interrupt someone listening
  shownKey = key; pending = false;
  if (view === 'post' && !l.find(p => p.id === cur)) view = 'archive';

  tabs.innerHTML = `<button class="${view === 'today' ? 'on' : ''}" data-v="today">Today</button><button class="${view !== 'today' ? 'on' : ''}" data-v="archive">Archive</button>`;
  if (!l.length) { app.innerHTML = '<p class="mut center">Nothing here yet. Check back soon.</p>'; return; }
  const [today, ...older] = l;

  if (view === 'today') {
    app.innerHTML = card(today) + (older.length ? '<button class="btn ghost wide" data-v="archive">🗂 Browse archive</button>' : '');
  } else if (view === 'post') {
    app.innerHTML = '<button class="btn ghost back" data-v="archive">← Back to archive</button>' + card(l.find(p => p.id === cur));
  } else {
    const sv = l.filter(p => isSaved(p.id));
    app.innerHTML = (sv.length ? '<div class="mh">🔖 Saved</div>' + sv.map(item).join('') : '')
      + `<div class="modes"><button class="${amode === 'list' ? 'on' : ''}" data-m="list">☰ List</button><button class="${amode === 'cal' ? 'on' : ''}" data-m="cal">📅 Calendar</button></div>`
      + (amode === 'cal' ? calendarView(l) : listView(older));
  }
}

document.addEventListener('click', e => {
  const seg = e.target.closest('.seg button');
  if (seg) {                                                // Translate toggle
    const box = seg.closest('.post'), p = posts.find(x => x.id === box.dataset.id); if (!p) return;
    const other = seg.dataset.l === 'other';
    box.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === seg));
    box.querySelector('.text').textContent = other ? p.other.text : p.english;
    box.querySelector('.lbl').textContent = other ? (p.other.lang || 'Other language') : 'English';
    return;
  }
  const sb = e.target.closest('[data-s]');
  if (sb) {                                                 // Save for later (updates in place so audio keeps playing)
    const id = sb.dataset.s;
    saved = isSaved(id) ? saved.filter(x => x !== id) : [...saved, id]; persist();
    document.querySelectorAll('[data-s]').forEach(b => {
      if (b.dataset.s !== id) return;
      b.classList.toggle('on', isSaved(id)); b.textContent = isSaved(id) ? '🔖 Saved' : '🔖 Save for later';
    });
    shownKey = keyOf(live());
    return;
  }
  const t = e.target.closest('[data-v],[data-f],[data-p],[data-m],[data-c],[data-day]'); if (!t) return;
  if (t.dataset.v) { view = t.dataset.v; scrollTo(0, 0); }
  if (t.dataset.f) filter = t.dataset.f;
  if (t.dataset.m) amode = t.dataset.m;
  if (t.dataset.c) { cm = shift(cm, +t.dataset.c); cday = null; }
  if (t.dataset.day) {
    cday = t.dataset.day;
    const same = live().filter(p => dkey(p.publishAt) === cday);
    if (same.length === 1) { cur = same[0].id; view = 'post'; scrollTo(0, 0); }
  }
  if (t.dataset.p) { cur = t.dataset.p; view = 'post'; scrollTo(0, 0); }
  render(true);
});

// ---- keep the page fresh: pick up new posts without a manual refresh ----
function refresh() {
  return fetch('api/posts?v=' + Date.now(), { cache: 'no-store' })
    .then(r => r.ok ? r.json() : (r.status === 404 ? [] : null))
    .catch(() => null)
    .then(d => { if (d) posts = d; render(); });
}
refresh();
setInterval(refresh, 60000);                 // check for new uploads every minute
setInterval(() => render(), 15000);          // scheduled posts appear the moment their time arrives
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
document.addEventListener('pause', () => { if (pending) render(); }, true);
document.addEventListener('ended', () => { if (pending) render(); }, true);
