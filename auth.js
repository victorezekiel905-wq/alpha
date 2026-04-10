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
    registerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      bank.hideFeedback(toast);

      const username = document.getElementById('registerUsername').value.trim();
      const password = document.getElementById('registerPassword').value.trim();
      const confirmPassword = document.getElementById('confirmPassword').value.trim();

      if (!username || !password || !confirmPassword) {
        bank.showFeedback(toast, 'Please complete all registration fields.', 'error');
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

      const users = bank.getUsers();
      const alreadyExists = users.some((user) => user.username.toLowerCase() === username.toLowerCase());

      if (alreadyExists) {
        bank.showFeedback(toast, 'Username already exists. Please use another one.', 'error');
        return;
      }

      const newUser = {
        username,
        password,
        balance: bank.APP.defaultBalance,
        accountNumber: bank.generateAccountNumber(),
        transactions: [
          {
            id: `txn-${Date.now()}`,
            date: new Date().toISOString(),
            amount: bank.APP.defaultBalance,
            type: 'Credit',
            description: 'Welcome bonus',
            recipientAccount: 'Self'
          }
        ]
      };

      users.push(newUser);
      bank.saveUsers(users);
      bank.setSession({ isLoggedIn: true, username: newUser.username });
      bank.showFeedback(toast, 'Account created successfully. Redirecting...', 'success');
      registerForm.reset();

      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 900);
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      bank.hideFeedback(toast);

      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value.trim();
      const users = bank.getUsers();

      const matchedUser = users.find(
        (user) => user.username === username && user.password === password
      );

      if (!matchedUser) {
        bank.showFeedback(toast, 'Invalid username or password.', 'error');
        return;
      }

      bank.setSession({ isLoggedIn: true, username: matchedUser.username });
      bank.showFeedback(toast, 'Login successful. Redirecting...', 'success');
      loginForm.reset();

      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 700);
    });
  }
});
