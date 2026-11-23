#!/usr/bin/env bash
# Initializes git, creates a PRIVATE GitHub repo (Mn99971/stagera-vr), pushes
# the starter commit, creates a PRIVATE GitHub Project board ("Stagera VR"),
# links the repo, and creates 12 real GitHub Issues on the board.
# No collaborators are invited.
#
# Prerequisites:
#   1. GitHub CLI installed: https://cli.github.com/
#   2. Logged in locally:    gh auth login
#   3. Project scope added:  gh auth refresh -s project
#
# Usage (from the stagera-vr root folder):
#   chmod +x scripts/setup_stagera_github.sh
#   ./scripts/setup_stagera_github.sh

set -euo pipefail

OWNER="${GITHUB_OWNER:-Mn99971}"
REPO_NAME="${GITHUB_REPO:-stagera-vr}"
FULL_REPO="${OWNER}/${REPO_NAME}"
PROJECT_TITLE="Stagera VR"

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: GitHub CLI (gh) is not installed. Install it from https://cli.github.com/"
  exit 1
fi

echo "Checking GitHub CLI authentication..."
gh auth status >/dev/null

# 1. Initialize local git repo if needed
if [ ! -d ".git" ]; then
  echo "Initializing local git repository..."
  git init -b main
fi

if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  git add .
  git commit -m "Initial Stagera VR starter scaffold and requirements blueprint"
fi

# 2. Create private GitHub repository and push (skip if it already exists)
if gh repo view "${FULL_REPO}" >/dev/null 2>&1; then
  echo "Repository ${FULL_REPO} already exists; ensuring origin remote and pushing..."
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/${FULL_REPO}.git"
  git push -u origin main
else
  echo "Creating private repository ${FULL_REPO} and pushing initial commit..."
  gh repo create "${FULL_REPO}" --private --source=. --remote=origin --push
fi

# 3. Create labels cleanly (ignore if they already exist)
create_label() {
  gh label create "$1" --repo "${FULL_REPO}" --color "$2" --description "$3" --force >/dev/null 2>&1 || true
}
create_label "setup"     "0E8A16" "Project setup and infrastructure"
create_label "step-1"    "1D76DB" "Step 1: Phone Setup & Session Preparation"
create_label "step-2"    "5319E7" "Step 2: In-VR Practice Session"
create_label "step-3"    "006B75" "Step 3: Feedback, Replay & Progress"
create_label "milestone" "D93F0B" "Pitch or final submission milestone"

# 4. Create private GitHub Project (v2) and link repository
echo "Creating private GitHub Project '${PROJECT_TITLE}' for ${OWNER}..."
PROJECT_JSON="$(gh project create --owner "${OWNER}" --title "${PROJECT_TITLE}" --format json)"
PROJECT_NUMBER="$(printf '%s' "${PROJECT_JSON}" | python3 -c "import sys, json; print(json.load(sys.stdin)['number'])")"
PROJECT_URL="$(printf '%s' "${PROJECT_JSON}" | python3 -c "import sys, json; print(json.load(sys.stdin)['url'])")"

gh project link "${PROJECT_NUMBER}" --owner "${OWNER}" --repo "${FULL_REPO}" >/dev/null
echo "Linked ${FULL_REPO} to Project #${PROJECT_NUMBER}: ${PROJECT_URL}"

# 5. Create 12 real GitHub Issues and add each one to the Project board
echo "Creating 12 requirements-mapped issues and adding them to the board..."
add_issue() {
  local title="$1"
  local labels="$2"
  local body="$3"
  local issue_url
  issue_url="$(gh issue create --repo "${FULL_REPO}" --title "${title}" --label "${labels}" --body "${body}")"
  gh project item-add "${PROJECT_NUMBER}" --owner "${OWNER}" --url "${issue_url}" >/dev/null
  echo "  + ${title}"
}

