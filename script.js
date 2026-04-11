(function () {
  const APP = {
    tableName: 'bank_system',
    sessionKey: 'alphaBankSession',
    statusCacheKey: 'alphaBankStatusCache',
    adminUsername: 'admin',
    adminPassword: 'admin123',
    reserveAccountNumber: '0000000001',
    reserveUsername: '__bank_reserve__',
    reserveSeedBalance: 1000000000,
    charges: {
      taxRate: 0.005,
      feeRate: 0.002
    },
    currencies: {
      USD: { code: 'USD', locale: 'en-US', label: 'Dollars' },
      EUR: { code: 'EUR', locale: 'de-DE', label: 'Euro' },
      GBP: { code: 'GBP', locale: 'en-GB', label: 'Pounds' }
    }
  };

  const safeParse = (value, fallback) => {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  };

  const getClient = () => window.AlphaBankSupabase?.client || null;
  const getSession = () => safeParse(localStorage.getItem(APP.sessionKey), null);
  const setSession = (session) => localStorage.setItem(APP.sessionKey, JSON.stringify(session));
  const clearSession = () => localStorage.removeItem(APP.sessionKey);
  const getStatusCache = () => safeParse(localStorage.getItem(APP.statusCacheKey), {});
  const setStatusCache = (value) => localStorage.setItem(APP.statusCacheKey, JSON.stringify(value || {}));
  const clearStatusCache = () => localStorage.removeItem(APP.statusCacheKey);

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
    const baseAmount = roundMoney(amount);
    const tax = roundMoney(baseAmount * APP.charges.taxRate);
    const fee = roundMoney(baseAmount * APP.charges.feeRate);
    const totalCharges = roundMoney(tax + fee);
    return {
      amount: baseAmount,
      tax,
      fee,
      totalCharges,
      totalDebit: roundMoney(baseAmount + totalCharges)
    };
  };

  const generateReceipt = () => `RCPT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const generateAccountNumber = async () => {
    const existingUsers = await fetchAllUsers();
    const existingAccounts = new Set(existingUsers.map((user) => String(user.account_number || '')));
    let accountNumber = '';

    do {
      accountNumber = `${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    } while (existingAccounts.has(accountNumber) || accountNumber === APP.reserveAccountNumber);

    return accountNumber;
  };

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
        const targetId = button.dataset.target;
        const input = document.getElementById(targetId);
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
    if (message.includes('schema cache') || message.includes('Could not find the table')) {
      return 'Supabase table bank_system is not available yet.';
    }
    return message;
  };

  const isSystemAccount = (row) => String(row?.account_number || '') === APP.reserveAccountNumber || String(row?.username || '') === APP.reserveUsername;

  const sanitizeUser = (row) => ({
    ...row,
    username: row?.username || '',
    password: row?.password || '',
    account_number: String(row?.account_number || ''),
    balance: roundMoney(row?.balance),
    currency: row?.currency || 'USD'
  });

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
    const users = await fetchAllUsers();
    return users.filter((user) => !isSystemAccount(user));
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

  async function fetchUserByCredentials(username, password) {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');

    const row = await querySingle(
      client
        .from(APP.tableName)
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .is('transaction_type', null)
    );

    if (!row || isSystemAccount(row)) return null;
    return sanitizeUser(row);
  }

  async function updateUserByAccountNumber(accountNumber, payload) {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');

    const { data, error } = await client
      .from(APP.tableName)
      .update(payload)
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

    const { data, error } = await client
      .from(APP.tableName)
      .insert(payload)
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

    const row = await querySingle(
      client
        .from(APP.tableName)
        .select('*')
        .eq('receipt', receiptValue)
    );

    return row || null;
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

  async function ensureBankReserve() {
    let reserve = await fetchUserByAccountNumber(APP.reserveAccountNumber);
    if (reserve) return reserve;

    await insertRow({
      username: APP.reserveUsername,
      password: '',
      account_number: APP.reserveAccountNumber,
      balance: APP.reserveSeedBalance,
      currency: 'USD',
      transaction_type: null,
      status: null,
      receipt: null
    });

    reserve = await fetchUserByAccountNumber(APP.reserveAccountNumber);
    return reserve;
  }

  async function fetchCurrentUser() {
    const session = getSession();
    if (!session || session.role !== 'customer' || !session.accountNumber) return null;
    return fetchUserByAccountNumber(session.accountNumber);
  }

  const getCurrentPage = () => (window.location.pathname.split('/').pop() || 'index.html');

  const requireAuth = () => {
    const session = getSession();
    const isAdminPage = document.body.dataset.adminPage === 'true';
    const isProtected = document.body.dataset.protected === 'true';
    const page = getCurrentPage();

    if (page === 'index.html' || page === '') {
      if (session?.role === 'admin') {
        window.location.replace('admin.html');
        return;
      }
      if (session?.role === 'customer') {
        window.location.replace('dashboard.html');
      }
      return;
    }

    if (isAdminPage) {
      if (!session || session.role !== 'admin') {
        window.location.replace('index.html');
      }
      return;
    }

    if (isProtected) {
      if (!session || session.role !== 'customer') {
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

  const getPrimaryReceiptBase = (receipt) => String(receipt || '').replace(/-CR$|-RF$/g, '');

  const getPrimaryTransactionsForCustomer = (transactions, accountNumber) => {
    const account = String(accountNumber || '');
    const creditReceipts = new Set(
      transactions
        .filter((txn) => String(txn.transaction_type || '').toLowerCase() === 'credit' && String(txn.receipt || '').endsWith('-CR'))
        .map((txn) => getPrimaryReceiptBase(txn.receipt))
    );

    const refundReceipts = new Set(
      transactions
        .filter((txn) => String(txn.transaction_type || '').toLowerCase() === 'credit' && String(txn.receipt || '').endsWith('-RF'))
        .map((txn) => getPrimaryReceiptBase(txn.receipt))
    );

    return sortTransactions(
      transactions.filter((txn) => {
        const type = String(txn.transaction_type || '').toLowerCase();
        const receipt = String(txn.receipt || '');

        if (type === 'credit' && txn.receiver_account === account) return true;
        if (type === 'credit' && receipt.endsWith('-RF') && txn.receiver_account === account) return true;
        if (type === 'debit' && txn.sender_account === account) return true;
        if (type === 'debit' && txn.receiver_account === account && creditReceipts.has(receipt)) return false;
        if (type === 'debit' && txn.receiver_account === account && refundReceipts.has(receipt)) return false;
        return false;
      })
    );
  };

  const getDisplayStatus = (transaction, allTransactions, currentAccountNumber) => {
    const rawStatus = String(transaction?.status || 'pending').toLowerCase();
    const receipt = getPrimaryReceiptBase(transaction?.receipt || '');
    const currentAccount = String(currentAccountNumber || '');
    const hasApprovalCredit = allTransactions.some(
      (item) => String(item.receipt || '') === `${receipt}-CR` && String(item.status || '').toLowerCase() === 'success'
    );

    if (String(transaction.transaction_type || '').toLowerCase() === 'debit' && transaction.sender_account === currentAccount) {
      if (rawStatus === 'success' && !hasApprovalCredit) return 'pending';
    }

    return rawStatus;
  };

  const getNotificationMessage = (status) => {
    const map = {
      success: 'Transfer Successful',
      pending: 'Transaction Pending',
      disapproved: 'Transaction Declined',
      failed: 'Transaction Failed'
    };
    return map[String(status || '').toLowerCase()] || 'Transaction Updated';
  };

  const startStatusWatcher = (accountNumber) => {
    const session = getSession();
    if (!session || session.role !== 'customer') return;

    const syncStatuses = async (notify) => {
      try {
        const allTransactions = await fetchTransactionsForAccount(accountNumber);
        const outgoingPrimary = sortTransactions(
          allTransactions.filter((txn) => String(txn.transaction_type || '').toLowerCase() === 'debit' && txn.sender_account === String(accountNumber || ''))
        );

        const currentCache = getStatusCache();
        const nextCache = { ...currentCache };

        outgoingPrimary.forEach((transaction) => {
          const derivedStatus = getDisplayStatus(transaction, allTransactions, accountNumber);
          const cacheKey = getPrimaryReceiptBase(transaction.receipt);
          const previousStatus = currentCache[cacheKey];

          if (notify && previousStatus && previousStatus !== derivedStatus) {
            showPopup(getNotificationMessage(derivedStatus), derivedStatus === 'disapproved' || derivedStatus === 'failed' ? 'error' : 'success');
          }

          nextCache[cacheKey] = derivedStatus;
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
    getStatusCache,
    setStatusCache,
    clearStatusCache,
    formatCurrency,
    formatDate,
    roundMoney,
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
    fetchAllUsers,
    fetchVisibleUsers,
    fetchUserByAccountNumber,
    fetchUserByCredentials,
    fetchCurrentUser,
    updateUserByAccountNumber,
    fetchTransactionsForAccount,
    fetchAllTransactions,
    fetchTransactionByReceipt,
    updateTransactionByReceipt,
    insertRow,
    ensureBankReserve,
    requireAuth,
    setupLogout,
    getPrimaryTransactionsForCustomer,
    getDisplayStatus,
    getNotificationMessage,
    sortTransactions,
    getPrimaryReceiptBase,
    isSystemAccount,
    getCurrencyConfig,
    startStatusWatcher
  };

  document.addEventListener('DOMContentLoaded', () => {
    requireAuth();
    setupLogout();
    togglePasswordButtons();
  });
})();
