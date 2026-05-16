#!/usr/bin/env python3
"""Build catalyst data files for the v2 catalyst board.

Reads:
  ~/Desktop/pharma-catalyst/extracted/<slug>_catalysts.json    (per-company tier1 rows)
  ~/Desktop/pharma-pipeline-web/data/index.json                (for issuer_name / exchange lookup)

Writes:
  data/catalysts_index.json     — compact list of all catalyst rows for the global table
  data/catalysts/<slug>.json    — per-company rows + 8-K source URLs for company.html
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

WEB_ROOT = Path(__file__).resolve().parent.parent
WEB_DATA = WEB_ROOT / "data"
WEB_CATALYSTS = WEB_DATA / "catalysts"

CATALYST_REPO = Path.home() / "Desktop" / "pharma-catalyst"
EXTRACTED = CATALYST_REPO / "extracted"


def load_company_meta() -> dict[str, dict]:
    """Map slug -> {issuer, exchange, kind} from the existing index.json."""
    idx_path = WEB_DATA / "index.json"
    if not idx_path.exists():
        return {}
    idx = json.loads(idx_path.read_text())
    out = {}
    for r in idx.get("rows", []):
        slug = r.get("slug")
        if slug:
            out[slug] = {
                "issuer": r.get("issuer", ""),
                "exchange": r.get("exchange", ""),
                "kind": r.get("kind", ""),
            }
    return out


def normalize_source_url(row: dict, sources_used: list) -> str:
    """Best-effort URL for the underlying 8-K exhibit."""
    src = row.get("source") or ""
    accession = ""
    if isinstance(src, str) and "-" in src:
        # e.g. "8K-0001551152-26-000013 (Ex-99.1)" -> "0001551152-26-000013"
        for tok in src.replace("8K-", "").split():
            if tok.count("-") == 2 and len(tok) >= 18:
                accession = tok
                break
    for s in sources_used or []:
        if not isinstance(s, dict):
            continue
        if accession and s.get("accession") == accession and s.get("url"):
            return s["url"]
    # fall back to the first source URL we have
    for s in sources_used or []:
        if isinstance(s, dict) and s.get("url"):
            return s["url"]
    return ""


def compact_row(row: dict, slug: str, issuer: str, source_url: str) -> dict:
    return {
        "slug": slug,
        "ticker": row.get("ticker", slug.upper()),
        "issuer": issuer,
        "asset": row.get("asset", ""),
        "indication": row.get("indication", ""),
        "phase": row.get("phase", ""),
        "milestone_type": row.get("milestone_type", ""),
        "anticipated_date_iso": row.get("anticipated_date_iso", ""),
        "date_precision": row.get("date_precision", ""),
        "filed_date": row.get("filed_date", ""),
        "confidence": row.get("confidence", ""),
        "source_url": source_url,
    }


def main() -> int:
    WEB_CATALYSTS.mkdir(parents=True, exist_ok=True)
    meta_by_slug = load_company_meta()

    all_rows: list[dict] = []
    per_company_count = 0
    today_iso = date.today().isoformat()

    for fp in sorted(EXTRACTED.glob("*_catalysts.json")):
        slug = fp.stem.replace("_catalysts", "")
        try:
            doc = json.loads(fp.read_text())
        except Exception:
            continue

        meta = meta_by_slug.get(slug, {})
        issuer = doc.get("issuer_name") or meta.get("issuer", "")
        exchange = meta.get("exchange", "")
        kind = meta.get("kind", "")
        sources_used = doc.get("sources_used", []) or []
        rows = doc.get("catalyst_rows", []) or []

        # Normalize source list (handle older shape where entry was a plain string)
        sources_norm = []
        for s in sources_used:
            if isinstance(s, dict):
                sources_norm.append({
                    "form": s.get("form", ""),
                    "accession": s.get("accession", ""),
                    "filed_date": s.get("filed_date", ""),
                    "exhibit": s.get("exhibit", ""),
                    "url": s.get("url", ""),
                })
            else:
                sources_norm.append({"form": "", "accession": "", "filed_date": "",
                                     "exhibit": str(s), "url": ""})

        # Per-company file (used by company.html embed)
        per_company = {
            "slug": slug,
            "ticker": doc.get("ticker", slug.upper()),
            "issuer_name": issuer,
            "exchange": exchange,
            "sources_used": sources_norm,
            "catalyst_rows": [],
            "extractor_notes": doc.get("extractor_notes", {}),
        }

        for r in rows:
            url = normalize_source_url(r, sources_norm)
            compact = compact_row(r, slug, issuer, url)
            compact["kind"] = kind
            compact["exchange"] = exchange
            all_rows.append(compact)

            # Full row goes into per-company JSON (includes raw_text)
            per_company["catalyst_rows"].append({
                **compact,
                "raw_text": r.get("raw_text", ""),
            })

        if rows or per_company["sources_used"]:
            (WEB_CATALYSTS / f"{slug}.json").write_text(json.dumps(per_company, indent=2))
            per_company_count += 1

    # Sort global list: future dates first (asc), then past (desc)
    def sort_key(r):
        d = r.get("anticipated_date_iso") or ""
        is_past = bool(d) and d < today_iso
        return (is_past, d if not is_past else "")  # future asc, past lumped at end

    all_rows.sort(key=lambda r: (
        not (r["anticipated_date_iso"] and r["anticipated_date_iso"] >= today_iso),
        r["anticipated_date_iso"] or "9999",
        r["ticker"],
    ))

    # Aggregate stats
    milestone_counts: dict[str, int] = {}
    phase_counts: dict[str, int] = {}
    future = past = undated = 0
    for r in all_rows:
        mt = r["milestone_type"] or "other"
        milestone_counts[mt] = milestone_counts.get(mt, 0) + 1
        ph_tokens = (r["phase"] or "").split()
        ph = ph_tokens[0] if ph_tokens else "—"
        phase_counts[ph] = phase_counts.get(ph, 0) + 1
        d = r["anticipated_date_iso"]
        if not d:
            undated += 1
        elif d >= today_iso:
            future += 1
        else:
            past += 1

    index_doc = {
        "snapshot_date": today_iso,
        "totals": {
            "companies": per_company_count,
            "rows": len(all_rows),
            "future": future,
            "past": past,
            "undated": undated,
        },
        "milestone_counts": milestone_counts,
        "phase_counts": phase_counts,
        "rows": all_rows,
    }
    (WEB_DATA / "catalysts_index.json").write_text(json.dumps(index_doc, indent=2))

    print(f"wrote data/catalysts_index.json — {len(all_rows)} rows ({future} future, {past} past, {undated} undated)")
    print(f"wrote data/catalysts/*.json — {per_company_count} companies")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
