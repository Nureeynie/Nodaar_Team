# Nodaar Team Hub — Enterprise Cloud Workspace

A modern, standard team operating system built for organizations with **Supabase (PostgreSQL & Auth)** and **Google Drive integration**, ready for **Vercel** or any cloud host.

---

## 🏢 Enterprise Features
- **Official Branding**: Official Nodaar logo and SVG/PNG favicons embedded across login and navigation shells.
- **Supabase Cloud Backend**: Pre-configured with your Supabase Project (`xzrczuoxlujzmztkupbz`).
- **Google Drive Integration**: Real-time link attachments for deliverables, daily standups, meeting notes, pitch decks, and OKR strategies.
- **Role-Based Security**: PostgreSQL Row-Level Security (RLS) enforcing admin vs. team member roles.
- **Mobile Responsive**: Clean desktop sidebar and mobile-friendly responsive views.

---

## 🔑 Your Project Credentials
- **Supabase Project URL**: `https://xzrczuoxlujzmztkupbz.supabase.co`
- **Publishable API Key**: `sb_publishable_rmA0mlX3rpylvgJ47uBktA_yv2085CN`
*(Already pre-configured in `app.js` — zero setup required for team members!)*

> ⚠️ **Important Security Note**: Your `sb_secret_...` key is the **service/admin master key**. It must **never** be placed in frontend code. It is kept safe in your Supabase project dashboard for backend operations.

---

## ⚡ 1-Minute Deployment

### 1. Initialize Your Database (One Time)
1. Go to your **[Supabase Project Dashboard](https://supabase.com/dashboard/project/xzrczuoxlujzmztkupbz)**.
2. Click **SQL Editor** in the left sidebar.
3. Open [`schema.sql`](file:///c:/Users/USER/Downloads/Nodaar_Team_Hub_Full_Package/schema.sql), copy all lines, paste into the SQL editor, and click **Run**.
4. All tables (`profiles`, `tasks`, `reports`, `okrs`, `meetings`, `ideas`, `milestones`) and triggers are created.

### 2. Deploy to Vercel
In PowerShell, run:
```powershell
cd c:\Users\USER\Downloads\Nodaar_Team_Hub_Full_Package
vercel --prod
```
*Vercel will upload the project and output your live production URL (e.g., `https://nodaar-team-hub.vercel.app`).*

---

## 📁 Repository Structure
```text
├── assets/
│   ├── favicon.svg               # Vector favicon
│   ├── logo-new.svg              # Scalable Nodaar vector logo
│   └── logo-new-removebg-preview.png  # Transparent Nodaar brand logo
├── index.html                    # Single-Page Enterprise App
├── app.js                        # Supabase JS v2 & Drive link logic
├── schema.sql                    # PostgreSQL Schema & RLS Policies
├── vercel.json                   # Clean URL routing & caching
└── README.md                     # Documentation
```
