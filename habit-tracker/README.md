# Almanac — Habit Tracker & Focus Timer

A private, offline personal productivity dashboard: daily habit tracking with
streaks and history, plus a Pomodoro-style focus timer. No backend, no
accounts, no analytics, no network requests of any kind — everything lives in
your browser's LocalStorage.

## Getting started

There is no build step and nothing to install. Just open the file:

```
habit-tracker/index.html
```

Double-click it, or drag it into a browser tab. That's the whole setup.

If you'd rather serve it locally (optional, e.g. to test on your phone over
your home network), any static server works:

```
cd habit-tracker
python3 -m http.server 8080
# then visit http://localhost:8080 on any device on the same network
```

## What's inside

```
habit-tracker/
├── index.html   — page structure and markup for every view
├── style.css    — the entire visual design (light + dark theme)
├── script.js    — all app logic (habits, streaks, history, Pomodoro)
└── README.md    — this file
```

Everything is vanilla HTML5, CSS3, and JavaScript — no React, no build tools,
no CDN dependencies. It works the same whether you're online or fully
offline.

## Using it day to day

**Today** is the main screen: your progress bar, focus-time summary, and the
list of habits with checkboxes. Tap a checkbox to mark a habit done — tap
again to undo it.

**+ Add habit** opens a small form: name, an icon, and an optional accent
colour. **Edit** and **delete** live on each habit card; deleting asks for
confirmation first and removes that habit's history along with it.

**Daily goal** (top of the progress card) is the completion percentage you're
aiming for each day. When you hit it, a small note appears — no popups, no
fireworks.

**History** shows the last 30 days as a grid. Green means everything was
done, amber means some of it, red means none of it, and grey means there's no
data for that day yet (either it's in the future, or you hadn't added any
habits yet). Click any day to see exactly what was and wasn't done.

**Statistics** is a handful of numbers — today/week/month completion, your
best streak ever, total habits completed all-time — plus the same for the
focus timer.

**Focus timer** is a standard Pomodoro: 25 minutes of focus, 5-minute short
breaks, and a 15-minute long break every 4th session, all editable in
**Settings**. You can optionally link a habit to your session beforehand
("Focus on: 📖 Study"), and completed sessions are tallied against that habit.
When a session ends, it switches to the next one automatically — you don't
need to do anything, though you can always pause, reset, or skip.

The ☀️/🌙 toggle in the bottom-left switches between light and dark. Your
choice is remembered, same as everything else.

## Your data

Everything — habits, completion history, streaks, your daily goal, theme,
timer settings, and session log — is stored only in this browser, under a
handful of `almanac.*` keys in LocalStorage. Nothing is sent anywhere. If you
clear your browser's site data for this page, or open it in a different
browser or a private/incognito window, you'll start fresh.

There's no export/import built in; if you want to move your data to another
browser, you'd need to copy the `almanac.*` LocalStorage keys over manually
via your browser's developer tools.

## Browser support

Works in any current version of Chrome, Firefox, Safari, or Edge. It needs
LocalStorage to be available and not blocked (some private-browsing modes
restrict it) — if storage ever fails to save, the app will tell you rather
than silently losing data.