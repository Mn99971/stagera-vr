# Stagera VR

Virtual Reality rehearsal platform for **presentations, lectures, job interviews, pitches, and panel discussions**—built with **WebXR (React Three Fiber + `@react-three/xr`)**, **TypeScript**, **Supabase**, and **OpenAI Realtime API**.

## Quick Start (Local Repo + Private GitHub Board)

1. Make sure you have [GitHub CLI (`gh`)](https://cli.github.com/) installed and logged in locally:
   ```bash
   gh auth login
   gh auth refresh -s project
   ```
2. Run the setup script from the root of this folder to create your **private** repo (`Mn99971/stagera-vr`), push the initial commit, create your **private** GitHub Project board (**Stagera VR**), and populate all 12 requirements-mapped issues (no collaborators invited):
   ```bash
   chmod +x scripts/setup_stagera_github.sh
   ./scripts/setup_stagera_github.sh
   ```
3. Run the web + WebXR app locally:
   ```bash
   cd apps/web
   npm install
   cp ../../.env.example .env.local
   npm run dev
   ```

## Milestones

* **Friday, Nov 27, 2026** — Pitch Session Demo (Phone setup → 4-digit pairing → VR room → 1 live AI question → Debrief/Report preview)
* **Friday, Dec 4, 2026** — Final Implementation & Submission

## Documentation

* See [`AGENTS.md`](./AGENTS.md) for the full 17 User Needs (`UN-01`–`UN-17`), 32 Functional Requirements (`FR-01`–`FR-32`), 10 Non-Functional Requirements (`NFR-01`–`NFR-10`), and architecture conventions for AI coding assistants.
