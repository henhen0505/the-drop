# dedup/

Event deduplication engine. Spec: `architecture/dedup-engine.md`, decisions.md #7.

Pipeline (`processor.ts`, one locked transaction per staged event):
extract -> external-ID fast path -> candidate finder -> scorer -> decision -> merge / queue for review / create.

- `extractors.ts` raw provider payload -> `NormalizedEvent` (TM / SG field paths still to be checked against live responses)
- `normalizer.ts` title / venue / artist text normalization (pure, rule lists are data)
- `similarity.ts` pg_trgm-equivalent trigram similarity
- `scorer.ts` venue / date / artist / title scores, weights 0.30 / 0.25 / 0.25 / 0.20
- `decision.ts` bands (auto-merge >= 0.85, review 0.55-0.85, else new event), review-only mode, same-venue-adjacent-date guard
- `merge-rules.ts` field-priority merge (pure); `merger.ts` writes it
- `venue-matcher.ts`, `artist-linker.ts` find-or-create venue / artist rows
- `lock.ts` global advisory lock so concurrent writers can't both create the same event

`DEDUP_AUTO_MERGE_ENABLED` defaults to false: everything scoring >= 0.55 goes to the admin queue until the first
50-100 decisions have been reviewed. Admin review lives in `modules/admin/dedup.*`.
