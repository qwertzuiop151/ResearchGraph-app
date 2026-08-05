# ResearchGraph — Improvement Backlog

Functionality-first backlog from the 2026-07-04 review of `overview.html` (3317 lines) + the
sync/data model. Source of truth for RG data = a private GitHub Gist (ID deliberately not in this
public repo — it lives in the agent's memory and in the MCP config);
`overview.html` is the human-facing client, the MCP is the agent-facing client, and standalone
programs (cron jobs on the box/VPS) are equally valid clients. **Not every capability needs a UI** —
some are better as scheduled programs that read/write the Gist directly.

Usage context: Dominik runs the RG app **in a browser on the institute PC** (agentic AI is forbidden
on institute PCs, but a static HTML page is fine). Writers to the same Gist: institute PC, home,
and the MCP agent → multi-writer concurrency is real.

## Requested build (concrete, future task)
- **Daily briefing cron program** (Dominik, 2026-07-04): a cyclic program that runs every morning,
  reads RG todos/data from the Gist, and produces that day's to-do list ("things to be done today").
  Example of a non-UI RG function. Natural host = the box/VPS (24/7). Likely overlaps the MCP's
  existing `rg_lab_get_daily_briefing`. Scope/open questions TBD with Dominik.

## Problems → Solutions (by functional impact)

1. **Two-writer data loss** — whole-blob last-write-wins (`ghSave:3109`); institute PC + home + MCP
   overwrite each other silently. → Entity-level merge by `id` + `modifiedAt` (fields already stored),
   tombstone deletes; no prompt for the normal case.
2. **No visibility into agent changes** — MCP writes are invisible in the app. → Activity feed /
   "since you last looked" (data already in `rg_lab_get_recent_changes` + per-entity timestamps).
   Could be a program output, not UI.
3. **Conflict = cryptic blocking `prompt()`** (`:3121`, `:3189`), unanswerable headless. → Auto-merge
   + non-blocking toast; ask only on true same-field conflict, showing a real diff.
4. **Due dates dead in UI** — `dueDate` only ever `null`. → Date picker + overdue/due-soon surfacing;
   optional Google Calendar push (MCP available).
5. **Task→experiment link (`elementId`) and dependencies (`blockedBy`) are dead fields** — never
   written by any UI. → Element-picker + blocker-picker on todos; show tasks under their experiment.
6. **Search half-blind** — `_matchesSearch` covers only nodes/elements, active project only; ignores
   todos/journal/ideas. → Global search across all entity types and projects.
7. **No cross-project / "today" view** — everything siloed. → Aggregate Today/All-open across projects
   (mirrors MCP `rg_lab_get_daily_briefing`).
8. **Undo inconsistent** — `addLabTodo`/`addSubtask` push undo; `addNode`/`confirmAdd`/`addIdea`/
   `addJournalEntry` do not (`:1716`,`:2512`). → Uniform `pushUndo()` + toast-with-Undo after deletes.
9. **Add-element friction** — modal only, no Enter-to-submit, empty name silently no-ops (`:2514`).
   → Enter/Esc, empty-field feedback, inline quick-add row like the todo rows.
10. **Ideas only promote to todos** (`promoteIdea`). → Also promote idea → element/node.
11. **RG↔PhDWiki links invisible** — link convention (`rg_node_id` ↔ `[[wikilink]]`) exists but the
    app never renders/resolves refs. → Render refs as clickable; show referenced literature on a node.
12. **No progress rollup** — `getProjStatusCounts` exists, unused for a bar. → Per-project (and
    per-node) progress bar.
13. **No attachments** — nowhere for gel images / plasmid maps / output links. → Link-to-file
    (`outputs-portable` / `file://`) + small images as data-URI thumbnails.

## Proposed new additions
- **Command palette (Ctrl-K)**: quick-add + jump + search in one box (collapses 6 & 9).
- **Timeline / Gantt view**: uses `createdAt`/`completedAt`/`dueDate`; good for supervisor meetings.
- **Markdown/PDF project report export** (current `exportData` is JSON backup only).
- **Weekly-review mode**: done / stuck / due.
- **Templates** for repeated protocols (transformation, miniprep…).
- **Calendar sync** for due dates via Google Calendar MCP.

## Cross-cutting note
The **agent-facing MCP is ahead of the human-facing app** (`recent_changes`, `daily_briefing` exist in
the MCP, not the app). Prefer implementing shared logic once (merge, briefing) as a program/module
both clients can use, rather than duplicating in UI.

## Technical (lower-visibility, but they cause the above)
- No `schemaVersion` in persisted blob; migrations are heuristic (`_migrateGoalsToNodes`,
  `_migrateProjColors`). Add explicit version.
- Wall-clock `saved` timestamp for conflict ordering → clock drift across machines can reverse order.
  Prefer a monotonic `rev` counter.
- `saveTags`/`saveStatuses` don't schedule a Gist push (`:889`,`:913`) — standalone tag/status edits
  sync late.
- 3317-line single-file, all globals + inline `onclick`. Extract pure logic (id, migrations, merge,
  factories) so the risky parts are testable.
- Add a single element/todo/node **factory** so schema defaults + timestamps live in one place
  (directly de-risks the merge work).
