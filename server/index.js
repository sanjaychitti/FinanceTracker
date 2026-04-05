const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const path = require('path')
const crypto = require('crypto')
const Database = require('better-sqlite3')

dotenv.config()

const app = express()
const port = Number(process.env.PORT) || 4000

const dbPath = path.join(__dirname, 'budget.db')
const db = new Database(dbPath)

const activeSessions = new Map()

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

const verifyPassword = (password, encodedHash) => {
  const [salt, originalHash] = String(encodedHash).split(':')
  if (!salt || !originalHash) {
    return false
  }

  const checkHash = crypto.scryptSync(password, salt, 64).toString('hex')
  const checkBuffer = Buffer.from(checkHash, 'hex')
  const originalBuffer = Buffer.from(originalHash, 'hex')

  if (checkBuffer.length !== originalBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(checkBuffer, originalBuffer)
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    monthly_income REAL NOT NULL DEFAULT 0,
    housing REAL NOT NULL DEFAULT 0,
    utilities REAL NOT NULL DEFAULT 0,
    food REAL NOT NULL DEFAULT 0,
    transport REAL NOT NULL DEFAULT 0,
    savings_goal REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS credit_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    bank_name TEXT NOT NULL,
    total_amount_due REAL NOT NULL DEFAULT 0,
    minimum_payment REAL NOT NULL DEFAULT 0,
    minimum_payment_date TEXT NOT NULL DEFAULT '',
    amount_paid REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS monthly_budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    monthly_income REAL NOT NULL DEFAULT 0,
    housing REAL NOT NULL DEFAULT 0,
    utilities REAL NOT NULL DEFAULT 0,
    food REAL NOT NULL DEFAULT 0,
    transport REAL NOT NULL DEFAULT 0,
    savings_goal REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    UNIQUE(user_id, year, month)
  )
`)

const insertUser = db.prepare(`
  INSERT INTO users (
    full_name,
    username,
    email,
    password
  ) VALUES (?, ?, ?, ?)
`)

const getUserByUsername = db.prepare(`
  SELECT
    id,
    full_name AS fullName,
    username,
    email,
    password,
    created_at AS createdAt
  FROM users
  WHERE username = ?
`)

const getUserById = db.prepare(`
  SELECT
    id,
    full_name AS fullName,
    username,
    email,
    created_at AS createdAt
  FROM users
  WHERE id = ?
`)

const getBudgetByUserId = db.prepare(`
  SELECT
    monthly_income AS monthlyIncome,
    housing,
    utilities,
    food,
    transport,
    savings_goal AS savingsGoal,
    updated_at AS updatedAt
  FROM budgets
  WHERE user_id = ?
`)

const upsertBudget = db.prepare(`
  INSERT INTO budgets (
    user_id,
    monthly_income,
    housing,
    utilities,
    food,
    transport,
    savings_goal,
    updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(user_id) DO UPDATE SET
    monthly_income = excluded.monthly_income,
    housing = excluded.housing,
    utilities = excluded.utilities,
    food = excluded.food,
    transport = excluded.transport,
    savings_goal = excluded.savings_goal,
    updated_at = CURRENT_TIMESTAMP
`)

const getMonthlyBudget = db.prepare(`
  SELECT
    year, month,
    monthly_income AS monthlyIncome,
    housing, utilities, food, transport,
    savings_goal AS savingsGoal,
    updated_at AS updatedAt
  FROM monthly_budgets
  WHERE user_id = ? AND year = ? AND month = ?
`)

const upsertMonthlyBudget = db.prepare(`
  INSERT INTO monthly_budgets (user_id, year, month, monthly_income, housing, utilities, food, transport, savings_goal, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(user_id, year, month) DO UPDATE SET
    monthly_income = excluded.monthly_income,
    housing = excluded.housing,
    utilities = excluded.utilities,
    food = excluded.food,
    transport = excluded.transport,
    savings_goal = excluded.savings_goal,
    updated_at = CURRENT_TIMESTAMP
`)

const getAllMonthlyBudgets = db.prepare(`
  SELECT
    year, month,
    monthly_income AS monthlyIncome,
    housing, utilities, food, transport,
    savings_goal AS savingsGoal
  FROM monthly_budgets
  WHERE user_id = ?
  ORDER BY year DESC, month DESC
`)

const getCardsByUserId = db.prepare(`
  SELECT
    id,
    bank_name AS bankName,
    total_amount_due AS totalAmountDue,
    minimum_payment AS minimumPayment,
    minimum_payment_date AS minimumPaymentDate,
    amount_paid AS amountPaid
  FROM credit_cards
  WHERE user_id = ?
  ORDER BY id DESC
`)

const insertCard = db.prepare(`
  INSERT INTO credit_cards (user_id, bank_name, total_amount_due, minimum_payment, minimum_payment_date, amount_paid)
  VALUES (?, ?, ?, ?, ?, ?)
`)

const updateCard = db.prepare(`
  UPDATE credit_cards
  SET bank_name = ?, total_amount_due = ?, minimum_payment = ?, minimum_payment_date = ?, amount_paid = ?
  WHERE id = ? AND user_id = ?
`)

const deleteCard = db.prepare(`
  DELETE FROM credit_cards
  WHERE id = ? AND user_id = ?
`)

app.use(cors())
app.use(express.json())

const requireAuth = (req, res, next) => {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  const userId = activeSessions.get(token)

  if (!token || !userId) {
    return res.status(401).json({ message: 'Please log in first.' })
  }

  req.userId = userId
  return next()
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/register', (req, res) => {
  const { fullName, username, email, password } = req.body

  if (!fullName || !username || !email || !password) {
    return res.status(400).json({ message: 'Name, username, email, and password are required.' })
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' })
  }

  try {
    const encodedPassword = hashPassword(password)
    insertUser.run(
      fullName.trim(),
      username.trim().toLowerCase(),
      email.trim().toLowerCase(),
      encodedPassword,
    )

    return res.status(201).json({ message: 'Account created. Please log in.' })
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed')) {
      return res.status(409).json({ message: 'Username or email is already in use.' })
    }

    return res.status(500).json({ message: 'Something went wrong while creating your account.' })
  }
})

app.post('/api/login', (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' })
  }

  const user = getUserByUsername.get(username.trim().toLowerCase())
  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ message: 'Invalid username or password.' })
  }

  const token = crypto.randomUUID()
  activeSessions.set(token, user.id)

  return res.json({
    message: 'Logged in successfully.',
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
    },
  })
})

app.post('/api/logout', requireAuth, (req, res) => {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  activeSessions.delete(token)
  return res.json({ message: 'Logged out.' })
})

app.get('/api/me', requireAuth, (req, res) => {
  const user = getUserById.get(req.userId)
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  let budget = getMonthlyBudget.get(req.userId, currentYear, currentMonth)
  if (!budget) {
    budget = getBudgetByUserId.get(req.userId) || {
      monthlyIncome: 0, housing: 0, utilities: 0, food: 0, transport: 0, savingsGoal: 0,
    }
  }
  return res.json({ user, budget })
})

app.post('/api/budget', requireAuth, (req, res) => {
  const { monthlyIncome, housing, utilities, food, transport, savingsGoal, year, month } = req.body
  const now = new Date()
  const targetYear = Number(year) || now.getFullYear()
  const targetMonth = Number(month) || (now.getMonth() + 1)

  if (targetYear < 2000 || targetYear > 2100 || targetMonth < 1 || targetMonth > 12) {
    return res.status(400).json({ message: 'Invalid year or month.' })
  }

  const numbers = [monthlyIncome, housing, utilities, food, transport, savingsGoal].map((value) => Number(value || 0))
  const hasInvalidNumber = numbers.some((value) => Number.isNaN(value) || value < 0)

  if (hasInvalidNumber) {
    return res.status(400).json({ message: 'Budget values must be zero or greater.' })
  }

  upsertMonthlyBudget.run(req.userId, targetYear, targetMonth, numbers[0], numbers[1], numbers[2], numbers[3], numbers[4], numbers[5])

  const budget = getMonthlyBudget.get(req.userId, targetYear, targetMonth)
  const totalPlanned = budget.housing + budget.utilities + budget.food + budget.transport + budget.savingsGoal
  const cashLeft = budget.monthlyIncome - totalPlanned

  return res.json({
    message: `Budget for ${targetMonth}/${targetYear} saved.`,
    budget: { ...budget, totalPlanned, cashLeft },
  })
})

app.get('/api/budget/history', requireAuth, (req, res) => {
  const history = getAllMonthlyBudgets.all(req.userId)
  return res.json({ history })
})

app.get('/api/budget/:year/:month', requireAuth, (req, res) => {
  const year = Number(req.params.year)
  const month = Number(req.params.month)
  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ message: 'Invalid year or month.' })
  }
  const budget = getMonthlyBudget.get(req.userId, year, month) || null
  return res.json({ budget })
})

app.get('/api/cards', requireAuth, (req, res) => {
  const cards = getCardsByUserId.all(req.userId)
  return res.json({ cards })
})

app.post('/api/cards', requireAuth, (req, res) => {
  const { bankName, totalAmountDue, minimumPayment, minimumPaymentDate, amountPaid } = req.body
  if (!bankName || !minimumPaymentDate) {
    return res.status(400).json({ message: 'Bank name and payment date are required.' })
  }
  const nums = [totalAmountDue, minimumPayment, amountPaid].map((v) => Number(v || 0))
  if (nums.some((v) => Number.isNaN(v) || v < 0)) {
    return res.status(400).json({ message: 'Amount values must be zero or greater.' })
  }
  const result = insertCard.run(req.userId, bankName.trim(), nums[0], nums[1], minimumPaymentDate, nums[2])
  const cards = getCardsByUserId.all(req.userId)
  const card = cards.find((c) => c.id === result.lastInsertRowid)
  return res.status(201).json({ message: 'Card added.', card })
})

app.put('/api/cards/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const { bankName, totalAmountDue, minimumPayment, minimumPaymentDate, amountPaid } = req.body
  if (!bankName || !minimumPaymentDate) {
    return res.status(400).json({ message: 'Bank name and payment date are required.' })
  }
  const nums = [totalAmountDue, minimumPayment, amountPaid].map((v) => Number(v || 0))
  if (nums.some((v) => Number.isNaN(v) || v < 0)) {
    return res.status(400).json({ message: 'Amount values must be zero or greater.' })
  }
  const result = updateCard.run(bankName.trim(), nums[0], nums[1], minimumPaymentDate, nums[2], id, req.userId)
  if (result.changes === 0) {
    return res.status(404).json({ message: 'Card not found.' })
  }
  const cards = getCardsByUserId.all(req.userId)
  return res.json({ message: 'Card updated.', cards })
})

app.delete('/api/cards/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const result = deleteCard.run(id, req.userId)
  if (result.changes === 0) {
    return res.status(404).json({ message: 'Card not found.' })
  }
  const cards = getCardsByUserId.all(req.userId)
  return res.json({ message: 'Card deleted.', cards })
})

const isProduction = process.env.NODE_ENV === 'production'
const clientDistPath = path.join(__dirname, '..', 'client', 'dist')

if (isProduction) {
  app.use(express.static(clientDistPath))

  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next()
    }
    return res.sendFile(path.join(clientDistPath, 'index.html'))
  })
}

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port} [${isProduction ? 'production' : 'development'}]`)
})
