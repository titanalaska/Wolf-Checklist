# Groundwork Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the Wolf Checklist to **Groundwork** and move it to `titanalaska.github.io/Groundwork/` without stranding a single installed phone or losing a single saved count.

**Architecture:** A new repo is created alongside the old one; the old one is never renamed and never redirected. `localStorage` and the bed-image cache keep their `wolf-*` names because the origin is shared and the values carry over for free. Only the shell cache is re-prefixed, and its cleanup is narrowed so the two apps can coexist without deleting each other's caches.

**Tech Stack:** Single-file HTML app, vanilla ES5-style JS, a service worker, GitHub Pages, `node:test` (Node 24) and Playwright.

**Spec:** `docs/superpowers/specs/2026-09-20-groundwork-rename-design.md`

## Global Constraints

- **NEVER rename the repo on GitHub.** GitHub 301-redirects a renamed repo, Pages included. A 301 on `sw.js` is forbidden by the Service Worker spec and silently freezes every install — this is exactly what stranded five PMs on Bootprint. Create a **new** repo.
- **NEVER change `var DOC_PATH = "checklist/wolf";`** (index.html). That is the shared-state document key on the sync backend. Changing it orphans every user's shared checklist state.
- **NEVER change `var LOCAL_KEY = "wolf-field-checklist-v1";`** or any `wolf-sync-key`, `wolf-lang`, `wolf-inv-token`, `wolf-inv-profile` key. `localStorage` is origin-scoped and `titanalaska.github.io` is shared, so these carry over untouched. Renaming loses the value, it does not move it.
- **NEVER rename `BED_CACHE = 'wolf-beds-v2'`** (sw.js). ~27 MB of bed crops, deliberately un-versioned so a deploy does not re-pull it over cell data.
- **Do NOT touch `wolf` in domain prose or comments** — `"Chris's Wolf checklist doc"`, `"WSRCC codes collide with Wolf's"`, `"Wolf's beds carry them"`. These refer to the actual Wolf Architects job and remain true.
- No behaviour changes. This is a rename and a move.
- Existing style in the first `<script>` block: `var`, `function`, no arrow functions or template literals.
- `npm test` must stay green throughout: **14 node + 22 Playwright**. `npm run verify-tests` must report all mutations caught.

---

### Task 1: A guard test for everything that must not change

Written first, before any rename, so the destructive edits are impossible to make silently.

**Files:**
- Create: `tests/rename-guards.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks import. It reads `index.html` and `sw.js` as text.

- [ ] **Step 1: Write the test**

Create `tests/rename-guards.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = () => fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = () => fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

// These names are load-bearing. localStorage and the Cache API are scoped to
// the ORIGIN, and titanalaska.github.io is shared by all three apps -- so
// /Groundwork/ inherits every one of these for free. Renaming does not move a
// value, it abandons it.

test('the shared doc path is untouched', () => {
  assert.ok(html().includes('var DOC_PATH = "checklist/wolf";'),
    'DOC_PATH is the shared-state key on the sync backend. Changing it orphans ' +
    'every user\'s shared checklist state.');
});

test('the local storage key is untouched', () => {
  assert.ok(html().includes('var LOCAL_KEY = "wolf-field-checklist-v1";'),
    'renaming this makes every saved count read as zero');
});

test('the inventory credential keys are untouched', () => {
  const h = html();
  assert.ok(h.includes('wolf-inv-token'), 'the pull feature signs in with this');
  assert.ok(h.includes('wolf-inv-profile'));
});

test('the sync key name is untouched', () => {
  assert.ok(html().includes('wolf-sync-key'),
    'renaming this silently un-shares every phone');
});

