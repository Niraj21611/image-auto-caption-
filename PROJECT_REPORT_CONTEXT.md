# CapFlow Auto-Caption — Complete Project Context (for Internship Report / LLM Input)

## 1) Project overview

**Project name:** CapFlow Auto-Caption  
**Type:** Full-stack web application  
**Primary goal:** Automate image caption generation at scale using OpenAI Vision + Batch APIs, then allow human reviewers to validate/edit captions before final approval and export.

In simple terms, this system does:
1. Admin selects image folders from local file system.
2. System uploads images to OpenAI (vision purpose).
3. System creates OpenAI batch jobs to generate captions.
4. Captions are ingested into MongoDB.
5. Human users review/edit captions.
6. Admin approves and exports final images/captions.

---

## 2) What business problem it solves

Manual captioning of thousands of images is slow and expensive. This app provides a **human-in-the-loop pipeline**:
- AI creates first-pass captions quickly.
- Reviewers improve quality.
- Admin controls assignment, approval, and export.

So the app balances **speed (AI)** + **quality control (humans)**.

---

## 3) Tech stack (A to Z)

## Frontend
- **Next.js 16** (App Router)
- **React 19**
- **TypeScript**
- **Tailwind CSS v4**
- **Radix UI + shadcn-style components**
- **Lucide icons**
- **Sonner** for toasts

## Backend
- **Next.js server actions** (major business logic)
- **Next.js route handlers** for API endpoints
- **Node.js fs/path APIs** for local directory scanning and file operations

## Authentication & authorization
- **NextAuth v4** with **Credentials provider**
- **JWT session strategy**
- **Role-based access control (ADMIN / USER)** via middleware

## Database
- **MongoDB**
- **Prisma ORM v6** with MongoDB provider
- Prisma models for users, jobs, captions, activities, export history

## AI / Vision
- **OpenAI Node SDK**
- OpenAI **Files API** (`purpose: "vision"` for image uploads)
- OpenAI **Batch API** (endpoint `/v1/responses`)
- OpenAI **Responses API** payload format in batch JSONL

## Utility libraries
- `p-limit` for concurrency control during uploads/status fetch
- `xlsx` for Excel exports
- `bcryptjs` for password hashing/comparison (used in password change flow)
- `sharp` is present in dependencies (not primary in current flow)

---

## 4) Core architecture

This is a monolithic Next.js app with server-side business logic:
- `app/` → pages/layouts/routes (UI + route handlers)
- `lib/actions/` → server actions (main domain logic)
- `prisma/schema.prisma` → DB schema
- `lib/auth.ts` → auth config and callbacks
- `lib/prisma.ts` → Prisma client singleton

**Pattern used:**
- UI calls server actions for operations (process batches, review, assign, export)
- Server actions update DB + talk to OpenAI + return status
- UI polls status for long-running jobs

---

## 5) Main modules and responsibilities

## Caption processing (`lib/actions/caption.actions.ts`)
Handles full AI pipeline:
- analyze image directory
- create preparation job
- upload images to OpenAI Files API
- create JSONL and OpenAI batch
- poll OpenAI batch
- ingest output file captions to DB
- recreate batch for failed items
- cancel/resume preparation

## Review workflow (`lib/actions/review.actions.ts`)
- fetch assigned jobs for users
- get paginated captions needing review
- submit edited caption (`postCaption`)
- mark skipped items

## Assignment + approval (`lib/actions/assignment.actions.ts`)
- list completed jobs
- assign jobs to users
- admin approval/rejection
- bulk approve / approve all
- export captions to XLSX

## Export workflow (`lib/actions/export.actions.ts`)
- export approved images to destination folder
- track export history
- mark exported records (`isExported`, `exportedAt`)

## User attendance + profile ops (`lib/actions/user.actions.ts`)
- user CRUD
- check-in/check-out sessions
- activity duration summaries
- weekly and daily attendance data

## Dashboard stats (`lib/actions/dashboard.actions.ts`)
- admin and user dashboard metrics

## Folder scan (`lib/actions/scan.actions.ts`)
- recursive discovery of folders named `media`
- image counting before batch creation

