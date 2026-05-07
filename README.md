# Pharma Pipeline Web

Static site browsing 1,360 US-listed biopharma / medtech companies and their active P1/P2/P3 clinical pipelines.

Data source: parallel to `~/Desktop/pharma-pipeline/` (10-K + ClinicalTrials.gov + corporate website synthesis).

## Layout

```
index.html        Overview: 1,360 companies, search + filter + sort
company.html      Detail view (?ticker=XXX)
data/index.json   Compact list (~300 KB)
data/companies/   Per-company full pipeline JSON, lazy-loaded
scripts/build_web.py   Regenerates data/ from the source repo
```

## Local preview

```
python3 -m http.server 8000
open http://localhost:8000/
```

## Refresh data

```
python3 scripts/build_web.py
```

## Deploy

GitHub Pages from `main` branch root.
