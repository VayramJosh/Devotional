// ===== Admin page =====
// Everything you upload is saved automatically in the cloud folder called "storage" (via /api). No folder to pick.
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const loc = d => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
const CH = 4 * 1024 * 1024;
let posts = [], editId = null, when = 'now', pw = '';
try { pw = localStorage.getItem('devo-pw') || ''; } catch {}

async function api(path, opt = {}) {
  const r = await fetch('api/' + path, { ...opt, cache: 'no-store', headers: { ...(opt.headers || {}), 'x-admin-password': pw } });
  if (!r.ok) {
    let m = r.statusText; try { m = (await r.json()).error || m; } catch {}
    const e = new Error(m); e.status = r.status; throw e;
  }
  return r;
}
const msg = (t, bad) => { $('msg').textContent = t; $('msg').style.color = bad ? 'var(--bad)' : 'var(--ok)'; };
const show = on => { $('login').hidden = on; $('app').hidden = !on; };
const loadPosts = async () => { posts = await (await api('posts')).json(); };

// ---- sign in ----
async function login() {
  pw = $('pw').value; $('lmsg').textContent = '';
  try { await api('check'); try { localStorage.setItem('devo-pw', pw); } catch {} await start(); }
  catch (e) {
    $('lmsg').textContent = e.status === 401 ? 'Wrong password.'
      : (e.status === 404 || e instanceof TypeError) ? "Can't reach the storage. This only works on your Netlify site (or with 'netlify dev'), not Live Server."
      : e.message;
  }
}
$('loginBtn').onclick = login;
$('pw').onkeydown = e => { if (e.key === 'Enter') login(); };
$('logout').onclick = () => { try { localStorage.removeItem('devo-pw'); } catch {} pw = ''; $('pw').value = ''; show(false); };

// ---- tabs ----
function tab(t) {
  $('paneUpload').hidden = t !== 'upload'; $('panePosts').hidden = t !== 'posts';
  $('tabUpload').classList.toggle('on', t === 'upload'); $('tabPosts').classList.toggle('on', t === 'posts');
}
$('tabUpload').onclick = () => tab('upload');
$('tabPosts').onclick = () => tab('posts');

// ---- post now / schedule ----
function setWhen(w) {
  when = w;
  $('oNow').classList.toggle('on', w === 'now'); $('oLater').classList.toggle('on', w === 'later');
  $('dtrow').classList.toggle('off', w === 'now');
  $('save').textContent = editId ? 'Save changes' : (w === 'now' ? 'Post now' : 'Schedule post');
}
$('oNow').onclick = () => setWhen('now');
$('oLater').onclick = () => setWhen('later');

const loadTxt = (input, box) => input.onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => $(box).value = r.result; r.readAsText(f); };
loadTxt($('txtfile'), 'english');
loadTxt($('otxtfile'), 'otext');

// ---- storage helpers ----
const savePosts = () => api('posts', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(posts) });
const rmAudio = async p => { if (p) try { await api('audio/' + p.split('/').pop(), { method: 'DELETE' }); } catch {} };
async function uploadAudio(f, name) {
  const n = Math.max(1, Math.ceil(f.size / CH));
  for (let i = 0; i < n; i++) {
    msg('Uploading audio… ' + Math.round(i / n * 100) + '%');
    await api(`audio/${name}?i=${i}&n=${n}&size=${f.size}&type=${encodeURIComponent(f.type || 'audio/mpeg')}`, { method: 'PUT', body: f.slice(i * CH, (i + 1) * CH) });
  }
}

// ---- form ----
function nextSlot() {
  const last = posts.reduce((m, p) => Math.max(m, +new Date(p.publishAt)), 0);
  const d = last > Date.now() ? new Date(last + 864e5) : new Date(Date.now() + 864e5);
  d.setHours(6, 0, 0, 0); return loc(d);
}
function resetForm() {
  editId = null; $('ftitle').textContent = 'New post'; $('cancel').hidden = true;
  ['title', 'english', 'olang', 'otext'].forEach(i => $(i).value = '');
  $('audio').value = ''; $('txtfile').value = ''; $('otxtfile').value = '';
  $('when').value = nextSlot(); setWhen('now');
}
$('cancel').onclick = () => { resetForm(); msg(''); };