---

## 6) End-to-end processing flow (how it works)

## Phase A: Preparation
1. Admin opens process page.
2. Selects root folder or scans for media folders.
3. Creates `ImageJob` with status `PREPARING`.
4. Recursively lists image files (`jpg/jpeg/png/webp`).
5. For each image:
   - create/update `ImageCaption` row
   - upload binary to OpenAI Files API with `purpose: "vision"`
   - store returned `openaiFileId`

Concurrency is controlled with `p-limit(3)`.

## Phase B: Batch creation
1. For uploaded images, create JSONL records:
   - `custom_id` = caption row id
   - endpoint = `/v1/responses`
   - request body includes prompt + image file reference
2. Upload JSONL as batch input file (`purpose: "batch"`).
3. Create OpenAI batch (`completion_window: "24h"`).
4. Save `batchId` to `ImageJob` and set status `BATCH_SUBMITTED`.

## Phase C: Polling and completion
1. System polls batch status from OpenAI.
2. Maps OpenAI statuses to app statuses (`RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`).
3. If failed, marks failed captions.
4. If completed, output file is available for ingestion.

## Phase D: Ingestion
1. Download output JSONL (`openai.files.content(output_file_id)`).
2. Parse each line, map by `custom_id`.
3. Extract model text response and write to `ImageCaption.preCaption`.
4. Mark unsuccessful/unknown lines as `FAILED`.
5. Update job totals (`processed`, `failed`) and final job status (`SUCCESSFUL`).

## Phase E: Human review
1. User sees assigned batches.
2. Reviews AI caption (`preCaption`), edits final text (`postCaption`).
3. Status transitions: `CAPTIONED -> REVIEWED`.
4. User may skip problematic item (`SKIPPED`).

## Phase F: Admin QA and export
1. Admin checks reviewed items.
2. Approves/rejects captions:
   - `REVIEWED -> APPROVED`
   - reject returns to `CAPTIONED`
3. Export approved images to destination path.
4. Store export history and mark images exported.

---

## 7) Database design (MongoDB via Prisma)

## Enums
- `UserRole`: `USER`, `ADMIN`
- `ImageStatus`: `CAPTIONED`, `REVIEWED`, `SKIPPED`, `APPROVED`, `FAILED`

## Models

### `User`
Stores auth + role + presence (`isCheckedIn`).

### `UserActivity`
Attendance sessions with check-in/check-out timestamps and duration.

### `ImageJob`
Represents one processing batch (folder path, counts, status, assigned user, OpenAI batch id).

### `ImageCaption`
One row per image:
- source file path
- OpenAI file reference (`openaiFileId`)
- AI caption (`preCaption`)
- reviewer caption (`postCaption`)
- status + export metadata

### `ExportHistory`
Tracks each export event (who exported, where, how many, which image IDs).

---

## 8) Auth and security model

- Sign-in with credentials (email/password)
- Session strategy: JWT
- Role in token/session used by middleware
- Route guards:
  - `/admin/*` only ADMIN
  - `/user/*` only USER

Middleware redirects unauthorized users.

---

## 9) API routes and server-side endpoints

## Route handlers
- `app/api/auth/[...nextauth]/route.ts` → NextAuth GET/POST
- `app/api/file/route.ts` → serves file bytes by path query (used for image display)

## Server actions
Most operations are server actions in `lib/actions/*`:
- processing
- review
- assignment
- dashboards
- export
- attendance

---

## 10) Environment variables

Required for correct running:
- `DATABASE_URL` (MongoDB connection string)
- `NEXTAUTH_SECRET` (JWT/session signing)
- `OPENAI_API_KEY` (OpenAI integration)
- `OPENAI_MODEL` (optional, defaults to `gpt-4o-mini`)

---

## 11) Build/run commands

- Dev: `npm run dev`
- Build: `npm run build`
- Start: `npm run start`
- Lint: `npm run lint`
- Seed DB: `npx prisma db seed`
- Backfill export fields: `npm run backfill:export`

---

