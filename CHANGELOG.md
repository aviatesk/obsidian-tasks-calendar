# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- links start -->

[0.1.1]:
  https://github.com/aviatesk/obsidian-tasks-calendar/compare/0.1.0...0.1.1

<!-- links end -->

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
