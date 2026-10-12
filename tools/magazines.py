"""Magazine descriptions ("About" on each magazine page): content/magazines/<slug>.md (Phase 11a).

Each file: TOML front matter between +++ lines (slug, status draft|reviewed, years, country, language, publishers,
editors, optional atlas entity, numbered [[sources]]) and a short English text citing its sources as [n].

  python tools/magazines.py check                 validate every file against tools/sources.toml
  python tools/magazines.py review --out f.html   one review page (OK / Change + note per magazine, copy all notes)

tools/atlas/build_atlas.py stores the reviewed ones in atlas.db (`magazine_about`, JSON) via `about_json()`, so they
reach the app with content updates (tools/publish_content.py) without a new APK.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content" / "magazines"
REQUIRED = ("slug", "status", "years", "country", "language", "publishers", "sources")


def parse(path: Path) -> tuple[dict, str]:
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    m = re.match(r"\+\+\+\n(.*?)\n\+\+\+\n(.*)", text, re.S)
    if not m:
        raise ValueError(f"{path.name}: missing +++ front matter")
    return tomllib.loads(m[1]), m[2].strip()


def load(content: Path = CONTENT) -> dict[str, tuple[dict, str]]:
    return {p.stem: parse(p) for p in sorted(content.glob("*.md"))}


def check(content: Path = CONTENT, sources_toml: Path = ROOT / "tools" / "sources.toml",
          atlas_dir: Path = ROOT / "content" / "atlas" / "entities") -> list[str]:
    slugs = {m["slug"] for m in tomllib.loads(sources_toml.read_text(encoding="utf-8"))["magazine"]}
    errors: list[str] = []
    for stem, (meta, body) in load(content).items():
        where = f"{stem}.md"
        for k in REQUIRED:
            if k not in meta:
                errors.append(f"{where}: missing {k}")
        if meta.get("slug") != stem:
            errors.append(f"{where}: slug {meta.get('slug')!r} differs from the file name")
        if stem not in slugs:
            errors.append(f"{where}: no magazine {stem!r} in sources.toml")
        if meta.get("status") not in ("draft", "reviewed"):
            errors.append(f"{where}: status must be draft or reviewed")
        ns = {s.get("n") for s in meta.get("sources", [])}
        for s in meta.get("sources", []):
            if not str(s.get("url", "")).startswith("https://"):
                errors.append(f"{where}: source {s.get('n')} needs an https url")
        for n in {int(x) for x in re.findall(r"\[(\d+)\]", body)}:
            if n not in ns:
                errors.append(f"{where}: cites [{n}] but has no source {n}")
        if not re.search(r"\[\d+\]", body):
            errors.append(f"{where}: the text cites no source")
        words = len(body.split())
        if not 15 <= words <= 220:  # obscure magazines get short texts rather than padding
            errors.append(f"{where}: {words} words (15–220)")
        if meta.get("atlas") and not (atlas_dir / f"{meta['atlas']}.md").exists():
            errors.append(f"{where}: no Atlas entity {meta['atlas']!r}")
    return errors


def about_json(meta: dict, body: str) -> str:
    """what the app shows (magazine.about)"""
    return json.dumps({
        "years": meta["years"], "country": meta["country"], "language": meta["language"],
        "publishers": meta["publishers"], "editors": meta.get("editors", []), "atlas": meta.get("atlas"),
        "text": body, "sources": [{"n": s["n"], "title": s["title"], "url": s["url"]} for s in meta["sources"]],
    }, ensure_ascii=False)


def review_page(out: Path, content: Path = CONTENT, sources_toml: Path = ROOT / "tools" / "sources.toml") -> None:
    mags = tomllib.loads(sources_toml.read_text(encoding="utf-8"))["magazine"]
    docs = load(content)
    cards = []
    for m in mags:
        if m["slug"] not in docs:
            continue
        meta, body = docs[m["slug"]]
        sid = m["slug"]
        text = "".join(f"<p>{_inline(' '.join(p.split()), sid)}</p>" for p in re.split(r"\n\s*\n", body) if p.strip())
        facts = (f'<span class="num">{html.escape(meta["years"])}</span> · {html.escape(meta["country"])} · '
                 f'{html.escape(meta["language"])}<br>Publishers: {html.escape(", ".join(meta["publishers"]))}'
                 + (f'<br>Editors: {html.escape(", ".join(meta.get("editors", [])))}' if meta.get("editors") else ""))
        srcs = "".join(f'<li id="{sid}-s{s["n"]}">[{s["n"]}] <a href="{html.escape(s["url"])}" target="_blank" rel="noopener">'
                       f'{html.escape(s["title"])}</a></li>' for s in meta["sources"])
        cards.append(f"""<article class="card" id="{sid}" data-id="{sid}">
