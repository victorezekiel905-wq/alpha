document.addEventListener('DOMContentLoaded', () => {
  const bank = window.AlphaBank;
  if (!bank) return;

  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const toast = document.getElementById('toast');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const authForms = document.querySelectorAll('.auth-form');

  const switchTab = (tabName) => {
    tabButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === tabName);
    });

    authForms.forEach((form) => {
      form.classList.toggle('active', form.id === `${tabName}Form`);
    });

    bank.hideFeedback(toast);
  };

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });

  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      bank.hideFeedback(toast);

      const accountNumber = document.getElementById('registerAccountNumber').value.trim();
      const fullName = document.getElementById('registerUsername').value.trim();
      const password = document.getElementById('registerPassword').value.trim();
      const confirmPassword = document.getElementById('confirmPassword').value.trim();
      const submitButton = registerForm.querySelector('button[type="submit"]');

      if (!accountNumber || !fullName || !password || !confirmPassword) {
        bank.showFeedback(toast, 'Please complete all registration fields.', 'error');
        return;
      }

      if (!bank.isValidAccountNumberFormat(accountNumber)) {
        bank.showFeedback(toast, 'Enter a valid admin-issued account number.', 'error');
        return;
      }

      if (password !== confirmPassword) {
        bank.showFeedback(toast, 'Passwords do not match.', 'error');
        return;
      }

      try {
        if (submitButton) submitButton.disabled = true;
        const assignedAccount = await bank.fetchUserByAccountNumber(accountNumber);

        if (!assignedAccount) {
          bank.showFeedback(toast, 'Account number not found. Please contact admin.', 'error');
          return;
        }

        if (assignedAccount.password) {
          bank.showFeedback(toast, 'This account is already active. Please login.', 'error');
          switchTab('login');
          return;
        }

        const updatedUser = await bank.updateUserByAccountNumber(accountNumber, {
          fullName,
          password
        });

        bank.setSession({
          isLoggedIn: true,
          role: 'customer',
          username: updatedUser.user_name,
          accountNumber: updatedUser.account_number,
          balance: updatedUser.balance,
          currency: updatedUser.currency,
          user: updatedUser
        });
        bank.clearStatusCache();
        bank.showFeedback(toast, 'Account activated successfully. Redirecting...', 'success');
        registerForm.reset();

        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 800);
      } catch (error) {
        console.error('[AlphaBank] registration error', error);
        bank.showFeedback(toast, bank.getFriendlyError(error, 'Unable to complete registration.'), 'error');
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      bank.hideFeedback(toast);

      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value.trim();
      const submitButton = loginForm.querySelector('button[type="submit"]');

      if (!username || !password) {
        bank.showFeedback(toast, 'Enter your login details.', 'error');
        return;
      }

      if (username === 'alpha@gmail.com' && password === 'Alpha@2026') {
        localStorage.setItem('admin', 'true');
        bank.setSession({
          isLoggedIn: true,
          role: 'admin',
          username: 'alpha@gmail.com'
        });
        window.location.href = 'admin.html';
        return;
      }

      try {
        if (submitButton) submitButton.disabled = true;
        const matchedUser = await bank.fetchUserByCredentials(username, password);

        if (!matchedUser) {
          bank.showFeedback(toast, 'Invalid email/account number or password.', 'error');
          return;
        }

        bank.setSession({
          isLoggedIn: true,
          role: 'customer',
          username: matchedUser.user_name,
          accountNumber: matchedUser.account_number,
          balance: matchedUser.balance,
          currency: matchedUser.currency,
          user: matchedUser
        });
        bank.clearStatusCache();
        bank.showFeedback(toast, 'Login successful. Redirecting...', 'success');
        loginForm.reset();

        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 700);
      } catch (error) {
        console.error('[AlphaBank] login error', error);
        bank.showFeedback(toast, bank.getFriendlyError(error, 'Unable to login right now.'), 'error');
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }
});
