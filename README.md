# Career Goals — daily task tracker

Vite + React 19 + TanStack Query on the front end, Express 5 + Mongoose on the back,
one MongoDB database. Both halves live in a single package and start with one command.

---

## The domain model

Three collections, in a strict hierarchy:

```
Goal  ──has many──▶  Task  ──has many──▶  Completion
(deadline)           (no deadline)        (one row per day)
                       │
                       └──has many──▶  TaskNote  (a thought, on one day)
```

Plus four that hang off the side of it:

```
GoalResolution  (one per goal, how it ended)      Thought  (belongs to nothing)

TrackingUnit  ──has many──▶  Measurement  ◀──optionally produced by──  Task
(what you measure)           (one number, one day)

SpecialDay  ──belongs to──▶  SpecialDayCategory
(a day that happens to you,   (Birthdays, Vacations, Sick days…:
 not one you do anything on)   one filter chip each)
```

**Goal** — the higher-level thing you're working towards. It is the *only* entity with a
due date. It has no progress field of its own: progress is derived from how many of its
tasks got ticked. A goal is assembled out of tasks.

**Task** — belongs to exactly one goal and has **no** due date. It repeats on whatever
schedule its frequency sets — every day by default — and carries no state of its own:
whether it happened is always a property of a *day*, never of the task.

**Completion** — one record per `(task, day)`. This is what "tasks reset daily" means in
practice: a task is never itself "done", each *day* is separately answered, and tomorrow
starts blank. A `(taskId, date)` unique index enforces one record per task per day.

A day has **three** states, not two:

| State      | Stored as                             |
| ---------- | ------------------------------------- |
| unanswered | no record at all                      |
| done       | `{ status: 'done' }`                  |
| failed     | `{ status: 'failed', note: '<why>' }` |

Two decisions worth knowing about:

- **Days are `YYYY-MM-DD` strings, not timestamps.** Storing a `Date` would make "which
  day was this?" depend on the reader's timezone, so ticking a box at 23:50 could land on
  the wrong column. The client sends its own local calendar day.
- **Clearing a day deletes the record** rather than keeping a "not done" row, so
  "unanswered" and "not done" can't drift apart. Flipping a failure to done also drops the
  note, since the reason no longer applies.

**Day resolution** — each task also says what should become of a day you never answered.
It's chosen when the task is created (and changeable afterwards from the day screen's
title menu), and it's the one thing that ever writes a completion you didn't:

| `task.dayResolution` | A scheduled day nobody answered                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `open` (default)     | Stays unanswered forever. What the app did before this existed.                                                                           |
| `fail`               | Becomes `{ status: 'failed', note: '', auto: true }` once the day is past.                                                                |
| `carry`              | Stacks forward, showing on Today as *due* until answered on its own date. Once the goal's target date has passed, whatever is still outstanding becomes `{ status: 'failed', note: 'Automatically failed', auto: true }`. |

The rule has one implementation, `server/src/lib/dayResolution.ts`, and three properties
worth keeping:

- **An automatic answer is a real completion**, flagged `auto: true`. The timeline, the
  goal statistics and a resolution's frozen snapshot all read it as an ordinary fail
  without any of them re-deriving the rule.
- **Answering a day by hand always wins**, and clears `auto`. Ticking an automatic fail
  overrides it.
- **`task.autoResolvedThrough` is a watermark** - the last day the resolver has dealt
  with. It never looks at a day at or before it. That's what stops a day whose automatic
  answer you *cleared* from reappearing on the next request, keeps the sweep proportional
  to the days that have passed since it last ran, and makes changing the setting
  forward-only: on a change the watermark jumps to yesterday, so history is never
  rewritten by a rule that wasn't in force at the time.

There is no scheduler in this app, so the resolver runs from the two tracker reads
(`GET /api/tracker` and `GET /api/tracker/day`). It's idempotent, and with nothing to
resolve it costs one query that matches no tasks.

**GoalResolution** — how a goal ended, written when you resolve it: an outcome, your own
note, and a *snapshot* of the figures at that moment. Its own collection so `Goal` stays
the plain container it is. Resolving is the normal way a goal finishes; deleting one is
the escape hatch (§6).

**Thought** — a think-tank entry, attached to no goal, task or day. Deliberately not a
`TaskNote`: the point is somewhere to put a thought *before* it has anywhere to belong.

**SpecialDay** — a holiday, a birthday, a vacation, a sick day. The one thing in here
that *happens* on a day rather than being done on one: it has no completion, no goal and
no schedule, which is exactly why it can't be a `Task`. A day being special changes
nothing about what's due — it's context, not work (with one opt-in exception, below).

**SpecialDayCategory** — what kind of day it is, and the user makes these: Birthdays,
Vacations, Festivals, Sick days. Each has a name, a colour (one of ten hues, `--hue-*`)
and a glyph, and the calendar's filter is simply the list of them, so a new category is a
new chip with no code involved. Nothing in the app asks "is this a vacation?" any more;
it asks the category, which carries two switches:

- **Day off** — its days are time off: drawn as a tinted band in its colour, and not
  counted as working days.
- **Pauses habits** — recurring tasks aren't due on its days (see
  [server/src/lib/vacation.ts](server/src/lib/vacation.ts)). Switching it on withdraws the
  automatic fails already on those days, as entering a vacation does.

Deleting a category deletes its days with it, after saying how many.

Two sources, one shape:

- **Stored** — every day entered by hand, filed under a category by `categoryId`.
- **Computed** — German public holidays, derived from the chosen Bundesland by
  `date-holidays` in [src/lib/holidays.ts](src/lib/holidays.ts) and **never written down**.
  Changing region re-derives them on the spot: no migration, and no stale rows left behind.
  They land in the **built-in** Holidays category, and Muttertag/Vatertag in Occasions.
  Built-ins can be renamed and recoloured like any other, but not deleted — the computed
  days would have nowhere to go.

Both collapse into one `SpecialDayOccurrence` — a *resolved* appearance on a concrete
date — which is all any screen ever sees, so the timeline, the day screen and Upcoming
can't disagree about what a day means.

Three decisions worth knowing about:

- **`endDate` is always present**, equal to `startDate` for a single day. Every range
  question is then a plain overlap test, with no "is this a point or a range?" branch
  anywhere downstream — the same instinct as `Completion` deleting a cleared day rather
  than inventing a third state.
- **`recurrence: 'annual'` works on ranges too**, as long as a range ends before the same
  date a year on; both ends repeat on their own month/day, so 30 Dec – 2 Jan crosses New
  Year every year. Feb 29 lands on the 28th in a common year. With **Count years** on, an
  annual day shows how many years it's been — a birthday's age, an anniversary.
- **Only `public` holidays are work-free.** `date-holidays` also knows Heiliger Abend and
  Silvester (`bank`), which are shown but never highlighted as days off, and a long tail of
  observances — Valentinstag, Muttertag, all four Advent Sundays — which are filtered out
  entirely. Regional cases are the library's problem, correctly: Fronleichnam is `public` in
  Bayern but not in Sachsen, where it only applies to certain municipalities.

**TrackingUnit** — a thing you measure: a `name` ("Weight"), an optional `symbol` ("kg"),
the `decimals` to round and render to, and an `aggregation` saying how its readings
collapse into one figure — `latest` for weight, `sum` for coffees or millilitres. Metadata
only; it holds no numbers itself.

**Measurement** — one number, in one unit, on one day. A reading typed on the tracking
page and a reading captured by ticking a task are the *same row*: the second just carries
the `taskId` that produced it. That's what lets one history list show both.

