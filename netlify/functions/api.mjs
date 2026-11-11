// Storage API. Everything is kept in the Netlify store called "storage":
//   posts.json            the list of posts
//   audio/<name>/<n>      audio files, kept in 4 MB pieces (Netlify limits each request to 6 MB)
//   audio/<name>/meta     size and type of each audio file
import { getStore } from "@netlify/blobs";
export const config = { path: "/api/*" };

const CH = 4 * 1024 * 1024;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const okName = n => /^[a-z0-9][a-z0-9._-]{0,90}$/i.test(n || "");

export default async (req) => {
  const store = getStore("storage");
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const pw = process.env.ADMIN_PASSWORD;
  const isAdmin = !!pw && req.headers.get("x-admin-password") === pw;
  const guard = () => !pw ? json({ error: "ADMIN_PASSWORD is not set in Netlify yet." }, 500) : (!isAdmin ? json({ error: "Wrong password." }, 401) : null);

  try {
    if (parts[0] === "check") return guard() || json({ ok: true });

    if (parts[0] === "posts") {
      if (req.method === "GET") {
        const all = (await store.get("posts.json", { type: "json" })) || [];
        // visitors never receive posts that are not live yet
        return json(isAdmin ? all : all.filter(p => new Date(p.publishAt) <= Date.now()));
      }
      if (req.method === "PUT") {
        const g = guard(); if (g) return g;
        const list = await req.json();
        if (!Array.isArray(list)) return json({ error: "Bad data." }, 400);
        await store.setJSON("posts.json", list);
        return json({ ok: true });
      }
    }

    if (parts[0] === "audio" && okName(parts[1])) {
      const name = parts[1];
      const metaKey = `audio/${name}/meta`;

      if (req.method === "GET") {
        const meta = await store.get(metaKey, { type: "json" });
        if (!meta) return new Response("Not found", { status: 404 });
        const size = meta.size, range = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
        let start = 0, end = size - 1, partial = false;
        if (range) {
          partial = true;
          if (range[1] === "" && range[2] !== "") { start = Math.max(0, size - +range[2]); }
          else { start = +range[1] || 0; if (range[2] !== "") end = Math.min(+range[2], size - 1); }
        }
        if (size > CH) partial = true;
        end = Math.min(end, start + CH - 1, size - 1);
        if (start > end) return new Response("Bad range", { status: 416, headers: { "content-range": `bytes */${size}` } });
        const first = Math.floor(start / CH), last = Math.floor(end / CH);
        const bufs = [];
        for (let i = first; i <= last; i++) {
          const b = await store.get(`audio/${name}/${i}`, { type: "arrayBuffer" });
          if (!b) return new Response("Missing audio data", { status: 500 });
          bufs.push(new Uint8Array(b));
        }
        const all = new Uint8Array(bufs.reduce((n, b) => n + b.length, 0));
        let o = 0; for (const b of bufs) { all.set(b, o); o += b.length; }
        const out = all.subarray(start - first * CH, end - first * CH + 1);
        const h = { "content-type": meta.type || "audio/mpeg", "accept-ranges": "bytes", "content-length": String(out.length), "cache-control": "public, max-age=3600" };
        if (partial) h["content-range"] = `bytes ${start}-${end}/${size}`;
        return new Response(out, { status: partial ? 206 : 200, headers: h });
      }

      if (req.method === "PUT") {
        const g = guard(); if (g) return g;
        const i = +url.searchParams.get("i"), n = +url.searchParams.get("n");
        const buf = await req.arrayBuffer();
        if (buf.byteLength > CH) return json({ error: "Chunk too large." }, 413);
        await store.set(`audio/${name}/${i}`, buf);
        if (i === n - 1) await store.setJSON(metaKey, { size: +url.searchParams.get("size"), type: url.searchParams.get("type") || "audio/mpeg", n });
        return json({ ok: true });
      }

      if (req.method === "DELETE") {
        const g = guard(); if (g) return g;
        const meta = await store.get(metaKey, { type: "json" });
        if (meta) { for (let i = 0; i < meta.n; i++) await store.delete(`audio/${name}/${i}`); await store.delete(metaKey); }
        return json({ ok: true });
      }
    }
    return json({ error: "Not found" }, 404);
  } catch (e) { return json({ error: e.message }, 500); }
};
