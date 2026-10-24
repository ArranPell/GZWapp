# GZW Field Guide

An unofficial, installable companion site for **Gray Zone Warfare**: a task tracker, a key finder, a loot finder and a searchable item database. It works on your phone (install it to the home screen like an app) and on your PC as a second screen.

Data comes from the community [GZW Data API](https://gzw-data.dev/docs/), which sources it from the [Gray Zone Warfare Wiki](https://gray-zone-warfare.fandom.com/). Not affiliated with MADFINGER Games.

## What's in it

- **Tasks**: all 250 tasks, filterable by vendor, area, type (main, side, contract, hidden) and status. Each one shows its briefing and its objectives split into steps. Tick tasks off as you finish them.
- **Characters**: up to 4, like the game. Each keeps its own name, faction, tasks, keys and vendor rep. Switch with the pill in the top bar.
- **Vendors**: what each vendor sells, grouped by the rep level it needs, with a "What I can buy now" filter for the active character's rep. Items locked behind a task (e.g. Turncoat's *Like a Boss* unlocks) are listed separately.
- **Faction** (per character: LRI, CSI or MSS): each faction runs the same starter tasks in its own town, and the API stores those once with all three towns. Pick your faction and they show in your starting town, and other factions' exclusive tasks are hidden. "All factions" shows everything.
- **Keys**: every key and keycard, grouped by area, with what it opens. Tick the ones you have.
- **Loot**: every lootable item in one list, flagged with the tasks that name it. By default it shows only items needed for tasks you haven't done.
- **Database**: about 80 categories (weapons, ammo, armour, attachments, meds, clothing, regions, vendors and more), with search, filters, sorting and a **Compare** table view.
- **Search**: the box at the top searches everything.
- **Offline**: pages and data you've opened are cached, so it keeps working with no signal.
- **Progress & data** (the gear icon): copy the active character's progress code to move it between phone and PC, refresh the data, or reset.

Progress is saved in the browser on each device. Nothing is sent anywhere.

## Limits of the data

The API is good but not complete, so some things a Tarkov-style app has aren't possible yet:

- **No ammo damage or penetration.** Ammo has velocity, accuracy and which armour class stops it.
- **No task rewards, prerequisites or level requirements**, so there's no task tree. Some tasks list an *alternate*, a branching choice where doing one usually rules out the other, and the app shows it.
- **No list of required hand-in items.** The loot finder flags items a task *mentions by name*, so it can miss an item a task calls something else.
- **No maps.**
- **No gun builder.** The API has no attachment compatibility (which parts fit which gun or slot), only about a third of attachments have recoil numbers, and how the game combines modifiers isn't documented. The Database's **Compare** view, sorted by recoil or handling, ranks parts within a slot instead.
- **Vendor stock is partial.** 536 items list a vendor and rep level; about 330 are loot-only or rewards, a few dozen name a vendor but no rep, and only about 230 have a price.
- **Some data is messy at the source**, for example "Artisan R3" next to "Artisan R.1", or a few weights shown as `?kg`. The app cleans up what it can: it splits run-together objectives, removes doubled briefings and merges duplicate loot entries.

## Running it locally

Needs Node 20 or newer. There's nothing to install.

```sh
npm start   # serves site/ at http://localhost:8080
npm test    # unit tests for the data clean-up, plus site checks
```

## Deploying (GitHub Pages)

`.github/workflows/pages.yml` runs the tests on every pull request. On every push to `main` it also deploys `site/` to GitHub Pages. One-time setup:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. GitHub Pages needs the repository to be **public** on a free plan (private repos need GitHub Pro or higher). Nothing in this repo is secret.

The site will be at `https://<your-username>.github.io/GZWapp/`. Open it in Chrome on Android, then use **Install** on the home page (or the ⋮ menu → *Add to Home screen*).

## How it's built

Plain HTML, CSS and JavaScript modules, with no framework and no build step.

```
site/
  index.html, manifest.webmanifest, sw.js   app shell, install metadata, offline cache
  css/app.css
  js/main.js        router (hash-based, so it works on GitHub Pages)
  js/api.js         API client; each dataset comes from /export in one request
  js/lib.js         pure data clean-up (objective splitting, area matching, …), unit tested
  js/data.js        tasks, keys and loot joined up for the pages
  js/store.js       characters and their progress, in localStorage
  js/catalog.js     how datasets are grouped and labelled
  js/views/*.js     one file per page
test/               node:test suites
scripts/            local server and icon renderer
```

Notes for future changes:

- **New JS or CSS file?** Add it to `SHELL_FILES` in `site/sw.js`. A test fails if you forget.
- **API rate limit** is 100 requests a minute; `api.js` keeps at most 6 in flight. The Vendors page pulls ~45 datasets (cached after the first visit), listed in `VENDOR_DATASETS` in `catalog.js`.
- **Wiki images** only load without a referrer (Fandom blocks hotlinking otherwise), so `index.html` sets `<meta name="referrer" content="no-referrer">`.
- **Releases:** the deploy job stamps the commit SHA into `sw.js`, so each release replaces the cached app in one go. Installed copies reload once when an update arrives.
- **Icons** are rendered from `site/icons/icon.svg` with `node scripts/make-icons.js` (needs Playwright).
