# Repository Guidelines

## Project Structure & Module Organization

`Frontend/` contains the Vite + Vue 3 + TypeScript UI, with components in `Frontend/src/components`, Pinia state in `Frontend/src/stores`, API helpers in `Frontend/src/apis`, and assets in `Frontend/src/assets` and `Frontend/public`. `Backend/` contains the Fastify + TypeScript service, with routes under `Backend/src/server/routes`, Circom parsing and analysis code under `Backend/src/core`, utilities under `Backend/src/utils`, and test or dump scripts under `Backend/src/test`. `toy-demos/` holds small Circom examples. `submodules/` is a real-world Circom corpus; avoid changing vendored submodule code unless explicitly required.

## Build, Test, and Development Commands

Use Node `v24.19.0` and pnpm `11.22.0`.

- `cd Frontend && pnpm install`: install UI dependencies.
- `cd Frontend && pnpm run dev`: start the Vite dev server.
- `cd Frontend && pnpm run build`: run `vue-tsc` type checking and build frontend assets.
- `cd Backend && pnpm install`: install backend dependencies.
- `cd Backend && pnpm run build`: compile TypeScript to `Backend/dist`.
- `cd Backend && pnpm run start`: run the Fastify server on port `8080`.

Install `circom` before using backend compile or analysis endpoints.

## Coding Style & Naming Conventions

Write TypeScript using ES modules. Match local formatting: backend files use semicolons and two-space indentation; Vue/frontend files commonly use single quotes and no semicolons. Name Vue components in PascalCase, composables as lower camel case modules, and route handlers as `*Handler`. Keep generated artifacts in existing output folders such as `Backend/dist`, `Backend/compilations`, or `Frontend/dist`; do not commit bulky regenerated outputs unless needed for review.

## Testing Guidelines

There is no package-level `test` script currently. Backend test-like files live in `Backend/src/test` and use `*.test.ts` naming, so add new focused checks there when extending parser, compiler, or analysis behavior. At minimum, run `pnpm run build` in the package you changed; for frontend changes, this includes Vue type checking.

## Commit & Pull Request Guidelines

Recent history uses short conventional prefixes such as `feat:` and `[fix]`. Keep commits focused, for example `feat: add template analysis panel` or `[fix] resolve constraint visualization`. Pull requests should describe the behavior change, list build/test commands run, link related issues when available, and include screenshots or short screen recordings for UI changes.

## Security & Configuration Tips

Do not commit secrets, local `.env` values, or private circuit inputs. Treat files under `submodules/` and generated proof/artifact directories as potentially large or sensitive; verify diffs before committing.
