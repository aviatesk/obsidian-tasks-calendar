# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian.md plugin called Tasks Calendar that visualizes tasks on an interactive calendar using FullCalendar. It integrates with the Dataview plugin to automatically gather tasks from notes across the vault.

## Development Commands

```bash
# Install dependencies
npm install

# Development mode with file watching
npm run dev

# Production build with TypeScript type checking
npm run build

# Version bump (updates manifest.json and versions.json)
npm run version
```

## Architecture

The codebase follows a clean separation between backend logic and frontend presentation:

### Directory Structure
- `src/backend/` - Business logic for task operations
  - `query.ts` - Dataview integration for task discovery
  - `parse.ts` - Markdown task parsing logic
  - `create.ts`, `update.ts`, `delete.ts` - Task CRUD operations
  - Date, status, and tag utilities
- `src/frontend/` - React components for the UI
  - `ReactRoot.tsx` - Main calendar component using FullCalendar
  - Various modal and UI components
- `main.ts` - Plugin entry point, handles Obsidian plugin lifecycle
- `TasksCalendarItemView.ts` - Main calendar view that integrates React with Obsidian

### Key Integration Points
1. **Dataview Plugin**: Tasks are discovered via Dataview queries, making the plugin dependent on Dataview being installed
2. **Task Formats**: Supports multiple task formats including inline dates `[due:: YYYY-MM-DD]` and frontmatter properties
3. **React + FullCalendar**: The UI is built with React and uses FullCalendar for the calendar interface

## Build System

- **Bundler**: esbuild (configured in `esbuild.config.mjs`)
- **TypeScript**: Full TypeScript support with strict checking
- **Output**: Generates `main.js` and `styles.css` in the root directory

## Code Style Guidelines

1. TypeScript with strict type checking enabled
2. React functional components with hooks
3. ESLint configuration enforces consistent code style
4. No unused variables allowed (except function arguments)
5. React import not required in JSX files

## Testing

Currently, there is no test framework set up. All changes should be manually tested within Obsidian.

## Plugin Development Notes

1. The plugin automatically opens on startup after a delay
2. Task updates trigger automatic calendar refreshes
3. Multi-day tasks and timed events are supported
4. Drag-and-drop functionality updates task dates in the source files
5. File property tasks treat entire notes as tasks using frontmatter

## Dependencies

Key dependencies to be aware of:
- `obsidian` - Obsidian plugin API
- `obsidian-dataview` - For task discovery across the vault
- `@fullcalendar/*` - Calendar UI components
- `react` & `react-dom` - UI framework
- `lucide-react` - Icon library

## Common Development Tasks

When modifying task parsing logic, the key files are:
- `src/backend/parse.ts` - Core parsing logic
- `src/backend/query.ts` - Dataview query construction

When modifying the calendar UI:
- `src/frontend/ReactRoot.tsx` - Main calendar configuration
- `src/frontend/` - Individual UI components

When adding new settings:
- `TasksCalendarSettings.ts` - Setting data structures
- `TasksCalendarSettingsTab.ts` - Settings UI