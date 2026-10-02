"""Render the Atlas content as one HTML review page (path first, then every entity with links and sources).

Usage: python tools/atlas/review_page.py --out <file.html>
The page lets the reviewer mark each entity OK / Change and write a note (kept in the browser only), then copy all
notes as text to paste back into the conversation.
"""
from __future__ import annotations

import argparse
import base64
import html
import re
import sqlite3
from pathlib import Path

from validate import ROOT, parse

TYPE_LABEL = {"person": "Person", "work": "Work", "film": "Film", "series": "TV series", "radio": "Radio",
              "music": "Music", "artwork": "Visual art", "magazine": "Magazine", "issue": "Issue", "event": "Event",
              "movement": "Movement", "theme": "Theme"}
LANE_LABEL = {"magazines": "Magazines & stories", "books": "Books", "film-tv": "Film & TV", "music": "Music",
              "visual-art": "Visual art", "comics": "Comics & manga", "events": "World events"}
REL_LABEL = {"influenced": "Influenced", "adapted_as": "Adapted as", "published_in": "Published in",
             "collected_in": "Collected in", "cover_of": "Cover of",
             "created_by": "Created by", "read_next": "Read next", "context": "Context"}
ORDER = ["person", "magazine", "issue", "artwork", "work", "radio", "film", "series", "music", "movement", "event", "theme"]
MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()


def fmt_date(d: str | None) -> str:
    if not d:
        return ""
    parts = str(d).split("-")
    if len(parts) == 1:
        return parts[0]
    if len(parts) == 2:
        return f"{MONTHS[int(parts[1]) - 1]} {parts[0]}"
    return f"{int(parts[2])} {MONTHS[int(parts[1]) - 1]} {parts[0]}"


def inline(text: str, eid: str) -> str:
    t = html.escape(text, quote=False)
    t = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", t)
    return re.sub(r"\[(\d+)\]", lambda m: f'<sup><a href="#{eid}-s{m.group(1)}">{m.group(1)}</a></sup>', t)