test('the bed image cache is untouched', () => {
  assert.ok(sw().includes("const BED_CACHE = 'wolf-beds-v2';"),
    'renaming this re-downloads ~27MB of bed crops over cell data');
});
```

- [ ] **Step 2: Run it against the unchanged app to verify it passes**

Run: `node --test tests/rename-guards.test.js`
Expected: PASS, 5 tests. It must pass **before** anything is renamed — that is what makes it a guard rather than a wish.

- [ ] **Step 3: Prove it can fail**

Temporarily change `var DOC_PATH = "checklist/wolf";` to `var DOC_PATH = "checklist/groundwork";` in `index.html`, run the test again.
Expected: FAIL on "the shared doc path is untouched".
Then **revert that edit** and re-run to confirm PASS again.

- [ ] **Step 4: Commit**

```bash
git add tests/rename-guards.test.js
git commit -m "Guard the names the rename must not touch"
```

---

### Task 2: Rename what people read

**Files:**
- Modify: `index.html` — lines 14, 15, 967, and the `savedFrom` string
- Modify: `manifest.json`
- Create: `tests/name.spec.js`

**Interfaces:**
- Consumes: Task 1's guards stay green.
- Produces: nothing other tasks import.

- [ ] **Step 1: Write the failing test**

Create `tests/name.spec.js`:

```js
// What a person reads must say Groundwork. What the machine reads must not
// change -- see tests/rename-guards.test.js.
const { test, expect } = require('@playwright/test');
const { loadApp } = require('./helpers');