add_issue   "[Setup] Init WebXR + Companion App stack (React Three Fiber, Three.js, TypeScript, Supabase)"   "setup"   "Set up unified TypeScript app for phone companion UI (Steps 1 & 3) and Meta Quest 3 WebXR (Step 2).
- Verify Vite + React Three Fiber + @react-three/xr + Supabase client.
- Apply initial Supabase migration with private RLS policies.
- Requirements: FR-01, NFR-06, NFR-10."

add_issue   "[Step 1] Auth, User Profile & EN/FR Localization (S1.1-S1.4)"   "step-1"   "Implement Welcome, Sign Up / Log In (email/password + Google OAuth), Profile Setup (role, practice goals, difficulties, EN/FR toggle), and Home dashboard with saved setups and weekly summary.
- Requirements: FR-01, FR-02, NFR-10."

add_issue   "[Step 1] Practice Types, Material Upload & AI Topic Extraction (S1.5-S1.7, S1.6b)"   "step-1"   "Build New Session flow:
- Practice Type: Presentation/Lecture, Interview (1-on-1 or panel), Pitch, or Panel discussion.
- Upload PPTX/PDF/DOCX/TXT (up to 25 MB / 50 slides) or enter Interview job title, JD, project summary, and optional CV.
- Extract planned topics/themes within 30s; allow reorder, edit, add, delete, or mark as brief.
- Requirements: FR-03, FR-04, FR-05, NFR-09."

add_issue   "[Step 1] Venue, Audience Behaviour, Interruptions, Goals & Saved Setups (S1.8-S1.9, S1.8b)"   "step-1"   "Configure session parameters before launch:
- Venues: Classroom (30), Lecture Hall (60), Auditorium (200), Interview Room (1), Panel Room (3).
- Behaviour: Supportive, Attentive, Distracted, Challenging.
- Interruptions: None (0), Low (1-2), Medium (3-5), High (6-8) per 10 min + toggles for follow-ups, questions at end, unexpected questions.
- Time limit (5/10/15/20 min or up to 90 min), 1-min warning, up to 3 practice goals, coached mode, save setup.
- First-time setup (S1.5-S1.10) target: <3 min.
- Requirements: FR-06, FR-07, FR-08, FR-28, NFR-07."

add_issue   "[Step 1-2] 4-Digit Phone-to-Headset Pairing & Saved Setups in VR (S1.10, S2.0)"   "step-1,step-2"   "Connect phone companion app to headset via Supabase Realtime:
- Generate 4-digit pairing code expiring after 5 min; display connection status and push setup to headset.
- VR Pre-Flight (S2.0): list saved setups inside the headset so users can launch directly with the controller.
- Requirements: FR-09, FR-31."

add_issue   "[Milestone] Pitch Session Demo Readiness — Nov 27, 2026"   "milestone"   "Deliver working end-to-end demo slice for Friday, Nov 27, 2026 pitch:
- Phone setup -> 4-digit pairing -> Lecture Hall / Interview Room WebXR scene -> 1 live AI question -> Quick Debrief + Phone Report preview."

add_issue   "[Step 2] WebXR 3D Venues, Instanced Avatars & Slide Projector (S2.1, S2.2, S2.2b, S2.4)"   "step-2"   "Build optimized Three.js / React Three Fiber scenes for Quest 3:
- Classroom (30), Lecture Hall (60), Auditorium (200 via InstancedMesh), Interview Room (1), Panel Room (3).
- Render uploaded slides on virtual projector + confidence screen.
- Animate audience/interviewer behaviour ratios + discrete interruptions (raised hands, late arrivals, repeat requests).
- Comfort & performance: >=72 FPS on Quest 3, no artificial camera movement, <20ms latency, >=32px readable VR text.
- Requirements: FR-10, FR-13, NFR-01, NFR-05, NFR-10."