<header><h2>{html.escape(m["name"])}</h2><span class="cat">{m["category"]}</span><span class="st {meta["status"]}">{meta["status"]}</span></header>
<div class="facts">{facts}</div>{text}<ol class="src">{srcs}</ol>
<div class="mark"><label><input type="radio" name="{sid}" value="ok"> OK</label>
<label><input type="radio" name="{sid}" value="change"> Change</label>
<textarea placeholder="What should change?"></textarea></div></article>""")
    out.write_text(PAGE.replace("{{CARDS}}", "\n".join(cards)).replace("{{COUNT}}", str(len(cards))), encoding="utf-8")


def _inline(t: str, sid: str) -> str:
    t = html.escape(t, quote=False)
    t = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", t)
    return re.sub(r"\[(\d+)\]", lambda m: f'<sup><a href="#{sid}-s{m[1]}">{m[1]}</a></sup>', t)


PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Magazine Descriptions Review</title>
<style>
:root{--bg:#EEE2C6;--surface:#F7EEDB;--ink:#2A2118;--muted:#6B5A44;--edge:#2A2118;--red:#C8321E;--yellow:#F2C230}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14161F;--surface:#1D2030;--ink:#EDE4CF;--muted:#A99C84;--edge:#EDE4CF}}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.55 Georgia,serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 80px}
h1{font:900 32px/1.1 system-ui,sans-serif;text-transform:uppercase;margin:0 0 6px}
.lead{color:var(--muted);margin:0 0 20px}
.card{background:var(--surface);border:2px solid var(--edge);box-shadow:4px 4px 0 var(--edge);padding:16px 18px;margin:0 0 22px}
.card header{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.card h2{font:800 22px system-ui,sans-serif;margin:0;text-transform:uppercase}
.cat{font:700 12px system-ui;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.st{font:700 11px system-ui;padding:2px 6px;border:1.5px solid var(--edge);text-transform:uppercase}.st.reviewed{background:var(--yellow);color:#2A2118}
.facts{font:14px system-ui,sans-serif;color:var(--muted);margin:8px 0}
.src{font-size:14px;color:var(--muted);padding-left:0;list-style:none}.src a{color:inherit}
sup a{color:var(--red);text-decoration:none}
.mark{display:flex;gap:14px;align-items:center;flex-wrap:wrap;border-top:1.5px dashed var(--edge);padding-top:10px;font:15px system-ui}
.mark textarea{flex:1 1 100%;min-height:44px;font:15px system-ui;background:var(--bg);color:var(--ink);border:1.5px solid var(--edge);padding:6px}
.bar{position:fixed;left:0;right:0;bottom:0;background:var(--ink);color:var(--bg);padding:10px 16px;display:flex;gap:12px;align-items:center;justify-content:center;font:15px system-ui}
.bar button{font:700 15px system-ui;padding:8px 14px;border:0;background:var(--yellow);color:#2A2118;cursor:pointer}
</style></head><body><main>
<h1>Magazine descriptions</h1><p class="lead">{{COUNT}} magazines. Mark each one OK or Change (with a note), then copy the result and paste it in the conversation. Marks stay in this browser.</p>
{{CARDS}}
</main><div class="bar"><span id="count"></span><button id="copy">Copy review</button></div>
<script>
const KEY='banca-magazine-review';let st={};try{st=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(st))}catch(e){};upd()};
const upd=()=>{const n=Object.values(st).filter(v=>v.mark).length;document.getElementById('count').textContent=n+' of {{COUNT}} marked'};
document.querySelectorAll('.card').forEach(c=>{const id=c.dataset.id,s=st[id]||{};
c.querySelectorAll('input').forEach(i=>{if(s.mark===i.value)i.checked=true;i.onchange=()=>{st[id]={...st[id],mark:i.value};save()}});
const t=c.querySelector('textarea');t.value=s.note||'';t.oninput=()=>{st[id]={...st[id],note:t.value};save()}});
document.getElementById('copy').onclick=async()=>{const lines=['Magazine descriptions review:'];
document.querySelectorAll('.card').forEach(c=>{const s=st[c.dataset.id]||{};lines.push(`- ${c.dataset.id}: ${s.mark||'unmarked'}${s.note?' — '+s.note:''}`)});
try{await navigator.clipboard.writeText(lines.join('\\n'));document.getElementById('copy').textContent='Copied'}catch(e){alert(lines.join('\\n'))}};
upd();
</script></body></html>"""


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    r = sub.add_parser("review")
    r.add_argument("--out", type=Path, required=True)
    a = ap.parse_args(argv)
    if a.cmd == "check":
        errors = check()
        for e in errors:
            print(e)
        print(f"{len(load())} descriptions, {len(errors)} problems")
        return 1 if errors else 0
    review_page(a.out)
    print(f"review page -> {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