- Many readings per unit per day are allowed on purpose — four coffees on a Tuesday is four
  rows. The exception is a **task-borne** reading: a partial unique index on
  `(taskId, unitId, date)` means re-ticking a day *edits* its value rather than piling up
  another one, mirroring `Completion`'s unique `(taskId, date)`.
- The index is partial on `taskId` being an ObjectId, not on it merely existing, so a
  hand-entered row can never collide with another one.
- `date` is the calendar day, exactly as `Completion` stores it; `measuredAt` only orders
  several readings *within* one day. Never derive one from the other.

**Task → units.** A task carries `unitIds: []` — the units it asks for when it's ticked
off. Recording a value is optional: the sheet can be skipped, and the day is still done.
The values ride along on the completion request rather than a second call, so the day and
its numbers can't half-land (there are no transactions — see §5). The rule the server
applies, mirrored client-side by `nextMeasurements` in `src/hooks/useDay.ts`:

| Request                          | This task's readings for that day       |
| -------------------------------- | --------------------------------------- |
| `measurements` **omitted**       | left alone                              |
| `measurements: []`               | deleted — this is the sheet's "Skip"    |
| `measurements: [a, b]`           | replaced; any attached unit not listed is deleted |
| completion cleared (`DELETE`)    | deleted                                 |

The rule is the same whether the day is **done or failed** — missing a review and logging
your hours anyway is an ordinary Tuesday, so the fail sheet asks for the same values the log
sheet does. Only clearing a day outright removes its readings on its own.

Hand-entered readings have no `taskId` and are never touched by any of these. The three
distinct cases matter: the overview timeline ticks days without ever sending the key, so
backfilling a month in the grid can't wipe a weight typed on the day screen.

Deleting a unit that still has readings, or is still attached to a task, is **refused**
with a 409 naming what's holding it — nothing is cascaded, because the numbers are the
whole point of having had the unit.

---

## 1. Requirements

| Tool    | Version         | Notes                                |
| ------- | --------------- | ------------------------------------ |
| Node.js | 20.19+ / 22.12+ | This project was verified on Node 26 |
| Yarn    | 1.22+           | `yarn.lock` is committed             |
| MongoDB | 6+              | Local, Docker, or Atlas — see step 3 |

---

## 2. Install

```bash
yarn install
cp .env.example .env      # PowerShell: Copy-Item .env.example .env
```

`.env` is gitignored; `.env.example` is the template to keep in sync.

---

## 3. Get a MongoDB running

Pick **one**.

### Option A — Docker (fastest)

```bash
docker compose up -d          # uses the docker-compose.yml in this repo
docker compose logs -f mongo  # optional: watch it boot
docker compose down           # stop it later (data survives in the mongo-data volume)
```

Connection string (already the default in `.env.example`):

```
MONGODB_URI=mongodb://127.0.0.1:27019/careergoals
```

> **Why 27019?** It's deliberately off the default 27017, so this project gets its own
> database without colliding with any other MongoDB you already run locally. If 27017 is
> free on your machine and you'd rather use it, change the port in both
> `docker-compose.yml` and `MONGODB_URI`.

### Option B — a MongoDB you already run

Already have MongoDB on the standard port (a local install, or another container)? Skip
compose entirely and point at it:

```
MONGODB_URI=mongodb://127.0.0.1:27017/careergoals
```

The `careergoals` database is created on first write, so it won't touch your other data.

### Option C — MongoDB Atlas (free cloud tier)

1. Create a free M0 cluster at <https://cloud.mongodb.com>.
2. **Database Access** → add a database user (username + password).
3. **Network Access** → add your current IP, or `0.0.0.0/0` for a throwaway dev cluster.
4. **Connect → Drivers** → copy the connection string into `.env`:

```
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/careergoals?retryWrites=true&w=majority
```

> Percent-encode special characters in the password (`@` → `%40`, `:` → `%3A`, `/` → `%2F`).
> The `/careergoals` path segment is the database name — without it you land in `test`.

---

## 4. Run it

```bash
yarn dev
```

That starts both processes with colour-coded output:

| Process | URL                   | What it is                          |
| ------- | --------------------- | ----------------------------------- |
| `web`   | http://localhost:5173 | Vite dev server (HMR)               |
| `api`   | http://localhost:4000 | Express, restarts on save via `tsx` |

Open http://localhost:5173. Verify the API on its own at
<http://localhost:4000/api/health> — it reports `{"status":"ok","db":"connected"}`.

Want sample data?

```bash
yarn seed
```

That inserts 3 goals, 7 tasks, and a randomised tick history across **last month and this
month** — so the month switcher has something to show even on the 1st. Seeded tasks are
backdated to the start of last month, otherwise every historical day would sit before the
task existed and render as untickable.

It only runs against an **empty** database — see §5 for why, and how to override it.

---

## 5. The database is the source of truth

Nothing in this project ever bulk-deletes your data as a side effect of a schema change.
That used to not be true — an earlier version of `yarn seed` wiped all three collections
on every run, and running it during a schema change destroyed real entries. The fix:

- **Schema changes ship as migrations**, not reseeds. A migration is a small, reviewed
  script that transforms whatever is already in the database in place.
- **Every migration backs up first, automatically.** Before applying anything pending,
  the runner dumps every collection to `server/backups/<timestamp>-pre-migrate/`.
- **`yarn seed` now refuses to touch a non-empty database.** It only inserts demo data
  into an empty one. Wiping real data on purpose requires typing `--force` yourself, and
  even then it backs up first.
- **Migrations run automatically before `yarn dev` and `yarn start`** (via `predev` /
  `prestart`), so the schema is never stale — but since they're additive and always
  backed up first, that automation is safe in a way a reseed never was.

### Writing a migration

1. Add `server/src/migrations/000N_short_description.ts`:

   ```ts
   import type { Migration } from '../lib/migration'

   export const migration: Migration = {
     id: '0002_add_task_priority',
     description: 'Backfill priority: "normal" on existing tasks',
     up: async (db) => {
       await db.collection('tasks').updateMany(
         { priority: { $exists: false } },
         { $set: { priority: 'normal' } },
       )
     },
   }
   ```

2. Register it in [server/src/migrations/registry.ts](server/src/migrations/registry.ts) —
   append to the array, never reorder or edit one that already shipped.
3. Run `yarn migrate` (or just `yarn dev` / `yarn start`, which run it for you).

`up` gets the raw MongoDB `Db`, not a Mongoose model — models change shape over time, and a
migration should describe the transformation, not depend on today's schema still matching
yesterday's data.

### Backup and restore

```bash
yarn db:backup              # dump every collection to server/backups/<timestamp>-manual/
yarn db:restore             # no args: lists what's available
yarn db:restore <folder>    # replace live data with that backup's contents (backs up first)
```

