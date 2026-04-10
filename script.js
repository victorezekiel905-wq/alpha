(function () {
  const APP = {
    usersKey: 'alphaBankUsers',
    sessionKey: 'alphaBankSession',
    defaultBalance: 50000
  };

  const safeParse = (value, fallback) => {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  };

  const getUsers = () => safeParse(localStorage.getItem(APP.usersKey), []);
  const saveUsers = (users) => localStorage.setItem(APP.usersKey, JSON.stringify(users));
  const getSession = () => safeParse(localStorage.getItem(APP.sessionKey), null);
  const setSession = (session) => localStorage.setItem(APP.sessionKey, JSON.stringify(session));
  const clearSession = () => localStorage.removeItem(APP.sessionKey);

  const generateAccountNumber = () => {
    const prefix = '30';
    const random = Math.floor(10000000 + Math.random() * 90000000).toString();
    return `${prefix}${random}`.slice(0, 10);
  };

  const formatCurrency = (amount) => {
    const value = Number(amount || 0);
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatDate = (value) => {
    return new Date(value).toLocaleString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCurrentUser = () => {
    const session = getSession();
    if (!session?.isLoggedIn || !session?.username) return null;
    return getUsers().find((user) => user.username === session.username) || null;
  };

  const updateCurrentUser = (updatedUser) => {
    const users = getUsers();
    const index = users.findIndex((user) => user.username === updatedUser.username);
    if (index > -1) {
      users[index] = updatedUser;
      saveUsers(users);
      setSession({ isLoggedIn: true, username: updatedUser.username });
    }
  };

  const requireAuth = () => {
    const isProtected = document.body.dataset.protected === 'true';
    const session = getSession();
    const hasAccess = Boolean(session?.isLoggedIn && session?.username);

    if (isProtected && !hasAccess) {
      window.location.replace('index.html');
    }

    if (!isProtected && hasAccess && window.location.pathname.endsWith('index.html')) {
      window.location.replace('dashboard.html');
    }
  };

  const setupLogout = () => {
    document.querySelectorAll('.logout-btn').forEach((button) => {
      button.addEventListener('click', () => {
        clearSession();
        window.location.replace('index.html');
      });
    });
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

  window.AlphaBank = {
    APP,
    getUsers,
    saveUsers,
    getSession,
    setSession,
    clearSession,
    getCurrentUser,
    updateCurrentUser,
    generateAccountNumber,
    formatCurrency,
    formatDate,
    requireAuth,
    setupLogout,
    togglePasswordButtons,
    setText,
    showFeedback,
    hideFeedback
  };

  document.addEventListener('DOMContentLoaded', () => {
    requireAuth();
    setupLogout();
    togglePasswordButtons();
  });
})();
