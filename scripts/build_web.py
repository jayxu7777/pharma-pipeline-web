#!/usr/bin/env python3
"""Regenerate the static-site data from the pharma-pipeline source repo.

Reads:  ~/Desktop/pharma-pipeline/data/large_cap_*/*_pipeline.json
Writes: ../data/index.json     (1 row per company, compact)
        ../data/companies/<slug>.json  (verbatim per-company file)
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

SRC_ROOT = Path("/Users/jiexu/Desktop/pharma-pipeline/data")
DST_ROOT = Path(__file__).resolve().parent.parent / "data"
DST_COMPANIES = DST_ROOT / "companies"

# Therapeutic-area keyword map. First match (in order) wins for an indication.
# Multiple indications per company are collected into a set.
TA_RULES: list[tuple[str, list[str]]] = [
    ("Oncology", [
        "cancer", "carcinoma", "tumor", "tumour", "lymphoma", "leukemia", "leukaemia",
        "myeloma", "melanoma", "sarcoma", "glioma", "glioblastoma", "nsclc", "sclc",
        "oncolog", "metastatic", "neoplas", "mds", "aml", "cll", "dlbcl", "tnbc",
        "hcc", "crc", "gist", "mesothelioma",
    ]),
    ("Ophthalmology", [
        "macular", "retinal", "retinopathy", "glaucoma", "dry eye", "ocular",
        "ophthalm", "uveitis", "diabetic retin", "amd",
    ]),
    ("CNS / Neurology", [
        "alzheimer", "parkinson", "depression", "schizophren", "epilepsy", "seizure",
        "als", "amyotrophic", "multiple sclerosis", " ms ", "stroke", "neuropath",
        "migraine", "anxiety", "autism", "asd", "huntington", "narcolepsy",
        "neurodegen", "dementia", "psychiat", "ptsd", "bipolar", "addiction",
        "neurolog", "spinal muscular", "sma ",
    ]),
    ("Cardiovascular", [
        "heart failure", "cardiac", "hypertension", "atrial", "ventricular",
        "atherosclero", "hfref", "hfpef", "cardiovascul", "myocard", "coronary",
        "thrombo", "anticoag", "arrhythm", "stenosis",
    ]),
    ("Metabolic", [
        "diabet", "obesity", "nash", "mash", "lipid", "cholesterol", "hyperlipid",
        "metabolic", "weight loss", "nafld", "hypertriglycerid",
    ]),
    ("Immunology / Inflammation", [
        "lupus", "psoriasis", "rheumatoid", "ibd", "crohn", "ulcerative colitis",
        "atopic dermatitis", "asthma", "copd", "immunolog", "inflammat", "vitiligo",
        "alopecia", "hidradenitis", "eczema", "ankylosing", "sjogren", "myositis",
    ]),
    ("Rare / Genetic", [
        "hemophilia", "duchenne", "pompe", "fabry", "gaucher", "sickle cell",
        "cystic fibrosis", "rare disease", "orphan", "wilson", "rett", "phenylketon",
        "hereditary angioedema", "hae ", "pku", "tay-sachs", "niemann",
    ]),
    ("Infectious", [
        "hiv", "hbv", "hcv", "hepatitis", "covid", "sars-cov", "influenza",
        "tuberculo", "malaria", "sepsis", "infectio", "antibio", "antivir",
        "rsv", "cmv", "ebv", "fungal", "vaccine",
    ]),
    ("Renal / Urology", [
        "kidney", "renal", "iga nephropathy", "ckd", "dialysis", "urolog",
        "incontinence", "prostat", "bladder",
    ]),
    ("Dermatology", [
        "skin", "dermat", "wound healing", "rosacea", "acne",
    ]),
    ("Hematology", [
        "anemia", "anaemia", "thrombocytop", "coagul", "hemato", "haemato",
        "bleeding", "transfus",
    ]),
    ("Women's / Reproductive Health", [
        "endometrios", "menopause", "pcos", "fertility", "contracept",
        "preeclamps", "postpartum", "vaginal",
    ]),
    ("GI / Hepatology", [
        "gastric", "gastro", "ibs", "constipation", "liver", "hepatic",
        "pancreati", "biliary", "cholang",
    ]),
    ("Respiratory", [
        "respiratory", "lung", "pulmonary", "ipf", "fibrosis",
    ]),
    ("Musculoskeletal / Pain", [
        "osteoarthrit", "osteoporo", "pain", "fibromyalg", "back pain",
        "spinal cord injury", "muscle",
    ]),
]

PHASE_ORDER = {"P3": 3, "P2": 2, "P1": 1, "P0": 0}


def normalize_phase(p: str | None) -> str:
    """Map various 'highest_phase' strings to P1/P2/P3 (or '' if not active)."""
    if not p:
        return ""
    s = str(p).upper().strip()
    if "PHASE 3" in s or "PHASE III" in s or s.startswith("P3") or "REGISTRATIONAL" in s or "PIVOTAL" in s:
        return "P3"
    if "PHASE 2/3" in s or "PHASE 2B/3" in s or "PHASE II/III" in s:
        return "P3"
    if "PHASE 2" in s or "PHASE II" in s or s.startswith("P2"):
        return "P2"
    if "PHASE 1/2" in s or "PHASE I/II" in s:
        return "P2"
    if "PHASE 1" in s or "PHASE I" in s or s.startswith("P1"):
        return "P1"
    if "NDA" in s or "BLA" in s or "MAA" in s or "APPROVED" in s or "FILED" in s:
        return "P3"  # post-pivotal counts toward late stage
    return ""


def classify_indication(text: str) -> str | None:
    if not text:
        return None
    t = text.lower()
    for area, keywords in TA_RULES:
        for kw in keywords:
            if kw in t:
                return area
    return None


def collect_areas(company: dict) -> list[str]:
    seen: list[str] = []
    for asset in company.get("pipeline") or []:
        for ind in asset.get("indications") or []:
            area = classify_indication(ind.get("indication") or "")
            if area and area not in seen:
                seen.append(area)
    return seen


def count_phases(company: dict) -> tuple[int, int, int, int]:
    """Return (assets, p3, p2, p1).

    'assets' = number of asset entries that have at least one active P1/P2/P3 indication.
    Phase counts at the indication level (an asset in P3 + P2 = 1 P3 + 1 P2).
    Falls back to summary_counts if pipeline missing.
    """
    pipeline = company.get("pipeline") or []
    if not pipeline:
        sc = company.get("summary_counts") or {}
        return (
            int(sc.get("total_assets") or 0),
            int(sc.get("p3") or 0),
            int(sc.get("p2") or 0),
            int(sc.get("p1") or 0),
        )

    assets = 0
    p1 = p2 = p3 = 0
    for asset in pipeline:
        active = False
        for ind in asset.get("indications") or []:
            ph = normalize_phase(ind.get("highest_phase"))
            if ph == "P3":
                p3 += 1
                active = True
            elif ph == "P2":
                p2 += 1
                active = True
            elif ph == "P1":
                p1 += 1
                active = True
        if active:
            assets += 1
    return assets, p3, p2, p1


def slug_from_path(path: Path) -> str:
    return path.name.replace("_pipeline.json", "")


def derive_bucket(path: Path) -> str:
    """Batch directory name (large_cap_<lo>_<hi>)."""
    return path.parent.name


def main() -> None:
    if DST_COMPANIES.exists():
        shutil.rmtree(DST_COMPANIES)
    DST_COMPANIES.mkdir(parents=True, exist_ok=True)

    rows: list[dict] = []
    bad: list[str] = []

    # Scan both core_biopharma (batch_*) and adjacent backfill (large_cap_*).
    # If the same slug appears in both, the later (large_cap) wins for the per-company file
    # but we keep the first row metadata; in practice the splits are disjoint by ticker.
    written: dict[str, str] = {}  # slug -> source batch dir name
    for prefix, kind in (("batch_*", "core_biopharma"), ("large_cap_*", "adjacent")):
        for batch_dir in sorted(SRC_ROOT.glob(prefix)):
            for path in sorted(batch_dir.glob("*_pipeline.json")):
                try:
                    company = json.loads(path.read_text())
                except Exception as e:
                    bad.append(f"{path}: {e}")
                    continue

                slug = slug_from_path(path)
                if slug in written:
                    # Skip duplicate slug across batches (rare); keep first.
                    continue
                written[slug] = batch_dir.name
                shutil.copyfile(path, DST_COMPANIES / f"{slug}.json")

                assets, p3, p2, p1 = count_phases(company)
                areas = collect_areas(company)
                row = {
                    "slug": slug,
                    "ticker": (company.get("ticker") or "").upper(),
                    "issuer": company.get("issuer_name") or "",
                    "exchange": company.get("exchange") or "",
                    "region": company.get("region") or "",
                    "batch": batch_dir.name,
                    "kind": kind,
                    "assets": assets,
                    "p3": p3,
                    "p2": p2,
                    "p1": p1,
                    "areas": areas,
                    "has_pipeline": assets > 0,
                    "no_pipeline_reason": company.get("no_active_clinical_pipeline_reason") or "",
                }
                rows.append(row)

    rows.sort(key=lambda r: (-(r["p3"] * 1000 + r["p2"] * 100 + r["p1"]), r["ticker"]))

    totals = {
        "companies": len(rows),
        "with_pipeline": sum(1 for r in rows if r["has_pipeline"]),
        "assets": sum(r["assets"] for r in rows),
        "p3": sum(r["p3"] for r in rows),
        "p2": sum(r["p2"] for r in rows),
        "p1": sum(r["p1"] for r in rows),
    }

    # area counts (companies that have at least one indication in this area)
    area_counts: dict[str, int] = {}
    for r in rows:
        for a in r["areas"]:
            area_counts[a] = area_counts.get(a, 0) + 1

    index = {
        "snapshot_date": "2026-05-06",
        "totals": totals,
        "area_counts": dict(sorted(area_counts.items(), key=lambda kv: -kv[1])),
        "rows": rows,
    }

    DST_ROOT.mkdir(exist_ok=True)
    (DST_ROOT / "index.json").write_text(json.dumps(index, indent=1))

    print(f"wrote {len(rows)} companies; totals: {totals}")
    print(f"area counts: {area_counts}")
    if bad:
        print(f"\n{len(bad)} parse failures:")
        for b in bad:
            print(f"  {b}")


if __name__ == "__main__":
    main()
