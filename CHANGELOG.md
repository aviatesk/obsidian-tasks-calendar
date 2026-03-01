# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- links start -->

[Unreleased]:
  https://github.com/aviatesk/obsidian-tasks-calendar/compare/0.1.2...HEAD
[0.1.2]:
  https://github.com/aviatesk/obsidian-tasks-calendar/compare/0.1.1...0.1.2
[0.1.1]:
  https://github.com/aviatesk/obsidian-tasks-calendar/compare/0.1.0...0.1.1

<!-- links end -->

## [Unreleased]

### Added

- Recurring task support: add a `[recurrence:: <pattern>]` inline property or
  `recurrence` frontmatter field to a task, and completing it will automatically
  create the next occurrence with an updated due date. Supported patterns
  include `every day`, `every N days/weeks/months/years`, `every weekday`, and
  `every monday`..`every sunday`.

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