async function save() {
  const title = $('title').value.trim(); if (!title) return msg('Please add a title.', 1);
  if (when === 'later' && !$('when').value) return msg('Please pick a date and time.', 1);
  const publishAt = when === 'later' ? new Date($('when').value).toISOString() : new Date().toISOString();
  const otext = $('otext').value.trim();
  const other = otext ? { lang: $('olang').value.trim() || 'Other language', text: otext } : null;
  const p = editId ? posts.find(x => x.id === editId) : { id: Date.now().toString(36), audio: '' };
  const f = $('audio').files[0], oldAudio = p.audio;
  $('save').disabled = true; msg('Saving…');
  try {
    if (f) {
      const ext = (f.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3';
      const name = p.id + '-' + Date.now().toString(36) + '.' + ext;
      await uploadAudio(f, name);
      p.audio = 'api/audio/' + name;
    }
    Object.assign(p, { title, publishAt, english: $('english').value.trim(), other });
    if (!other) delete p.other;
    if (!editId) posts.push(p);
    msg('Saving…');
    await savePosts();
    if (f && oldAudio) await rmAudio(oldAudio);
    const was = when; resetForm(); renderList();
    msg(was === 'now' ? '✅ Saved to storage. It is live now.' : '✅ Scheduled. It will appear on the site at its time.');
  } catch (e) {
    msg('Could not save: ' + e.message, 1);
    if (e.status === 401) show(false);
  }
  $('save').disabled = false;
}
$('save').onclick = save;

// ---- schedule list ----
function renderList() {
  const sorted = [...posts].sort((a, b) => new Date(b.publishAt) - new Date(a.publishAt));
  $('list').innerHTML = sorted.map(p => {
    const live = new Date(p.publishAt) <= new Date();
    return `<div class="card"><span class="tag ${live ? 'live' : ''}">${live ? 'Live' : 'Scheduled'}</span>
      <span class="mut">${fmt(p.publishAt)}${p.audio ? ' · audio' : ''}${p.other ? ' · ' + esc(p.other.lang) : ''}</span>
      <h3>${esc(p.title)}</h3>
      <div class="row"><button class="btn ghost" data-e="${esc(p.id)}">Edit</button><button class="btn del" data-d="${esc(p.id)}">Delete</button></div></div>`;
  }).join('') || '<p class="mut">No posts yet.</p>';
  $('list').querySelectorAll('[data-e]').forEach(b => b.onclick = () => edit(b.dataset.e));
  $('list').querySelectorAll('[data-d]').forEach(b => b.onclick = () => del(b.dataset.d));
}
function edit(id) {
  const p = posts.find(x => x.id === id); if (!p) return;
  resetForm(); editId = id; tab('upload');
  $('ftitle').textContent = 'Edit post'; $('cancel').hidden = false;
  $('title').value = p.title; $('english').value = p.english || '';
  if (p.other) { $('olang').value = p.other.lang; $('otext').value = p.other.text; }
  $('when').value = loc(new Date(p.publishAt)); setWhen('later');
  msg('Editing. Choose a new audio file only if you want to replace the old one.'); scrollTo({ top: 0, behavior: 'smooth' });
}
async function del(id) {
  const p = posts.find(x => x.id === id); if (!p || !confirm('Delete "' + p.title + '" for good?')) return;
  try { await rmAudio(p.audio); posts = posts.filter(x => x.id !== id); await savePosts(); renderList(); }
  catch (e) { alert('Could not delete: ' + e.message); }
}

// ---- start ----
async function start() {
  await loadPosts(); show(true); resetForm(); renderList();
  $('barText').textContent = '✅ Signed in. Everything you upload is saved automatically to your "storage" folder online.';
}
(async () => { if (pw) { try { await api('check'); await start(); return; } catch {} } show(false); })();
