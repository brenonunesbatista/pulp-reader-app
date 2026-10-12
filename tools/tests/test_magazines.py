"""Magazine descriptions (content/magazines): validation and what the app receives."""
import json

import magazines

SOURCE = '[[sources]]\nn = 1\ntitle = "Amazing Stories — Wikipedia"\nurl = "https://en.wikipedia.org/wiki/Amazing_Stories"'


def write(d, slug, body, **meta):
    m = {"slug": slug, "status": "draft", "years": "1926–2005", "country": "United States", "language": "English",
         "publishers": ["Experimenter Publishing"], **meta}
    fm = "\n".join(f"{k} = {json.dumps(v, ensure_ascii=False)}" for k, v in m.items())
    (d / f"{slug}.md").write_text(f"+++\n{fm}\n\n{SOURCE}\n+++\n{body}\n", encoding="utf-8")


def test_check_and_about(tmp_path):
    content, atlas = tmp_path / "m", tmp_path / "a"
    content.mkdir()
    atlas.mkdir()
    (atlas / "amazing-stories.md").write_text("x", encoding="utf-8")
    toml = tmp_path / "s.toml"
    toml.write_text('[[magazine]]\nslug = "amazing-stories"\n[[magazine]]\nslug = "galaxy"\n', encoding="utf-8")
    good = " ".join(["word"] * 30) + " [1]."
    write(content, "amazing-stories", good, atlas="amazing-stories")
    write(content, "galaxy", "Too short [2].")
    write(content, "unknown-mag", good)
    errors = magazines.check(content, toml, atlas)
    assert any("galaxy.md: cites [2]" in e for e in errors)
    assert any("galaxy.md:" in e and "words" in e for e in errors)
    assert any("unknown-mag.md: no magazine" in e for e in errors)
    assert not any(e.startswith("amazing-stories.md") for e in errors)
    meta, body = magazines.load(content)["amazing-stories"]
    about = json.loads(magazines.about_json(meta, body))
    assert about["atlas"] == "amazing-stories" and about["sources"][0]["n"] == 1 and about["text"].endswith("[1].")
