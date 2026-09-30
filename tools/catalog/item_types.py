"""FictionMags Index item type codes (http://www.philsp.com/docs/fm_item_types.html), used by the reference guide."""

ITEM_TYPES: dict[str, str] = {
    "an": "anthology", "ar": "article", "as": "afterword to story", "aw": "afterword",
    "bg": "biographical material", "bi": "bibliography", "br": "book review",
    "cl": "column", "cn": "competition", "cr": "criticism", "cs": "comic strip", "ct": "cartoon",
    "cv": "cover art", "ed": "editorial", "es": "essay", "ex": "extract", "fa": "facetious article",
    "fp": "frontispiece", "fr": "fanzine review", "fw": "foreword", "gm": "game", "gp": "group of items",
    "gr": "game review", "hu": "humour", "ia": "illustrated article", "il": "illustration",
    "in": "introduction", "is": "introduction to story", "iv": "interview", "iw": "incomplete work",
    "lc": "letter column", "lk": "linking material", "lr": "magazine review", "lt": "letter",
    "mm": "memoir", "mp": "map", "mr": "movie review", "ms": "miscellaneous",
    "n.": "novel", "na": "novella", "nv": "novelette", "ob": "obituary", "pi": "pictorial",
    "pl": "play", "pm": "poem", "pp": "prose poem", "pr": "preface", "pt": "photography",
    "pz": "puzzle", "qa": "question & answer column", "qz": "quiz", "rc": "review column",
    "ri": "reviews introduction", "rr": "round-robin", "rv": "review", "sa": "story adaptation",
    "sg": "song", "si": "section introduction", "sl": "serial segment", "sr": "story review",
    "ss": "short story", "sy": "symposium", "sz": "synopsis", "tc": "true crime", "te": "true experience",
    "th": "theatre review", "ts": "true story", "uw": "unfinished work", "vi": "vignette",
    "??": "unknown",
}

# page tokens used instead of a page number
PAGE_TOKENS = {"bc": "back cover", "fc": "front cover", "ifc": "inside front cover", "ibc": "inside back cover"}
