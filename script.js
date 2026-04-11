(function () {
  const APP = {
    tableName: 'alpha',
    sessionKey: 'alphaBankSession',
    userStorageKey: 'user',
    adminStorageKey: 'admin',
    statusCacheKey: 'alphaBankStatusCache',
    adminEmail: 'alpha@gmail.com',
    adminPassword: 'Alpha@2026',
    currencies: {
      USD: { code: 'USD', locale: 'en-US' },
      EUR: { code: 'EUR', locale: 'de-DE' },
      GBP: { code: 'GBP', locale: 'en-GB' }
    }
  };

  let schemaCache = null;

  const safeParse = (value, fallback) => {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  };

  const getClient = () => window.AlphaBankSupabase || window.alphaSupabase || null;
  const getSession = () => safeParse(localStorage.getItem(APP.sessionKey), null);
  const getStoredUser = () => safeParse(localStorage.getItem(APP.userStorageKey), null);
  const getStatusCache = () => safeParse(localStorage.getItem(APP.statusCacheKey), {});
  const setStatusCache = (value) => localStorage.setItem(APP.statusCacheKey, JSON.stringify(value || {}));
  const clearStatusCache = () => localStorage.removeItem(APP.statusCacheKey);

  const setSession = (session) => {
    const normalized = session || null;
    if (!normalized) {
      localStorage.removeItem(APP.sessionKey);
      return;
    }

    localStorage.setItem(APP.sessionKey, JSON.stringify(normalized));

    if (normalized.role === 'admin') {
      localStorage.setItem(APP.adminStorageKey, true);
      localStorage.removeItem(APP.userStorageKey);
    } else if (normalized.role === 'customer') {
      localStorage.removeItem(APP.adminStorageKey);
      localStorage.setItem(APP.userStorageKey, JSON.stringify(normalized.user || {
        username: normalized.username || '',
        account_number: normalized.accountNumber || '',
        balance: normalized.balance || 0,
        currency: normalized.currency || 'USD'
      }));
    }
  };

  const clearSession = () => {
    localStorage.removeItem(APP.sessionKey);
    localStorage.removeItem(APP.userStorageKey);
    localStorage.removeItem(APP.adminStorageKey);
  };

  const roundMoney = (value) => Number((Number(value || 0)).toFixed(2));

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const getCurrencyConfig = (currency) => APP.currencies[currency] || APP.currencies.USD;

  const formatCurrency = (amount, currency = 'USD') => {
    const config = getCurrencyConfig(currency);
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(amount || 0));
  };

  const formatDate = (value) => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const sortTransactions = (transactions = []) => [...transactions].sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at || a.date || 0).getTime();
    const bTime = new Date(b.updated_at || b.created_at || b.date || 0).getTime();
    return bTime - aTime;
  });

  const calculateCharges = (amount) => {
    const cleanAmount = roundMoney(amount);
    return {
      amount: cleanAmount,
      tax: 0,
      fee: 0,
      totalCharges: 0,
      totalDebit: cleanAmount
    };
  };

  const generateReceipt = () => `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const setText = (selector, value) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  };

  const showFeedback = (element, message, type = 'success') => {
    if (!element) return;
    element.textContent = message;
    element.className = element.id === 'toast' ? 'toast show' : 'alert-box show';
    element.classList.add(type);
  };

  const hideFeedback = (element) => {
    if (!element) return;
    element.classList.remove('show', 'success', 'error');
    element.textContent = '';
  };

  const getPopupContainer = () => {
    let popup = document.getElementById('globalPopupNotice');
    if (!popup) {
      popup = document.createElement('div');
      popup.id = 'globalPopupNotice';
      popup.className = 'popup-notice';
      document.body.appendChild(popup);
    }
    return popup;
  };

  const showPopup = (message, type = 'success') => {
    const popup = getPopupContainer();
    popup.textContent = message;
    popup.className = `popup-notice show ${type}`;
    window.clearTimeout(showPopup.timeoutId);
    showPopup.timeoutId = window.setTimeout(() => {
      popup.classList.remove('show');
    }, 3200);

    if (type === 'error' || message === 'Transaction Declined') {
      window.setTimeout(() => window.alert(message), 120);
    }
  };

  const togglePasswordButtons = () => {
    document.querySelectorAll('.toggle-password').forEach((button) => {
      button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.target);
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        button.textContent = isPassword ? 'Hide' : 'Show';
      });
    });
  };

  const getFriendlyError = (error, fallback = 'Something went wrong. Please try again.') => {
    if (!error) return fallback;
    const message = error.message || String(error);
    if (message.includes('Could not find the table') || message.includes('schema cache')) {
      return 'Supabase table alpha is not available yet.';
    }
    return message;
  };

  const sanitizeUser = (row = {}) => ({
    ...row,
    username: row.username || row.user_name || row.email || '',
    password: row.password || '',
    account_number: String(row.account_number || ''),
    balance: roundMoney(row.balance),
    currency: row.currency || 'USD'
  });

  const normalizeUserName = (row = {}) => String(row.username || row.user_name || row.email || '').trim();
  const isAdminSession = () => localStorage.getItem(APP.adminStorageKey) === 'true';

  async function detectSchema() {
    if (schemaCache) return schemaCache;
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');

    const { data, error } = await client
      .from(APP.tableName)
      .select('*')
      .limit(1);

    if (error && !String(error.message || '').includes('Results contain 0 rows')) throw error;

    const sample = Array.isArray(data) ? data[0] : null;
    schemaCache = {
      usernameField: sample && Object.prototype.hasOwnProperty.call(sample, 'user_name') && !Object.prototype.hasOwnProperty.call(sample, 'username')
        ? 'user_name'
        : 'username'
    };

    return schemaCache;
  }

  function applySchemaToPayload(payload, schema) {
    const nextPayload = { ...payload };
    if (Object.prototype.hasOwnProperty.call(nextPayload, 'username')) {
      const usernameValue = nextPayload.username;
      delete nextPayload.username;
      nextPayload[schema.usernameField] = usernameValue;
    }
    return nextPayload;
  }

  async function querySingle(builder) {
    const { data, error } = await builder.limit(1);
    if (error) throw error;
    return Array.isArray(data) ? data[0] || null : data || null;
  }

  async function fetchAllUsers() {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');

    const { data, error } = await client
      .from(APP.tableName)
      .select('*')
      .is('transaction_type', null);

    if (error) throw error;
    return (data || []).map(sanitizeUser);
  }

  async function fetchVisibleUsers() {
    return fetchAllUsers();
  }

  async function fetchUserByAccountNumber(accountNumber) {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');

    const row = await querySingle(
      client
        .from(APP.tableName)
        .select('*')
        .eq('account_number', String(accountNumber || ''))
        .is('transaction_type', null)
    );

    return row ? sanitizeUser(row) : null;
  }

  async function fetchUserByCredentials(identifier, password) {
    const users = await fetchAllUsers();
    const normalizedIdentifier = String(identifier || '').trim().toLowerCase();
    const normalizedPassword = String(password || '');

    return users.find((user) => {
      const username = normalizeUserName(user).toLowerCase();
      const email = String(user.email || '').trim().toLowerCase();
      return (username === normalizedIdentifier || email === normalizedIdentifier) && String(user.password || '') === normalizedPassword;
    }) || null;
  }

  async function updateUserByAccountNumber(accountNumber, payload) {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');
    const schema = await detectSchema();
    const updatePayload = applySchemaToPayload(payload, schema);

    const { data, error } = await client
      .from(APP.tableName)
      .update(updatePayload)
      .eq('account_number', String(accountNumber || ''))
      .is('transaction_type', null)
      .select('*')
      .limit(1);

    if (error) throw error;
    return data?.[0] ? sanitizeUser(data[0]) : null;
  }

  async function insertRow(payload) {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');
    const schema = await detectSchema();
    const insertPayload = applySchemaToPayload(payload, schema);

    const { data, error } = await client
      .from(APP.tableName)
      .insert(insertPayload)
      .select('*')
      .limit(1);

    if (error) throw error;
    return data?.[0] || null;
  }

  async function fetchTransactionsForAccount(accountNumber) {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');
    const account = String(accountNumber || '');

    const { data, error } = await client
      .from(APP.tableName)
      .select('*')
      .not('transaction_type', 'is', null)
      .or(`sender_account.eq.${account},receiver_account.eq.${account}`);

    if (error) throw error;
    return sortTransactions(data || []);
  }

  async function fetchAllTransactions() {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');

    const { data, error } = await client
      .from(APP.tableName)
      .select('*')
      .not('transaction_type', 'is', null);

    if (error) throw error;
    return sortTransactions(data || []);
  }

  async function fetchTransactionByReceipt(receiptValue) {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');

    return querySingle(
      client
        .from(APP.tableName)
        .select('*')
        .eq('receipt', receiptValue)
    );
  }

  async function updateTransactionByReceipt(receiptValue, payload) {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');

    const { data, error } = await client
      .from(APP.tableName)
      .update(payload)
      .eq('receipt', receiptValue)
      .select('*');

    if (error) throw error;
    return data || [];
  }

  async function fetchCurrentUser() {
    const session = getSession();
    if (!session || session.role !== 'customer' || !session.accountNumber) return null;
    const freshUser = await fetchUserByAccountNumber(session.accountNumber);
    if (freshUser) {
      setSession({
        ...session,
        username: freshUser.username,
        accountNumber: freshUser.account_number,
        balance: freshUser.balance,
        currency: freshUser.currency,
        user: freshUser
      });
    }
    return freshUser;
  }

  async function generateAccountNumber() {
    const users = await fetchAllUsers();
    const existing = new Set(users.map((user) => String(user.account_number || '')));
    let accountNumber = '';

    do {
      accountNumber = `${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    } while (existing.has(accountNumber));

    return accountNumber;
  }

  async function ensureBankReserve() {
    const users = await fetchVisibleUsers();
    const total = users.reduce((sum, user) => sum + Number(user.balance || 0), 0);
    return {
      account_number: 'BANK',
      balance: roundMoney(total),
      currency: 'USD'
    };
  }

  const getCurrentPage = () => window.location.pathname.split('/').pop() || 'index.html';

  const requireAuth = () => {
    const session = getSession();
    const isAdminPage = document.body.dataset.adminPage === 'true';
    const isProtected = document.body.dataset.protected === 'true';
    const page = getCurrentPage();

    if (page === 'index.html' || page === '') {
      if (isAdminSession() || session?.role === 'admin') {
        window.location.replace('admin.html');
        return;
      }
      if (session?.role === 'customer' && getStoredUser()) {
        window.location.replace('dashboard.html');
      }
      return;
    }

    if (isAdminPage) {
      if (!(isAdminSession() || session?.role === 'admin')) {
        window.location.replace('index.html');
      }
      return;
    }

    if (isProtected) {
      if (!session || session.role !== 'customer' || isAdminSession()) {
        window.location.replace('index.html');
      }
    }
  };

  const setupLogout = () => {
    document.querySelectorAll('.logout-btn').forEach((button) => {
      button.addEventListener('click', () => {
        clearSession();
        clearStatusCache();
        window.location.replace('index.html');
      });
    });
  };

  const getPrimaryReceiptBase = (receipt) => String(receipt || '').replace(/-CR$/g, '');

  const getPrimaryTransactionsForCustomer = (transactions, accountNumber) => {
    const account = String(accountNumber || '');
    const successCredits = new Set(
      transactions
        .filter((txn) => String(txn.transaction_type || '').toLowerCase() === 'credit')
        .map((txn) => getPrimaryReceiptBase(txn.receipt))
    );

    return sortTransactions(
      transactions.filter((txn) => {
        const type = String(txn.transaction_type || '').toLowerCase();
        const baseReceipt = getPrimaryReceiptBase(txn.receipt);
        if (type === 'debit' && String(txn.sender_account || '') === account) return true;
        if (type === 'credit' && String(txn.receiver_account || '') === account) return true;
        if (type === 'debit' && String(txn.receiver_account || '') === account && !successCredits.has(baseReceipt)) return true;
        return false;
      })
    );
  };

  const getDisplayStatus = (transaction) => String(transaction?.status || 'pending').toLowerCase();

  const getNotificationMessage = (status) => {
    const map = {
      success: 'Transfer Successful',
      pending: 'Transaction Pending',
      failed: 'Transaction Failed',
      disapproved: 'Transaction Declined'
    };
    return map[String(status || '').toLowerCase()] || 'Transaction Updated';
  };

  const startStatusWatcher = (accountNumber) => {
    const session = getSession();
    if (!session || session.role !== 'customer') return;

    const syncStatuses = async (notify) => {
      try {
        const transactions = await fetchTransactionsForAccount(accountNumber);
        const visible = getPrimaryTransactionsForCustomer(transactions, accountNumber);
        const currentCache = getStatusCache();
        const nextCache = { ...currentCache };

        visible
          .filter((txn) => String(txn.sender_account || '') === String(accountNumber || ''))
          .forEach((transaction) => {
            const status = getDisplayStatus(transaction);
            const cacheKey = getPrimaryReceiptBase(transaction.receipt);
            const previous = currentCache[cacheKey];

            if (notify && previous && previous !== status) {
              showPopup(getNotificationMessage(status), status === 'failed' || status === 'disapproved' ? 'error' : 'success');
            }

            nextCache[cacheKey] = status;
          });

        setStatusCache(nextCache);
      } catch (error) {
        console.error(error);
      }
    };

    syncStatuses(false);
    window.setInterval(() => syncStatuses(true), 12000);
  };

  window.AlphaBank = {
    APP,
    getClient,
    getSession,
    setSession,
    clearSession,
    getStoredUser,
    getStatusCache,
    setStatusCache,
    clearStatusCache,
    roundMoney,
    formatCurrency,
    formatDate,
    sortTransactions,
    calculateCharges,
    generateReceipt,
    generateAccountNumber,
    setText,
    showFeedback,
    hideFeedback,
    showPopup,
    togglePasswordButtons,
    getFriendlyError,
    escapeHtml,
    sanitizeUser,
    fetchAllUsers,
    fetchVisibleUsers,
    fetchUserByAccountNumber,
    fetchUserByCredentials,
    updateUserByAccountNumber,
    insertRow,
    fetchTransactionsForAccount,
    fetchAllTransactions,
    fetchTransactionByReceipt,
    updateTransactionByReceipt,
    fetchCurrentUser,
    ensureBankReserve,
    requireAuth,
    setupLogout,
    getPrimaryReceiptBase,
    getPrimaryTransactionsForCustomer,
    getDisplayStatus,
    getNotificationMessage,
    getCurrencyConfig,
    startStatusWatcher
  };

  document.addEventListener('DOMContentLoaded', () => {
    requireAuth();
    setupLogout();
    togglePasswordButtons();
  });
})();