def body_html(body: str, eid: str) -> str:
    out = []
    for block in re.split(r"\n\s*\n", body.strip()):
        block = block.strip()
        if block.startswith("## "):
            head, _, rest = block.partition("\n")
            out.append(f"<h4>{html.escape(head[3:])}</h4>")
            if rest.strip():
                out.append(f"<p>{inline(' '.join(rest.split()), eid)}</p>")
        elif block:
            out.append(f"<p>{inline(' '.join(block.split()), eid)}</p>")
    return "\n".join(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--content", type=Path, default=ROOT / "content" / "atlas")
    ap.add_argument("--catalog", type=Path, default=ROOT / "app" / "public" / "catalog")
    a = ap.parse_args()

    docs = {p.stem: parse(p) for p in sorted((a.content / "entities").glob("*.md"))}
    path = parse(next((a.content / "paths").glob("*.md")))
    con = sqlite3.connect(a.catalog / "catalog.db") if (a.catalog / "catalog.db").exists() else None

    def readable(mag: str, issue: str) -> bool | None:
        if not con:
            return None
        y, m = issue.split("-")
        r = con.execute("SELECT i.ia_identifier FROM issue i JOIN magazine g ON g.id = i.magazine_id "
                        "WHERE g.slug = ? AND i.year = ? AND i.month = ?", (mag, int(y), int(m))).fetchone()
        return bool(r and r[0])

    def cover_uri(ref: str) -> str | None:
        mag, _, issue = ref.partition("/")
        f = a.catalog / "covers" / f"{mag}-{issue}.webp"
        return "data:image/webp;base64," + base64.b64encode(f.read_bytes()).decode() if f.exists() else None

    def title(eid: str) -> str:
        return html.escape(docs[eid].meta["title"]) if eid in docs else html.escape(eid)

    # ---- path ----------------------------------------------------------------------------------------------------
    stops = []
    for i, s in enumerate(path.meta["stops"], 1):
        d = docs[s["entity"]].meta
        year = fmt_date(d.get("date")).split(" ")[-1] if d.get("date") else ""
        stops.append(f'<li><a class="stop" href="#{s["entity"]}"><span class="n num">{i}</span>'
                     f'<span class="yr num">{year}</span><span class="st"><b>{title(s["entity"])}</b>'
                     f'<span>{html.escape(s["why"])}</span></span></a></li>')

    # ---- entities ------------------------------------------------------------------------------------------------
    inbound: dict[str, list[tuple[str, str]]] = {}
    for eid, d in docs.items():
        for l in d.meta.get("links", []):
            inbound.setdefault(l["to"], []).append((l["rel"], eid))

    sections = []
    for typ in ORDER:
        ids = sorted((i for i, d in docs.items() if d.meta["type"] == typ), key=lambda i: str(docs[i].meta.get("date", "")))
        if not ids:
            continue
        cards = []
        for eid in ids:
            m = docs[eid].meta
            dates = fmt_date(m.get("date")) + (f" – {fmt_date(m.get('end'))}" if m.get("end") else "")
            facts = [f'<span class="badge t-{typ}">{TYPE_LABEL[typ]}</span>']
            if m.get("lane"):
                facts.append(f'<span class="lane">{LANE_LABEL[m["lane"]]}</span>')
            if dates:
                facts.append(f'<span class="num">{dates}</span>')
            themes = "".join(f'<a class="chip" href="#{t}">{title(t)}</a>' for t in m.get("themes", []))
            img = ""
            if (m.get("image") or {}).get("catalog_cover"):
                uri = cover_uri(m["image"]["catalog_cover"])
                if uri:
                    img = f'<img class="cover" src="{uri}" alt="Cover of {title(eid)}">'
            cat = []
            for c in m.get("catalog", []):
                ok = readable(c["magazine"], c["issue"])
                label = f'{"Amazing Stories" if c["magazine"] == "amazing-stories" else c["magazine"]}, {fmt_date(c["issue"])}'
                if c.get("story"):
                    label = f'“{html.escape(c["story"])}” · {label}'
                state = ('<span class="stamp">Readable in Banca</span>' if ok else
                         '<span class="noscan">In the catalog · no scan yet</span>' if ok is False else "")
                cat.append(f"<li>{label} {state}</li>")
            links = [f'<li><span class="rel">{REL_LABEL[l["rel"]]}</span> <a href="#{l["to"]}">{title(l["to"])}</a>'
                     + (f' <span class="why">— {html.escape(l["note"])}</span>' if l.get("note") else "") + "</li>"
                     for l in m.get("links", [])]
            links += [f'<li><span class="rel in">← {REL_LABEL[rel]}</span> <a href="#{src}">{title(src)}</a></li>'
                      for rel, src in inbound.get(eid, [])]
            media = []
            if img_meta := (m.get("image") or {}):
                if img_meta.get("url"):
                    media.append(f'<li>Image: <a href="{html.escape(img_meta["source"])}" target="_blank" rel="noopener">'
                                 f'{html.escape(img_meta["source"].rsplit("File:", 1)[-1])}</a> · {html.escape(img_meta["credit"])} · '
                                 f'{html.escape(img_meta["license"])}</li>')
                elif img_meta.get("catalog_cover"):
                    media.append(f'<li>Image: catalog cover {html.escape(img_meta["catalog_cover"])}</li>')
            ext = m.get("external") or {}
            if ext.get("imdb"):
                media.append(f'<li><a href="https://www.imdb.com/title/{ext["imdb"]}/" target="_blank" rel="noopener">IMDb ↗</a></li>')
            if ext.get("spotify_album"):
                media.append(f'<li><a href="https://open.spotify.com/album/{ext["spotify_album"]}" target="_blank" rel="noopener">Spotify ↗</a></li>')
            srcs = "".join(
                f'<li id="{eid}-s{s["n"]}"><a href="{html.escape(s["url"])}" target="_blank" rel="noopener">{html.escape(s["title"])}</a></li>'
                if s["url"].startswith("http") else f'<li id="{eid}-s{s["n"]}">{html.escape(s["title"])}</li>'
                for s in m.get("sources", []))
            cards.append(f"""
<article class="entity" id="{eid}" data-id="{eid}">
  <header>
    <div class="facts">{''.join(facts)}<span class="status">{html.escape(m['status'])}</span></div>
    <h3>{title(eid)}</h3>
    <p class="sub">{html.escape(m.get('subtitle', ''))}</p>
  </header>
  <div class="cols">
    <div class="text">{img}{body_html(docs[eid].body, eid)}</div>
    <aside>
      {f'<h5>Themes</h5><div class="chips">{themes}</div>' if themes else ''}
      {f'<h5>In Banca</h5><ul class="plain">{"".join(cat)}</ul>' if cat else ''}
      {f'<h5>Connections</h5><ul class="plain links">{"".join(links)}</ul>' if links else ''}
      {f'<h5>Image &amp; links</h5><ul class="plain">{"".join(media)}</ul>' if media else ''}
      {f'<h5>Sources</h5><ol class="sources">{srcs}</ol>' if srcs else ''}
    </aside>
  </div>
  <div class="review">
    <div class="seg" role="group" aria-label="Review {title(eid)}">
      <button type="button" data-v="ok">OK</button><button type="button" data-v="change">Change</button>
    </div>
    <textarea id="note-{eid}" rows="2" placeholder="What should change? (optional)"></textarea>
  </div>
</article>""")
        sections.append(f'<section><h2 class="sec">{TYPE_LABEL[typ]}{"s" if typ not in ("music", "series") else ""}'
                        f' <span class="count num">{len(ids)}</span></h2>{"".join(cards)}</section>')

    page = TEMPLATE.replace("%TITLE%", html.escape(path.meta["title"])) \
        .replace("%SUBTITLE%", html.escape(path.meta.get("subtitle", ""))) \
        .replace("%INTRO%", body_html(path.body, "path")) \
        .replace("%STOPS%", "".join(stops)).replace("%SECTIONS%", "".join(sections)) \
        .replace("%COUNT%", str(len(docs))).replace("%PATHN%", str(len(stops)))
    a.out.write_text(page, encoding="utf-8")
    print(f"wrote {a.out} ({len(page) // 1024} KB, {len(docs)} entities)")


TEMPLATE = r"""<title>Atlas Pilot Review</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800;900&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&display=swap">
<style>
/* Banca "Newsprint": aged paper, warm ink, red masthead with halftone; a long reading page with a review strip per entity */
:root {
  --bg: #EEE2C6; --surface: #F7EEDA; --surface-2: #E4D4AF; --ink: #2A2118; --muted: #5E4E3A; --rule: #D6C6A2;
  --red: #C8321F; --on-red: #FFF4DC; --yellow: #F2B705; --blue: #1F4E8C; --green: #3E7D45;
  --mast-ink: #FFF4DC; --shadow: 4px 4px 0 var(--ink);
  --f-display: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  --f-text: 'Source Serif 4', Georgia, serif;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0E1222; --surface: #171C30; --surface-2: #222842; --ink: #F1E4C6; --muted: #ABA38C; --rule: #2A3150;
  --red: #FF5A44; --on-red: #0E1222; --yellow: #FFC93C; --blue: #86A8F0; --green: #7CC98A; --shadow: 4px 4px 0 #05070F;
  color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #0E1222; --surface: #171C30; --surface-2: #222842; --ink: #F1E4C6; --muted: #ABA38C; --rule: #2A3150;
  --red: #FF5A44; --on-red: #0E1222; --yellow: #FFC93C; --blue: #86A8F0; --green: #7CC98A; --shadow: 4px 4px 0 #05070F;
  color-scheme: dark }
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--ink); font: 400 17px/1.55 var(--f-text); margin: 0; }
a { color: var(--blue); }
.num { font-variant-numeric: tabular-nums lining-nums; }
.mast { background: radial-gradient(rgb(255 240 200 / .16) 1.3px, transparent 1.8px) 0 0 / 7px 7px, #C8321F;
  border-bottom: 3px solid #2A2118; color: var(--mast-ink); padding: 20px 20px 22px; }
.mast .kicker { font: 700 12px var(--f-text); letter-spacing: .14em; text-transform: uppercase; opacity: .9; }
.mast h1 { margin: 6px 0 4px; font: 900 clamp(40px, 8vw, 72px)/.92 var(--f-display); color: #F2B705; text-transform: uppercase;
  text-shadow: 3px 3px 0 #1F4E8C; text-wrap: balance; }
.mast p { margin: 0; max-width: 60ch; }
.wrap { max-width: 1100px; margin: 0 auto; padding-inline: 20px; padding-block: 24px 80px; }
.intro { max-width: 68ch; }
h2.sec { display: flex; align-items: center; gap: 14px; margin: 44px 0 16px; font: 900 30px/1 var(--f-display); text-transform: uppercase; }
h2.sec::after { content: ''; flex: 1; height: 4px; background: var(--red); }
.count { font: 700 15px var(--f-text); color: var(--muted); order: 2; }
.how { background: var(--surface); border: 2px solid var(--ink); box-shadow: var(--shadow); padding: 14px 16px; margin: 20px 0; }
.how p { margin: 0 0 6px; }
.toolbar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
  background: var(--bg); border-bottom: 2px solid var(--ink); padding: 10px 0; }
.toolbar .tally { color: var(--muted); font-size: 15px; flex: 1; min-width: 180px; }
.btn { height: 44px; padding: 0 16px; border: 2px solid var(--ink); border-radius: 4px; background: var(--surface); color: var(--ink);
  font: 800 18px/1 var(--f-display); letter-spacing: .06em; text-transform: uppercase; box-shadow: var(--shadow); cursor: pointer; }
.btn.primary { background: var(--red); color: var(--on-red); }
.btn:active { transform: translate(4px, 4px); box-shadow: none; }
.btn:focus-visible, .seg button:focus-visible, textarea:focus-visible { outline: 3px solid var(--blue); outline-offset: 2px; }
ol.path { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.stop { display: grid; grid-template-columns: 34px 52px minmax(0, 1fr); gap: 10px; align-items: baseline; padding: 10px 12px;
  background: var(--surface); border: 2px solid var(--ink); text-decoration: none; color: var(--ink); }
.stop .n { font: 900 22px/1 var(--f-display); color: var(--red); }
.stop .yr { font-weight: 700; color: var(--muted); }
.stop .st { display: flex; flex-direction: column; min-width: 0; }
.stop .st span { color: var(--muted); font-size: 15px; }
.entity { background: var(--surface); border: 2px solid var(--ink); box-shadow: 6px 6px 0 var(--ink); padding: 18px 20px; margin: 0 0 22px;
  scroll-margin-top: 80px; }
.entity.ok { border-color: var(--green); box-shadow: 6px 6px 0 var(--green); }
.entity.change { border-color: var(--red); box-shadow: 6px 6px 0 var(--red); }
.facts { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; font-size: 14px; color: var(--muted); }
.badge { font: 700 11px var(--f-text); letter-spacing: .12em; text-transform: uppercase; padding: 3px 7px; border: 2px solid var(--ink); color: var(--ink); }
.t-person { background: var(--yellow); color: #2A2118; } .t-film, .t-series, .t-radio { background: var(--blue); color: var(--surface); border-color: var(--blue); }
.t-event { background: var(--red); color: var(--on-red); border-color: var(--red); } .t-theme { border-style: dashed; }
.lane::before { content: '▸ '; }
.status { margin-left: auto; font: 700 11px var(--f-text); letter-spacing: .12em; text-transform: uppercase; border: 1px dashed var(--muted); padding: 2px 6px; }
.entity h3 { margin: 8px 0 2px; font: 900 32px/1 var(--f-display); text-transform: uppercase; text-wrap: balance; }
.sub { margin: 0 0 10px; color: var(--muted); }
.cols { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 24px; }
.text { min-width: 0; max-width: 66ch; }
.text p { margin: 0 0 12px; }
.text h4 { margin: 16px 0 4px; font: 800 18px var(--f-display); letter-spacing: .06em; text-transform: uppercase; color: var(--red); }
.cover { float: right; width: 130px; margin: 4px 0 10px 16px; border: 2px solid var(--ink); box-shadow: var(--shadow); }
aside h5 { margin: 4px 0 6px; font: 700 12px var(--f-text); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
aside { min-width: 0; font-size: 15px; display: grid; align-content: start; gap: 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { border: 2px solid var(--ink); padding: 2px 8px; border-radius: 4px; text-decoration: none; color: var(--ink); background: var(--bg); font-size: 14px; }
ul.plain { list-style: none; padding: 0; margin: 0 0 6px; display: grid; gap: 4px; }
.rel { font: 700 11px var(--f-text); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.rel.in { color: var(--blue); }
.why { color: var(--muted); }
.stamp { display: inline-block; margin-top: 2px; font: 700 11px var(--f-text); letter-spacing: .1em; text-transform: uppercase; color: var(--red);
  border: 2px solid var(--red); border-radius: 12px; padding: 1px 7px; }
.noscan { display: inline-block; font-size: 13px; color: var(--muted); font-style: italic; }
ol.sources { margin: 0; padding-left: 20px; overflow-wrap: anywhere; }
ol.sources li:target { background: var(--yellow); color: #2A2118; }
sup a { text-decoration: none; font-weight: 700; padding: 0 1px; }
.review { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--rule); }
.seg { display: inline-flex; border: 2px solid var(--ink); border-radius: 4px; overflow: hidden; }
.seg button { height: 40px; padding: 0 16px; border: 0; background: var(--bg); color: var(--ink); font: 700 15px var(--f-text); cursor: pointer; }
.seg button + button { border-left: 2px solid var(--ink); }
.seg button.on[data-v="ok"] { background: var(--green); color: var(--surface); }
.seg button.on[data-v="change"] { background: var(--red); color: var(--on-red); }
textarea { flex: 1 1 260px; min-width: 0; min-height: 40px; border: 2px solid var(--ink); border-radius: 4px; background: var(--bg); color: var(--ink);
  font: 15px/1.4 var(--f-text); padding: 8px 10px; resize: vertical; }
.toast { position: fixed; left: 50%; bottom: calc(20px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); background: var(--ink); color: var(--bg);
  padding: 10px 16px; border-radius: 20px; font-weight: 600; }
#out { width: 100%; min-height: 160px; margin-top: 10px; }
@media (max-width: 760px) {
  .cols { grid-template-columns: 1fr; }
  .cover { width: 104px; }
  .entity h3 { font-size: 27px; }
}
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
</style>

<header class="mast">
  <div class="kicker">Banca · Atlas · pilot path for review</div>
  <h1>%TITLE%</h1>
  <p>%SUBTITLE%</p>
</header>
<main class="wrap">
  <div class="intro">%INTRO%</div>
  <div class="how">
    <p><b>How to review.</b> Read each entry and mark it <b>OK</b> or <b>Change</b>; write what to fix in the note. Numbers like <sup>1</sup> jump to the source.</p>
    <p>Your marks stay in this browser. When done, tap <b>Copy review</b> and paste the text into the conversation.</p>
  </div>
  <div class="toolbar">
    <span class="tally num" id="tally">0 of %COUNT% reviewed</span>
    <button class="btn primary" type="button" id="copy">Copy review</button>
  </div>
  <textarea id="out" hidden readonly aria-label="Review text"></textarea>

  <h2 class="sec">The path <span class="count num">%PATHN%</span></h2>
  <ol class="path">%STOPS%</ol>
  %SECTIONS%
</main>
<div class="toast" id="toast" hidden>Copied</div>
<script>
(function () {
  var KEY = 'atlas-pilot-review';
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { state = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  var cards = Array.prototype.slice.call(document.querySelectorAll('.entity'));
  function paint(card) {
    var s = state[card.dataset.id] || {};
    card.classList.toggle('ok', s.v === 'ok');
    card.classList.toggle('change', s.v === 'change');
    card.querySelectorAll('.seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === s.v); b.setAttribute('aria-pressed', b.dataset.v === s.v); });
  }
  function tally() {
    var n = cards.filter(function (c) { return (state[c.dataset.id] || {}).v; }).length;
    var ch = cards.filter(function (c) { return (state[c.dataset.id] || {}).v === 'change'; }).length;
    document.getElementById('tally').textContent = n + ' of ' + cards.length + ' reviewed' + (ch ? ' · ' + ch + ' to change' : '');
  }
  cards.forEach(function (card) {
    var id = card.dataset.id, ta = card.querySelector('textarea');
    ta.value = (state[id] || {}).note || '';
    card.querySelectorAll('.seg button').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = state[id] || {}; s.v = s.v === b.dataset.v ? undefined : b.dataset.v; state[id] = s; save(); paint(card); tally();
      });
    });
    ta.addEventListener('input', function () {
      var s = state[id] || {}; s.note = ta.value; if (ta.value.trim() && !s.v) { s.v = 'change'; paint(card); tally(); } state[id] = s; save();
    });
    paint(card);
  });
  tally();
  function text() {
    var ok = [], change = [], todo = [];
    cards.forEach(function (c) {
      var s = state[c.dataset.id] || {}, t = c.querySelector('h3').textContent;
      if (s.v === 'ok') ok.push(c.dataset.id + (s.note && s.note.trim() ? ' — ' + s.note.trim() : ''));
      else if (s.v === 'change') change.push(c.dataset.id + ' (' + t + '): ' + ((s.note || '').trim() || 'change requested'));
      else todo.push(c.dataset.id);
    });
    return 'Atlas pilot review\n\nOK (' + ok.length + '):\n' + ok.map(function (x) { return '- ' + x; }).join('\n') +
      '\n\nChange (' + change.length + '):\n' + change.map(function (x) { return '- ' + x; }).join('\n') +
      '\n\nNot reviewed (' + todo.length + '):\n' + todo.map(function (x) { return '- ' + x; }).join('\n') + '\n';
  }
  document.getElementById('copy').addEventListener('click', function () {
    var t = text(), out = document.getElementById('out'), toast = document.getElementById('toast');
    out.value = t;
    function shown(msg) { toast.textContent = msg; toast.hidden = false; setTimeout(function () { toast.hidden = true; }, 1800); }
    try {
      navigator.clipboard.writeText(t).then(function () { shown('Review copied'); }, function () { out.hidden = false; out.select(); shown('Select the text below and copy it'); });
    } catch (e) { out.hidden = false; out.select(); shown('Select the text below and copy it'); }
  });
})();
</script>
"""

if __name__ == "__main__":
    main()
