(function () {
  const APP = {
    tableName: 'alpha',
    sessionKey: 'alphaBankSession',
    userStorageKey: 'user',
    adminStorageKey: 'admin',
    statusCacheKey: 'alphaBankStatusCache',
    themeKey: 'alphaBankTheme',
    adminEmail: 'alpha@gmail.com',
    adminPassword: 'Alpha@2026',
    currencies: {
      USD: { code: 'USD', locale: 'en-US', symbol: '$' },
      GBP: { code: 'GBP', locale: 'en-GB', symbol: '£' },
      EUR: { code: 'EUR', locale: 'de-DE', symbol: '€' }
    },
    regions: ['USA', 'UK', 'EUROPE']
  };

  const safeParse = (value, fallback) => {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  };

  const normalizeBoolean = (value) => value === true || value === 'true' || value === 1 || value === '1';

  const getClient = () => window.AlphaBankSupabase || window.alphaSupabase || window.supabaseClient || null;
  const getSession = () => safeParse(localStorage.getItem(APP.sessionKey), null);
  const getStoredUser = () => safeParse(localStorage.getItem(APP.userStorageKey), null);
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

  const setSession = (session) => {
    if (!session) {
      localStorage.removeItem(APP.sessionKey);
      return;
    }

    localStorage.setItem(APP.sessionKey, JSON.stringify(session));

    if (session.role === 'admin') {
      localStorage.setItem(APP.adminStorageKey, 'true');
      localStorage.removeItem(APP.userStorageKey);
      return;
    }

    localStorage.removeItem(APP.adminStorageKey);
    if (session.user) {
      localStorage.setItem(APP.userStorageKey, JSON.stringify(session.user));
    }
  };

  const clearSession = () => {
    localStorage.removeItem(APP.sessionKey);
    localStorage.removeItem(APP.userStorageKey);
    localStorage.removeItem(APP.adminStorageKey);
  };

  const getCurrencyConfig = (currency) => APP.currencies[String(currency || 'USD').toUpperCase()] || APP.currencies.USD;
  const getCurrencySymbol = (currency) => getCurrencyConfig(currency).symbol;

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
    const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
    const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
    return bTime - aTime;
  });

  const calculateCharges = (amount) => {
    const cleanAmount = roundMoney(amount);
    const tax = roundMoney(cleanAmount * 0.005);
    const fee = roundMoney(cleanAmount * 0.002);
    const totalCharges = roundMoney(tax + fee);
    const netAmount = roundMoney(cleanAmount - totalCharges);

    return {
      amount: cleanAmount,
      tax,
      fee,
      totalCharges,
      netAmount,
      totalDebit: cleanAmount
    };
  };

  const generateReceipt = () => `TXN-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;
  const getCreditReceipt = (receipt) => `${String(receipt || '').replace(/-CR$/i, '')}-CR`;
  const getPrimaryReceiptBase = (receipt) => String(receipt || '').replace(/-CR$/i, '');
  const isAdminSession = () => localStorage.getItem(APP.adminStorageKey) === 'true';

  const setText = (selector, value) => {
    const elements = document.querySelectorAll(selector);
    elements.forEach((element) => {
      element.textContent = value;
    });
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
    showPopup.timeoutId = window.setTimeout(() => popup.classList.remove('show'), 3200);
    if (type === 'error') {
      window.setTimeout(() => window.alert(message), 120);
    }
  };

  const getThemePreference = () => localStorage.getItem(APP.themeKey) || 'day';

  const updateThemeToggle = (theme) => {
    const toggle = document.querySelector('.theme-toggle');
    if (!toggle) return;
    const icon = toggle.querySelector('.theme-icon');
    const label = toggle.querySelector('.theme-label');
    if (icon) icon.textContent = theme === 'night' ? '🌙' : '☀️';
    if (label) label.textContent = theme === 'night' ? 'Night Mode' : 'Day Mode';
    toggle.setAttribute('aria-label', theme === 'night' ? 'Switch to day mode' : 'Switch to night mode');
  };

  const applyTheme = (theme) => {
    const nextTheme = String(theme || 'day').toLowerCase() === 'night' ? 'night' : 'day';
    document.documentElement.setAttribute('data-theme', nextTheme);
    if (document.body) document.body.setAttribute('data-theme', nextTheme);
    localStorage.setItem(APP.themeKey, nextTheme);
    updateThemeToggle(nextTheme);
    return nextTheme;
  };

  const ensureAmbientBackground = () => {
    if (!document.querySelector('.bg-grid')) {
      const grid = document.createElement('div');
      grid.className = 'bg-grid';
      document.body.prepend(grid);
    }

    ['orb-1', 'orb-2', 'orb-3'].forEach((name) => {
      if (!document.querySelector(`.bg-orb.${name}`)) {
        const orb = document.createElement('div');
        orb.className = `bg-orb ${name}`;
        document.body.prepend(orb);
      }
    });
  };

  const setupThemeToggle = () => {
    if (!document.querySelector('.theme-toggle')) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'theme-toggle';
      toggle.innerHTML = '<span class="theme-icon">☀️</span><span class="theme-label">Day Mode</span>';
      document.body.appendChild(toggle);
      toggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'day';
        applyTheme(current === 'night' ? 'day' : 'night');
      });
    }
    applyTheme(getThemePreference());
  };

  const createRipple = (event, element) => {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    element.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), 650);
  };

  const setupRippleEffect = () => {
    document.addEventListener('click', (event) => {
      const interactive = event.target.closest('.btn, .quick-action-card, .theme-toggle');
      if (!interactive) return;
      createRipple(event, interactive);
    });
  };

  const copyText = async (value) => {
    const text = String(value || '').trim();
    if (!text) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const field = document.createElement('textarea');
        field.value = text;
        document.body.appendChild(field);
        field.select();
        document.execCommand('copy');
        field.remove();
      }
      return true;
    } catch (error) {
      console.error('[AlphaBank] copy error', error);
      return false;
    }
  };

  const setupQuickActionHelpers = () => {
    document.addEventListener('click', async (event) => {
      const copyButton = event.target.closest('[data-copy-account="true"]');
      if (!copyButton) return;
      event.preventDefault();
      const session = getSession();
      const accountFromPage = document.getElementById('dashboardAccountNumber')?.textContent?.trim();
      const value = accountFromPage || session?.accountNumber || session?.user?.account_number || '';
      if (!value) {
        showPopup('Account number unavailable right now.', 'error');
        return;
      }
      const copied = await copyText(value);
      showPopup(copied ? 'Account number copied.' : 'Unable to copy account number.', copied ? 'success' : 'error');
    });
  };

  const resolveElement = (target) => typeof target === 'string' ? document.querySelector(target) : target;

  const animateValue = (target, endValue, formatter, duration = 1100) => {
    const element = resolveElement(target);
    if (!element) return;
    const finalValue = Number(endValue || 0);
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      element.textContent = formatter(finalValue);
      element.dataset.currentValue = String(finalValue);
      return;
    }
    const startValue = Number(element.dataset.currentValue || 0);
    const startTime = performance.now();
    const diff = finalValue - startValue;

    const step = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + diff * eased;
      element.textContent = formatter(current);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        element.dataset.currentValue = String(finalValue);
        element.textContent = formatter(finalValue);
      }
    };

    requestAnimationFrame(step);
  };

  const animateCurrency = (target, amount, currency = 'USD') => {
    animateValue(target, amount, (value) => formatCurrency(value, currency));
  };

  const animateCount = (target, amount) => {
    animateValue(target, amount, (value) => Math.round(value).toLocaleString());
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
    const message = String(error.message || error || fallback);
    if (message.includes('Supabase client is not initialized')) {
      return 'Supabase client is not initialized.';
    }
    if (message.includes('Failed to fetch')) {
      return 'Network request failed. Please try again.';
    }
    if (message.includes('column') && message.includes('does not exist')) {
      return fallback;
    }
    return message;
  };

  const parseUserMeta = (row = {}) => {
    const meta = safeParse(row.receipt, {});
    const rawHistory = row.history ?? meta.history ?? meta.flagMessage ?? '';
    const history = String(rawHistory || '').trim();
    const flagged = Object.prototype.hasOwnProperty.call(meta, 'flagged')
      ? normalizeBoolean(meta.flagged)
      : Boolean(history);
    return {
      fullName: meta.fullName || row.user_name || '',
      email: meta.email || row.sender_account || '',
      phone: meta.phone || row.receiver_account || '',
      region: meta.region || 'USA',
      currency: meta.currency || 'USD',
      profileImage: meta.profileImage || '',
      defaultTransactionsGenerated: normalizeBoolean(meta.defaultTransactionsGenerated),
      history,
      flagMessage: history,
      flagged: Boolean(history) ? flagged : false
    };
  };

  const parseTransactionMeta = (row = {}) => {
    const meta = safeParse(row.password, {});
    const charges = calculateCharges(row.amount || 0);
    const history = Array.isArray(meta.history)
      ? meta.history
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
          status: String(entry.status || '').toLowerCase(),
          message: String(entry.message || '').trim(),
          created_at: entry.created_at || ''
        }))
        .filter((entry) => entry.message)
      : [];
    return {
      status: String(meta.status || 'success').toLowerCase(),
      currency: meta.currency || 'USD',
      tax: meta.tax != null ? roundMoney(meta.tax) : charges.tax,
      fee: meta.fee != null ? roundMoney(meta.fee) : charges.fee,
      totalCharges: meta.totalCharges != null ? roundMoney(meta.totalCharges) : charges.totalCharges,
      netAmount: meta.netAmount != null ? roundMoney(meta.netAmount) : charges.netAmount,
      adminMessage: String(meta.adminMessage || meta.message || history[history.length - 1]?.message || '').trim(),
      history
    };
  };

  const buildUserMeta = (payload = {}, current = {}) => {
    const currentMeta = parseUserMeta(current);
    const fullName = String(payload.fullName ?? payload.user_name ?? currentMeta.fullName ?? current.user_name ?? '').trim();
    const email = String(payload.email ?? currentMeta.email ?? current.sender_account ?? '').trim();
    const phone = String(payload.phone ?? currentMeta.phone ?? current.receiver_account ?? '').trim();
    const region = String(payload.region ?? currentMeta.region ?? 'USA').trim().toUpperCase() || 'USA';
    const currency = String(payload.currency ?? currentMeta.currency ?? 'USD').trim().toUpperCase() || 'USD';
    const profileImage = String(payload.profileImage ?? currentMeta.profileImage ?? '').trim();
    const defaultTransactionsGenerated = Object.prototype.hasOwnProperty.call(payload, 'defaultTransactionsGenerated')
      ? normalizeBoolean(payload.defaultTransactionsGenerated)
      : currentMeta.defaultTransactionsGenerated;
    const history = String(payload.history ?? payload.flagMessage ?? currentMeta.history ?? '').trim();
    const flagged = Object.prototype.hasOwnProperty.call(payload, 'flagged')
      ? normalizeBoolean(payload.flagged)
      : Boolean(history);

    return {
      fullName,
      email,
      phone,
      region,
      currency,
      profileImage,
      defaultTransactionsGenerated,
      history: flagged ? history : '',
      flagMessage: flagged ? history : '',
      flagged: flagged && Boolean(history)
    };
  };

  const buildUserDbPayload = (payload = {}, current = {}) => {
    const meta = buildUserMeta(payload, current);
    const nextPayload = {
      user_name: meta.fullName,
      password: Object.prototype.hasOwnProperty.call(payload, 'password') ? String(payload.password || '') : String(current.password || ''),
      account_number: Object.prototype.hasOwnProperty.call(payload, 'account_number') ? String(payload.account_number || '') : String(current.account_number || ''),
      balance: Object.prototype.hasOwnProperty.call(payload, 'balance') ? roundMoney(payload.balance) : roundMoney(current.balance || 0),
      sender_account: meta.email,
      receiver_account: meta.phone,
      receipt: JSON.stringify(meta),
      history: meta.history || null,
      transaction_type: null,
      amount: null
    };

    if (Object.prototype.hasOwnProperty.call(payload, 'statement')) {
      nextPayload.statement = payload.statement;
    }

    return nextPayload;
  };

  const buildTransactionMeta = (payload = {}, current = {}) => {
    const currentMeta = parseTransactionMeta(current);
    const amount = Object.prototype.hasOwnProperty.call(payload, 'amount') ? payload.amount : current.amount;
    const charges = calculateCharges(amount || 0);
    const nextStatus = String(payload.status || currentMeta.status || 'success').toLowerCase();
    const hasAdminMessage = Object.prototype.hasOwnProperty.call(payload, 'adminMessage') || Object.prototype.hasOwnProperty.call(payload, 'message');
    const adminMessage = hasAdminMessage
      ? String(payload.adminMessage ?? payload.message ?? '').trim()
      : String(currentMeta.adminMessage || '').trim();
    let history = Array.isArray(payload.history)
      ? payload.history
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
          status: String(entry.status || nextStatus).toLowerCase(),
          message: String(entry.message || '').trim(),
          created_at: entry.created_at || new Date().toISOString()
        }))
        .filter((entry) => entry.message)
      : [...currentMeta.history];

    if (hasAdminMessage && adminMessage) {
      const lastEntry = history[history.length - 1];
      if (!lastEntry || lastEntry.message !== adminMessage || String(lastEntry.status || '').toLowerCase() != nextStatus) {
        history = [...history, { status: nextStatus, message: adminMessage, created_at: new Date().toISOString() }];
      }
    }

    return {
      status: nextStatus,
      currency: String(payload.currency || currentMeta.currency || 'USD').toUpperCase(),
      tax: roundMoney(payload.tax != null ? payload.tax : charges.tax),
      fee: roundMoney(payload.fee != null ? payload.fee : charges.fee),
      totalCharges: roundMoney(payload.totalCharges != null ? payload.totalCharges : charges.totalCharges),
      netAmount: roundMoney(payload.netAmount != null ? payload.netAmount : charges.netAmount),
      adminMessage,
      history
    };
  };

  const sanitizeUser = (row = {}) => {
    const meta = parseUserMeta(row);
    return {
      ...row,
      user_name: meta.fullName,
      username: meta.fullName,
      full_name: meta.fullName,
      email: meta.email,
      phone: meta.phone,
      region: meta.region,
      currency: meta.currency,
      profileImage: meta.profileImage,
      defaultTransactionsGenerated: meta.defaultTransactionsGenerated,
      history: meta.history,
      flagMessage: meta.flagMessage,
      flagged: meta.flagged,
      account_number: String(row.account_number || ''),
      balance: roundMoney(row.balance || 0)
    };
  };

  const sanitizeTransaction = (row = {}) => {
    const meta = parseTransactionMeta(row);
    return {
      ...row,
      status: meta.status,
      currency: meta.currency,
      tax: meta.tax,
      fee: meta.fee,
      totalCharges: meta.totalCharges,
      netAmount: meta.netAmount,
      adminMessage: meta.adminMessage,
      history: meta.history,
      amount: roundMoney(row.amount || 0),
      sender_account: String(row.sender_account || ''),
      receiver_account: String(row.receiver_account || ''),
      receipt: String(row.receipt || '')
    };
  };

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
        .eq('account_number', String(accountNumber || '').trim())
        .is('transaction_type', null)
    );

    return row ? sanitizeUser(row) : null;
  }

  async function fetchUserByCredentials(identifier, password) {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');

    const input = String(identifier || '').trim();
    const secret = String(password || '');

    const row = await querySingle(
      client
        .from(APP.tableName)
        .select('*')
        .or(`sender_account.eq.${input},account_number.eq.${input}`)
        .eq('password', secret)
        .is('transaction_type', null)
    );

    return row ? sanitizeUser(row) : null;
  }

  async function insertUser(payload) {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');

    const insertPayload = buildUserDbPayload(payload);
    const { data, error } = await client
      .from(APP.tableName)
      .insert(insertPayload)
      .select('*')
      .limit(1);

    if (error) throw error;
    return data?.[0] ? sanitizeUser(data[0]) : null;
  }

  async function updateUserByAccountNumber(accountNumber, payload) {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');

    const current = await querySingle(
      client
        .from(APP.tableName)
        .select('*')
        .eq('account_number', String(accountNumber || '').trim())
        .is('transaction_type', null)
    );

    if (!current) throw new Error('User account not found.');

    const updatePayload = buildUserDbPayload(payload, current);
    const { data, error } = await client
      .from(APP.tableName)
      .update(updatePayload)
      .eq('account_number', String(accountNumber || '').trim())
      .is('transaction_type', null)
      .select('*')
      .limit(1);

    if (error) throw error;
    return data?.[0] ? sanitizeUser(data[0]) : null;
  }

  async function fetchTransactionsForAccount(accountNumber) {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');

    const account = String(accountNumber || '').trim();
    const { data, error } = await client
      .from(APP.tableName)
      .select('*')
      .not('transaction_type', 'is', null)
      .or(`sender_account.eq.${account},receiver_account.eq.${account}`);

    if (error) throw error;
    return sortTransactions((data || []).map(sanitizeTransaction));
  }

  async function fetchAllTransactions() {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');

    const { data, error } = await client
      .from(APP.tableName)
      .select('*')
      .not('transaction_type', 'is', null);

    if (error) throw error;
    return sortTransactions((data || []).map(sanitizeTransaction));
  }

  async function fetchTransactionByReceipt(receiptValue) {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');

    const row = await querySingle(
      client
        .from(APP.tableName)
        .select('*')
        .eq('receipt', String(receiptValue || '').trim())
    );

    return row ? sanitizeTransaction(row) : null;
  }

  function buildTransactionDbPayload(payload = {}, current = {}) {
    const meta = buildTransactionMeta(payload, current);
    const basePayload = {
      user_name: Object.prototype.hasOwnProperty.call(payload, 'user_name') ? String(payload.user_name || '') : String(current.user_name || ''),
      password: JSON.stringify(meta),
      balance: Object.prototype.hasOwnProperty.call(payload, 'balance') ? roundMoney(payload.balance || 0) : current.balance ?? null,
      sender_account: Object.prototype.hasOwnProperty.call(payload, 'sender_account') ? String(payload.sender_account || '') : String(current.sender_account || ''),
      receiver_account: Object.prototype.hasOwnProperty.call(payload, 'receiver_account') ? String(payload.receiver_account || '') : String(current.receiver_account || ''),
      receipt: Object.prototype.hasOwnProperty.call(payload, 'receipt') ? String(payload.receipt || '') : String(current.receipt || ''),
      amount: Object.prototype.hasOwnProperty.call(payload, 'amount') ? roundMoney(payload.amount || 0) : roundMoney(current.amount || 0),
      transaction_type: Object.prototype.hasOwnProperty.call(payload, 'transaction_type') ? String(payload.transaction_type || '').toLowerCase() : String(current.transaction_type || '').toLowerCase()
    };

    if (Object.prototype.hasOwnProperty.call(payload, 'created_at') && payload.created_at) {
      basePayload.created_at = payload.created_at;
    }

    return basePayload;
  }

  async function insertTransaction(payload) {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');

    const insertPayload = buildTransactionDbPayload(payload);
    const { data, error } = await client
      .from(APP.tableName)
      .insert(insertPayload)
      .select('*')
      .limit(1);

    if (error) throw error;
    return data?.[0] ? sanitizeTransaction(data[0]) : null;
  }

  async function insertTransactionsBulk(payloads = []) {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');
    if (!Array.isArray(payloads) || !payloads.length) return [];

    const rows = payloads.map((payload) => buildTransactionDbPayload(payload));
    const { data, error } = await client
      .from(APP.tableName)
      .insert(rows)
      .select('*');

    if (error) throw error;
    return sortTransactions((data || []).map(sanitizeTransaction));
  }

  async function updateTransactionByReceipt(receiptValue, payload) {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');

    const current = await querySingle(
      client
        .from(APP.tableName)
        .select('*')
        .eq('receipt', String(receiptValue || '').trim())
    );

    if (!current) throw new Error('Transaction not found.');

    const updatePayload = buildTransactionDbPayload(payload, current);

    const { data, error } = await client
      .from(APP.tableName)
      .update(updatePayload)
      .eq('receipt', String(receiptValue || '').trim())
      .select('*')
      .limit(1);

    if (error) throw error;
    return data?.[0] ? sanitizeTransaction(data[0]) : null;
  }

  async function fetchCurrentUser() {
    const session = getSession();
    if (!session || session.role !== 'customer' || !session.accountNumber) return null;

    const client = getClient();
    if (!client) throw new Error('Supabase client is not initialized.');

    const { data, error } = await client
      .from(APP.tableName)
      .select('*')
      .eq('account_number', String(session.accountNumber || '').trim())
      .is('transaction_type', null)
      .single();

    if (error || !data) return null;

    const freshUser = sanitizeUser(data);

    setSession({
      isLoggedIn: true,
      role: 'customer',
      username: freshUser.user_name,
      accountNumber: freshUser.account_number,
      balance: freshUser.balance,
      currency: freshUser.currency,
      user: freshUser
    });

    return freshUser;
  }


  async function getUserFlagReason(accountNumber) {
    const user = typeof accountNumber === 'object' && accountNumber
      ? sanitizeUser(accountNumber)
      : await fetchUserByAccountNumber(accountNumber);
    return String(user?.history || user?.flagMessage || '').trim();
  }

  const randomDigits = (length) => Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');

  async function generateAccountNumber(region) {
    const users = await fetchAllUsers();
    const existing = new Set(users.map((user) => String(user.account_number || '')));
    const normalizedRegion = String(region || 'USA').trim().toUpperCase();
    let accountNumber = '';

    do {
      if (normalizedRegion === 'UK') {
        accountNumber = `20-${randomDigits(6)}-${randomDigits(8)}`;
      } else if (normalizedRegion === 'EUROPE') {
        accountNumber = `EU${randomDigits(12 + Math.floor(Math.random() * 5))}`;
      } else {
        accountNumber = `10${randomDigits(8 + Math.floor(Math.random() * 3))}`;
      }
    } while (existing.has(accountNumber));

    return accountNumber;
  }

  function isValidAccountNumberFormat(accountNumber) {
    const value = String(accountNumber || '').trim().toUpperCase();
    return /^10\d{8,10}$/.test(value) || /^20-\d{6}-\d{8}$/.test(value) || /^EU\d{12,16}$/.test(value);
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

  const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  const buildExternalAccountNumber = (region) => {
    const normalizedRegion = String(region || 'USA').toUpperCase();
    if (normalizedRegion === 'UK') {
      return `20-${randomDigits(6)}-${randomDigits(8)}`;
    }
    if (normalizedRegion === 'EUROPE') {
      return `EU${randomDigits(12)}`;
    }
    return `10${randomDigits(8)}`;
  };

  const buildDefaultTransactions = (user, count = 60) => {
    const currency = user?.currency || 'USD';
    const region = user?.region || 'USA';
    const accountNumber = String(user?.account_number || '');
    const rows = [];

    for (let index = 0; index < count; index += 1) {
      const isCredit = index % 2 === 0;
      const amount = roundMoney(randomBetween(85, 4800) + Math.random());
      const createdAt = new Date(Date.now() - randomBetween(2, 320) * 86400000 - randomBetween(1, 86000) * 1000).toISOString();
      const receipt = `DFT-${Date.now()}-${index + 1}-${randomDigits(5)}`;
      const externalAccount = buildExternalAccountNumber(region);

      rows.push({
        user_name: user?.user_name || '',
        amount,
        sender_account: isCredit ? externalAccount : accountNumber,
        receiver_account: isCredit ? accountNumber : externalAccount,
        transaction_type: isCredit ? 'credit' : 'debit',
        status: 'success',
        currency,
        tax: 0,
        fee: 0,
        totalCharges: 0,
        netAmount: amount,
        receipt,
        created_at: createdAt
      });
    }

    return rows;
  };

  async function ensureDefaultTransactionsForUser(userInput) {
    const user = userInput?.account_number ? sanitizeUser(userInput) : await fetchCurrentUser();
    if (!user || !user.account_number) return [];
    return fetchTransactionsForAccount(user.account_number);
  }

  async function getBlockingDisapprovedTransaction(accountNumber) {
    const adminMessage = await getUserFlagReason(accountNumber);
    return adminMessage ? { adminMessage } : null;
  }

  async function updateUserProfileImage(accountNumber, profileImage) {
    return updateUserByAccountNumber(accountNumber, { profileImage });
  }

  const getCurrentPage = () => window.location.pathname.split('/').pop() || 'index.html';

  const requireAuth = () => {
    const page = getCurrentPage();
    const session = getSession();
    const isAdminPage = document.body.dataset.adminPage === 'true';
    const isProtected = document.body.dataset.protected === 'true';

    if (page === 'index.html' || page === '') {
      if (isAdminSession() || session?.role === 'admin') {
        window.location.replace('admin.html');
        return;
      }
      if (session?.role === 'customer') {
        window.location.replace('dashboard.html');
      }
      return;
    }

    if (isAdminPage) {
      if (localStorage.getItem('admin') !== 'true') {
        window.location.replace('index.html');
      }
      return;
    }

    if (isProtected && (!session || session.role !== 'customer' || isAdminSession())) {
      window.location.replace('index.html');
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

  const getPrimaryTransactionsForCustomer = (transactions, accountNumber) => {
    const account = String(accountNumber || '');
    return sortTransactions(
      transactions.filter((transaction) => {
        const type = String(transaction.transaction_type || '').toLowerCase();
        return (type === 'debit' && String(transaction.sender_account || '') === account)
          || (type === 'credit' && String(transaction.receiver_account || '') === account);
      })
    );
  };

  const getDisplayStatus = (transaction) => String(transaction?.status || 'success').toLowerCase();

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
        console.error('[AlphaBank] status watcher error', error);
      }
    };

    syncStatuses(false);
    window.setInterval(() => syncStatuses(true), 4000);
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
    getCreditReceipt,
    generateAccountNumber,
    isValidAccountNumberFormat,
    getCurrencyConfig,
    getCurrencySymbol,
    setText,
    showFeedback,
    hideFeedback,
    showPopup,
    togglePasswordButtons,
    getFriendlyError,
    escapeHtml,
    sanitizeUser,
    sanitizeTransaction,
    fetchAllUsers,
    fetchVisibleUsers,
    fetchUserByAccountNumber,
    fetchUserByCredentials,
    insertUser,
    updateUserByAccountNumber,
    fetchTransactionsForAccount,
    fetchAllTransactions,
    fetchTransactionByReceipt,
    insertTransaction,
    updateTransactionByReceipt,
    fetchCurrentUser,
    getUserFlagReason,
    ensureBankReserve,
    ensureDefaultTransactionsForUser,
    getBlockingDisapprovedTransaction,
    updateUserProfileImage,
    insertTransactionsBulk,
    requireAuth,
    setupLogout,
    getPrimaryReceiptBase,
    getPrimaryTransactionsForCustomer,
    getDisplayStatus,
    getNotificationMessage,
    startStatusWatcher,
    applyTheme,
    animateCurrency,
    animateCount
  };

  document.addEventListener('DOMContentLoaded', () => {
    console.log('[AlphaBank] App booted');
    ensureAmbientBackground();
    setupThemeToggle();
    setupRippleEffect();
    setupQuickActionHelpers();
    requireAuth();
    setupLogout();
    togglePasswordButtons();
  });
})();
