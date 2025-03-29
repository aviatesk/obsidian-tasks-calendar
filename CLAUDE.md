# Tasks Calendar Developer Guidelines

## Build Commands
- `npm run dev` - Start development server with hot reloading
- `npm run build` - Build production version (runs TypeScript check)
- `npm run version` - Bump version numbers in manifest.json and versions.json

## Code Style
- **TypeScript**: Strict null checks, no unused vars/parameters
- **React**: Follow React best practices, optimize for render performance
- **Architecture**: Backend (src/backend/) and frontend (src/frontend/) separation
- **File Format**: Write all code in English (including comments)
- **Imports**: Group by external, internal modules; use relative imports within modules
- **Naming**: PascalCase for components, camelCase for functions/variables
- **Error Handling**: Use backend/error-handling.ts for consistent error management
- **Comments**: Only add meaningful comments for complex logic
- **Component Design**: Follow React principles, prefer controlled components
- **State Management**: Minimize re-renders, use React hooks appropriately
- **CSS**: Write consistent styling in styles.css, reference existing patterns

## Project Structure
- React components in src/frontend/
- Backend utilities in src/backend/
- Keep business logic separate from UI components

## Current Branch (avi/recur)
- Implements recurrence functionality for repeating tasks
- Uses custom format for recurrence rules
- New backend/recurrence.ts module for handling recurring task generation