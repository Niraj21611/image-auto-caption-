## Purpose
Short, concrete instructions to make AI coding agents productive in this repo (Next.js app using App Router, NextAuth, Prisma with MongoDB, TypeScript).

## Quickstart (developer commands)
- Dev server: `npm run dev` (Next on port 3000)
- Build: `npm run build` and run with `npm run start`
- Lint: `npm run lint` (uses ESLint)
- Seed database: `npx prisma db seed` (seed script is `prisma/seed.ts` and is defined in package.json)
- Prisma client: run `npx prisma generate` after changing the schema

## Architecture (big picture)
- App Router based Next.js app under `app/` (server components by default). UI pages and protected areas live in `app/(protected)/...`.
- Authentication: NextAuth is wired as an API route at `app/api/auth/[...nextauth]/route.ts` and configured in `lib/auth.ts`.
- Database: Prisma with a MongoDB datasource. Schema is in `prisma/schema.prisma`. Prisma client singleton is exposed from `lib/prisma.ts`.
- UI: small component library under `components/ui/*` (Radix + Tailwind patterns). Page-level layout components live in `app/layout.tsx` and nested layouts under `app/(protected)/admin/layout.tsx`.

## Key files to reference for most tasks
- `app/api/auth/[...nextauth]/route.ts` — NextAuth HTTP handlers (GET/POST)
- `lib/auth.ts` — NextAuth options, providers, callbacks (jwt/session), adapter (Prisma)
- `lib/prisma.ts` — PrismaClient singleton and logging config
- `prisma/schema.prisma` — data model (User and UserRole enum)
- `prisma/seed.ts` — seed script (creates sample users)
- `provider/authProvider.tsx` — client-side `SessionProvider` wrapper used by app
- `components/ui/*` and `components/Sidebar/*` — common UI patterns and examples to follow

## Project-specific conventions & patterns
- TypeScript + Next App Router (server components by default). Use `use client` only for client components.
- Authentication uses NextAuth with the Prisma adapter. `lib/auth.ts` contains the ground truth for how sessions and roles are attached to tokens/sessions.
- Prisma is configured for MongoDB (see `datasource db` in `prisma/schema.prisma`) and uses `@prisma/client` v6.
- UI uses Tailwind CSS (see `postcss.config.mjs` and `tailwindcss` devDependency) and Radix primitives in `components/ui`.

## Integration points & environment
- Env vars required: `DATABASE_URL` (Mongo connection), `NEXTAUTH_SECRET` (NextAuth secret). Look for other env usage by grepping `process.env`.
- Prisma seed: the package.json `prisma.seed` entry points to `prisma/seed.ts`. Run `npx prisma db seed` to execute it.

## Discovered gotchas (documented so agents don't inadvertently break behavior)
- Password handling inconsistency: `prisma/seed.ts` hashes passwords with bcrypt, but `lib/auth.ts` currently compares credentials with `credentials.password === user.password` (plain equality). This is a real mismatch — avoid changing authentication behavior without fixing both hashing in `authorize` and tests.
- Sign-in page path: `nextauth` `pages.signIn` option is set to `/sigin` (typo). Verify whether this is intentional or should be `/signin`.

## How to make safe changes
- When changing auth or user model: update `prisma/schema.prisma`, run `npx prisma generate`, and ensure `prisma/seed.ts`/`lib/auth.ts` remain consistent.
- For UI changes: follow component patterns in `components/ui/*` and reuse `className`/Tailwind utility usage.
- When adding server-side code, prefer server components in `app/` unless a client hook or state is needed.

## Small examples to copy/paste
- Use the Prisma singleton: `import prisma from "@/lib/prisma";` then `await prisma.user.findUnique(...)` (see `lib/auth.ts`).
- NextAuth route handler: `export { handler as GET, handler as POST };` (see `app/api/auth/[...nextauth]/route.ts`).

## If something is unclear
- Ask for the intended sign-in route and whether password hashing should be enforced in `lib/auth.ts`. Also confirm which package manager to prefer (pnpm/npm) if you change scripts.

## Style + commit notes for agents
- Keep changes minimal and local to feature: update Prisma schema and regenerate client in the same commit when touching models.
- Prefer small, testable PRs: one change for auth, one for UI/layout, etc.

---
If you'd like, I can (A) open a PR that fixes the password hashing mismatch (hash comparison in `lib/auth.ts`) and corrects the sign-in path, or (B) keep the file as-is and only add more examples. Which would you prefer?
