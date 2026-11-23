# AGENTS.md — Stagera VR Engineering & Requirements Spec

Use this file as the primary context for AI coding tools (Codex, Cursor, Claude, Gemini) working on **Stagera VR**.

## 1. Product Summary

Stagera is a 3-step VR rehearsal app targeting **Meta Quest 3** (WebXR / installable Quest PWA) paired with a **phone companion web app**:

1. **Step 1 — Setup & Session Preparation (Phone):** Auth/Profile (EN/FR), Practice Type (Presentation/Lecture, Interview, Pitch, Panel), Slide/Outline upload (`PPTX`, `PDF`, `DOCX`, `TXT` up to 25 MB / 50 slides) or Interview JD/CV/project summary, AI topic extraction & editing, Venue/Behaviour/Interruption config, Time limit & saved setups, Practice goals & coached mode, and 4-digit headset pairing (5-min expiry).
2. **Step 2 — In-VR Practice Session (Headset):** 3D venue (Classroom 30, Lecture Hall 60, Auditorium 200, Interview Room 1, Panel Room 3), projector + confidence screen, trigger & voice slide controls (`next slide` / `previous slide`), toggleable private panel, behaviour-driven audience/interviewer animations, AI Q&A (<2s spoken reply) + follow-ups, mic test + 3-point head-gaze calibration, pause menu + coached PAR hints, 30s auto-save recording + auto-flagging, in-headset saved setups (`S2.0`), and in-headset Quick Debrief (`S2.7`).
3. **Step 3 — Feedback, Replay & Progress (Phone):** Full session report (WPM, filler count by word, eye-contact zones, time vs limit, topics covered, >=3 linked recommendations), goal-first interview feedback (`I` vs `we` + PAR check), flagged moments timeline, Presenter/Audience/2D moment replay, Repeat moment / Retry question with recovery check, Coached vs Independent attempt comparison, progress dashboard with targets, session history (rename/delete), auto-suggested harder level after 2 consecutive target-hitting sessions, and privacy controls (24h hard delete).

## 2. Tech Stack & Conventions

* **Frontend & VR (`apps/web`):** Vite + React + TypeScript + `@react-three/fiber` + `@react-three/xr` + `three`.
* **Performance (`NFR-01`, `NFR-05`):** Target >=72 FPS on Meta Quest 3 with up to 200 avatars using `THREE.InstancedMesh` and low-poly `.glb` assets. Never apply artificial camera movement (<20ms motion-to-photon latency). VR body text must be >=32px equivalent at 2 m (`NFR-10`).
* **Backend (`supabase/`):** Supabase Auth (email + Google OAuth), Postgres with strict RLS (private by default, `NFR-06`), Supabase Realtime Broadcast for 4-digit pairing (`FR-09`), and private Storage buckets for slides/recordings.
* **AI Voice & Analysis:** OpenAI Realtime API over WebRTC for <2s spoken audience/interviewer replies (`NFR-02`) and live English transcription (>=90% accuracy, >=85% filler precision, `NFR-04`).
* **Localization & Accessibility (`NFR-10`):** English (`en`) and French (`fr`) UI strings, captions ON by default for all audience/interviewer speech, WCAG 2.1 AA contrast in phone views.

## 3. Traceability Reference

* **Step 1 FRs:** `FR-01`–`FR-09`, `FR-28`
* **Step 2 FRs:** `FR-10`–`FR-18`, `FR-29`, `FR-31`, `FR-32`
* **Step 3 FRs:** `FR-19`–`FR-27`, `FR-30`
* **NFRs:** `NFR-01` (72 FPS / 200 avatars), `NFR-02` (<2s reply), `NFR-03` (<30s / <90s report), `NFR-04` (ASR/filler accuracy), `NFR-05` (VR comfort), `NFR-06` (TLS 1.2+, AES-256, 24h delete), `NFR-07` (<3 min setup), `NFR-08` (90 min + 30s auto-save), `NFR-09` (<30s 25MB/50-slide parse), `NFR-10` (EN/FR, VR text, captions, WCAG AA).

## 4. Folder Structure

* `apps/web/src/companion/` — Step 1 setup & Step 3 feedback/progress screens
* `apps/web/src/vr/` — Step 2 WebXR scenes, instanced avatars, slide projector, private HUD
* `apps/web/src/ai/` — Realtime WebRTC voice session, topic extractor, WPM/filler analyzer
* `apps/web/src/lib/` — Supabase client, Realtime pairing channel, i18n
* `apps/web/src/types/` — Shared domain types (`stagera.ts`)
* `supabase/migrations/` — SQL schema and RLS policies
