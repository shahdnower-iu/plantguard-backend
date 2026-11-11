# PlantGuard Backend 

Plant disease detection API with persistent chat history, Cloudinary image uploads, and Groq AI.

---

## Project Structure

```
src/
├── config/
│   ├── connectionDb.ts   ← Prisma (PostgreSQL)
│   ├── env.ts            ← Environment variable validation
│   ├── redis.ts          ← Redis (OTP + auth sessions)
│   └── cloudinary.ts     ← Cloudinary (image uploads)
│
├── middleware/
│   ├── auth.ts           ← JWT token verification
│   ├── errorHandler.ts   ← Global error handler
│   ├── upload.ts         ← Multer + Cloudinary upload
│   ├── rateLimiter.ts    ← Rate limiting
│   └── validation.ts     ← Zod schema validation helper
│
├── modules/
│   ├── auth/
│   │   ├── auth.controller.ts   ← Routes: register, login, logout, refresh
│   │   ├── auth.service.ts      ← Business logic
│   │   └── auth.email.ts        ← Email sending (OTP)
│   ├── user/
│   │   ├── user.controller.ts
│   │   └── user.service.ts
│   ├── plant/
│   │   ├── plant.controller.ts  ← Plant CRUD + care schedules
│   │   └── plant.service.ts
│   ├── scan/
│   │   ├── scan.controller.ts   ← Upload image → disease detection
│   │   └── scan.service.ts      ← Calls Plant.id API
│   └── chat/
│       ├── chat.controller.ts   ← Chat with persistent history
│       └── chat.service.ts      ← Groq LLM + keyword RAG
│
├── utils/
│   ├── errors.ts   ← Custom error classes
│   ├── jwt.ts      ← Token generation/verification
│   └── hash.ts     ← Password hashing + OTP generation
│
├── app.controller.ts   ← Registers all routes
└── index.ts            ← Server entry point
```

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your credentials
```

Required services (all have free tiers, none require a credit card):
| Service | What for | Free tier |
|---------|----------|-----------|
| [Neon](https://neon.tech) | PostgreSQL database | ✅ Yes |
| Gmail | Sending OTP emails | ✅ Free (use App Password) |
| [Cloudinary](https://cloudinary.com) | Image storage | ✅ 25GB free |
| [Plant.id](https://plant.id) | Disease detection AI | ✅ Limited free |
| [Groq](https://console.groq.com) | Chat LLM | ✅ Yes |

### 3. Set up the database
```bash
npm run db:generate   # Generate Prisma client
npm run db:push       # Create tables in your database
```

### 4. Run in development
```bash
npm run dev
```

Server starts at: `http://localhost:3001`

---

## What Changed From v2

| Feature | Old (v2) | New (v3) |
|---------|----------|----------|
| Image storage | Vercel Blob | **Cloudinary** |
| Chat knowledge | Pinecone (vector DB) | **In-code keyword search** (no external service) |
| Chat history | Not saved | **Saved to PostgreSQL** (like ChatGPT) |
| Sessions/OTP | Redis (needs credit card) | **In-memory store** (built-in, no service needed) |
| Email | Custom SMTP | **Gmail + App Password** (free, easy) |
| Folder structure | Flat `routes/` + `services/` | **Modules** (each feature in one folder) |

---

## Testing

See `API_TESTING.md` for curl commands for every endpoint.

```bash
# Quick test after starting the server:
curl http://localhost:3001/health
curl http://localhost:3001/api
```

## notifications tabel 
07:00 ── Task reminder check
         → Finds tasks due TODAY or TOMORROW
         → Groups all tasks per user into one email
         → "You have 3 care tasks due soon" (table: plant / task / Today|Tomorrow)

08:00 ── Overdue care check
         → Finds tasks whose nextDue already passed (yesterday or earlier)
         → Sends alert per plant: "Rose needs watering — overdue by 2 days"
         → Max one alert per plant per 3 days

08:05 ── Health decline check
         → Compares each plant's last 2 scan scores
         → If drop > 15 points → "Plant health is declining"
         → Max one alert per plant per 7 days

Monday 08:00 ── Weekly report
         → Sends summary to every user with at least one plant
         → Overall score, total scans, plants needing attention
