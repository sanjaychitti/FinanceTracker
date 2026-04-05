# Finance Tracker

A full-stack monthly budget tracker with:
- React frontend (dashboard-style create-account flow)
- Express backend API
- SQLite storage

## Quick start

```bash
npm install
npm run setup
npm run dev
```

This starts:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

## Create account API

`POST /api/accounts`

Example body:

```json
{
  "fullName": "Sanjay Chitti",
  "email": "you@example.com",
  "password": "secret123",
  "monthlyIncome": 6000,
  "housing": 1800,
  "utilities": 300,
  "food": 650,
  "transport": 250,
  "savingsGoal": 900
}
```

## Build and run for deployment

```bash
npm run setup
npm run build
npm run start
```

Production server runs on `PORT` (default `4000`) and serves the built frontend from `client/dist`.

## Deploy options

### Render / Railway
1. Create a new web service from this repository.
2. Build command: `npm install; npm run setup; npm run build`
3. Start command: `npm run start`
4. Set environment variable `PORT` if your platform requires it.

### Docker
Use this optional Dockerfile setup if you want containerized deployment.
