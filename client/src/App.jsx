import { useEffect, useMemo, useState } from 'react'
import './App.css'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const emptyBudget = {
  monthlyIncome: '',
  housing: '',
  utilities: '',
  food: '',
  transport: '',
  savingsGoal: '',
}

const emptyCardForm = {
  bankName: '',
  totalAmountDue: '',
  minimumPayment: '',
  minimumPaymentDate: '',
  amountPaid: '',
  editingId: null,
}

function App() {
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
  })
  const [budgetForm, setBudgetForm] = useState(emptyBudget)
  const [token, setToken] = useState(localStorage.getItem('finance_token') || '')
  const [currentUser, setCurrentUser] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiMessage, setApiMessage] = useState('')
  const [cards, setCards] = useState([])
  const [cardForm, setCardForm] = useState(emptyCardForm)
  const [cardMessage, setCardMessage] = useState('')
  const [isSavingCard, setIsSavingCard] = useState(false)
  const [activeTab, setActiveTab] = useState('monthly-budget')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [budgetHistory, setBudgetHistory] = useState([])
  const [historyYear, setHistoryYear] = useState(new Date().getFullYear())

  useEffect(() => {
    if (!token) {
      return
    }

    const bootstrapSession = async () => {
      try {
        const response = await fetch('/api/me', {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!response.ok) {
          throw new Error('Session expired. Please log in.')
        }

        const result = await response.json()
        setCurrentUser(result.user)
        setBudgetForm({
          monthlyIncome: String(result.budget.monthlyIncome || ''),
          housing: String(result.budget.housing || ''),
          utilities: String(result.budget.utilities || ''),
          food: String(result.budget.food || ''),
          transport: String(result.budget.transport || ''),
          savingsGoal: String(result.budget.savingsGoal || ''),
        })

        const cardsRes = await fetch('/api/cards', { headers: { Authorization: `Bearer ${token}` } })
        if (cardsRes.ok) {
          const cardsData = await cardsRes.json()
          setCards(cardsData.cards)
        }

        const histRes = await fetch('/api/budget/history', { headers: { Authorization: `Bearer ${token}` } })
        if (histRes.ok) {
          const histData = await histRes.json()
          setBudgetHistory(histData.history)
        }
      } catch (_error) {
        localStorage.removeItem('finance_token')
        setToken('')
        setCurrentUser(null)
      }
    }

    bootstrapSession()
  }, [token])

  const totals = useMemo(() => {
    const toNumber = (value) => Number(value || 0)

    const planned =
      toNumber(budgetForm.housing) +
      toNumber(budgetForm.utilities) +
      toNumber(budgetForm.food) +
      toNumber(budgetForm.transport) +
      toNumber(budgetForm.savingsGoal)

    const income = toNumber(budgetForm.monthlyIncome)
    const leftover = income - planned

    return { planned, income, leftover }
  }, [budgetForm])

  const ccImpact = useMemo(() => {
    const totalMinPayments = cards.reduce((sum, c) => sum + (Number(c.minimumPayment) || 0), 0)
    const netAfterBudget = totals.income - totals.planned
    const netAfterCC = netAfterBudget - totalMinPayments
    return { totalMinPayments, netAfterBudget, netAfterCC }
  }, [totals, cards])

  const handleAuthChange = (event) => {
    const { name, value } = event.target
    setAuthForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleBudgetChange = (event) => {
    const { name, value } = event.target
    setBudgetForm((prev) => ({ ...prev, [name]: value }))
  }

  const fetchBudgetForMonth = async (year, month) => {
    try {
      const res = await fetch(`/api/budget/${year}/${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setBudgetForm(
          data.budget
            ? {
                monthlyIncome: String(data.budget.monthlyIncome || ''),
                housing: String(data.budget.housing || ''),
                utilities: String(data.budget.utilities || ''),
                food: String(data.budget.food || ''),
                transport: String(data.budget.transport || ''),
                savingsGoal: String(data.budget.savingsGoal || ''),
              }
            : emptyBudget,
        )
      }
    } catch (_err) {}
  }

  const handleRegister = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setApiMessage('')

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Unable to register right now.')
      }

      setApiMessage(result.message)
      setAuthMode('login')
      setAuthForm((prev) => ({
        ...prev,
        fullName: '',
        email: '',
      }))
    } catch (error) {
      setApiMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setApiMessage('')

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authForm.username, password: authForm.password }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.message || 'Unable to log in right now.')
      }

      localStorage.setItem('finance_token', result.token)
      setToken(result.token)
      setCurrentUser(result.user)
      setApiMessage('')
      setAuthForm({
        fullName: '',
        username: '',
        email: '',
        password: '',
      })
    } catch (error) {
      setApiMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBudgetSave = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setApiMessage('')

    try {
      const response = await fetch('/api/budget', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...budgetForm, year: selectedYear, month: selectedMonth }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.message || 'Unable to save budget right now.')
      }

      setApiMessage(result.message)
      const histRes = await fetch('/api/budget/history', { headers: { Authorization: `Bearer ${token}` } })
      if (histRes.ok) {
        const histData = await histRes.json()
        setBudgetHistory(histData.history)
      }
    } catch (error) {
      setApiMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const logout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch (_error) {
      // Logout should continue even if network call fails.
    }

    localStorage.removeItem('finance_token')
    setToken('')
    setCurrentUser(null)
    setBudgetForm(emptyBudget)
    setCards([])
    setBudgetHistory([])
    setApiMessage('')
  }

  const handleCardChange = (event) => {
    const { name, value } = event.target
    setCardForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleCardSubmit = async (event) => {
    event.preventDefault()
    setIsSavingCard(true)
    setCardMessage('')
    const isEditing = cardForm.editingId !== null
    const url = isEditing ? `/api/cards/${cardForm.editingId}` : '/api/cards'
    const method = isEditing ? 'PUT' : 'POST'
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(cardForm),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Unable to save card.')
      if (isEditing) {
        setCards(result.cards)
      } else {
        setCards((prev) => [result.card, ...prev])
      }
      setCardMessage(result.message)
      setCardForm(emptyCardForm)
    } catch (error) {
      setCardMessage(error.message)
    } finally {
      setIsSavingCard(false)
    }
  }

  const handleCardEdit = (card) => {
    setCardForm({
      bankName: card.bankName,
      totalAmountDue: String(card.totalAmountDue),
      minimumPayment: String(card.minimumPayment),
      minimumPaymentDate: card.minimumPaymentDate,
      amountPaid: String(card.amountPaid),
      editingId: card.id,
    })
    setCardMessage('')
    document.getElementById('credit-cards')?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleCardDelete = async (id) => {
    if (!window.confirm('Remove this credit card?')) return
    try {
      const response = await fetch(`/api/cards/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Unable to delete card.')
      setCards(result.cards)
      setCardMessage(result.message)
    } catch (error) {
      setCardMessage(error.message)
    }
  }

  if (!currentUser) {
    return (
      <div className="auth-screen">
        <div className="auth-panel">
          <section className="auth-card">
            <h1>{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
            <p className="auth-subtitle">
              {authMode === 'login'
                ? 'Sign in to your Finance Tracker account'
                : 'Start tracking your budget in minutes'}
            </p>
            <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="auth-form">
            {authMode === 'register' && (
              <label>
                Full Name
                <input name="fullName" type="text" required value={authForm.fullName} onChange={handleAuthChange} />
              </label>
            )}

            <label>
              Username
              <input name="username" type="text" required value={authForm.username} onChange={handleAuthChange} />
            </label>

            {authMode === 'register' && (
              <label>
                Email
                <input name="email" type="email" required value={authForm.email} onChange={handleAuthChange} />
              </label>
            )}

            <label>
              Password
              <input
                name="password"
                type="password"
                minLength="6"
                required
                value={authForm.password}
                onChange={handleAuthChange}
              />
            </label>

            {authMode === 'login' && (
              <a className="forgot-password" href="#" onClick={(event) => event.preventDefault()}>
                Forgot Password?
              </a>
            )}

            <button className="login-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Please wait...' : authMode === 'login' ? 'Log In' : 'Register'}
            </button>

            <p className="divider">or continue with</p>

            <button className="google-button" type="button" disabled>
              <span className="google-g">G</span>
              <span>{authMode === 'login' ? 'Sign In' : 'Sign Up'}</span>
            </button>

            <p className="switch-mode">
              {authMode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault()
                  setApiMessage('')
                  setAuthMode((prev) => (prev === 'login' ? 'register' : 'login'))
                }}
              >
                {authMode === 'login' ? 'Register Now' : 'Log In'}
              </a>
            </p>
          </form>

            {apiMessage && <p className="api-message auth-message">{apiMessage}</p>}
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <aside className="left-panel">
        <div className="brand-wrap">
          <p className="brand-tag">Finance Tracker</p>
          <h1>Budgeting Options</h1>
          <p>Welcome back, {currentUser.fullName}.</p>
        </div>

        <nav className="menu">
          {[
            { id: 'monthly-budget', label: 'Monthly Budget' },
            { id: 'credit-cards', label: 'Credit Cards' },
            { id: 'summary', label: 'Summary' },
            { id: 'history', label: 'Budget History' },
          ].map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`menu-item${activeTab === id ? ' active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
          <button className="menu-item logout-btn" onClick={logout} type="button">
            Log Out
          </button>
        </nav>

        <div className="loan-style-card">
          <p>Preview This Month</p>
          <strong>${totals.income.toLocaleString()}</strong>
          <span>Income</span>
        </div>
      </aside>

      <main className="right-panel">
        {activeTab === 'monthly-budget' && (
        <section className="panel-card" id="monthly-budget">
          <header className="card-header">
            <div>
              <h2>Monthly Budget — {MONTHS[selectedMonth - 1]} {selectedYear}</h2>
              <p>Set your plan for the month. The breakdown below updates as you type.</p>
            </div>
            <button className="primary-action" form="budget-form" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Budget'}
            </button>
          </header>

          <div className="month-picker">
            <label>
              Month
              <select value={selectedMonth} onChange={(e) => {
                const m = Number(e.target.value)
                setSelectedMonth(m)
                fetchBudgetForMonth(selectedYear, m)
              }}>
                {MONTHS.map((name, i) => (
                  <option key={i + 1} value={i + 1}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Year
              <select value={selectedYear} onChange={(e) => {
                const y = Number(e.target.value)
                setSelectedYear(y)
                fetchBudgetForMonth(y, selectedMonth)
              }}>
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
          </div>

          <form id="budget-form" className="budget-form" onSubmit={handleBudgetSave}>
            <div className="form-grid account-grid">
              <label>
                Monthly Income
                <input
                  name="monthlyIncome"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={budgetForm.monthlyIncome}
                  onChange={handleBudgetChange}
                />
              </label>
            </div>

            <h3>Budget Categories</h3>
            <div className="form-grid budget-grid">
              <label>
                Housing
                <input
                  name="housing"
                  type="number"
                  min="0"
                  step="0.01"
                  value={budgetForm.housing}
                  onChange={handleBudgetChange}
                  required
                />
              </label>
              <label>
                Utilities
                <input
                  name="utilities"
                  type="number"
                  min="0"
                  step="0.01"
                  value={budgetForm.utilities}
                  onChange={handleBudgetChange}
                  required
                />
              </label>
              <label>
                Food
                <input
                  name="food"
                  type="number"
                  min="0"
                  step="0.01"
                  value={budgetForm.food}
                  onChange={handleBudgetChange}
                  required
                />
              </label>
              <label>
                Transport
                <input
                  name="transport"
                  type="number"
                  min="0"
                  step="0.01"
                  value={budgetForm.transport}
                  onChange={handleBudgetChange}
                  required
                />
              </label>
              <label>
                Savings Goal
                <input
                  name="savingsGoal"
                  type="number"
                  min="0"
                  step="0.01"
                  value={budgetForm.savingsGoal}
                  onChange={handleBudgetChange}
                  required
                />
              </label>
            </div>
          </form>

          {apiMessage && <p className="api-message">{apiMessage}</p>}

          <div className="impact-panels">
            <div className="impact-panel">
              <h4>Budget Breakdown</h4>
              <div className="impact-row"><span>Monthly Income</span><span>${totals.income.toLocaleString()}</span></div>
              <div className="impact-row"><span>Housing</span><span className="deduction">−${Number(budgetForm.housing || 0).toLocaleString()}</span></div>
              <div className="impact-row"><span>Utilities</span><span className="deduction">−${Number(budgetForm.utilities || 0).toLocaleString()}</span></div>
              <div className="impact-row"><span>Food</span><span className="deduction">−${Number(budgetForm.food || 0).toLocaleString()}</span></div>
              <div className="impact-row"><span>Transport</span><span className="deduction">−${Number(budgetForm.transport || 0).toLocaleString()}</span></div>
              <div className="impact-row"><span>Savings Goal</span><span className="deduction">−${Number(budgetForm.savingsGoal || 0).toLocaleString()}</span></div>
              <div className="impact-row impact-total">
                <span>Net After Budget</span>
                <span className={ccImpact.netAfterBudget < 0 ? 'warn' : ''}>${ccImpact.netAfterBudget.toLocaleString()}</span>
              </div>
            </div>

            <div className="impact-panel">
              <h4>After Credit Card Min. Payments</h4>
              {cards.length === 0 ? (
                <p className="impact-empty">No credit cards on file. Add cards in the Credit Cards tab to see their impact here.</p>
              ) : (
                <>
                  <div className="impact-row"><span>Net After Budget</span><span>${ccImpact.netAfterBudget.toLocaleString()}</span></div>
                  {cards.map((card) => (
                    <div key={card.id} className="impact-row">
                      <span>{card.bankName} min.</span>
                      <span className="deduction">−${card.minimumPayment.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="impact-row impact-total">
                    <span>Net Remaining</span>
                    <span className={ccImpact.netAfterCC < 0 ? 'warn' : 'remaining-clear'}>
                      ${ccImpact.netAfterCC.toLocaleString()}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
        )}

        {activeTab === 'credit-cards' && (
        <section className="panel-card" id="credit-cards">
          <header className="card-header">
            <div>
              <h2>Credit Cards</h2>
              <p>Track your card balances, payments, and due dates.</p>
            </div>
            <button className="primary-action" form="card-form" type="submit" disabled={isSavingCard}>
              {isSavingCard ? 'Saving...' : cardForm.editingId ? 'Update Card' : 'Add Card'}
            </button>
          </header>

          <form id="card-form" className="budget-form" onSubmit={handleCardSubmit}>
            <div className="form-grid card-grid">
              <label>
                Bank Name
                <input
                  name="bankName"
                  type="text"
                  required
                  value={cardForm.bankName}
                  onChange={handleCardChange}
                  placeholder="e.g. Chase, Bank of America"
                />
              </label>
              <label>
                Total Amount Due
                <input
                  name="totalAmountDue"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={cardForm.totalAmountDue}
                  onChange={handleCardChange}
                />
              </label>
              <label>
                Minimum Payment
                <input
                  name="minimumPayment"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={cardForm.minimumPayment}
                  onChange={handleCardChange}
                />
              </label>
              <label>
                Min. Payment Date
                <input
                  name="minimumPaymentDate"
                  type="date"
                  required
                  value={cardForm.minimumPaymentDate}
                  onChange={handleCardChange}
                />
              </label>
              <label>
                Amount Paid
                <input
                  name="amountPaid"
                  type="number"
                  min="0"
                  step="0.01"
                  value={cardForm.amountPaid}
                  onChange={handleCardChange}
                />
              </label>
            </div>
            {cardForm.editingId && (
              <button
                type="button"
                className="cancel-edit"
                onClick={() => { setCardForm(emptyCardForm); setCardMessage('') }}
              >
                Cancel Edit
              </button>
            )}
          </form>

          {cardMessage && <p className="api-message">{cardMessage}</p>}

          {cards.length === 0 ? (
            <p className="empty-state">No credit cards added yet. Use the form above to add one.</p>
          ) : (
            <div className="table-wrap">
              <table className="cards-table">
                <thead>
                  <tr>
                    <th>Bank Name</th>
                    <th>Total Amount Due</th>
                    <th>Min. Payment</th>
                    <th>Payment Date</th>
                    <th>Amount Paid</th>
                    <th>Remaining</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((card) => {
                    const remaining = card.totalAmountDue - card.amountPaid
                    return (
                      <tr key={card.id}>
                        <td>{card.bankName}</td>
                        <td>${card.totalAmountDue.toLocaleString()}</td>
                        <td>${card.minimumPayment.toLocaleString()}</td>
                        <td>{card.minimumPaymentDate}</td>
                        <td>${card.amountPaid.toLocaleString()}</td>
                        <td className={remaining > 0 ? 'remaining-owed' : 'remaining-clear'}>
                          ${remaining.toLocaleString()}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button type="button" className="btn-edit" onClick={() => handleCardEdit(card)}>Edit</button>
                            <button type="button" className="btn-delete" onClick={() => handleCardDelete(card.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}

        {activeTab === 'summary' && (
        <section className="panel-card" id="summary">
          <h2>Track Your Plan</h2>
          <div className="summary-grid">
            <article>
              <p>Planned Spend</p>
              <strong>${totals.planned.toLocaleString()}</strong>
            </article>
            <article>
              <p>Expected Leftover</p>
              <strong className={totals.leftover < 0 ? 'warn' : ''}>${totals.leftover.toLocaleString()}</strong>
            </article>
            <article>
              <p>Income</p>
              <strong>${totals.income.toLocaleString()}</strong>
            </article>
          </div>

          <div className="created-box">
            <p>Signed in as:</p>
            <h3>{currentUser.fullName}</h3>
            <p>@{currentUser.username}</p>
          </div>
        </section>
        )}

        {activeTab === 'history' && (
        <section className="panel-card" id="history">
          <header className="card-header">
            <div>
              <h2>Budget History</h2>
              <p>Review your monthly plans. Click Edit to load any month into the budget form.</p>
            </div>
            {[...new Set(budgetHistory.map((b) => b.year))].length > 0 && (
              <select
                className="year-select"
                value={historyYear}
                onChange={(e) => setHistoryYear(Number(e.target.value))}
              >
                {[...new Set(budgetHistory.map((b) => b.year))].sort((a, b) => b - a).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            )}
          </header>

          {budgetHistory.filter((b) => b.year === historyYear).length === 0 ? (
            <p className="empty-state">No budget data for {historyYear}. Save a monthly budget to see it here.</p>
          ) : (
            <div className="table-wrap">
              <table className="cards-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Income</th>
                    <th>Total Planned</th>
                    <th>Net After Budget</th>
                    <th>CC Min Payments</th>
                    <th>Net After CC</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {budgetHistory
                    .filter((b) => b.year === historyYear)
                    .map((b) => {
                      const planned = b.housing + b.utilities + b.food + b.transport + b.savingsGoal
                      const netBudget = b.monthlyIncome - planned
                      const totalCC = cards.reduce((s, c) => s + (Number(c.minimumPayment) || 0), 0)
                      const netCC = netBudget - totalCC
                      return (
                        <tr key={`${b.year}-${b.month}`}>
                          <td><strong>{MONTHS[b.month - 1]}</strong></td>
                          <td>${b.monthlyIncome.toLocaleString()}</td>
                          <td>${planned.toLocaleString()}</td>
                          <td className={netBudget < 0 ? 'remaining-owed' : ''}>${netBudget.toLocaleString()}</td>
                          <td>${totalCC.toLocaleString()}</td>
                          <td className={netCC < 0 ? 'remaining-owed' : 'remaining-clear'}>${netCC.toLocaleString()}</td>
                          <td>
                            <button
                              type="button"
                              className="btn-edit"
                              onClick={() => {
                                setSelectedYear(b.year)
                                setSelectedMonth(b.month)
                                setBudgetForm({
                                  monthlyIncome: String(b.monthlyIncome),
                                  housing: String(b.housing),
                                  utilities: String(b.utilities),
                                  food: String(b.food),
                                  transport: String(b.transport),
                                  savingsGoal: String(b.savingsGoal),
                                })
                                setActiveTab('monthly-budget')
                              }}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}
      </main>
    </div>
  )
}

export default App