## 12) Important pages and user journeys

## Auth
- `/signin` → login page

## Admin
- `/admin` → admin dashboard stats
- `/admin/process` → create/process AI batches
- `/admin/assign` → assign batches to users
- `/admin/assign/[jobId]` → approve/reject/bulk actions
- `/admin/export` → export approved images
- `/admin/user` → user management
- `/admin/track` → tracking/monitoring

## User
- `/user` → user dashboard (attendance + assignments)
- `/user/review` → review captions
- `/user/setting` → settings/password

---

## 13) OpenAI integration details (very important)

The project uses **OpenAI Vision through Files + Responses + Batch APIs**, not Google Vision API.

### Image upload
- each local image is uploaded as a file with `purpose: "vision"`
- returned `file.id` is stored in DB

### Batch payload
- app creates a JSONL file
- one request line per image
- each line targets `/v1/responses`
- includes prompt text + image file reference

### Processing
- batch runs asynchronously (24-hour window)
- app polls status and updates DB

### Output ingestion
- fetch output file JSONL
- parse response text
- map by `custom_id`
- write captions to DB

### Failure recovery
- failed rows can be retried with `recreateFailedCaptionBatch()`

---

## 14) Current known gaps / technical debt (as observed in code)

1. **Password handling inconsistency**
   - Password change flow hashes with bcrypt.
   - Auth `authorize()` currently compares plain text (`credentials.password === user.password`).
   - This can break login for hashed passwords and is a security concern.

2. **Sign-in page typo in auth config**
   - `lib/auth.ts` has `pages.signIn = "/sigin"` (typo).
   - Middleware expects `/signin`.

3. **File serving route risk**
   - `app/api/file/route.ts` accepts a path parameter and reads directly from filesystem.
   - Should be hardened with stricter path allowlisting.

4. **In-memory preparation state**
   - preparation progress maps are in memory.
   - server restart can lose transient state (DB has partial fallback).

---

## 15) Scalability and performance notes

- Upload/status calls are concurrency-limited (`p-limit(3)`) to avoid overload.
- Batch processing is asynchronous, suitable for large datasets.
- DB queries are mostly selective and paginated for review pages.
- Export copies files sequentially; can be parallelized with controlled limits.

---

## 16) Suggested future improvements

- Fix password auth consistency (bcrypt in sign-in path).
- Add stronger input/path validation and auditing for file route.
- Move long-running workflow orchestration to queue/worker architecture.
- Add retries with exponential backoff for OpenAI and filesystem operations.
- Add unit/integration tests for caption ingestion parser and status transitions.
- Add observability (structured logs + metrics + traces).

---

## 17) One-paragraph summary for report

CapFlow Auto-Caption is a full-stack Next.js + MongoDB application that automates large-scale image caption generation using OpenAI Vision and Batch APIs, then routes AI-generated captions through a human review and admin approval workflow before export. It supports role-based access (admin/user), job assignment, attendance tracking, batch status monitoring, retry handling for failed AI outputs, and export history tracking. The architecture combines server actions for business logic, Prisma for MongoDB modeling, and a modern React/Tailwind UI for operational efficiency.

---

## 18) Ready-to-use prompt to give another LLM

"I am sharing context of my internship project called CapFlow Auto-Caption. Please help me write: (1) abstract, (2) introduction, (3) system architecture, (4) module-wise explanation, (5) database design, (6) API and AI pipeline explanation, (7) results and limitations, (8) future scope, and (9) viva questions with answers. Use the following technical facts exactly:
- Next.js 16 App Router, React 19, TypeScript, Tailwind, Radix UI
- NextAuth credentials auth + role-based middleware
- Prisma ORM with MongoDB
- OpenAI Files API (`purpose: vision`) + Batch API + Responses endpoint
- Image workflow statuses: CAPTIONED, REVIEWED, SKIPPED, APPROVED, FAILED
- Human-in-the-loop review before final approval/export
- Export tracking using isExported/exportedAt and ExportHistory model
- Includes attendance check-in/check-out for users
Also include architecture diagrams in text form and explain data flow step-by-step."