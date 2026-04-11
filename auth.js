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
      const username = document.getElementById('registerUsername').value.trim();
      const password = document.getElementById('registerPassword').value.trim();
      const confirmPassword = document.getElementById('confirmPassword').value.trim();
      const submitButton = registerForm.querySelector('button[type="submit"]');

      if (!accountNumber || !username || !password || !confirmPassword) {
        bank.showFeedback(toast, 'Please complete all registration fields.', 'error');
        return;
      }

      if (!/^\d{10}$/.test(accountNumber)) {
        bank.showFeedback(toast, 'Enter the 10-digit account number issued by admin.', 'error');
        return;
      }

      if (password.length < 4) {
        bank.showFeedback(toast, 'Password must be at least 4 characters.', 'error');
        return;
      }

      if (password !== confirmPassword) {
        bank.showFeedback(toast, 'Passwords do not match.', 'error');
        return;
      }

      try {
        if (submitButton) submitButton.disabled = true;

        const assignedAccount = await bank.fetchUserByAccountNumber(accountNumber);
        if (!assignedAccount || bank.isSystemAccount(assignedAccount)) {
          bank.showFeedback(toast, 'Account number not found. Please contact admin.', 'error');
          return;
        }

        if (assignedAccount.username && assignedAccount.password) {
          bank.showFeedback(toast, 'This account number has already been registered.', 'error');
          return;
        }

        const users = await bank.fetchVisibleUsers();
        const usernameExists = users.some(
          (user) => user.username && user.username.toLowerCase() === username.toLowerCase() && user.account_number !== accountNumber
        );

        if (usernameExists) {
          bank.showFeedback(toast, 'Username already exists. Please use another one.', 'error');
          return;
        }

        const updatedUser = await bank.updateUserByAccountNumber(accountNumber, {
          username,
          password
        });

        bank.setSession({
          isLoggedIn: true,
          role: 'customer',
          username: updatedUser.username,
          accountNumber: updatedUser.account_number
        });
        bank.clearStatusCache();
        bank.showFeedback(toast, 'Account registered successfully. Redirecting...', 'success');
        registerForm.reset();

        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 900);
      } catch (error) {
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
        bank.showFeedback(toast, 'Enter your username and password.', 'error');
        return;
      }

      if (username === bank.APP.adminUsername && password === bank.APP.adminPassword) {
        bank.setSession({ isLoggedIn: true, role: 'admin', username });
        bank.showFeedback(toast, 'Login successful. Redirecting...', 'success');
        loginForm.reset();

        setTimeout(() => {
          window.location.href = 'admin.html';
        }, 700);
        return;
      }

      try {
        if (submitButton) submitButton.disabled = true;
        const matchedUser = await bank.fetchUserByCredentials(username, password);

        if (!matchedUser) {
          bank.showFeedback(toast, 'Invalid username or password.', 'error');
          return;
        }

        bank.setSession({
          isLoggedIn: true,
          role: 'customer',
          username: matchedUser.username,
          accountNumber: matchedUser.account_number
        });
        bank.clearStatusCache();
        bank.showFeedback(toast, 'Login successful. Redirecting...', 'success');
        loginForm.reset();

        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 700);
      } catch (error) {
        bank.showFeedback(toast, bank.getFriendlyError(error, 'Unable to login right now.'), 'error');
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }
});
