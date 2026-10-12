"""Stream rows out of a mysqldump file (inside a zip) without a MySQL server: only the tables asked for are parsed.

`INSERT INTO `t` VALUES (...),(...);` lines are tokenized; strings are MySQL-escaped and, for the ISFDB (latin1 tables
holding HTML entities for other characters), decoded as latin-1 then HTML-unescaped by the caller.
"""
from __future__ import annotations

import re
import zipfile
from collections.abc import Callable, Iterator
from pathlib import Path

TOKEN = re.compile(rb"\(|\)|'((?:[^'\\]|\\.)*)'|(NULL)|(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)")
ESC = {b"0": b"\0", b"n": b"\n", b"r": b"\r", b"t": b"\t", b"Z": b"\x1a", b"b": b"\b"}
_unesc = re.compile(rb"\\(.)", re.S)


def _string(raw: bytes) -> str:
    return _unesc.sub(lambda m: ESC.get(m[1], m[1]), raw).decode("latin-1")


def rows(dump: Path, tables: set[str], keep: Callable[[str, tuple], bool] | None = None) -> Iterator[tuple[str, tuple]]:
    """(table, row) for every row of `tables`; `keep(table, row)` filters early (rows are tuples of str/int/float/None)"""
    with zipfile.ZipFile(dump) as z, z.open(z.infolist()[0]) as f:
        for line in f:
            if not line.startswith(b"INSERT INTO `"):
                continue
            table = line[13:line.index(b"`", 13)].decode()
            if table not in tables:
                continue
            row: list | None = None
            for m in TOKEN.finditer(line, line.index(b" VALUES ") + 8):
                tok = m[0]
                if tok == b"(":
                    row = []
                elif tok == b")":
                    if row is not None:
                        r = tuple(row)
                        if keep is None or keep(table, r):
                            yield table, r
                    row = None
                elif row is not None:
                    if m[1] is not None or tok.startswith(b"'"):
                        row.append(_string(m[1] or b""))
                    elif m[2]:
                        row.append(None)
                    else:
                        row.append(float(tok) if b"." in tok or b"e" in tok.lower() else int(tok))