add_issue   "[Step 2] In-VR Slide Controls, Private Panel, Pause Menu & Coached Hints (S2.2, S2.5, S2.5b)"   "step-2"   "Implement presenter controls:
- Next/previous slide via controller trigger or voice commands ('next slide', 'previous slide').
- Toggleable private panel (timer, slide/question number, outline ticks) + 1-min warning banner.
- Pause menu (freezes audience & timer): Resume, Restart from current slide/question, Restart from beginning, Hide panel, End session.
- Coached mode: 'Give me a hint' displays structured Problem-Action-Result prompt and marks attempt as hint-assisted.
- Requirements: FR-11, FR-12, FR-17, FR-29."

add_issue   "[Step 2] Live Speech Transcription, AI Q&A (<2s) & Head-Gaze Calibration (S2.1, S2.3, S2.2b)"   "step-2"   "Integrate real-time voice and gaze pipeline:
- Pre-session mic test and 3-point head-direction calibration (left, centre, right) tracking speaking time per zone or at interviewer.
- Capture and transcribe English speech (>=90% word accuracy, >=85% filler precision).
- Trigger audience/interviewer questions from confirmed topics or JD/project summary; start spoken AI replies within 2s (95% of replies) with default-on captions.
- Requirements: FR-14, FR-15, FR-16, NFR-02, NFR-04, NFR-10."

add_issue   "[Step 2] Session Recording, 30s Auto-Save, Auto-Flagging & VR Quick Debrief (S2.6, S2.7)"   "step-2"   "Persist session telemetry and show immediate post-session feedback:
- Record audio, transcript, gaze distribution, and slide timings; support up to 90-min sessions with auto-save every 30s.
- Auto-flag questions, skipped slides, pauses >5s, pace >160 wpm, and hints used.
- In-VR Quick Debrief (S2.7): WPM, filler words, points covered, time vs limit, 1 recommendation, 1 flagged moment, goal-first feedback, plus Retry / Repeat moment / Raise difficulty / Open full report on phone.
- Requirements: FR-18, FR-32, NFR-08."

add_issue   "[Step 3] Session Report, Goal-First Feedback, Timeline & Moment Replay/Retry (S3.1-S3.4, S3.1b, S3.4b)"   "step-3"   "Build post-session analysis and targeted retry loop on phone app:
- Generate full report within 30s (<=20 min) or 90s (<=90 min): WPM, filler count by word, eye-contact zones, time vs limit, topics covered, and >=3 specific linked recommendations.
- Goal-first interview feedback: 'I' vs 'we' ownership and Problem-Action-Result check.
- Flagged moments timeline + Moment Replay (Presenter POV, Audience POV, Phone 2D) with highlighted transcript.
- 'Repeat this moment' / 'Retry this question' with recovery tracking + Coached vs Independent comparison.
- Requirements: FR-19, FR-20, FR-21, FR-22, FR-23, FR-24, FR-30, NFR-03."

add_issue   "[Step 3 & Milestone] Progress Dashboard, History, Privacy Controls & Final Submission — Dec 4, 2026 (S3.5-S3.7)"   "step-3,milestone"   "Complete retention, privacy, and final delivery features:
- Progress dashboard with metric trends (filterable by practice type & date range), custom targets, and auto-suggested difficulty increase after 2 consecutive target-hitting sessions.
- Session history (open, rename, delete) + Privacy & Data settings (private by default, 30-day auto-delete toggle, export data, permanent deletion within 24h).
- Final testing, polish, and submission by Friday, Dec 4, 2026.
- Requirements: FR-25, FR-26, FR-27, NFR-06."

echo ""
echo "All done!"
echo "  Private Repo:  https://github.com/${FULL_REPO}"
echo "  Project Board: ${PROJECT_URL}"
echo ""
echo "Last 2 clicks in GitHub UI:"
echo "  1. Open the Project Board link -> click the view dropdown -> Layout -> Board."
echo "  2. Add 'Backlog' and 'In Review' to the Status columns and drag issues 1-6 to 'To Do' and 7-12 to 'Backlog'."
