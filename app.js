(() => {
  "use strict";

  // ---------- data ----------
  const DEX = window.POKEDEX;
  const REGIONS = ["", "Kanto", "Johto", "Hoenn", "Sinnoh", "Unova", "Kalos", "Alola", "Galar", "Paldea"];
  const TYPES = ["", "Normal", "Fighting", "Flying", "Poison", "Ground", "Rock", "Bug", "Ghost", "Steel",
    "Fire", "Water", "Grass", "Electric", "Psychic", "Ice", "Dragon", "Dark", "Fairy"];
  const OPS = ["=", ">", "<"];          // centre sign cycle
  const SEPS = ["", ">", "<", "="];      // green-slash sign cycle
  const PINK = "#ec5a98", GREEN = "#2f8a3a";

  // A family is keyed by the species id of its first member (unique per family).
  const FAM = new Map();
  for (const f of DEX.f) {
    const key = f.m[0];
    const mons = f.m.map(id => ({ id, name: DEX.p[id][0], types: DEX.p[id][1], legend: !!DEX.p[id][2] }));
    FAM.set(key, {
      key, gen: f.g, mons,
      legend: mons.some(m => m.legend),
      types: [...new Set(mons.flatMap(m => m.types))],
      primary: mons[0].types[0],
      label: mons.map(m => m.name).join(" / "),
    });
  }

  const spriteUrl = (id, art) => art
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`
    : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

  // ---------- state ----------
  // row = { l: {f:[keys], s:[seps between]}, op, r: {f:[], s:[]} }
  const blankSide = () => ({ f: [], s: [] });
  const blankRow = () => ({ l: blankSide(), op: "=", r: blankSide() });
  let state = { gl: 5, gr: 1, title: "", rows: [], art: false };
  let active = -1;          // highlighted row index
  let pinned = false;       // user explicitly picked the row (don't auto-advance)
  const history = [];

  const $ = id => document.getElementById(id);

  function snapshot() {
    history.push(JSON.stringify(state));
    if (history.length > 100) history.shift();
  }
  function save() {
    try { localStorage.setItem("genmatchup", JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function commit() { save(); render(); }

  // ---------- share-link encoding ----------
  const SEP_CH = { "": "/", ">": "g", "<": "l", "=": "e" };
  const CH_SEP = Object.fromEntries(Object.entries(SEP_CH).map(([k, v]) => [v, k]));
  const OP_CH = { "=": "e", ">": "g", "<": "l" };
  const CH_OP = { e: "=", g: ">", l: "<" };

  function encSide(side) {
    return side.f.map((k, i) => (i ? SEP_CH[side.s[i - 1] || ""] : "") + k).join("");
  }
  function decSide(str) {
    const side = blankSide();
    const parts = str.match(/[\/gle]?\d+/g) || [];
    parts.forEach((p, i) => {
      let sep = "";
      if (/^\D/.test(p)) { sep = CH_SEP[p[0]]; p = p.slice(1); }
      const k = +p;
      if (!FAM.has(k)) return;
      if (side.f.length) side.s.push(i ? sep : "");
      side.f.push(k);
    });
    return side;
  }
  function encode() {
    const p = new URLSearchParams();
    p.set("l", state.gl); p.set("r", state.gr);
    if (state.title) p.set("t", state.title);
    if (state.art) p.set("a", "1");
    p.set("m", state.rows.map(r => `${encSide(r.l)}_${OP_CH[r.op] || "e"}_${encSide(r.r)}`).join("."));
    return p.toString();
  }
  function decode(hash) {
    const p = new URLSearchParams(hash);
    if (!p.has("l") || !p.has("r")) return null;
    const s = { gl: +p.get("l") || 1, gr: +p.get("r") || 2, title: p.get("t") || "", art: p.get("a") === "1", rows: [] };
    for (const chunk of (p.get("m") || "").split(".")) {
      if (!chunk) continue;
      const [l = "", o = "e", r = ""] = chunk.split("_");
      s.rows.push({ l: decSide(l), op: CH_OP[o] || "=", r: decSide(r) });
    }
    return s;
  }

  // ---------- helpers ----------
  const genOf = side => side === "l" ? state.gl : state.gr;
  function usedKeys() {
    const used = new Set();
    for (const r of state.rows) { r.l.f.forEach(k => used.add(k)); r.r.f.forEach(k => used.add(k)); }
    return used;
  }
  function addToSide(side, key) {
    if (side.f.length) side.s.push("");
    side.f.push(key);
  }
  function removeFromSide(side, idx) {
    side.f.splice(idx, 1);
    if (side.s.length) side.s.splice(Math.max(0, idx - 1), 1);
  }

  // ---------- SVG signs (shared look for board and image export) ----------
  function opPath(op) {
    // drawn in a 40x30 box, centred at (20,15)
    if (op === "=") return "M6 9 H34 M6 21 H34";
    if (op === ">") return "M8 4 L32 15 L8 26";
    if (op === "<") return "M32 4 L8 15 L32 26";
    return "";
  }
  function opSvg(op, w = 40, color = PINK, stroke = 5.5) {
    return `<svg width="${w}" height="${w * 0.75}" viewBox="0 0 40 30"><path d="${opPath(op)}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function sepSvg(sign, h) {
    const sign_ = sign ? `<g transform="translate(5 ${h / 2 - 7}) scale(.6)"><path d="${opPath(sign)}" fill="none" stroke="${PINK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></g>` : "";
    return `<svg width="34" height="${h}" viewBox="0 0 34 ${h}"><line x1="13" y1="${h - 4}" x2="21" y2="4" stroke="${GREEN}" stroke-width="5" stroke-linecap="round"/>${sign_}</svg>`;
  }

  // ---------- rendering ----------
  function spriteImg(m, cls = "mon") {
    return `<img class="${cls}" src="${spriteUrl(m.id, state.art)}" alt="${m.name}" title="${m.name}" loading="lazy" crossorigin="anonymous">`;
  }

  function sideHtml(side, rowIdx, which) {
    if (!side.f.length) return "";
    const h = 56;
    return side.f.map((k, i) => {
      const fam = FAM.get(k);
      const sep = i ? `<button class="sep" data-act="sep" data-row="${rowIdx}" data-side="${which}" data-i="${i - 1}" title="Change comparison">${sepSvg(side.s[i - 1], h)}</button>` : "";
      return `${sep}<span class="fam" data-act="fam" data-row="${rowIdx}" data-side="${which}" data-i="${i}" title="${fam.label}">${fam.mons.map(m => spriteImg(m)).join("")}</span>`;
    }).join("");
  }

  function renderBoard() {
    const b = $("board");
    b.classList.toggle("art", state.art);
    let html = `<div class="head">${REGIONS[state.gl]}</div><div class="head c"></div><div class="head">${REGIONS[state.gr]}</div>`;
    if (!state.rows.length) {
      html += `<div class="empty-board"><span>Pick families from the lists to start a matchup — or hit Auto-match.</span></div>`;
    }
    state.rows.forEach((r, i) => {
      const act = i === active;
      html += `<div class="row${act ? " active" : ""}" data-row="${i}">
        <div class="cell l${r.l.f.length ? "" : " empty"}" data-act="row" data-row="${i}">${sideHtml(r.l, i, "l")}</div>
        <div class="cell c" data-act="row" data-row="${i}"><button class="op" data-act="op" data-row="${i}" title="Change comparison">${opSvg(r.op)}</button></div>
        <div class="cell r${r.r.f.length ? "" : " empty"}" data-act="row" data-row="${i}">${sideHtml(r.r, i, "r")}</div>
      </div>`;
      if (act) {
        html += `<div class="row-tools">
          <button data-act="up" data-row="${i}">↑ Up</button>
          <button data-act="down" data-row="${i}">↓ Down</button>
          <button data-act="swap" data-row="${i}" title="Flip the sign">Flip sign</button>
          <button data-act="del" data-row="${i}">Delete row</button>
          <button data-act="done">Done</button>
        </div>`;
      }
    });
    b.innerHTML = html;
    fitSprites();
  }

  // Shrink sprites so the widest row fits the screen (keeps the divider centred on phones).
  function fitSprites() {
    const units = Math.max(3, ...state.rows.map(r =>
      Math.max(...[r.l, r.r].map(sd => sd.f.reduce((n, k) => n + FAM.get(k).mons.length, 0) + sd.s.length * 0.6))));
    const half = ($("board").parentElement.clientWidth - 56 - 16) / 2 - 12;
    const s = Math.max(16, Math.min(60, Math.floor(half / units)));
    $("board").style.setProperty("--s", s + "px");
  }

  function renderPools() {
    const used = usedKeys();
    const q = $("search").value.trim().toLowerCase();
    const t = +$("typeFilter").value;
    const hideLeg = $("hideLegends").checked;
    for (const which of ["l", "r"]) {
      const gen = genOf(which);
      const list = [...FAM.values()].filter(f =>
        f.gen === gen && !used.has(f.key) &&
        (!hideLeg || !f.legend) &&
        (!t || f.types.includes(t)) &&
        (!q || f.label.toLowerCase().includes(q)));
      $("pool" + which.toUpperCase()).innerHTML = list.length
        ? list.map(f => `<button class="chip" data-key="${f.key}" data-side="${which}" title="${f.label}">
            <span class="sprites${state.art ? " art" : ""}">${f.mons.map(m => spriteImg(m)).join("")}</span>
            <span class="name">${f.mons[f.mons.length - 1].name}</span></button>`).join("")
        : `<div class="pool-empty">${q || t ? "No matches." : "All matched!"}</div>`;
      $("poolTitle" + which.toUpperCase()).textContent = `${REGIONS[gen]} (Gen ${gen}) · ${list.length}`;
    }
  }

  function renderTarget() {
    const r = state.rows[active];
    const willNew = !r || (!pinned && r.l.f.length && r.r.f.length);
    $("target").innerHTML = willNew
      ? `Next pick starts <b>row ${state.rows.length + 1}</b>`
      : `Adding to <b>row ${active + 1}</b>`;
  }

  function render() {
    $("genL").value = state.gl; $("genR").value = state.gr;
    if (document.activeElement !== $("title")) $("title").value = state.title;
    $("artStyle").checked = state.art;
    $("btnUndo").disabled = !history.length;
    renderBoard(); renderPools(); renderTarget();
  }

  // ---------- actions ----------
  function pick(which, key) {
    snapshot();
    let r = state.rows[active];
    if (!r || (!pinned && r.l.f.length && r.r.f.length)) {
      state.rows.push(blankRow());
      active = state.rows.length - 1;
      pinned = false;
      r = state.rows[active];
    }
    addToSide(r[which], key);
    commit();
  }

  function autoMatch() {
    const used = usedKeys();
    const hideLeg = $("hideLegends").checked;
    const pool = g => [...FAM.values()].filter(f => f.gen === g && !used.has(f.key) && (!hideLeg || !f.legend));
    const L = pool(state.gl), R = pool(state.gr);
    if (!L.length || !R.length) return toast("Nothing left to match.");
    const pairs = [];
    for (const a of L) for (const b of R) {
      let s = 0;
      if (a.primary === b.primary) s += 4;
      s += a.types.filter(t => b.types.includes(t)).length * 1.5;
      s -= Math.abs(a.mons.length - b.mons.length) * 1.2;
      if (a.legend !== b.legend) s -= 3;
      pairs.push([s, a, b]);
    }
    pairs.sort((x, y) => y[0] - x[0]);
    const doneL = new Set(), doneR = new Set();
    snapshot();
    // drop a trailing empty row so we don't leave gaps
    while (state.rows.length && !state.rows.at(-1).l.f.length && !state.rows.at(-1).r.f.length) state.rows.pop();
    let n = 0;
    for (const [, a, b] of pairs) {
      if (doneL.has(a.key) || doneR.has(b.key)) continue;
      doneL.add(a.key); doneR.add(b.key);
      state.rows.push({ l: { f: [a.key], s: [] }, op: "=", r: { f: [b.key], s: [] } });
      n++;
    }
    active = -1; pinned = false;
    commit();
    toast(`Added ${n} pairs. Tap the signs to make your calls.`);
  }

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, 2400);
  }

  // ---------- image export (drawn on a canvas) ----------
  function loadImg(src) {
    return new Promise(res => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
  }

  function strokePath(ctx, op, x, y, scale, color, width) {
    // x,y = top-left of the 40x30 box
    ctx.save();
    ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.stroke(new Path2D(opPath(op)));
    ctx.restore();
  }

  async function exportPng() {
    const btn = $("btnPng");
    btn.disabled = true; btn.textContent = "Rendering…";
    try {
      const S = 80, SEPW = 44, PAD = 24, MID = 80, ROWH = S + 12, rows = state.rows;
      const sideW = side => side.f.reduce((w, k) => w + FAM.get(k).mons.length * S, 0) + Math.max(0, side.f.length - 1) * SEPW;
      const half = Math.max(260, ...rows.map(r => Math.max(sideW(r.l), sideW(r.r))));
      const titleH = state.title ? 56 : 0, headH = 40;
      const W = PAD * 2 + half * 2 + MID;
      const H = titleH + headH + Math.max(1, rows.length) * ROWH + PAD;
      const ids = new Set();
      rows.forEach(r => [...r.l.f, ...r.r.f].forEach(k => FAM.get(k).mons.forEach(m => ids.add(m.id))));
      const imgs = new Map();
      await Promise.all([...ids].map(async id => imgs.set(id, await loadImg(spriteUrl(id, state.art)))));

      const scale = 2;
      const cv = document.createElement("canvas");
      cv.width = W * scale; cv.height = H * scale;
      const ctx = cv.getContext("2d");
      ctx.scale(scale, scale);
      ctx.imageSmoothingEnabled = state.art;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);

      const cx = W / 2;
      ctx.fillStyle = "#000";
      ctx.fillRect(cx - 8, titleH + 4, 16, H - titleH - 12);

      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#111";
      if (state.title) { ctx.font = "700 30px system-ui, sans-serif"; ctx.fillText(state.title, cx, titleH / 2 + 6); }
      ctx.font = "500 20px system-ui, sans-serif";
      ctx.fillText(REGIONS[state.gl].toUpperCase(), PAD + half / 2, titleH + headH / 2);
      ctx.fillText(REGIONS[state.gr].toUpperCase(), W - PAD - half / 2, titleH + headH / 2);

      const drawSide = (side, x, y) => {
        side.f.forEach((k, i) => {
          if (i) {
            ctx.strokeStyle = GREEN; ctx.lineWidth = 6; ctx.lineCap = "round";
            ctx.beginPath(); ctx.moveTo(x + SEPW / 2 - 6, y + S - 8); ctx.lineTo(x + SEPW / 2 + 6, y + 8); ctx.stroke();
            const sg = side.s[i - 1];
            if (sg) strokePath(ctx, sg, x + SEPW / 2 - 14, y + S / 2 - 10, 0.7, PINK, 7);
            x += SEPW;
          }
          for (const m of FAM.get(k).mons) {
            const im = imgs.get(m.id);
            if (im) ctx.drawImage(im, x, y, S, S);
            x += S;
          }
        });
      };

      rows.forEach((r, i) => {
        const y = titleH + headH + i * ROWH + 4;
        drawSide(r.l, cx - MID / 2 - sideW(r.l), y);
        drawSide(r.r, cx + MID / 2, y);
        strokePath(ctx, r.op, cx - 26, y + S / 2 - 19.5, 1.3, PINK, 6);
      });

      const blob = await new Promise(res => cv.toBlob(res, "image/png"));
      const name = `${REGIONS[state.gl]}-vs-${REGIONS[state.gr]}.png`.toLowerCase();
      const file = new File([blob], name, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
        await navigator.share({ files: [file], title: name }).catch(() => {});
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
    } catch (e) {
      console.error(e);
      toast("Couldn't render the image.");
    } finally {
      btn.disabled = false; btn.textContent = "Save image";
    }
  }

  // ---------- events ----------
  function setup() {
    for (const sel of [$("genL"), $("genR")]) {
      sel.innerHTML = REGIONS.slice(1).map((r, i) => `<option value="${i + 1}">Gen ${i + 1} · ${r}</option>`).join("");
    }
    $("typeFilter").innerHTML += TYPES.slice(1).map((t, i) => `<option value="${i + 1}">${t}</option>`).join("");

    const onGen = which => e => {
      const g = +e.target.value;
      const other = which === "gl" ? state.gr : state.gl;
      if (g === other) { e.target.value = state[which]; return toast("Pick two different generations."); }
      const hasRows = state.rows.some(r => (which === "gl" ? r.l : r.r).f.length);
      snapshot();
      state[which] = g;
      if (hasRows) {
        // families from the old generation no longer belong; clear that side
        state.rows.forEach(r => { r[which === "gl" ? "l" : "r"] = blankSide(); });
        state.rows = state.rows.filter(r => r.l.f.length || r.r.f.length);
        active = -1;
      }
      commit();
    };
    $("genL").onchange = onGen("gl");
    $("genR").onchange = onGen("gr");

    $("title").oninput = e => { state.title = e.target.value; save(); };
    $("search").oninput = renderPools;
    $("typeFilter").onchange = renderPools;
    $("hideLegends").onchange = renderPools;
    $("artStyle").onchange = e => { state.art = e.target.checked; commit(); };

    $("btnNewRow").onclick = () => { snapshot(); state.rows.push(blankRow()); active = state.rows.length - 1; pinned = true; commit(); };
    $("btnAuto").onclick = autoMatch;
    $("btnUndo").onclick = () => {
      if (!history.length) return;
      state = JSON.parse(history.pop());
      if (active >= state.rows.length) active = state.rows.length - 1;
      commit();
    };
    $("btnClear").onclick = () => {
      if (!state.rows.length || !confirm("Clear every row?")) return;
      snapshot(); state.rows = []; state.title = ""; active = -1; commit();
    };
    $("btnLink").onclick = async () => {
      const url = `${location.origin}${location.pathname}#${encode()}`;
      window.history.replaceState(null, "", url);
      try { await navigator.clipboard.writeText(url); toast("Link copied!"); }
      catch (e) { prompt("Copy this link:", url); }
    };
    $("btnPng").onclick = exportPng;

    document.querySelector(".pool-cols").addEventListener("click", e => {
      const chip = e.target.closest(".chip");
      if (chip) pick(chip.dataset.side, +chip.dataset.key);
    });

    $("board").addEventListener("click", e => {
      const el = e.target.closest("[data-act]");
      if (!el) return;
      const act = el.dataset.act, i = +el.dataset.row, r = state.rows[i];
      if (act === "op") {
        snapshot(); r.op = OPS[(OPS.indexOf(r.op) + 1) % OPS.length]; commit();
      } else if (act === "sep") {
        snapshot();
        const side = r[el.dataset.side], j = +el.dataset.i;
        side.s[j] = SEPS[(SEPS.indexOf(side.s[j] || "") + 1) % SEPS.length];
        commit();
      } else if (act === "fam") {
        if (i === active) {
          snapshot(); removeFromSide(r[el.dataset.side], +el.dataset.i); commit();
        } else { active = i; pinned = true; render(); }
      } else if (act === "row") {
        active = i; pinned = true; render();
      } else if (act === "up" && i > 0) {
        snapshot(); [state.rows[i - 1], state.rows[i]] = [state.rows[i], state.rows[i - 1]]; active = i - 1; commit();
      } else if (act === "down" && i < state.rows.length - 1) {
        snapshot(); [state.rows[i + 1], state.rows[i]] = [state.rows[i], state.rows[i + 1]]; active = i + 1; commit();
      } else if (act === "swap") {
        snapshot(); r.op = r.op === ">" ? "<" : r.op === "<" ? ">" : "="; commit();
      } else if (act === "del") {
        snapshot(); state.rows.splice(i, 1); active = Math.min(i, state.rows.length - 1); pinned = false; commit();
      } else if (act === "done") {
        active = -1; pinned = false; render();
      }
    });

    let resizeT;
    window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(renderBoard, 150); });
  }

  // ---------- boot ----------
  function load() {
    const fromHash = location.hash.length > 1 && decode(location.hash.slice(1));
    if (fromHash) { state = fromHash; return; }
    try {
      const saved = JSON.parse(localStorage.getItem("genmatchup") || "null");
      if (saved && saved.gl && saved.gr && Array.isArray(saved.rows)) state = { ...state, ...saved };
    } catch (e) { /* ignore */ }
  }

  setup();
  load();
  render();
})();