test('the app calls itself Groundwork on screen', async ({ page }) => {
  await loadApp(page);
  const seen = await page.evaluate(() => ({
    title: document.title,
    heading: document.querySelector('h1').textContent.trim(),
    appleTitle: (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content,
  }));

  expect(seen.title).toBe('Groundwork');
  expect(seen.heading).toBe('Groundwork');
  expect(seen.appleTitle).toBe('Groundwork');
});

test('no user-facing text still says Wolf Architect Jobs', async ({ page }) => {
  await loadApp(page);
  const body = await page.evaluate(() => document.body.innerText);
  expect(
    body.includes('Wolf Architect Jobs'),
    'the old name is still on screen somewhere'
  ).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/name.spec.js`
Expected: FAIL — title is `Wolf Architect Jobs`.

- [ ] **Step 3: Make the edits**

In `index.html`, line 14:
```html
<meta name="apple-mobile-web-app-title" content="Groundwork">
```

Line 15:
```html
<title>Groundwork</title>
```

Line 967:
```html
    <h1>Groundwork</h1>
```

The backup label (search for `savedFrom`):
```js
  p.savedFrom = "Groundwork backup";
```

Replace `manifest.json` entirely:
```json
{
  "name": "Groundwork",
  "short_name": "Groundwork",
  "description": "Job checklists for Titan Alaska. Bed-by-bed plant lists, live counts against each species target, what is still owed, and the status report for the office.",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#f6f7f1",
  "theme_color": "#2f5233",
  "icons": [
    { "src": "./icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "./icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "./icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Note the description no longer says "four Wolf Architects jobs" — there are six coming and only one is Wolf's.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx playwright test tests/name.spec.js && node --test tests/rename-guards.test.js`
Expected: both PASS. The guards passing is the point — the rename touched only what people read.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: 14 node + 24 Playwright (22 + the 2 new ones).

- [ ] **Step 6: Commit**

```bash
git add index.html manifest.json tests/name.spec.js
git commit -m "Call it Groundwork"
```

---

### Task 3: Re-prefix the shell cache and narrow the cleanup

The dangerous one. `activate()` currently deletes anything starting with `wolf-` that is not in its keep list, and the Cache API is **origin-scoped** — so a Groundwork worker running that filter deletes `wolf-shell-v34`, the shell of the app people are still using, breaking it offline mid-migration.

**Files:**
- Modify: `sw.js`
- Create: `tests/cache-ownership.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `cachesToDelete(names, keep)` in `sw.js`, between `// ---- PURE` sentinels, extracted by the test.

- [ ] **Step 1: Write the failing test**

Create `tests/cache-ownership.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// sw.js runs in a service worker and has no exports. Pull the one pure
// function out by its sentinels and run it here.
function loadPure() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const start = src.indexOf('// ---- PURE: testable, no SW globals ----');
  const end = src.indexOf('// ---- /PURE ----');
  if (start === -1 || end === -1) throw new Error('PURE sentinels not found in sw.js');
  const exp = {};
  new Function('exports', src.slice(start, end) +
    '\nexports.cachesToDelete = cachesToDelete;')(exp);
  return exp;
}

// Both apps live on titanalaska.github.io and the Cache API is origin-scoped,
// so Groundwork can see -- and delete -- Wolf Checklist's caches. It must not.
const ON_THE_ORIGIN = [
  'groundwork-shell-v1',
  'groundwork-shell-v2',
  'wolf-shell-v34',
  'wolf-beds-v2',
];

test('an old Groundwork shell is cleaned up', () => {
  const { cachesToDelete } = loadPure();
  const out = cachesToDelete(ON_THE_ORIGIN, ['groundwork-shell-v2', 'wolf-beds-v2']);
  assert.ok(out.includes('groundwork-shell-v1'));
});

test('the current shell is never deleted', () => {
  const { cachesToDelete } = loadPure();
  const out = cachesToDelete(ON_THE_ORIGIN, ['groundwork-shell-v2', 'wolf-beds-v2']);
  assert.ok(!out.includes('groundwork-shell-v2'));
});

test('Wolf Checklist\'s shell is NEVER deleted', () => {
  const { cachesToDelete } = loadPure();
  const out = cachesToDelete(ON_THE_ORIGIN, ['groundwork-shell-v2', 'wolf-beds-v2']);
  assert.ok(!out.includes('wolf-shell-v34'),
    'deleting this breaks the old app offline for whoever has not migrated yet');
});

test('the shared bed images are NEVER deleted', () => {
  const { cachesToDelete } = loadPure();
  const out = cachesToDelete(ON_THE_ORIGIN, ['groundwork-shell-v2', 'wolf-beds-v2']);
  assert.ok(!out.includes('wolf-beds-v2'),
    'deleting this re-downloads ~27MB over cell data');
});

test('nothing outside our own prefix is ever returned', () => {
  const { cachesToDelete } = loadPure();
  const out = cachesToDelete(['something-else-v1', 'wolf-shell-v34'], []);
  assert.deepStrictEqual(out, []);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/cache-ownership.test.js`
Expected: FAIL — `PURE sentinels not found in sw.js`.

- [ ] **Step 3: Edit sw.js**

Change the two cache constants (leave `BED_CACHE` alone):

```js
const CACHE_VERSION = 'v1';
const CACHE_PREFIX = 'groundwork-shell-';
const SHELL_CACHE = `${CACHE_PREFIX}${CACHE_VERSION}`;
```

Add the pure function immediately above the `activate` listener:

```js
// ---- PURE: testable, no SW globals ----
// Which caches are OURS to remove.
//
// The Cache API is scoped to the ORIGIN, and titanalaska.github.io carries
// Wolf Checklist and Titan Inventory as well. The old version of this filter
// matched anything starting with "wolf-", which from here would delete the
// shell of an app somebody is still using. Never widen this beyond our own
// prefix, and never add wolf-beds-v2 to a delete path -- both apps read it.
function cachesToDelete(names, keep){
  return (names || []).filter(function(n){
    return n.indexOf(CACHE_PREFIX) === 0 && keep.indexOf(n) === -1;
  });
}
// ---- /PURE ----
```

Replace the filter inside `activate()`:

```js
      const keep = [SHELL_CACHE, BED_CACHE];
      const names = await caches.keys();
      await Promise.all(cachesToDelete(names, keep).map(n => caches.delete(n)));
```

Update the header comment on line ~35, which still describes the old behaviour:

```
 *   - On a miss, every other groundwork-shell-* cache is tried before giving up.
```

And the lookup that implements it (search for `startsWith('wolf-shell-')`):

```js
    const names = (await caches.keys()).filter(n => n.indexOf(CACHE_PREFIX) === 0);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/cache-ownership.test.js && node --test tests/rename-guards.test.js`
Expected: 5 + 5 PASS. `wolf-beds-v2` is still guarded and is now also proven undeletable.

- [ ] **Step 5: Run the whole suite**

Run: `npm test && npm run verify-tests`
Expected: all green, all mutations caught.

- [ ] **Step 6: Commit**

```bash
git add sw.js tests/cache-ownership.test.js
git commit -m "Groundwork only ever deletes its own caches"
```

---

### Task 4: Create the repo and deploy

**Files:**
- No source changes. New remote repository.

**Interfaces:**
- Consumes: Tasks 1-3 committed.
- Produces: `https://titanalaska.github.io/Groundwork/` serving the renamed app.

- [ ] **Step 1: Create the repo**

Do **not** rename `Wolf-Checklist`. From inside `Wolf-Checklist-repo`:

```bash
gh repo create titanalaska/Groundwork --public --description "Job checklists for Titan Alaska"
```

- [ ] **Step 2: Push the current content to it**

```bash
git remote add groundwork https://github.com/titanalaska/Groundwork.git
git push groundwork main
```

- [ ] **Step 3: Enable Pages**

```bash
gh api -X POST repos/titanalaska/Groundwork/pages -f "source[branch]=main" -f "source[path]=/"
```

- [ ] **Step 4: Wait for the build and verify it is actually serving**

```bash
sleep 30
gh api repos/titanalaska/Groundwork/pages/builds/latest --jq '{status:.status,error:.error.message}'
curl -s https://titanalaska.github.io/Groundwork/ | grep -c "<title>Groundwork</title>"
curl -s https://titanalaska.github.io/Groundwork/sw.js | grep "CACHE_PREFIX"
```

Expected: `status: built`, title found once, `CACHE_PREFIX = 'groundwork-shell-'`.

- [ ] **Step 5: Confirm the old app is untouched**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://titanalaska.github.io/Wolf-Checklist/
curl -s https://titanalaska.github.io/Wolf-Checklist/sw.js | grep "CACHE_VERSION = "
```

Expected: `200`, and `v34` — no redirect, old shell intact. **If the old URL returns anything other than 200, stop.** A redirect there is the failure this whole plan exists to avoid.

- [ ] **Step 6: Commit the remote setup note**

```bash
git add -A
git commit --allow-empty -m "Groundwork live at titanalaska.github.io/Groundwork/"
```

---

### Task 5: Tell the old app where it went

The old path keeps working and gains a banner. Because `sw.js` is **not** redirected, installed phones receive this update normally — which is the single difference from the Bootprint migration.

**Files:**
- Modify: `index.html` (on the **Wolf-Checklist** remote only)
- Modify: `sw.js` (cache bump, Wolf-Checklist only)

**Interfaces:**
- Consumes: Task 4's URL is live.
- Produces: nothing.

- [ ] **Step 1: Branch from the pre-rename commit**

The old app must keep saying Wolf, so branch from before Task 2:

```bash
git checkout -b wolf-farewell f3ae67b
```

- [ ] **Step 2: Add the banner**

In `index.html`, immediately after `<header>`'s closing tag, insert:

```html
<div class="moved-note">
  <b>This app has moved.</b>
  It is now called Groundwork, at
  <a href="https://titanalaska.github.io/Groundwork/">titanalaska.github.io/Groundwork/</a>.
  Open that link, add it to your home screen, and check your counts look right
  before you delete this one. Your saved counts are already there.
</div>
```

And in the `<style>` block, beside the other notice styles:

```css
  .moved-note{
    margin:12px 16px;padding:12px 14px;border-radius:10px;
    background:var(--amber-bg);border:2px solid var(--amber);
    font-size:.95rem;line-height:1.5;
  }
  .moved-note b{display:block;color:var(--amber);margin-bottom:3px;}
  .moved-note a{color:var(--amber);font-weight:700;}
```

- [ ] **Step 3: Bump the old app's cache so the banner actually reaches phones**

In `sw.js`:

```js
const CACHE_VERSION = 'v35';
```

- [ ] **Step 4: Verify it still parses and still works**

```bash
node ../.claude/hooks/check-html-js.js index.html
npx playwright test
```

Expected: parses; the suite is the pre-rename one, so **22 Playwright** pass and the name tests do not exist on this branch.

- [ ] **Step 5: Push to the old remote only**

```bash
git push origin wolf-farewell:main
```

- [ ] **Step 6: Verify the banner is live and the app still works**

```bash
sleep 30
curl -s https://titanalaska.github.io/Wolf-Checklist/ | grep -c "moved-note"
curl -s https://titanalaska.github.io/Wolf-Checklist/sw.js | grep "CACHE_VERSION = "
```

Expected: banner found, `v35`.

---

### Task 6: Move people, then retire

Not a code task. It is the part that actually decides whether anyone is stranded, so it is written down rather than assumed.

**Files:** none.

- [ ] ~~**Step 1: List who has it installed**~~ — ANSWERED 2026-09-20: it cannot be.

Matt: *"it could be any crew they send out."* The set of people using this app
is not fixed, so the install list cannot be enumerated, so the migration can
never be confirmed complete.

**This settles Step 5 below: `/Wolf-Checklist/` stays up permanently.** The
banner is not a temporary notice, it is permanent furniture. Do not remove it
and do not retire the old path.

It also creates a standing risk worth stating: **a crew member who has never
seen either app can still install the OLD one** from a stale bookmark or a
forwarded link, and would have no way of knowing. The banner is the only thing
protecting them, which is another reason it never comes down.

- [ ] **Step 2: Answer the spec's open question**

Find every link to `/Wolf-Checklist/` that lives outside the app: BuilderTrend entries, the office TV bookmark, emails to Chris or Corvus, the `status.html` link. Each one outlives the old path unless it is changed.

- [ ] **Step 3: Move each person, one at a time**

For each: open the Groundwork URL, add to home screen, open it, confirm the job tabs and counts look right, **then** delete the old icon. Their data is already there — same origin — so nothing is carried by hand. Tick them off the list.

- [ ] **Step 4: Send the office the new status link**

`https://titanalaska.github.io/Groundwork/status.html` to Chris and Todd. The old one keeps working; it is a plain page with no service worker.

- [x] **Step 5: Do not retire it** — decided 2026-09-20

The old path stays live with its banner, indefinitely. Step 1 established that
the install list cannot be enumerated, so there is no state in which retirement
is safe. This is a decision, not an unfinished task.

If it is ever revisited: **still no redirect**, because a 301 on `sw.js` would
break any install that somehow remains — which is the whole reason this
migration was designed the way it was.

---

## Self-Review

**Spec coverage:** Name and destination → Tasks 2, 4. localStorage keys unchanged → Task 1 guards. Cache names change + narrowed cleanup → Task 3. `wolf-beds-v2` kept → Tasks 1 and 3. No redirect on the old path → Task 4 Step 5 verifies it, Task 5 ships the banner instead, Task 6 Step 5 forbids it at retirement. Move people individually → Task 6. Status link → Task 6 Step 4. Open question about external links → Task 6 Step 2. What changes on screen → Task 2. Testing, including "the SW never deletes a cache it does not own" → Task 3.

**Placeholder scan:** none. Every step carries its literal code, command and expected output.

**Type consistency:** `cachesToDelete(names, keep)` is defined in Task 3 Step 3 and called with that arity in Task 3 Steps 1 and 3. `CACHE_PREFIX` is introduced in Task 3 Step 3 and used in the same task's sentinel block and shell-miss lookup. `SHELL_CACHE` and `BED_CACHE` keep their existing names and arity. Test counts are stated cumulatively: 14 node + 22 Playwright at the start, +2 Playwright after Task 2, +5 node after Task 1, +5 node after Task 3.

**Known gap:** Task 6 Step 1 may not be answerable. If the install list cannot be enumerated, the migration cannot be confirmed complete and `/Wolf-Checklist/` should stay up indefinitely rather than be retired on a guess. That is a deliberate stop, not an oversight.
