# Agent Development Guidelines for circomViz

## Build and Test Commands

### Frontend (Vue 3 + TypeScript + Vite)
- **Development**: `cd Frontend && pnpm run dev`
- **Build**: `cd Frontend && pnpm run build` (runs `vue-tsc -b && vite build`)
- **Type check only**: `cd Frontend && vue-tsc -b`
- **Preview**: `cd Frontend && pnpm run preview`

### Backend (TypeScript + Fastify)
- **Development**: `cd Backend && pnpm install && pnpm run build && pnpm run start`
- **Build**: `cd Backend && pnpm run build` (runs `tsc -p tsconfig.json`)
- **Start**: `cd Backend && pnpm run start` (runs `node ./dist/index.js`)
- **Clean compilations**: `cd Backend && pnpm run remove`

### CircomCode Tests (Jest)
- **All tests**: `cd CircomCode/zk-email-verify-circuit && pnpm run test` (NODE_OPTIONS=--max_old_space_size=8192 jest --runInBand --detectOpenHandles --forceExit --verbose tests)
- **Single test file**: `cd CircomCode/zk-email-verify-circuit && npx jest tests/email-verifier.test.ts`
- **Single test case**: `cd CircomCode/zk-email-verify-circuit && npx jest -t "should verify email without any SHA precompute selector"`

## Code Style Guidelines

### TypeScript Configuration
- **Strict mode**: Enabled in both Frontend and Backend
- **Target**: ES2022 (Frontend), ESNext (Backend)
- **Module**: ES modules with `.js` extensions in Backend imports
- **Type checking**: All files should type-check with `vue-tsc -b` or `tsc -p tsconfig.json`

### Imports
- Use ES modules throughout
- Use `@/` alias for src directory in Frontend (configured in vite.config.ts)
- Import order: external libraries → internal modules → type imports (no strict order enforced)
- Prefer named exports for utilities, default exports for components

### Vue Components
- Use Composition API with `<script setup lang="ts">`
- Components should be in `Frontend/src/components/` with PascalCase filenames
- Use `<script setup>` syntax with `ref`, `computed`, `watch`, `onMounted` from 'vue'
- Props and emits should be explicitly typed
- Use Element Plus components from `element-plus` and icons from `@element-plus/icons-vue`

### Pinia Stores
- Use `defineStore` from 'pinia' with store ID
- Store files in `Frontend/src/stores/`
- Structure: `state`, `getters`, `actions`
- Actions should be methods that mutate state, getters should be computed values
- Example: `export const useCircuitStore = defineStore('circuit', { state: () => ({...}), getters: {...}, actions: {...} })`

### Type Definitions
- Store types in `Frontend/src/types/` or `Backend/src/types/`
- Use `interface` for objects with properties, `type` for unions, tuples, primitives
- Type names: PascalCase for interfaces/types (e.g., `SymbolObject`, `ConstraintComponent`)
- Export types for reuse across files

### API Layer
- Store API functions in `Frontend/src/apis/`
- Use axios instance with interceptors (defined in `request.ts`)
- Define request/response interfaces alongside API functions
- Pattern: `export interface api_name_request {...}`, `export interface api_name_response {...}`, `export const api_name = (data: request) => request.post<response>(endpoint, data)`

### Error Handling
- Use try-catch for async operations that may fail
- Type errors as `error: any` or `error: Error` depending on context
- Log errors with `console.error` or `console.log`
- For API errors, check `err.response?.status` and handle appropriately
- Backend: return HTTP errors with `reply.status(400).send({ error: 'message', details: ... })`

### Naming Conventions
- **Components**: PascalCase (e.g., `CircuitView`, `MonacoEditor`)
- **Functions**: camelCase (e.g., `generateCircuit`, `hexToRgba`, `readableCoefficient`)
- **Variables/Constants**: camelCase (e.g., `circuitStore`, `prime_bigint`)
- **Constants**: UPPER_SNAKE_CASE for truly immutable values (e.g., `GROTH16_PRIME`)
- **Interfaces/Types**: PascalCase (e.g., `SymbolObject`, `ConstraintObject`)
- **Files**: 
  - Components: PascalCase.vue (e.g., `CircuitView.vue`)
  - Utilities: camelCase.ts (e.g., `colors.ts`, `coefficient.ts`)
  - Types: camelCase.ts (e.g., `circuitTypes.ts`)
  - API: index.ts, request.ts

### Testing (Jest)
- Test files use `.test.ts` extension in `tests/` or `test/` directories
- Use `describe()` to group tests, `it()` or `test()` for individual tests
- Set timeouts with `jest.setTimeout()` for long-running tests
- Use `beforeAll()`, `beforeEach()` for setup
- Use `expect().assertions()` when expecting errors
- Test pattern: success cases + failure cases + edge cases

### Styling (Tailwind CSS)
- Use Tailwind utility classes in templates
- Custom styles in `<style scoped>` blocks when needed
- Deep selectors use `:deep()` (e.g., `:deep(textarea) { height: 100%; }`)
- Element Plus styles override with scoped CSS when necessary

### Backend Specifics
- Use Fastify for the server
- Enable CORS with `@fastify/cors`
- Define routes as `server.METHOD(path, handler)`
- Use async/await for async handlers
- Use TypeScript types for request/response: `request.body as { code: string }`
- Use ES modules with `.js` extensions in imports (e.g., `import { saveCode } from './scripts/compilation.js'`)

### File Structure
```
Frontend/src/
  apis/         # API layer
  components/   # Vue components
  composables/  # Reusable composition functions
  examples/     # Example circom code
  stores/       # Pinia stores
  types/        # TypeScript type definitions
  main.ts       # App entry point
  App.vue       # Root component

Backend/src/
  scripts/      # Backend logic (compilation, QAP building)
  types/        # TypeScript type definitions
  index.ts      # Server entry point

CircomCode/
  */tests/      # Jest test files for circom circuits
```

### Environment Configuration
- Frontend uses Vite env variables: `import.meta.env.VITE_BASE_URL`
- Backend uses dotenv for environment variables
- Prime field constant `P` loaded from `.env` in Backend

### Node/Package Manager
- **Node version**: v18.20.4
- **Package manager**: pnpm 9.5.0
- Use `pnpm install` to install dependencies
- All projects use ES modules (`"type": "module"`)

### Code Quality
- Type errors must be resolved before committing
- No explicit linting/formatting configuration (no ESLint/Prettier at project root)
- Follow existing code patterns in the codebase
- Keep functions focused and single-responsibility
- Add comments for complex logic, mathematical operations, or non-obvious implementations
