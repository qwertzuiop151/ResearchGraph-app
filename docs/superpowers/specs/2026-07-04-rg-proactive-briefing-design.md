# Design: ResearchGraph Proactive Morning Briefing (+ due-date capture)

Design spec for RG's first "proactive second brain" capability: an agent-reasoned weekday
morning briefing generated on the server, delivered to an in-app "Today" panel + Telegram,
plus wiring the dead `dueDate` todo field so the briefing can sort by real deadlines.
Brainstormed 2026-07-04 with Dominik. Terminal state of this spec = a writing-plans implementation plan.

## 1. North-star & context

RG is shifting from a single-file offline app into **the human-facing window onto a shared data
store (the GitHub Gist) that multiple clients act on**: the `overview.html` app, the RG MCP (agent),
and — new — scheduled programs on the server. **The intelligence lives in the scheduled programs, not
the HTML.** This spec builds the first such program.

Usage reality: Dominik runs the RG app in a browser on the **institute PC**, where agentic AI is
forbidden. So the "brain" runs on the server and its output must *reach* him on channels he can access
at the institute PC.

Hard constraints inherited from RG (`.planning/PROJECT.md`): the HTML stays **single-file, vanilla JS,
no build, no external deps, localStorage-primary, colorblind-safe (no red/green-only encoding)**. Any
HTML change here must honor these.

## 2. Scope

**In scope**
- Component A — the morning-briefing pipeline (server cron → reasoning → delivery).
- Component B — due-date capture on todos (wire the dead `dueDate` field) so deadlines are pinnable.
- The RG "Today" panel (additive HTML) that renders the briefing.

**Out of scope (explicitly deferred)**
- The full multi-writer entity-merge sync fix. This spec is **read-mostly**: the briefing only reads
  RG data; its one write goes to a *separate* Gist file that cannot touch `researchgraph_data.json`.
- Two-way interaction (replying to the briefing to make the agent act).
- Migrating the whole app off single-file.

## 3. Architecture (Approach A: headless Claude Code + existing MCPs)

```
cron (Mon–Fri, default 07:00 Europe/Berlin, configurable)
  └─ run_briefing.sh
       1. REASON:  claude -p @briefing_prompt.md   (read-only)
                     reads RG via MCP read methods + Google Calendar MCP,
                     reasons like a chief-of-staff,
                     writes briefing_out.json (local file)
       2. PUBLISH: publish_briefing_to_gist.py briefing_out.json
                     PATCHes ONLY the daily_briefing.json file in the Gist
       3. NOTIFY:  send_telegram_briefing.py briefing_out.json
                     pushes the glanceable text via the server's Telegram bot
       on ANY step failure → send_telegram.py "briefing failed: <reason>" + log

RG overview.html
  └─ on load, fetch daily_briefing.json from the Gist → render read-only "Today" panel
```

**Reasoning and delivery are separated** so the agent needs *no write tools* — it only reads and emits
a local JSON file. Deterministic Python scripts do all writing. This is what makes the pipeline
read-mostly and unable to corrupt RG data.

### 3.1 The safety move: a separate Gist file

The briefing is written to its **own file, `daily_briefing.json`, inside the same Gist** — NOT as a
field inside `researchgraph_data.json`. A Gist holds multiple files; a PATCH naming only
`daily_briefing.json` leaves every other file untouched. Therefore the briefing write **literally
cannot clobber RG data**, regardless of the still-unfixed multi-writer race. This is a stronger
guarantee than "field-scoped."

The app already fetches the Gist in `ghLoad`; it reads a second file's `.content`. No new auth.

## 4. Component A — briefing pipeline

### 4.1 Reasoning step (`briefing_prompt.md`, run via `claude -p`)
- Working dir on the server wired to: RG MCP (read methods: `rg_lab_get_daily_briefing`,
  `rg_lab_list_todos`, `rg_lab_get_recent_changes`, `rg_list_projects`) and the Google Calendar MCP
  (`list_events` for today).
- The agent reasons across **all projects** (briefing is cross-project) about: fixed calendar blocks;
  critical-path / people-gated items (a blocker of time-sensitive work inherits urgency); blocked
  items and what unblocks them; real due dates (once Component B exists); solo deep-work that fits
  around fixed blocks.
- Emits `briefing_out.json` (schema in 4.3). No writes, no non-read tools.

### 4.2 Output format (locked with Dominik)
Glanceable — **grasp in ~10 seconds**, sorted by deadline (most time-sensitive first), one short *why*
per item. The rendered form (Telegram + panel) looks like:

```
☀️ Mon 6 Jul — sorted by deadline
⏰ Before 10:00 — people reachable, morning's gone after
🎯 Lock Art-175 His-tag w/ Bock/Karcher — gate blocking the synthesis order
📨 Message Karcher — cassette (med+high) + transformation vector
🔒 10:00–11:00 — HR Sicherheitsbelehrung + Edeka job (fixed)
🔓 After / no deadline
② Order Art-175 CDS Run B — the moment the tag is locked
③ 🔬 Tobacco ORF set — Mark → export → characterize (solo, high-prio)
④ 📖 If time: ingest ELYDIA endolysin papers
🧹 "tzutzu" — junk todo?
```
Rules: short lines, one clause of *why* max, group by time band (before fixed blocks / fixed calendar
blocks / after / no-deadline). Housekeeping flags (stray/junk todos) at the bottom, one line each.
Colorblind-safe: never rely on red/green alone — the priority is carried by *position* and the emoji
label, not color.

