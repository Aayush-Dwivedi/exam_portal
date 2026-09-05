# 🚀 Production Deployment Guide: Split Cloud Architecture

This guide covers deploying the **AI-Proctored Exam Portal** using the modern split architecture:
- **Frontend**: [Vercel](https://vercel.com) (or Netlify) for ultra-fast CDN edge delivery, automatic HTTPS, and global caching.
- **Backend**: [Render](https://render.com) (or AWS / Railway) running the FastAPI AI proctoring backend via Docker.
- **Database**: Managed Cloud PostgreSQL ([Neon](https://neon.tech), [Supabase](https://supabase.com), or [Render Postgres](https://render.com)).

---

## Architecture Overview

```
[ Candidate & Admin Browsers ]
       │                │
       │ (HTTPS)        │ (HTTPS & WSS)
       ▼                ▼
┌──────────────┐  ┌───────────────────────────────────────┐
│    Vercel    │  │                 Render                │
│ React (Vite) │  │ FastAPI Backend + YOLOv8 + OpenCV     │
└──────────────┘  └───────────────────┬───────────────────┘
                                      │ (SSL)
                                      ▼
                         ┌──────────────────────────┐
                         │ Cloud Managed PostgreSQL │
                         │ (Supabase / Neon / Render│
                         └──────────────────────────┘
```

---

## Step 1: Provision Cloud PostgreSQL (Choose One)

### Option A: Render Managed PostgreSQL (Easiest — 1-Click with `render.yaml`)
If you use Render for the backend, you can automatically provision PostgreSQL using the included [`render.yaml`](file:///c:/Users/aayus/Downloads/Exam%20Portal/render.yaml) blueprint without any manual database setup.

### Option B: Neon Serverless Postgres (Free Tier)
1. Go to [neon.tech](https://neon.tech) and create a free project.
2. Under **Dashboard**, copy your connection string:
   ```
   postgresql://user:password@ep-cool-sample.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
3. *Note: The Exam Portal backend automatically detects and converts `postgres://` or `postgresql://` to asyncpg format (`postgresql+asyncpg://`) automatically!*

### Option C: Supabase PostgreSQL (Free Tier)
1. Go to [supabase.com](https://supabase.com) and create a free project.
2. In **Project Settings** -> **Database** -> **Connection String** -> Select **URI**.
3. Copy your URI (e.g. `postgresql://postgres:[YOUR-PASSWORD]@db.xxxx.supabase.co:5432/postgres`).

---

## Step 2: Deploy the FastAPI Backend to Render

### Method 1: 1-Click Render Blueprint (Recommended)
1. Push this repository to GitHub or GitLab.
2. Log in to [Render](https://dashboard.render.com).
3. Click **New +** -> **Blueprint**.
4. Connect your repository.
5. Render will automatically detect [`render.yaml`](file:///c:/Users/aayus/Downloads/Exam%20Portal/render.yaml), provision the database, and build the Docker container using [`docker/Dockerfile.backend`](file:///c:/Users/aayus/Downloads/Exam%20Portal/docker/Dockerfile.backend).
6. Click **Apply**.
7. Once deployed, Render will provide your backend URL (e.g., `https://exam-portal-backend.onrender.com`).

### Method 2: Manual Docker Web Service on Render
1. In the Render Dashboard, click **New +** -> **Web Service**.
2. Select your repository.
3. Choose **Docker** as the Environment:
   - **Dockerfile Path**: `docker/Dockerfile.backend`
   - **Docker Context**: `.`
4. Add the following **Environment Variables**:
   | Key | Value | Description |
   |---|---|---|
   | `PROJECT_NAME` | `Exam Portal` | Service display name |
   | `API_V1_STR` | `/api` | API route prefix |
   | `SECRET_KEY` | `[Generate a random 32+ char string]` | JWT encryption key |
   | `DATABASE_URL` | `postgresql://...` | Your Cloud Postgres URI from Step 1 |
   | `CORS_ORIGINS` | `["*"]` or `["https://your-app.vercel.app"]` | Allowed frontend origins |
5. Click **Create Web Service**.

> [!TIP]
> **Zero-Touch Auto-Seeding**: When the backend starts up against a fresh, empty PostgreSQL database, it automatically initializes database schemas, seeds the default admin account (`admin@examportal.com` / `admin123`), and populates the Practice Mock Exam.

---

## Step 3: Deploy the React Frontend to Vercel

1. Log in to [Vercel](https://vercel.com).
2. Click **Add New...** -> **Project**.
3. Import your GitHub repository.
4. Configure the build settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend` *(or leave root; both include [`vercel.json`](file:///c:/Users/aayus/Downloads/Exam%20Portal/vercel.json) rewrites)*
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Under **Environment Variables**, add:
   | Key | Value | Example |
   |---|---|---|
   | `VITE_API_BASE_URL` | `https://<YOUR-RENDER-BACKEND-URL>/api` | `https://exam-portal-backend.onrender.com/api` |
   | `VITE_WS_BASE_URL` | `wss://<YOUR-RENDER-BACKEND-URL>/ws` | `wss://exam-portal-backend.onrender.com/ws` |
6. Click **Deploy**.
7. In ~60 seconds, Vercel will give you your live URL (e.g., `https://exam-portal.vercel.app`).

---

## Step 4: Verify Deployment

1. **Test Frontend Navigation**:
   - Open your Vercel URL in your browser: `https://your-app.vercel.app/login`.
   - Verify the login screen loads without scrolling, and the **Demo Candidate** section is visible.
2. **Test 1-Click Demo Candidate**:
   - Click **"Generate Demo Candidate"**.
   - Verify the modal popup shows the generated credentials and that the form is auto-filled.
   - Click **"Sign In & Launch Mock Exam"** to enter the candidate dashboard.
3. **Test Proctored Mock Exam**:
   - Start the **Practice Mock Exam**.
   - Verify camera & microphone hardware check passes, questions load, and proctoring events register.
4. **Test Admin Monitoring**:
   - Open a separate private tab.
   - Log in as Staff: `admin@examportal.com` / `admin123`.
   - Navigate to **Live Monitoring** (`/admin/monitoring`) to verify real-time WebSocket connection.

---

## Production Security Best Practices

1. **Update Default Admin Password**:
   - Log in to `/admin` and update the default password from `admin123` to a strong unique secret.
2. **Restrict CORS Origins**:
   - In your Render environment variables, update `CORS_ORIGINS` from `["*"]` to your exact Vercel production domain:
     `CORS_ORIGINS='["https://your-exam-portal.vercel.app"]'`
3. **Custom Domain (Optional)**:
   - Both Vercel and Render support adding free custom domains (e.g. `exam.yourdomain.com` and `api.yourdomain.com`) with automatic SSL certificate renewal.
