# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- links start -->

[Unreleased]:
  https://github.com/aviatesk/obsidian-tasks-calendar/compare/0.1.10...HEAD
[0.1.10]:
  https://github.com/aviatesk/obsidian-tasks-calendar/compare/0.1.9...0.1.10
[0.1.9]:
  https://github.com/aviatesk/obsidian-tasks-calendar/compare/0.1.8...0.1.9
[0.1.8]:
  https://github.com/aviatesk/obsidian-tasks-calendar/compare/0.1.7...0.1.8
[0.1.7]:
  https://github.com/aviatesk/obsidian-tasks-calendar/compare/0.1.6...0.1.7
[0.1.6]:
  https://github.com/aviatesk/obsidian-tasks-calendar/compare/0.1.5...0.1.6
[0.1.5]:
  https://github.com/aviatesk/obsidian-tasks-calendar/compare/0.1.4...0.1.5
[0.1.4]:
  https://github.com/aviatesk/obsidian-tasks-calendar/compare/0.1.3...0.1.4
[0.1.3]:
  https://github.com/aviatesk/obsidian-tasks-calendar/compare/0.1.2...0.1.3
[0.1.2]:
  https://github.com/aviatesk/obsidian-tasks-calendar/compare/0.1.1...0.1.2
[0.1.1]:
  https://github.com/aviatesk/obsidian-tasks-calendar/compare/0.1.0...0.1.1

<!-- links end -->

## [Unreleased]

### Added

- Task tooltip now shows the body of a task, i.e. the lines indented under the
  task line, rendered as Markdown. Internal links in the body are clickable.
- Events of tasks that have a body are marked with a small icon in front of the
  title.

### Changed

- Events now use only the first line of a task as their title. The body of a
  multi-line task is no longer appended to the title.
- Deleting a task from the calendar now deletes its body as well.
- Deleting a task inside a blockquote or callout now removes its line instead of
  leaving an empty line behind, which used to split the blockquote in two.
- Completing a recurring task now inserts the next occurrence after the body of
  the completed task, and copies the body to the new task.
- The task text field of the task tooltip no longer accepts line breaks, which
  used to split the task line and detach the task from its properties and body.
  Pressing Enter now saves the text, and line breaks in pasted text are replaced
  with spaces.
- The calendar now refreshes as soon as Dataview has indexed a change made from
  the calendar, instead of only three seconds after it.
- Upgraded build and type checking to TypeScript 7.0.2, while retaining
  TypeScript 6.0 for ESLint compatibility.

### Fixed

- Editing the text of a multi-line task from the task tooltip no longer fails
  with a "Cannot safely update" error.
- Tasks inside blockquotes and callouts can now be updated from the calendar.
  Changing their status, dates, text, or recurrence used to fail with an
  "Invalid task format" error.
- Updating or deleting a task no longer risks modifying another line when lines
  were added to or removed from the note just before. The calendar now verifies
  that the line still holds the task, and asks to try again otherwise.
- Updating a task no longer drops the text that follows a tag or a property. For
  example, changing the status of `- [ ] buy milk #errand at the store` used to
  remove "at the store". The rest of the line is now written back as it was,
  which also keeps the order of tags and properties, URLs with a `#fragment`,
  and repeated spaces intact.
- Changing the date of a task whose text contains a wikilink or other square
  brackets, e.g. `- [ ] read [[Note]] [due:: 2027-01-01]`, no longer adds a
  second `due` property instead of updating the existing one.
- After the title of a task written in file properties is edited, which renames
  its file, the task tooltip now shows the new file name and path. Further
  changes made from the same tooltip are applied to the renamed file instead of
  failing with a "File not found" error.

## [0.1.10]

### Fixed

- Calendar rendering misalignment after toggling the sidebar. The calendar now
  listens to the workspace `resize` event (in addition to `layout-change`) so
  that `updateSize()` is called when the sidebar is shown or hidden.

## [0.1.9]

### Fixed

- Task property autocomplete (`[due]`, `[start]`, etc.) now reliably triggers
  when typing `[` on a task line. Obsidian's built-in `[[` wikilink handler was
  intercepting the `[` keystroke and preventing the suggest popup from
  appearing. A CodeMirror input handler now bypasses this for task lines while
  preserving normal `[[` wikilink behavior elsewhere.

## [0.1.8]

### Added

- Task tooltip now shows the `created` date with elapsed days when the task has
  a `[created:: YYYY-MM-DD]` property