### 4.3 `briefing_out.json` schema (the contract between reasoning and delivery)
```json
{
  "date": "2026-07-06",
  "generatedAt": "2026-07-06T05:00:12Z",
  "headline": "Mon 6 Jul — sorted by deadline",
  "bands": [
    {"label": "Before 10:00", "note": "people reachable, morning's gone after",
     "items": [
       {"marker": "🎯", "title": "Lock Art-175 His-tag w/ Bock/Karcher",
        "why": "gate blocking the synthesis order", "projectId": "proj_b18c3660206e",
        "todoId": "t_mr5hj2rzxuiz"}
     ]},
    {"label": "10:00–11:00 (fixed)", "calendar": true,
     "items": [{"title": "HR Sicherheitsbelehrung + Edeka job"}]}
  ],
  "housekeeping": ["\"tzutzu\" — junk todo?"]
}
```
`todoId`/`projectId` are optional per item; when present they let the panel deep-link later. Delivery
scripts render this identically to Telegram and the panel.

### 4.4 Delivery scripts (deterministic, testable)
- `publish_briefing_to_gist.py` — GET the Gist, PATCH with `files:{"daily_briefing.json":{content}}`
  only. `--dry-run` prints the payload without writing. Fails loud (checks `r.ok`, like the fixed
  `ghSave` does after the 3-week silent-failure bug).
- `send_telegram_briefing.py` — renders `briefing_out.json` to the glanceable text and posts via the
  server's existing Telegram bot (token/chat-id from existing server config/env, **never hardcoded**).
- `run_briefing.sh` — orchestrates the three steps; on any non-zero step, sends a Telegram failure
  notice and logs to a file. No silent breakage.

### 4.5 Scheduling / host
- Cron weekdays, default **Mon–Fri 07:00 Europe/Berlin**, in a small config alongside Gist id, timezone,
  Telegram chat id.
- **Host: the VPS (91.99.133.39) initially** — RG MCP + Calendar MCP + Telegram already run there. Move
  to the lab box (144.91.100.65) once its MCP stack is configured (currently it has none). This is a
  known migration dependency, not a blocker.

## 5. Component B — due-date capture (wire the dead `dueDate` field)

Today `dueDate` exists in the todo schema but is only ever `null` — no UI, no MCP setter, no render.
"Sort by deadline" is therefore inference-only. This component makes deadlines real and pinnable.

- **HTML (additive, single-file, colorblind-safe):** a date control on each todo to set/clear a due
  date; render the date on the todo and a **due-soon / overdue** affordance that does *not* rely on
  red/green alone (e.g. an ⏰ badge + text like "overdue 2d", plus a non-red/green color).
- **MCP:** ensure `rg_lab_add_todo` / `rg_lab_update_todo` accept and persist `dueDate` (ISO date) so
  both Dominik (app) and the agent can set it. If already supported, just document; else add the param.
- **Briefing uses it:** the reasoning step sorts by real `dueDate` first (overdue → due today →
  upcoming), and falls back to the calendar+criticality inference for todos without one. So A works
  before B lands and gets sharper once B exists — A is **not blocked by** B.

## 6. Error handling & trust
- Every pipeline step logs to a dated file on the server.
- Any failure fires a Telegram "briefing failed: <reason>" — the explicit lesson from RG's earlier
  3-week silent sync failure. A missing/loud briefing is acceptable; a silently-wrong one is not.
- The panel shows a muted "no briefing yet" if `daily_briefing.json` is missing or its `date` ≠ today,
  so a stale briefing never masquerades as today's.

## 7. Testing
- `publish_briefing_to_gist.py` / `send_telegram_briefing.py`: unit-testable against a fixed
  `briefing_out.json` with `--dry-run`; assert the Gist PATCH names only `daily_briefing.json`, and the
  rendered Telegram text matches the locked format.
- Reasoning step: validated by manual runs, inspecting `briefing_out.json` (non-deterministic, not
  unit-tested).
- HTML "Today" panel + due-date control: **Dominik tests in the browser himself** (do not auto-open a
  browser to verify).

## 8. Build phasing (for the implementation plan)
1. **Delivery + panel skeleton:** `daily_briefing.json` contract, `publish`/`send` scripts (dry-run
   tested), and the read-only "Today" panel rendering a hand-written sample. Proves the pipe end-to-end.
2. **Reasoning step:** `briefing_prompt.md` + `run_briefing.sh` + cron; agent emits real
   `briefing_out.json`. Deadlines inferred (calendar + criticality).
3. **Due-date capture (Component B):** HTML control + render, MCP setter, briefing upgraded to sort by
   real due dates.

## 9. Open questions for the plan
- Exact server config location for the Telegram token/chat-id to reuse (confirm on the VPS).
- Whether `rg_lab_add_todo`/`update_todo` already persist `dueDate` (check the MCP before adding a param).
- Cron user + how `claude -p` is invoked non-interactively on the VPS (auth, working dir, allowed tools).