Backups are Extended JSON (via `bson`'s `EJSON`), so `ObjectId`s and `Date`s round-trip
exactly — a restored document is byte-for-byte the same shape it was when dumped.
`server/backups/` is gitignored: it can contain real data, and doesn't belong in
version control.

---

## 6. The five screens

| Route                   | Screen     | For                                                              |
| ----------------------- | ---------- | ---------------------------------------------------------------- |
| `/`                     | Today      | Phone. Answer today's tasks, one tap each. `?date=` opens a day. |
| `/goals`                | Goals      | The goals running on a day, and the ones needing resolving.      |
| `/goals/:goalId`        | Goal       | One goal: progress, calendar, tasks, plan, journal, units.       |
| `/overview`             | Overview   | Desktop - left out of a phone's tab bar. The timeline, plus adding tasks and resolving goals. |
| `/calendar`             | Calendar   | Special days as a strip of months, like a wall planner.          |
| `/calendar/:month`      | Month      | One month in focus: its days, working days and special days.     |
| `/think-tank`           | Think tank | An inbox for thoughts, turned into tasks and goals.              |
| `/think-tank/:thoughtId` | Thought    | One thought, read in full.                                       |
| `/tracking`             | Tracking   | Health-style cards: each unit's figure for a day, and its trend. |
| `/tracking/:unitId`     | Unit       | One unit: its chart, its readings, what uses it.                 |
| `/tracking/compare`     | Compare    | Up to three units against each other.                            |

The day screen owns the root path because it's the one you open every day — swap the
routes in [src/App.tsx](src/App.tsx) if you'd rather land somewhere else.

Everything but Overview is in Apple's design language, phone first: grouped backgrounds
with inset cards, large titles that hand over to a translucent bar on scroll, and the
system's own controls. Detail pages slide in from the right and back out on "‹ Back"
(the View Transitions API, [src/lib/navigation.ts](src/lib/navigation.ts)) - only for
the app's own buttons; browser back and the iOS edge swipe animate themselves.

### The editing model - one rule everywhere

> **Pages show; an Edit button opens a bottom sheet. Sheets have Cancel and Save, and
> every field in them is the phone's own control.**

- **Detail pages are read-only.** Their bar reads `‹ Back … [+] [Edit]`: `+` adds the
  child item (a task to a goal, a reading to a unit), Edit opens the thing's own sheet.
- **One sheet creates and edits.** New Goal and Edit Goal are the same component with the
  same rows ([GoalSheet](src/components/GoalSheet.tsx)), and likewise
  [TaskSheet](src/components/TaskSheet.tsx), [UnitSheet](src/components/UnitSheet.tsx),
  [ReadingSheet](src/components/ReadingSheet.tsx) and
  [ThoughtSheet](src/components/ThoughtSheet.tsx). Tasks have no page: tapping a task row
  opens its sheet, the way Reminders' ⓘ does.
- **Native inputs.** `<input>` with the right `inputmode`/`enterkeyhint`, `<input
  type=date>`, `<select>` dressed as a pop-up button, `<input type=checkbox switch>`
  (Safari 17.4+ draws the real switch). Rows live in
  [FormRows](src/components/FormRows.tsx). Numbers are typed as text and read by
  `parseDecimal`, so "75,5" off a German keyboard works.
- **Sub-settings slide in inside the sheet** (Repeat ›, Tracking Units ›, Limit or Target ›,
  If Not Ticked ›). Every page edits one draft; one Save commits it - a PATCH of only the
  keys that changed.
- **Dirty guard.** Swiping a sheet down, tapping the scrim or pressing Escape with unsaved
  changes asks *Discard Changes / Keep Editing*.
- **Deleting.** Thoughts and readings, and archiving a task or goal, use an **undo toast**
  ([src/lib/toast.tsx](src/lib/toast.tsx)): the item disappears at once and the request
  goes out when the toast leaves (flushed with `keepalive` if the tab closes first).
  Units and tasks, whose deletes cascade through their history, ask in an action sheet.
  Goals keep the typed-name confirmation.

Every sheet is one primitive, [SheetCore](src/components/SheetCore.tsx): a native modal
`<dialog>` (focus trap, Escape, inert page) with a scrim and a panel moved frame by frame
from a spring. It rises from the bottom at every width, leaves the way it came, follows a
drag 1:1 from its grabber or header (or from its body once scrolled to the top), decides on
release by momentum projection, and can be grabbed mid-rise. On a phone the page behind
the first sheet recedes ([src/lib/sheetStack.ts](src/lib/sheetStack.ts)).

### The sidebar is part of the shell, not a page

The month calendar, the **category filter**, the **special-days filter**, the timeline's
sort control and **Create goal** live in one sidebar rendered by
[src/App.tsx](src/App.tsx), outside `<main>`. The
category filter applies to *every* screen — the timeline, the goals list and the day
screen all narrow to it — so it can't belong to any one of them.

Both it and the sort order persist to `localStorage`
(see [src/context/PrefsProvider.tsx](src/context/PrefsProvider.tsx)), so they survive a
reload. Hiding a category removes it from an OR-filter rather than requiring it: a goal
disappears only once *every* one of its categories is hidden. Below `75rem` the sidebar
is replaced by a button in the tab bar that opens the same content as a bottom **Filters**
sheet.

### Today — the mobile screen

A single vertical list of the day's tasks. Each row is the task title, the goal it feeds,
and two buttons:

- **Check** marks the day done. Tapping it again clears the day.
- **Cross** opens a sheet asking *"What's the reason for the fail? Any more details?"* The
  text is saved on that day's record and shown under the task, where tapping it reopens
  the sheet to edit. The sheet also has **Clear day** to go back to unanswered.

Built for thumbs: tap targets are at least 44px, the sheet slides up from the bottom on
narrow screens and respects `env(safe-area-inset-bottom)`, the textarea is 16px so iOS
Safari doesn't zoom on focus, and `touch-action: manipulation` kills the double-tap delay.
A progress bar at the top splits done vs failed, and the arrows step through earlier days.

Above everything sits the day's **info block**, when there is one: today is a holiday,
someone's birthday, a day of a vacation. It is deliberately *not* a task row — nothing to
tick, nothing counted in the figures, no status — because a day being special says nothing
about whether you did what you meant to. The upcoming groups below the day (**This week**,
**Next week** - both split by day, "Wednesday · In 2 days" - then **Next month** and
**Later**) carry the same days, mixed in with the tasks rather than given a heading of their
own: "what's coming" is one question.

Above the day's own list sits **Due** — the days a *carry-over* task never got answered
(see the domain model). One row per task, showing the oldest outstanding day and how many
are stacked behind it, with the same swipe and tick gestures as any other row. Answering
one writes to **its own date**, not to today: the debt is cleared where it was incurred,
so the timeline fills in that day and the next stacked day takes its place. Due rows only
ever show on today — stepping back to the 2nd shows the 2nd as it actually was.

Tasks created *after* the day you're viewing don't appear — they didn't exist yet. Tasks
whose goal has been **resolved** do still appear, greyed and struck through, with
**Archive task** in the title menu to take them off the screen for good (with an undo
toast). The title menu also carries **Add note**, **Show Goal**, and **Edit Task…**, which
opens the task sheet: title, goal, repeat, tracking units, limit and what a missed day
becomes, all in one place. Repeat and If Not Ticked apply from today onwards and never
rewrite days already gone. The floating **+** opens New Task.

### Goals

Browsed by day, with the same ‹ Today › header as Today and Tracking (future days
allowed). On today, **Needs resolving** lists goals past their due date that nobody has
resolved, each with an orange Resolve button. Below, every goal whose window covers the
day: a ring of that day's tasks in the **goal's colour** (failed in red), the title on one
line, and "Day 14 of 31 · 78% so far" under it. A row opens the goal's page; swipe right to
add a task, left to resolve (or archive, once resolved); press and hold to reorder.
**Upcoming** previews goals that haven't started, with a calendar-style date tile. The
floating **+** is New Goal - and saving one opens its page, so adding tasks comes next.

**A goal's page** (`/goals/:goalId`) is read-only: a big ring with the rate and "64 of 78
done", the day of its window, the current and best streak of fully-done days; a month
calendar of its days as a heatmap mixed from its colour (empty where nothing was due, each
day a button that opens Today on that date); its tasks, each with a seven-day dot strip and
opening the task sheet; its **plan** (the goal's `description`); a **journal** of day notes
and failure reasons; the tracking units its tasks feed; and Resolve / Reopen / Archive.

**Goal colour** is one of five (purple, the default and the accent; blue; green; orange;
pink), validated as a set for colour-blind separation in both modes. No red - red means
failed. It only ever marks rings, cells, dots and swatches, never text.

### Overview — the timeline

```
                    4  5  6  7  8  9 ...
▼ Run a half marathon                    68%  ⋯
    Run 5k          X  X  ·  X  ·  ·  ·
    Stretch 10 min  X  ·  X  X  X  ·  ·
▼ Read 24 books                          54%  ⋯
    Read 20 pages   ·  X  X  ·  ·  X  X
```

- **Rows are tasks, grouped under the goal they belong to.** The task column is sticky, so
  it stays put while the days scroll sideways.
- **The top row is Special days**, always directly under the calendar header and above
  every task row, in both sort orders. It belongs to no goal, so it's group index 0 rather
  than part of the goal/task list. It declares `stackItems` *for itself* and no fixed
  height, which is what lets the library grow it to fit: a vacation, a holiday falling
  inside that vacation and a birthday on the same day each get their own lane. Work-free
  days tint the whole column — a public holiday in its category's colour, time off you
  took (a day-off category) more softly in its own — and the `+` in its sidebar cell opens
  the special-days dialog, where the Bundesland is chosen.
- **The date window is a view control, not a fetch control.** Everything the data covers
  is loaded in one request; the canvas opens on today ±14 days and panning, zooming or
  dragging just moves the window over data that's already there. There are no date
  pickers, and nothing you do to the view causes a refetch.
- **Weekends are shaded and today is accented.**
- **Ticks cycle unanswered, done, cleared.** Failures are recorded on the Today screen,
  where there's room to ask why, but they show up here as a cross with the reason in
  the tooltip. Ticks are disabled for days in the **future**, and days **before the task
  was created** — a task can't have a history from before it existed.
- **Ticks are optimistic.** A tick flips immediately and rolls back if the server rejects
  it, so the grid never feels like it's waiting on the network.
- Each goal row shows a completion rate over its whole life, computed from the ticks —
  days that haven't happened yet, and days before a task existed, don't count against you.
  An overdue goal's title turns red.
- **The `⋯` menu** (revealed on hover, and kept out while it's open) holds *Add task*,
  *Resolve*, and — once resolved — *Archive*. It's portalled to `<body>`: the sidebar row
  it lives in is `overflow: hidden` and the timeline scrolls sideways, either of which
  would clip a panel rendered in place.

### Resolving a goal

A goal is never meant to be deleted — it's **resolved**. The Resolve sheet shows the figures as
they stand (rate, done, failed, unanswered, task count, days elapsed against days
planned), asks how it ended — *Achieved*, *Partly there*, *Missed it*, *Let it go* — and
gives you a box for what you made of it.

- The resolution is its own record ([GoalResolution](server/src/models/goalResolution.model.ts))
  and the goal's `status` moves to `completed`. Nothing is removed: the goal stays on the
  timeline and the goals list, greyed.
- **Archive** is the separate, later step that takes a finished goal off the active
  screens. It's only offered once the goal is resolved.
- The stats are **snapshotted onto the resolution**, not recomputed on read — tasks and
  their day records can be deleted afterwards, and the numbers you wrote the note about
  should outlive them.
- **Reopen this goal** drops the resolution and puts it back to `active`.
- **Delete permanently** is one level down in the same sheet (and in Edit Goal), behind typing the goal’s
  title. It cascades to the goal's tasks, their day records *and* their notes.

### Think tank

An inbox that turns thoughts into action. A Messages-style **capture bar** sits above the
tab bar: Return saves a thought with no sheet in between, and `#home` in the text tags it
(⤢ opens the full New Thought sheet for a title). The list reads like Notes - Pinned, Today,
Previous 7 Days, Previous 30 Days, then months - with a search field (server-side, title,
body or tag) and a tag strip that filters. Swipe a thought right to **Make Task**, left to
delete it (undo toast). Now and then a thought at least 21 days old comes back up in a
**Revisit** card: Make Task, Keep (snoozed 30 days, in `localStorage`) or Let Go.

**Make Task** opens the task sheet prefilled - its title, Repeat = Once, a goal to pick -
and its **Already done** switch logs it as done on a past day in one step (the task is
backdated with `startDay`, see the API). **Make Goal** opens the goal sheet with the text as
the plan. Either way the thought records its `outcome` and folds into **Turned into
action**, which links to where it went; a thought whose task or goal was later deleted
says so instead of linking nowhere.

### Tracking

Define what you measure — "Weight" in kg, "Coffees", "Steps" — and record against it. Each
unit is an Apple Health-style card for the day in view: the figure that matters (the
latest reading, or the day's total, per its own `aggregation`; "No reading · last 75 kg"
when there's none), a sparkline ending on that day - 30 days of line for a latest unit, 14
of bars for a summing one, grey with only the day in view in the accent, unlogged days as
gaps - and a round **+** that logs against that day. The unit's name opens its page:
the chart (period picker, swipe to page, hold to read), its readings grouped by day (tap
to edit, swipe left to delete), what uses it, and a link to compare it with others.

Deleting a unit is refused while anything still points at it; the action sheet shows the
server's reason. A unit a limit adds up can't be switched to "latest reading" while the
limit exists.

**Units on a task.** Attach units in the task sheet's *Tracking Units* page. Ticking a task
that carries units opens a sheet asking for each one, reached identically by the tick
button and by the swipe-left gesture. **Skip** marks the day done with nothing recorded;
a done row then shows its readings as a chip that reopens the sheet to edit them.

Failing a task asks for the same values, in the fail sheet alongside the reason — a failed
day keeps its numbers. A failed row's chip reopens the *fail* sheet, not the log sheet, so
editing a value can't quietly flip the day back to done.

Detaching a unit from a task deletes what *that task* recorded for it. Readings you typed
by hand are never touched — they carry no `taskId`.

The overview timeline deliberately does **not** ask: a grid cell can't show a number, and
a sheet per cell would make backfilling a month unusable. It ticks days without sending
the measurement key at all, which is precisely what stops it wiping a value entered on the
day screen.

### Calendar — special days, month by month

A wall planner of special days: months as columns, days 1–31 as rows, so a date sits on
the same line in every month. It's one strip from ten years back to ten years ahead,
scrolling freely month by month, so any twelve months sit side by side (Feb–Jan as easily
as Jan–Dec). Only special days are on it; goals, tasks and habits stay on their own screens.

- **It opens on the page of the current year that holds today**: Jan–Dec on a desktop
  (twelve months to a screen), Jul–Dec on a tablet (six), today's quarter on a phone
  (three, with today's row in the middle). Every scroll comes to rest on the start of a
  month.
- **The header is DayNav's**: the visible months above, the year most of them belong to
  as the title, then **Today** (once you've moved off the opening page), **‹ ›** (a year
  back or forward, smoothly, interruptible). The floating **+** opens the Special Days
  sheet, as on the other tabs. On a desktop where the year fits, the mouse wheel steps
  through months.
- **Grey is a day off**: weekends, and public holidays that are work-free. Time off — a
  day in a **Day off** category, like a vacation or a sick day — is a band in its
  category's colour, titled on its first day and again on the 1st of each month it runs
  into. Everything else is one word in its category's colour (a birthday's age in grey
  after the name). A day with more than one shows the first — days entered by hand, then
  computed observances, then holidays, then time off; within that, category order — plus
  "+1"; hovering shows them all. January carries its year, where one year turns into the
  next.
- **Past days step back**: they keep their card, but their text and tints fade, so what's
  still to come stands out.
- **The legend is the filter**: one chip per category, toggling the same categories as
  the sidebar's special-days filter, on every screen. A category made in the Special Days
  sheet shows up here at once. That's why the route has no sidebar on desktop.
  The strip stops above the floating +, so the button never covers the bottom of a column.
- **Tap a month** (anywhere in its column) to zoom into it: `/calendar/2026-05` grows out
  of the column, and **‹ 2026** shrinks it back into place, onto the month you were last
  on. The month view has the days as a calendar card (tap a day for everything on it),
  its working days and days off — counted from every day-off category and the
  Bundesland's holidays, with what's left in the current month — and its special days as a
  list. ‹ › in its bar step a month.

Only the years on screen and one either side are rendered, so the twenty-year reach costs
nothing. It reads the same `useSpecialDayOccurrences` as Today and Overview, so the
Bundesland and the filter apply here too. Nothing is stored for it; it's a view over
what's already there.

## 7. Scripts

| Command           | What it does                                                                |
| ----------------- | ---------------------------------------------------------------------------- |
| `yarn dev`        | Runs pending migrations, then both servers at once (via `concurrently`)      |
| `yarn dev:client` | Vite only                                                                    |
| `yarn dev:server` | Express only, watch mode                                                    |
| `yarn build`      | Typecheck all three TS projects, then build the client to `dist/`           |
| `yarn start`      | Runs pending migrations, then the API with `NODE_ENV=production`            |
| `yarn preview`    | Serve the built client                                                      |
| `yarn migrate`    | Apply any pending migrations (auto-backs up first)                          |
| `yarn db:backup`  | Dump every collection to `server/backups/<timestamp>-manual/`               |
| `yarn db:restore` | Restore a backup (no args: lists what's available)                          |
| `yarn seed`       | Insert demo data — only into an **empty** database (`--force` to override)  |
| `yarn typecheck`  | `tsc -b` across client, vite config, and server                             |
| `yarn lint`       | ESLint over the whole repo                                                  |

---

## 8. Environment variables

All in `.env` (see `.env.example`):

| Variable        | Default                                   | Used by                    |
| --------------- | ----------------------------------------- | -------------------------- |
| `NODE_ENV`      | `development`                             | server                     |
| `PORT`          | `4000`                                    | server + Vite proxy target |
| `MONGODB_URI`   | `mongodb://127.0.0.1:27019/careergoals` | server                     |
| `CLIENT_ORIGIN` | `http://localhost:5173`                   | server (CORS allowlist)    |
| `VITE_API_URL`  | unset → `/api`                            | client                     |

Only `VITE_`-prefixed variables reach the browser — never put secrets behind that prefix.

**How the two halves find each other:** the client calls the relative path `/api/...`, and
the Vite dev server proxies `/api` to `http://localhost:$PORT` ([vite.config.ts](vite.config.ts)).
Same origin in the browser, so no CORS preflight in dev. In production, either serve
`dist/` from a static host and set `VITE_API_URL` to the deployed API URL (adding that
host to `CLIENT_ORIGIN`), or put both behind one reverse proxy and leave it unset.

---

## 9. Project layout

```
├── server/src/
│   ├── index.ts                  # bootstrap: connect DB → listen → graceful shutdown
│   ├── app.ts                    # express app, CORS, /api/health, route mounting
│   ├── migrate.ts                # yarn migrate - applies pending migrations
│   ├── backup.ts                 # yarn db:backup
│   ├── restore.ts                # yarn db:restore
│   ├── seed.ts                   # yarn seed - demo data, empty databases only
│   ├── migrations/
│   │   ├── registry.ts           # ordered list of migrations
│   │   ├── 0001_baseline.ts      # the current schema, as a starting point
│   │   └── …                     # 0002..0006, appended in order, never edited
│   ├── config/env.ts             # typed, validated env access
│   ├── db/connect.ts             # mongoose connection + lifecycle logging
│   ├── lib/date.ts               # YYYY-MM / YYYY-MM-DD helpers
│   ├── lib/text.ts               # escapeRegex, for user strings in a $regex
│   ├── lib/backup.ts             # EJSON dump used by migrate / backup / restore
│   ├── lib/migration.ts          # the Migration type
│   ├── models/
│   │   ├── goal.model.ts         # Goal: the deadline lives here
│   │   ├── task.model.ts         # Task: belongs to a goal, no deadline
│   │   ├── completion.model.ts   # one row per (task, day), unique index
│   │   ├── taskNote.model.ts     # a freeform thought against one task, one day
│   │   ├── goalResolution.model.ts # how a goal ended + a stats snapshot
│   │   ├── thought.model.ts      # think-tank entry, attached to nothing
│   │   ├── trackingUnit.model.ts # a thing you measure: name, symbol, decimals
│   │   └── measurement.model.ts  # one number, one unit, one day
│   ├── routes/                   # goal / task / tracker / thought / trackingUnit / measurement routers
│   ├── controllers/
│   │   ├── goal.controller.ts    # CRUD + cascade delete
│   │   ├── task.controller.ts    # CRUD + cascade delete
│   │   ├── goalResolution.controller.ts # resolve / reopen a goal
│   │   ├── taskNote.controller.ts       # notes by day, by goal, or all
│   │   ├── thought.controller.ts        # think tank, with server-side search
│   │   ├── trackingUnit.controller.ts   # CRUD + the summary aggregation + blocked delete
│   │   ├── measurement.controller.ts    # hand-entered readings + roundToDecimals
│   │   └── tracker.controller.ts # the whole-history grid, the day toggle, task readings
│   └── middleware/errorHandler.ts # HttpError, 404, central error → JSON
│
├── src/                          # React client
│   ├── main.tsx                  # QueryClientProvider + devtools
│   ├── App.tsx                   # shell: nav + the app-wide sidebar + routes
│   ├── context/                  # prefs.ts (context) + PrefsProvider.tsx
│   ├── lib/apiClient.ts          # fetch wrapper, throws typed ApiError
│   ├── lib/queryClient.ts        # QueryClient defaults (staleTime, retry policy)
│   ├── lib/date.ts               # local-date helpers (never UTC)
│   ├── lib/goalStats.ts          # the one implementation of "how is this goal going"
│   ├── lib/storage.ts            # localStorage that can't take a render down
│   ├── lib/units.ts              # formatMeasurement - the one way a value is written
│   ├── api/                      # goals, goalResolutions, tasks, taskNotes, tracker, thoughts, trackingUnits, measurements
│   ├── hooks/                    # useGoals, useTasks, useTracker, useDay (optimistic), usePrefs, useTrackingUnits, useMeasurements, useMeasurementDraft
│   ├── routes/
│   │   ├── TodayPage.tsx         # the mobile day screen
│   │   ├── GoalsPage.tsx         # the goal summary screen
│   │   ├── OverviewPage.tsx      # the timeline screen
│   │   ├── CalendarPage.tsx      # the strip of months of special days
│   │   ├── MonthPage.tsx         # one month of it, zoomed in
│   │   ├── ThinkTankPage.tsx     # the think tank
│   │   └── TrackingPage.tsx      # units and the numbers behind them
│   └── components/               # AppSidebar, TrackerTimeline, MonthStrip, RowMenu, MeasurementFields, …
│
├── docker-compose.yml            # local MongoDB
├── tsconfig.app.json             # client
├── tsconfig.node.json            # vite config
└── tsconfig.server.json          # server
```

---

## 10. API reference

Base URL `http://localhost:4000/api` (or just `/api` through the Vite proxy).

### Tracker — what the table uses

| Method   | Path                           | Body / Query        | Returns                   |
| -------- | ------------------------------ | ------------------- | ------------------------- |
| `GET`    | `/tracker`                     | `?from=YYYY-MM-DD&to=YYYY-MM-DD` | the grid, whole history by default |
| `GET`    | `/tracker/day`                 | `?date=YYYY-MM-DD`  | one day, as a flat list   |
| `GET`    | `/tracker/notes`               | `?date=` or `?goalId=`, or neither | `TaskNote[]` |
| `POST`   | `/tracker/notes`               | `{ taskId, date, text }` | `201` `TaskNote`     |
| `PATCH`  | `/tracker/notes/:id`           | `{ text }`          | `200` `TaskNote`          |
| `DELETE` | `/tracker/notes/:id`           | —                   | `204` no content          |
| `PUT`    | `/tasks/:id/completions/:date` | `{ status, note?, measurements? }` | the `Completion` row |
| `DELETE` | `/tasks/:id/completions/:date` | —                   | `204`, back to unanswered |

**With no `from`/`to` it returns everything there is** — from the earliest thing that
exists (a goal's start, a goal's creation, the oldest day ever answered) out to the latest
due date, plus a fortnight past today. That's what the overview asks for: the date window
on screen is a *view* control, so the fetch covers the lot and panning never runs into
blank days that had data behind them. The derived span is clamped to ~5 years; an
explicit `from`/`to` is still honoured and still capped at 366 days.

Archived goals are left out. **Resolved** ones are not — they come back with their
`resolution` attached, to be shown greyed rather than hidden.

`GET /tracker/notes` narrows by `date` (one day, for the day screen), by `goalId` (every
note under one goal, for the goals screen), or by neither (the lot, capped at 1000).

`GET /tracker` returns goals → their tasks → a map of ticked days, in one round trip:

```jsonc
{
  "from": "2026-08-04",
  "to": "2026-09-02",
  "days": ["2026-08-04", "2026-08-05", "..."],
  "goals": [
    {
      "id": "…", "title": "Run a half marathon", "targetDate": "2026-12-01T00:00:00.000Z",
      "status": "active",
      // null until the goal is resolved
      "resolution": null,
      "tasks": [
        {
          "id": "…", "title": "Run 5k", "goalId": "…",
          // only answered days appear; a missing day is still unanswered.
          // auto: true means the day resolver wrote it, not you
          "completions": {
            "2026-09-01": { "status": "done", "note": "", "auto": false },
            "2026-09-04": { "status": "failed", "note": "Work ran late.", "auto": false }
          }
        }
      ]
    }
  ]
}
```

`GET /tracker/day` is what the mobile screen uses — a flat list, already joined to the
goal title, and filtered to tasks that existed on that date:

```jsonc
{
  "date": "2026-09-01",
  "tasks": [
    // goalStatus and categories ride along so the day screen can filter by
    // category and grey out a resolved goal's work without a second request
    { "id": "1", "title": "Run 5k", "goalTitle": "Run a half marathon",
      "goalStatus": "active", "categories": ["health"],
      "status": "done", "note": "" },
    { "id": "2", "title": "Commit something", "goalTitle": "Ship the app",
      "goalStatus": "active", "categories": ["work"],
      "status": "failed", "note": "Just forgot." },
    { "id": "3", "title": "Read 20 pages", "goalTitle": "Read 24 books",
      "goalStatus": "completed", "categories": ["learning"],
      "status": null, "note": "" }          // null = still unanswered
  ],
  // Carry-over days still owed - one row per task, oldest first. Only ever
  // populated when `date` is today. Answering one PUTs to `dueDate`, not to
  // today, and the next stacked day takes its place on the refetch.
  "due": [
    { "id": "1", "title": "Run 5k", "goalTitle": "Run a half marathon",
      "goalStatus": "active", "categories": ["health"],
      "dueDate": "2026-08-29", "daysLate": 3, "stacked": 2 }
  ]
}
```

`PUT` takes `{ "status": "done" | "failed", "note"?: string }`. It upserts, so calling it
twice is an edit rather than a duplicate row, and `note` is cleared when the status is
`done`. Both `PUT` and `DELETE` reject days in the future with `400`.

### Goals

| Method   | Path         | Body / Query                                  | Returns          |
| -------- | ------------ | --------------------------------------------- | ---------------- |
| `GET`    | `/goals`     | `?status=active\|completed\|archived&search=` | `200` `Goal[]`   |
| `GET`    | `/goals/:id` | —                                             | `200` `Goal`     |
| `POST`   | `/goals`     | `GoalInput`                                   | `201` `Goal`     |
| `PATCH`  | `/goals/:id` | `Partial<GoalInput>`                          | `200` `Goal`     |
| `DELETE` | `/goals/:id` | —                                             | `204` no content |

```jsonc
// GoalInput
{
  "title": "Run a half marathon",    // required, 1–140 chars
  "description": "Long run Sundays", // optional, <= 2000
  "categories": ["health"],          // optional, each <= 60, defaults to ["general"]
  "status": "active",                // active | completed | archived
  "targetDate": "2026-12-01",        // ISO date or null — goals only
  "color": "blue"                    // purple | blue | green | orange | pink, or null (= purple)
}
```

Deleting a goal **cascades**: its tasks, all of their day records, all of their notes and
its own resolution go with it. It's the escape hatch — resolving is how a goal is meant to
end (§6).

### Goal resolutions

| Method   | Path                    | Body / Query            | Returns                    |
| -------- | ----------------------- | ----------------------- | -------------------------- |
| `GET`    | `/goals/:id/resolution` | —                       | `200` `GoalResolution`     |
| `PUT`    | `/goals/:id/resolution` | `GoalResolutionInput`   | `200` `GoalResolution`     |
| `DELETE` | `/goals/:id/resolution` | —                       | `204`, goal back to active |

```jsonc
// GoalResolutionInput
{
  "outcome": "achieved",             // achieved | partial | missed | abandoned
  "note": "Ran it in 1:52.",         // optional, <= 4000
  // a snapshot, not an authority - see below
  "stats": {
    "rate": 74, "done": 51, "failed": 6, "missed": 12,
    "possible": 69, "taskCount": 3, "daysElapsed": 90, "daysPlanned": 90
  }
}
```

`PUT` upserts and moves the goal's `status` to `completed`; calling it again edits the
resolution rather than stacking up (one per goal, enforced by a unique index). `DELETE`
reopens the goal.

`stats` is computed by the client, in [src/lib/goalStats.ts](src/lib/goalStats.ts) — it
already holds the whole tracker payload and the one implementation of the rate maths, and
a second copy on the server would be a second thing to keep in step. It's frozen at the
moment of resolving so the figures survive the tasks being deleted later.

**Archiving** is just `PATCH /goals/:id` with `{ "status": "archived" }` — it needs no
endpoint of its own. That's what takes a resolved goal off the active screens.

### Thoughts — the think tank

| Method   | Path            | Body / Query               | Returns             |
| -------- | --------------- | -------------------------- | ------------------- |
| `GET`    | `/thoughts`     | `?search=…&tag=…`          | `200` `Thought[]`   |
| `POST`   | `/thoughts`     | `ThoughtInput`             | `201` `Thought`     |
| `PATCH`  | `/thoughts/:id` | `Partial<ThoughtInput>`    | `200` `Thought`     |
| `DELETE` | `/thoughts/:id` | —                          | `204` no content    |

```jsonc
// ThoughtInput
{
  "title": "On shipping",   // optional, <= 140
  "text": "…",              // required, 1-10000
  "tags": ["ideas"],        // optional, each <= 60, de-duplicated case-insensitively
  "pinned": false,          // pinned entries sort first
  "outcome": {              // optional - what it became; null clears it
    "kind": "task",         // task | goal
    "id": "…",              // the task's or goal's id - may since have been deleted
    "title": "Fix the tap",
    "at": "2026-10-14T08:30:00Z"
  }
}
```

On `PATCH`, `tags: []` is a real edit (the thought ends up with none); only on `POST` does
an empty list mean "didn't say".

Listing is pinned-first then newest. `search` matches title, body or tag as a
case-insensitive substring; unlike `/goals?search=`, the pattern is **escaped**, because
searching the think tank for an open bracket is an ordinary thing to type.

### Special days

| Method   | Path                | Body / Query                | Returns              |
| -------- | ------------------- | --------------------------- | -------------------- |
| `GET`    | `/special-days`     | `?from=…&to=…`              | `200` `SpecialDay[]` |
| `POST`   | `/special-days`     | `SpecialDayInput`           | `201` `SpecialDay`   |
| `PATCH`  | `/special-days/:id` | `Partial<SpecialDayInput>`  | `200` `SpecialDay`   |
| `DELETE` | `/special-days/:id` | —                           | `204` no content     |

```jsonc
// SpecialDayInput
{
  "categoryId": "6ad5…",      // required; must be an existing category (else 422)
  "title": "Anna",            // required, <= 140
  "startDate": "1990-04-05",  // YYYY-MM-DD
  "endDate": "1990-04-05",    // optional; defaults to startDate
  "recurrence": "annual",     // none | annual
  "yearKnown": true,          // whether the start year is real: counts an age/anniversary
  "note": ""                  // optional, <= 500
}
```

Public holidays have **no endpoint** — they're computed on the client from the Bundesland
kept in `localStorage`, so there's nothing to store or serve. `from`/`to` narrow
non-recurring days to those overlapping the window; recurring ones are always returned,
since whether they land in it depends on a projection the client does.

Two `422`s worth knowing: `endDate` before `startDate`, and an annual range that doesn't
end before the same date a year on. A `PATCH` is validated against the document *as it
will be*, not against the patch alone — moving only `startDate` past an untouched `endDate`
drags the end along rather than leaving an inverted range. Saving a day in a category that
pauses habits withdraws the automatic fails on its days.

### Special-day categories

| Method   | Path                          | Body                                | Returns                      |
| -------- | ----------------------------- | ----------------------------------- | ---------------------------- |
| `GET`    | `/special-day-categories`     | —                                   | `200` `SpecialDayCategory[]` (filter order) |
| `POST`   | `/special-day-categories`     | `SpecialDayCategoryInput`           | `201` `SpecialDayCategory`   |
| `PATCH`  | `/special-day-categories/:id` | `Partial<SpecialDayCategoryInput>`  | `200` `SpecialDayCategory`   |
| `DELETE` | `/special-day-categories/:id` | —                                   | `204` no content             |

```jsonc
// SpecialDayCategoryInput
{
  "name": "Sick days",        // required, <= 40; unique, case-insensitively (else 409)
  "color": "red",             // red | orange | amber | green | teal | blue | indigo | pink | brown | slate
  "icon": "thermometer",      // one of the glyphs in src/components/specialDayGlyphs.tsx
  "dayOff": true,             // time off: a band, not a working day
  "pausesHabits": true        // recurring tasks aren't due on its days
}
```

A new category goes to the end of the list. `builtin` (`holidays` | `observances`) is set
only by the migration that made those two, and can't be written; deleting a built-in is a
`400`. Deleting any other category deletes its days too. Switching `pausesHabits` on
withdraws the automatic fails on every day the category already holds.

### Tasks

| Method   | Path         | Body / Query                       | Returns          |
| -------- | ------------ | ---------------------------------- | ---------------- |
| `GET`    | `/tasks`     | `?goalId=…&includeArchived=true`   | `200` `Task[]`   |
| `POST`   | `/tasks`     | `{ title, goalId, archived?, frequency?, unitIds?, dayResolution? }` | `201` `Task` |
| `PATCH`  | `/tasks/:id` | partial of the above               | `200` `Task`     |
| `DELETE` | `/tasks/:id` | —                                  | `204` no content |

`goalId` is required and must reference an existing goal — a task with no goal is a `422`,
and an unknown goal is a `404`.

`POST` also takes an optional `startDay` (`YYYY-MM-DD`), for a `once` task only, no later
than today and no earlier than its goal's start: the task's `createdAt` is backdated to
noon UTC that day, so a completion written there afterwards (`PUT
/tasks/:id/completions/:date`) shows as done on that day rather than as upcoming. That's
how the think tank's "Already done" logs something done in the past. A limit isn't taken
on `POST` - set it with a `PATCH` straight after. Deleting a task **cascades** to its day records and its
notes — and its measurements. `PATCH /tasks/:id` with `{ "archived": true }` is what
"Archive task" does on the day screen.

`unitIds` is capped at 6 and must reference existing tracking units. Sending it on a
`PATCH` **replaces** the list, and deletes any readings this task recorded for a unit
that's no longer in it.

`dayResolution` is `open` | `fail` | `carry` and defaults to `open` — what happens to a
scheduled day nobody answers (see the domain model). Changing it on a `PATCH` also moves
the task's `autoResolvedThrough` watermark to yesterday, so the new setting takes effect
from today onwards and never rewrites a day that has already gone by. Changing `frequency`
moves the watermark for the same reason, and for a sharper one: a `carry` task never
advances its own watermark while its goal is still in date, so without that move a new
frequency would have the task surface every day of its history at once as stacked debt.

`frequency` is one of `{ type: 'daily' }`, `{ type: 'once' }`,
`{ type: 'weekly', daysOfWeek: [0-6] }`, `{ type: 'monthly', daysOfMonth: [1-31] }` or
`{ type: 'everyNDays', intervalDays: 2-365, startWeekday: 0-6 }`. A `once` task doesn't
need its goal to have a target date: with one, its single chance runs out when that date
passes; without one, it stays on the list until it's ticked.

`everyNDays` is the only frequency that needs a point to count from — a weekday alone
doesn't say *which* Monday. The server resolves `startWeekday` into a stored `anchorDate`,
the first occurrence, and every later one falls `intervalDays` apart from it. That field is
**server-owned**: it is not accepted on the wire, and one sent anyway is ignored. Creating,
it resolves from the task's start day (so a task on a goal beginning next month starts its
cadence there); editing, never earlier than today, so a changed frequency cannot reach back
and make days that have gone by retroactively scheduled. Once written it is fixed — moving
the goal's `startDate` afterwards leaves the cadence where it is.

### Tracking units

| Method   | Path                  | Body / Query                                   | Returns                 |
| -------- | --------------------- | ---------------------------------------------- | ----------------------- |
| `GET`    | `/tracking-units`     | —                                              | `200` `TrackingUnit[]`  |
| `POST`   | `/tracking-units`     | `{ name, symbol?, decimals?, aggregation? }`   | `201` `TrackingUnit`    |
| `PATCH`  | `/tracking-units/:id` | partial of the above                           | `200` `TrackingUnit`    |
| `DELETE` | `/tracking-units/:id` | —                                              | `204`, or `409` in use  |

Every unit carries a server-computed `summary` — `{ entryCount, latest, todayTotal }` —
built in one aggregation, so rendering the page never means fetching anyone's history.

A duplicate `name` is a **409**, matched case-insensitively (a plain unique index would
let "kg" and "Kg" both through, which is the collision people actually make). Deleting a
unit that any task or entry still points at is also a **409**, naming what's holding it;
archived tasks count and are labelled as such, since they're off every screen.

### Measurements

| Method   | Path                | Body / Query                          | Returns                |
| -------- | ------------------- | ------------------------------------- | ---------------------- |
| `GET`    | `/measurements`     | `?unitId=&from=&to=&limit=` (30, max 366) | `200` `Measurement[]` |
| `POST`   | `/measurements`     | `{ unitId, value, date?, note? }`     | `201` `Measurement`    |
| `PATCH`  | `/measurements/:id` | `{ value?, note? }`                   | `200` `Measurement`    |
| `DELETE` | `/measurements/:id` | —                                      | `204` no content       |

Newest first. `date` defaults to today; backdating is allowed, the future is a `400` — the
same rule the task tick enforces, so both entry points agree. `value` is rounded to the
unit's `decimals` on write, so what's stored is what's shown. List rows carry `taskTitle`
when a task tick produced them.

This endpoint is for readings typed on the tracking page. Readings that come from ticking
a task go through `PUT /tasks/:id/completions/:date` instead — see the domain model.

### Errors

`{ "message": string, "issues"?: [{ path, message }] }` with status `400` (bad id, or a
future day), `404` (not found), `409` (a name already taken, or a unit still in use),
`422` (validation), or `500`.

```bash
curl "http://localhost:4000/api/tracker"        # everything there is

curl -X PUT http://localhost:4000/api/tasks/<taskId>/completions/2026-09-01 \
  -H "Content-Type: application/json" -d '{"done":true}'
```

---

## 11. How the React Query wiring works

`main.tsx` wraps the app in a `QueryClientProvider`, so components read and mutate server
state through hooks instead of `useEffect` + `useState`.

**Reading** — one query backs each screen:

```ts
const { data, isPending, isError, error, isFetching } = useTracker()   // the whole grid
const { data } = useDay('2026-09-01')                                  // one day
const { data } = useThoughts(search)                                   // the think tank
```

`useTracker` takes no arguments and its key carries no dates: the grid is fetched whole,
once, and the timeline's date window is chosen locally. Panning, zooming and switching
sort order all read from that one cache entry rather than re-querying. `useDay` and
`useThoughts` still key on what they vary by, and use
`placeholderData: (previous) => previous` so stepping through days — or typing in the
think tank's search box — doesn't blank the list out between requests.

**Writing** — [useTracker.ts](src/hooks/useTracker.ts) does an optimistic toggle, the one
piece of this app where latency would be really felt:

```ts
onMutate: async ({ taskId, date, done }) => {
  await queryClient.cancelQueries({ queryKey })   // don't let an in-flight refetch clobber us
  const previous = queryClient.getQueryData(queryKey)
  queryClient.setQueryData(queryKey, /* flip that one cell */)
  return { previous }                             // hand the snapshot to onError
},
onError: (_e, _vars, context) => queryClient.setQueryData(queryKey, context.previous),
onSettled: () => queryClient.invalidateQueries({ queryKey }),
```

Other conventions already in place:

- **Query keys are centralised** in `goalKeys` / `taskKeys` / `trackerKeys`, so an
  invalidation can't miss a cache entry because a key got retyped slightly differently.
- **Every screen reads the same records**, so every completion mutation invalidates
  `trackerKeys.all` — answering a task on the phone updates the grid and the goals list,
  and vice versa. Goal, task and resolution mutations do the same, since adding a task or
  resolving a goal has to show up everywhere at once.
- **View preferences are not server state**, so they aren't in React Query at all: the
  category filter and the sort order live in `PrefsProvider` and persist to
  `localStorage`. Only things the server owns go through the cache.
- **Errors are typed.** `apiFetch` throws an `ApiError` carrying the HTTP status and the
  server's zod issues, and `queryClient` uses that status to skip retries on 4xx —
  retrying a validation failure only wastes a round trip.
- **Devtools** are mounted in `main.tsx`; the floating icon opens a cache inspector, and
  the component is dropped from production builds.

---

## 12. Adding a resource

1. `server/src/models/<thing>.model.ts` — the mongoose schema. If the database already has
   documents that need to change shape for this to work, that's a migration (§5), not a
   hand edit or a reseed.
2. `server/src/controllers/<thing>.controller.ts` — handlers, one zod schema per input.
   Throw `new HttpError(404, '...')`; Express 5 forwards async rejections to the error
   handler by itself, so no `try/catch` per route. If it owns child documents, delete them
   in the same handler the way `deleteGoal` does.
3. `server/src/routes/<thing>.routes.ts` — then mount it in `app.ts`.
4. `src/api/<thing>.ts` — types + fetchers.
5. `src/hooks/use<Thing>.ts` — copy the `goalKeys` / hooks pattern, and invalidate
   `trackerKeys.all` if the change can affect the grid.

A new collection needs **no migration** — Mongo creates it on first write, and nothing
already stored changes shape. Migrations are for documents that already exist
(`GoalResolution`, `Thought`, `TrackingUnit` and `Measurement` were all added without one;
adding `unitIds` to the existing `tasks` needed `0006`).

### Things kept in sync by hand

Nothing type-checks across the wire, so these pairs have to be changed together:

| One side | The other |
| --- | --- |
| `server/src/lib/schedule.ts` | `src/lib/schedule.ts` — `isScheduledOn` is duplicated on purpose |
| `TaskFrequency` in `src/api/tasks.ts` | `TaskFrequencyInput`, its write-side twin, in the same file |
| the `DayTask` interface in `src/api/tracker.ts` | the row object `getDay` builds by hand |
| `TaskFrequency` / `unitIds` in `src/api/tasks.ts` | `server/src/models/task.model.ts` |
| the measurement rule in `setCompletion` | `nextMeasurements` in `src/hooks/useDay.ts` |
| `TaskDayResolution` in `server/src/models/task.model.ts` | `TaskDayResolution` in `src/api/tasks.ts` |
| `specialDayHues` / `specialDayIcons` in `server/src/models/specialDayCategory.model.ts` | the same lists in `src/api/specialDays.ts` (and `--hue-*` in `src/index.css`, the glyphs in `src/components/specialDayGlyphs.tsx`) |

`nextMeasurements` exists so the optimistic patch shows exactly what the server will
store. If the two drift, a row displays a value that was never saved, until the next
refetch quietly removes it.

The `schedule.ts` pair is the one to be most careful with, because only one half of it is
type-checked. `tsconfig.app.json` isn't strict, so a frequency the *client* copy doesn't
handle would fall off the end of the switch, return `undefined`, and still compile — and
that function decides what the timeline, the heatmap and every statistic can see. The
explicit `never` assignment in its `default` case is what turns that into a build error;
don't remove it.

---

## Troubleshooting

| Symptom                                                    | Fix                                                                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `MongooseServerSelectionError: connect ECONNREFUSED`       | MongoDB isn't running — `docker compose up -d`, or check `MONGODB_URI`                                      |
| `Bind for 0.0.0.0:27019 failed: port is already allocated` | Another container holds the port: `docker ps`, then pick a free one in `docker-compose.yml` + `MONGODB_URI` |
| Atlas: `bad auth` / `Authentication failed`                | Wrong user/password, or unencoded special characters in the password                                        |
| Atlas: connection hangs, then times out                    | Your IP isn't in **Network Access**                                                                         |
| Client 404s on `/api/...`                                  | The API isn't running, or `PORT` in `.env` no longer matches the proxy target                               |
| `EADDRINUSE :4000`                                         | Something else holds the port: `netstat -ano \| findstr :4000`, then `taskkill /PID <pid> /F`               |
| CORS error in the browser console                          | You're calling the API cross-origin — add that origin to `CLIENT_ORIGIN`                                    |
| Every cell in a month is hatched                           | Those days are before the tasks were created — see §6                                                       |
| `Completion validation failed: status: Path status is required` | Records predate the done/failed schema — write a migration (§5) to backfill `status`                |
| `yarn seed` refuses to run                                 | It only inserts into an empty database, on purpose (§5) — `yarn db:backup` first, then `--force` if you mean it |
| Need to undo a migration or a bad `--force` reseed         | `yarn db:restore` with no args to list backups, then `yarn db:restore <folder>` — one was taken automatically right before |
