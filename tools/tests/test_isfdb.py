"""ISFDB contents: the mysqldump reader, the extract and attaching contents to catalog issues (Phase 9)."""
import json
import zipfile

from catalog import isfdb
from catalog.model import Catalog, Issue
from catalog.mysqldump import rows

DUMP = """-- MySQL dump
CREATE TABLE `authors` (
INSERT INTO `authors` VALUES (1,'Isaac Asimov',NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,0,NULL,0,'Asimov',NULL,NULL),(2,'The Editor',NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,0,NULL,0,NULL,NULL,NULL),(3,'H. L. Gold',NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,0,NULL,0,NULL,NULL,NULL),(4,'David Stone',NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,0,NULL,0,NULL,NULL,NULL),(5,'uncredited',NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,0,NULL,0,NULL,NULL,NULL);
INSERT INTO `canonical_author` VALUES (1,10,1,1),(2,11,2,1),(3,111,3,1),(4,12,4,1),(5,13,3,1),(6,14,5,1),(7,114,3,1),(8,15,1,1);
INSERT INTO `emails` VALUES (1,'someone@example.org');
INSERT INTO `pub_content` VALUES (1,10,500,'152'),(2,11,500,'2'),(3,12,500,'fc'),(4,13,500,NULL),(5,14,500,'[160]'),(6,15,501,'5');
INSERT INTO `pubs` VALUES (500,'Galaxy Science Fiction, October 1950','X','1950-10-00',1,'164','digest','MAGAZINE',NULL,NULL,'25c',NULL,NULL,NULL,NULL),(501,'Galaxy Science Fiction (UK), October 1950','Y','1950-10-00',1,NULL,NULL,'MAGAZINE',NULL,NULL,NULL,NULL,NULL,NULL,NULL),(502,'Some Novel','Z','1950-01-00',1,NULL,NULL,'NOVEL',NULL,NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO `titles` VALUES (10,'Darwinian Pool Room',NULL,NULL,NULL,NULL,NULL,'1950-10-00','short story','SHORTFICTION',NULL,0,0,NULL,0,0,17,NULL,'No','No','No','No',NULL),(11,'For Adults Only',NULL,NULL,NULL,NULL,NULL,'1950-10-00',NULL,'ESSAY',NULL,0,111,NULL,0,0,17,NULL,'No','No','No','No',NULL),(111,'For Adults Only',NULL,NULL,NULL,NULL,NULL,'1950-10-00',NULL,'ESSAY',NULL,0,0,NULL,0,0,17,NULL,'No','No','No','No',NULL),(12,'Cover: Galaxy',NULL,NULL,NULL,NULL,NULL,'1950-10-00',NULL,'COVERART',NULL,0,0,NULL,0,0,17,NULL,'No','No','No','No',NULL),(13,'Galaxy Science Fiction - 1950',NULL,NULL,NULL,NULL,NULL,'1950-10-00',NULL,'EDITOR',NULL,0,0,NULL,0,0,17,NULL,'No','No','No','No',NULL),(14,'Forecast (Galaxy, October 1950)',NULL,NULL,NULL,NULL,NULL,'1950-10-00',NULL,'ESSAY',NULL,0,114,NULL,0,0,17,NULL,'No','No','No','No',NULL),(114,'Forecast',NULL,NULL,NULL,NULL,NULL,'1950-10-00',NULL,'ESSAY',NULL,0,0,NULL,0,0,17,NULL,'No','No','No','No',NULL),(15,'It\\'s a \\"UK\\" one',NULL,NULL,NULL,NULL,NULL,'1950-10-00','short story','SHORTFICTION',NULL,0,0,NULL,0,0,17,NULL,'No','No','No','No',NULL);
"""


def test_mysqldump_rows(tmp_path):
    z = tmp_path / "d.zip"
    with zipfile.ZipFile(z, "w") as f:
        f.writestr("backup", DUMP)
    got = [r for _, r in rows(z, {"titles"}, lambda t, r: r[0] == 15)]
    assert got[0][:2] == (15, 'It\'s a "UK" one') and got[0][7] == "1950-10-00"
    assert not list(rows(z, {"pubs"}, lambda t, r: r[7] == "NOVEL" and r[0] != 502))


def test_extract_and_attach(tmp_path):
    z = tmp_path / "d.zip"
    with zipfile.ZipFile(z, "w") as f:
        f.writestr("backup", DUMP)
    mags = [{"slug": "galaxy", "isfdb": r"^Galaxy( Science Fiction)?, ", "isfdb_exclude": r"\bUK\b"}]
    assert isfdb.extract(z, mags, tmp_path / "out", log=lambda s: None) == {"galaxy": 1}
    data = json.loads((tmp_path / "out" / "galaxy.json").read_text(encoding="utf-8"))
    assert "CC BY 4.0" in data["source"] and "email" not in json.dumps(data)
    pub = data["issues"][0]
    assert (pub["cover_artists"], pub["editors"]) == (["David Stone"], ["H. L. Gold"])
    assert [i["title"] for i in pub["items"]] == ["For Adults Only", "Darwinian Pool Room", "Forecast (Galaxy, October 1950)"]

    issue = Issue(year=1950, month=10, title="Galaxy, October 1950", slug="galaxy-1950-10", source_page=0)
    other = Issue(year=1951, month=1, title="Galaxy, January 1951", slug="galaxy-1951-01", source_page=0)
    cat = Catalog("Galaxy", "galaxy", "test", [issue, other], [])
    assert isfdb.attach(cat, tmp_path / "out" / "galaxy.json")["matched"] == 1
    got = [(s.title, s.type_code, s.page_printed, s.note, [c.raw for c in s.credits]) for s in issue.stories]
    assert got == [("For Adults Only", "ar", 2, "The Editor = H. L. Gold", ["The Editor"]),
                   ("Darwinian Pool Room", "ss", 152, None, ["Isaac Asimov"]),
                   ("Forecast", "ar", 160, "uncredited", ["H. L. Gold"])]
    assert (issue.cover_artist_raw, issue.editors_raw) == ("David Stone", ["H. L. Gold"])
    assert [p.text for p in cat.problems if p.kind == "isfdb-unmatched-issue"] == ["galaxy-1951-01"]