### Fixed

- Inline date picker for non-range properties (`created`, `completion`, etc.)
  now correctly edits only the clicked field instead of always modifying
  `start`/`due`

## [0.1.7]

### Fixed

- Today's date badge and selected date badge in the date picker wrapping
  two-digit numbers (10-31) onto two lines

## [0.1.6]

### Added

- External calendar source support: overlay events from local ICS files on the
  calendar. Configure per-calendar in the settings modal with file path, color,
  and opacity. Supports standard ICS `VEVENT` entries (all-day and timed events,
  UTC and timezone-aware datetimes). External events are read-only and visually
  distinguished by configurable color and opacity. The calendar auto-refreshes
  when a configured ICS file changes in the vault.

### Changed

- Migrated all custom-positioned tooltips and modals to native Obsidian `Modal`.
  This eliminates manual positioning logic, mobile overlay hacks, and fragile
  z-index management. Task tooltip, date-time picker, and status picker now use
  Obsidian's built-in modal infrastructure for consistent behavior across
  desktop and mobile.
- Addressed Obsidian plugin guideline compliance issues flagged by
  [`eslint-plugin-obsidian`](https://github.com/obsidianmd/eslint-plugin):
  eliminated `any` types, fixed floating promises, enforced sentence case in UI
  text, and replaced direct style manipulation with CSS classes.

### Fixed

- Removed dead CSS rules left over from the old tooltip/modal positioning
  system.

## [0.1.5]

### Changed

- Replaced native `confirm()` dialogs with Obsidian `Modal` for consistent UI
  and better mobile compatibility.
- Replaced hardcoded CSS colors on the delete button with Obsidian CSS variables
  for proper theme support.
- Restored original Dataview `onChange` handler on plugin unload to prevent
  leaked behavior across reloads.
- Marked `obsidian-dataview` as external in the build configuration to exclude
  unused bundled code, reducing `main.js` size by ~115KB.

## [0.1.4]

### Added

- Log level setting under **Settings → Advanced**. Defaults to Warning so only
  warnings and errors appear in the developer console.

### Changed

- Reserved `error` log level for unexpected logic errors. Race-condition
  scenarios (file not found, validation failures) now use `warn`. Added `warn`
  logs alongside Notice calls in early-return paths.

- Default `excludedStatuses` is now empty. New calendars show all tasks
  including completed and cancelled ones. Existing calendars are unaffected.

## [0.1.3]

### Added

- Recurring task support: add a `[recurrence:: <pattern>]` inline property or
  `recurrence` frontmatter field to a task, and completing it will automatically
  create the next occurrence with an updated due date. Supported patterns
  include `every day`, `every N days/weeks/months/years`, `every weekday`, and
  `every monday`..`every sunday`.

- Editor autocomplete for task properties: typing `[` on a task line suggests
  date property names and `recurrence`, with date properties pre-filled with
  today's date. Recurrence values also offer pattern suggestions.

- Click-to-edit date properties: clicking a date inline field (e.g.,
  `[due:: 2026-03-01]`) opens a date picker to update the value. Works in both
  live preview (via CodeMirror decoration) and reading view (via post
  processor), with or without Dataview decoration enabled.

### Changed

- Redesigned date-time picker modal: replaced the header and "All day" checkbox
  with a segmented control (All day / Time) and an independent Range toggle
  button below the calendar. Cancel and Done buttons are now side-by-side at the
  bottom. Modal width increased to 340px.

## [0.1.2]

### Added

- Built-in default styling for cancelled (`-`) and done (`x`/`X`) task statuses
  with strikethrough and muted colors
- Active view highlighting in the views dropdown
- Minified `main.js` output for smaller plugin size
- Added strikethrough style to cancelled events

### Changed

- Redesigned settings modal list items as compact chips
- Rewrote calendar settings modal with Obsidian native API

### Fixed

- Fixed null/empty `status` in frontmatter not showing the status section in
  task tooltip
- Fixed datetime picker calendar display on mobile
- Fixed initial calendar rendering misalignment
- Fixed popover positioning

## [0.1.1]

### Added

- Supports file property tasks (using frontmatter):
  ```yaml
  ---
  ---
  due: YYYY-MM-DD
  start: YYYY-MM-DD # Optional for multi-day tasks
  status: ' ' # optional, empty string means this task is "Incomplete"
  ---
  ```
  The file name becomes the task title, and the entire note becomes a task.
