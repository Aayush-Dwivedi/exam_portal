# Exam Portal — AI-Proctored Examination & Assessment Platform

[![Python](https://img.shields.io/badge/Python-3.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.0-61DAFB.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6.svg)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38B2AC.svg)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

An enterprise-grade, full-stack online examination management and assessment platform featuring dedicated role-based workflows for **Admin**, **Paper Setter**, and **Candidate**, powered by an **AI-Assisted Computer Vision Proctoring Subsystem**, server-authoritative timer, real-time WebSocket monitoring, automated grading, and comprehensive analytics.

---

## 🌟 Key Highlights

* **3 Strict RBAC Roles**:
  * **Admin**: Complete system control, user management, paper approval/rejection workflows, real-time live candidate monitoring via WebSockets, forensic proctoring event review, platform analytics, and audit trails.
  * **Paper Setter**: Question bank repository authoring (MCQ, Multi-Select, True/False, Numerical), 7-step examination blueprint wizard, section management, negative marks configuration, and submission for admin review.
  * **Candidate**: Pre-exam 5-step hardware diagnostics (Browser, Camera, Mic, Network Latency, Face Verification), distraction-free exam room with dynamic question palette, autosave, offline resilience, and immediate evaluation reports.
* **AI-Assisted Computer Vision Proctoring**:
  * Modular CV engine detecting **Face Absence**, **Multiple Faces**, **Looking Away (Head Pose Estimation)**, **Phone / Device Detection**, and **Camera Occlusion / Dark Feed**.
  * Temporal event debouncing (prevents frame-by-frame spam and filters brief benign glances).
  * **AI-Assisted Risk Signal Scoring** (0–100, Low / Medium / High) to prioritize administrative review without automatic disqualifications.
* **Server-Authoritative Synchronization**:
  * Timing, answer immutability, and scoring computed strictly on the backend.
  * Automatic submission upon expiration with objective evaluation (correct, incorrect penalties, section breakdowns).

---

## 🏛️ System Architecture

```text
exam-portal/
├── backend/
│   ├── app/
│   │   ├── api/             # REST endpoints (auth, users, questions, exams, sessions, results, proctoring, analytics, audit)
│   │   ├── auth/            # JWT authentication, Argon2/Bcrypt password hashing, RBAC guards
│   │   ├── core/            # App settings (Pydantic v2), structured logging
│   │   ├── database/        # Async SQLAlchemy engine, session maker, base models
│   │   ├── models/          # SQLAlchemy ORM models (User, Exam, Section, Question, Option, Session, Answer, Result, ProctoringEvent, AuditLog)
│   │   ├── schemas/         # Pydantic validation & response schemas
│   │   ├── services/        # Business logic: evaluation engine, exam state machine, risk calculator, audit logger
│   │   ├── websocket/       # WebSocket connection manager & real-time broadcasting
│   │   └── main.py          # FastAPI application entrypoint & WebSockets
│   ├── requirements.txt     # Python backend dependencies
│   └── seed.py              # Realistic seed data loader
├── proctoring/
│   ├── config/              # CV thresholds, angle limits, darkness sensitivity
│   ├── face_detection/      # Face detection & count monitoring
│   ├── head_pose/           # Yaw/pitch estimation for looking away
│   ├── object_detection/    # Phone and handheld device detector
│   ├── camera_blocked/      # Lens obstruction / dark frame detector
│   └── event_engine/        # Temporal smoothing & debouncing state machine
├── frontend/
│   ├── src/
│   │   ├── api/             # Axios client with JWT interceptor
│   │   ├── components/      # UI components (Badges, Modals, StatsCards, Palettes)
│   │   ├── contexts/        # AuthContext, ProtectedRoute
│   │   ├── layouts/         # AdminLayout, SetterLayout, CandidateLayout
│   │   ├── pages/           # Admin, Paper Setter, Candidate & Exam Room pages
│   │   ├── types/           # TypeScript definitions
│   │   └── App.tsx          # React Router v6 routing tree
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── tests/
│   ├── conftest.py          # Async test fixtures
│   ├── test_auth.py         # Login, registration, token verification
│   ├── test_exams.py        # Question CRUD & approval lifecycle
│   ├── test_evaluation.py   # Grading engine with positive & negative marking
│   ├── test_proctoring_engine.py # CV event debouncing & risk scoring
│   └── test_rbac.py         # Strict role access boundary tests
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── nginx.conf
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## ⚡ Quick Start (Local Development)

### 1. Prerequisites
* **Python 3.10+** (Tested on Python 3.12)
* **Node.js 18+** & **npm**

### 2. Backend Setup
```bash
# Clone and navigate into workspace
cd "Exam Portal"

# Install Python requirements
pip install -r backend/requirements.txt

# Run the database seeder (populates users, 30+ questions, exams, sample history)
python backend/seed.py

# Start FastAPI backend server
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```
* Backend API Documentation: `http://localhost:8000/docs`
* OpenAPI JSON Schema: `http://localhost:8000/api/openapi.json`
* Health Check: `http://localhost:8000/api/health`

### 3. Frontend Setup
```bash
# In a new terminal, navigate to frontend
cd frontend

# Install frontend dependencies
npm install

# Start Vite React development server
npm run dev
```
* Access Web Application: `http://localhost:5173`

---

## 🔐 Default Development Credentials

| Role | Name | Email | Password |
| :--- | :--- | :--- | :--- |
| **Admin** | Platform Administrator | `admin@examportal.com` | `admin123` |
| **Paper Setter** | Alex Turner (CS Lead) | `setter.alex@examportal.com` | `setter123` |
| **Paper Setter** | Dr. Sarah Jenkins | `setter.sarah@examportal.com` | `setter123` |
| **Candidate** | Rahul Sharma | `rahul.sharma@example.com` | `candidate123` |
| **Candidate** | Priya Patel | `priya.patel@example.com` | `candidate123` |
| **Candidate** | Amit Kumar | `amit.kumar@example.com` | `candidate123` |

> *Tip: The Login page features 1-click **Quick Demo Login** buttons to instantly test all 3 role workflows!*

---

## 🧪 Automated Testing

Run the full pytest automated test suite covering authentication, RBAC boundaries, exam lifecycle, evaluation scoring, and computer vision event debouncing:

```bash
python -m pytest tests/ -v
```

---

## 🐳 Docker Deployment

To launch the complete multi-container production stack (PostgreSQL + FastAPI Backend + Nginx Frontend):

```bash
docker-compose up --build -d
```
* Web Portal: `http://localhost:3000`
* Backend API: `http://localhost:8000/docs`

---

## 🛡️ Privacy & Fairness Policy

1. **AI as Decision Support**: The Computer Vision proctoring engine generates *observable environmental signals* to guide human administrator review. It does not output definitive accusations of cheating.
2. **No Demographic or Sensitive Inferences**: No emotion recognition, sentiment analysis, or demographic classification is used in scoring or risk estimation.
3. **Immutability**: Once an exam session is finalized, all candidate answers and audit trails are cryptographically persisted.

---

## 📄 License
This project is licensed under the MIT License.
