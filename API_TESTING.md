# PlantGuard API — Testing Guide

Use this file to test every endpoint. Works with curl, Postman, or Bruno.

---

## Setup

Set these variables before running commands:

```bash
BASE=http://localhost:3001
TOKEN=""          # Paste access token here after login
SESSION=""        # Paste chat session ID here
PLANT=""          # Paste plant ID here
```

---

## 1. Auth Endpoints

### Register (sends OTP to email)
```bash
curl -X POST $BASE/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Shahd",
    "lastName": "Nower",
    "email": "shahd@example.com",
    "password": "Test1234",
    "country": "Egypt",
    "city": "Cairo"
  }'
```

**Expected:** `{ "message": "OTP sent to your email..." }`

---

### Verify Email (paste OTP from your inbox)
```bash
curl -X POST $BASE/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "shahd@example.com",
    "otp": "123456"
  }'
```

**Expected:** `{ "accessToken": "...", "user": { ... } }`

---

### Login
```bash
curl -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "shahd@example.com",
    "password": "Test1234"
  }'
```

**Expected:** `{ "accessToken": "...", "user": { ... } }`

**→ Copy the accessToken and set:** `TOKEN="paste_token_here"`

---

### Refresh Token
```bash
curl -X POST $BASE/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{ "refreshToken": "paste_refresh_token" }'
```

---

### Logout
```bash
curl -X POST $BASE/api/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```

---

## 2. User Endpoints

### Get Profile
```bash
curl $BASE/api/user/profile \
  -H "Authorization: Bearer $TOKEN"
```

---

### Update Profile
```bash
curl -X PUT $BASE/api/user/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Shahd",
    "city": "Alexandria"
  }'
```

---

### Upload Profile Image (multipart/form-data)
```bash
curl -X POST $BASE/api/user/profile/image \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@/path/to/your/photo.jpg"
```

**Expected:** `{ "user": { "profileImage": "https://res.cloudinary.com/..." } }`

---

### Change Password
```bash
curl -X PUT $BASE/api/user/password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "Test1234",
    "newPassword": "NewPass5678"
  }'
```

---

## 3. Plant Endpoints

### List My Plants
```bash
curl $BASE/api/plants \
  -H "Authorization: Bearer $TOKEN"
```

---

### Add Plant (JSON, no image)
```bash
curl -X POST $BASE/api/plants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Rose",
    "plantType": "Flower",
    "location": "Balcony",
    "notes": "Needs watering every 2 days"
  }'
```

**→ Copy the plant id and set:** `PLANT="paste_plant_id"`

---

### Add Plant with Image (multipart/form-data)
```bash
curl -X POST $BASE/api/plants \
  -H "Authorization: Bearer $TOKEN" \
  -F "name=My Rose" \
  -F "plantType=Flower" \
  -F "image=@/path/to/plant.jpg"
```

---

### Get Single Plant
```bash
curl $BASE/api/plants/$PLANT \
  -H "Authorization: Bearer $TOKEN"
```

---

### Update Plant
```bash
curl -X PUT $BASE/api/plants/$PLANT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Updated notes",
    "lastWatered": "2026-04-13T10:00:00Z"
  }'
```

---

### Delete Plant
```bash
curl -X DELETE $BASE/api/plants/$PLANT \
  -H "Authorization: Bearer $TOKEN"
```

---

### Add Care Schedule
```bash
curl -X POST $BASE/api/plants/$PLANT/care-schedule \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "taskType": "WATER",
    "frequency": "TWICE_WEEKLY",
    "notes": "Water in the morning",
    "nextDue": "2026-04-15T08:00:00Z"
  }'
```

**taskType options:** `WATER | FERTILIZE | PRUNE | REPOT | CHECK_HEALTH`
**frequency options:** `DAILY | TWICE_WEEKLY | WEEKLY | BIWEEKLY | MONTHLY | AS_NEEDED`

---

### Complete a Care Task
```bash
curl -X POST $BASE/api/plants/$PLANT/care-schedule/SCHEDULE_ID/complete \
  -H "Authorization: Bearer $TOKEN"
```

---

## 4. Scan / Disease Detection

### Scan a Plant Image
```bash
curl -X POST $BASE/api/scans/predict \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@/path/to/sick_plant.jpg" \
  -F "plantId=$PLANT"
```

**Expected response:**
```json
{
  "scan": { "id": "...", "imageUrl": "https://res.cloudinary.com/..." },
  "result": {
    "healthy": false,
    "disease": "Powdery Mildew",
    "confidence": 0.87,
    "diagnosis": "Powdery Mildew",
    "recommendation": "Apply fungicide and improve air circulation."
  }
}
```

---

### View Scan History
```bash
curl "$BASE/api/scans/history" \
  -H "Authorization: Bearer $TOKEN"

# Filter by plant:
curl "$BASE/api/scans/history?plantId=$PLANT" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 5. Chat (Persistent History)

### Start a New Chat (creates session automatically)
```bash
curl -X POST $BASE/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "message": "My rose has yellow leaves, what could be wrong?" }'
```

**Expected:**
```json
{
  "reply": "Yellow leaves on roses can indicate...",
  "sessionId": "cm...",
  "messageId": "cm..."
}
```

**→ Copy the sessionId:** `SESSION="paste_session_id"`

---

### Continue the Same Chat (follow-up question)
```bash
curl -X POST $BASE/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "How often should I water it?",
    "sessionId": "'$SESSION'"
  }'
```

The AI remembers the previous messages in this session.

---

### List All Chat Sessions (like ChatGPT sidebar)
```bash
curl $BASE/api/chat/sessions \
  -H "Authorization: Bearer $TOKEN"
```

---

### Get Full Message History of a Session
```bash
curl $BASE/api/chat/sessions/$SESSION/messages \
  -H "Authorization: Bearer $TOKEN"
```

---

### Delete a Session
```bash
curl -X DELETE $BASE/api/chat/sessions/$SESSION \
  -H "Authorization: Bearer $TOKEN"
```

---

## 6. Utility

### Health Check (no auth needed)
```bash
curl $BASE/health
```

**Expected:** `{ "status": "ok", "db": "ok", "redis": "ok" }`

---

### List All Endpoints
```bash
curl $BASE/api
```

---

## Common Errors

| Status | Code | Meaning |
|--------|------|---------|
| 400 | `VALIDATION_ERROR` | Missing or invalid field in request body |
| 401 | `UNAUTHORIZED` | Missing or expired token |
| 403 | `FORBIDDEN` | You don't own this resource |
| 404 | `NOT_FOUND` | Resource doesn't exist |
| 409 | `CONFLICT` | Email already registered |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error (check logs) |
