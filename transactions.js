document.addEventListener('DOMContentLoaded', () => {
  const bank = window.AlphaBank;
  if (!bank) return;

  const currentUser = bank.getCurrentUser();
  if (!currentUser) return;

  const renderDashboard = () => {
    const recentTransactions = [...(currentUser.transactions || [])]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

    const totalCreditsValue = (currentUser.transactions || [])
      .filter((txn) => txn.type === 'Credit')
      .reduce((sum, txn) => sum + Number(txn.amount), 0);

    const totalDebitsValue = (currentUser.transactions || [])
      .filter((txn) => txn.type === 'Debit')
      .reduce((sum, txn) => sum + Number(txn.amount), 0);

    bank.setText('[data-user-name]', currentUser.username);
    bank.setText('#dashboardAccountNumber', currentUser.accountNumber);
    bank.setText('#dashboardBalance', bank.formatCurrency(currentUser.balance));
    bank.setText('#miniBalance', bank.formatCurrency(currentUser.balance));
    bank.setText('#totalCredits', bank.formatCurrency(totalCreditsValue));
    bank.setText('#totalDebits', bank.formatCurrency(totalDebitsValue));

    const recentContainer = document.getElementById('recentTransactions');
    if (!recentContainer) return;

    if (!recentTransactions.length) {
      recentContainer.innerHTML = '<div class="empty-state">No transactions yet.</div>';
      return;
    }

    recentContainer.innerHTML = recentTransactions
      .map(
        (txn) => `
          <div class="transaction-item">
            <div class="transaction-meta">
              <div class="transaction-avatar">${txn.type === 'Credit' ? '⬇' : '⬆'}</div>
              <div>
                <strong>${txn.description || txn.type}</strong>
                <p class="muted">${bank.formatDate(txn.date)}</p>
              </div>
            </div>
            <div style="text-align:right;">
              <span class="transaction-type ${txn.type === 'Credit' ? 'type-credit' : 'type-debit'}">${txn.type}</span>
              <p class="${txn.type === 'Credit' ? 'amount-credit' : 'amount-debit'}" style="margin-top:8px;font-weight:700;">${txn.type === 'Credit' ? '+' : '-'}${bank.formatCurrency(txn.amount)}</p>
            </div>
          </div>
        `
      )
      .join('');
  };

  const renderTransactionsTable = () => {
    const wrapper = document.getElementById('transactionsTableWrapper');
    if (!wrapper) return;

    const transactions = [...(currentUser.transactions || [])].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    if (!transactions.length) {
      wrapper.innerHTML = '<div class="empty-state">No transaction records available.</div>';
      return;
    }

    wrapper.innerHTML = `
      <table class="transactions-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Type</th>
            <th>Recipient</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${transactions
            .map(
              (txn) => `
                <tr>
                  <td>${bank.formatDate(txn.date)}</td>
                  <td>${txn.description || txn.type}</td>
                  <td><span class="transaction-type ${txn.type === 'Credit' ? 'type-credit' : 'type-debit'}">${txn.type}</span></td>
                  <td>${txn.recipientAccount || 'Self'}</td>
                  <td class="${txn.type === 'Credit' ? 'amount-credit' : 'amount-debit'}">${txn.type === 'Credit' ? '+' : '-'}${bank.formatCurrency(txn.amount)}</td>
                </tr>
              `
            )
            .join('')}
        </tbody>
      </table>
    `;
  };

  const renderProfile = () => {
    bank.setText('#profileUsername', currentUser.username);
    bank.setText('#profileAccountNumber', currentUser.accountNumber);
    bank.setText('#profileBalance', bank.formatCurrency(currentUser.balance));
    bank.setText('#profileTransactionCount', String((currentUser.transactions || []).length));
  };

  const handleTransfer = () => {
    const transferForm = document.getElementById('transferForm');
    const balanceElement = document.getElementById('transferAvailableBalance');
    const messageBox = document.getElementById('transferMessage');

    if (balanceElement) {
      balanceElement.textContent = bank.formatCurrency(currentUser.balance);
    }

    if (!transferForm) return;

    transferForm.addEventListener('submit', (event) => {
      event.preventDefault();
      bank.hideFeedback(messageBox);

      const recipientAccountInput = document.getElementById('recipientAccount');
      const amountInput = document.getElementById('transferAmount');
      const recipientAccount = recipientAccountInput.value.trim();
      const amount = Number(amountInput.value);

      if (!recipientAccount || !amountInput.value.trim()) {
        bank.showFeedback(messageBox, 'Please fill in all transfer fields.', 'error');
        return;
      }

      if (!/^\d{10}$/.test(recipientAccount)) {
        bank.showFeedback(messageBox, 'Recipient account number must be 10 digits.', 'error');
        return;
      }

      if (recipientAccount === currentUser.accountNumber) {
        bank.showFeedback(messageBox, 'You cannot transfer to your own account number.', 'error');
        return;
      }

      if (Number.isNaN(amount) || amount <= 0) {
        bank.showFeedback(messageBox, 'Enter a valid transfer amount.', 'error');
        return;
      }

      if (amount > Number(currentUser.balance)) {
        bank.showFeedback(messageBox, 'Insufficient balance for this transfer.', 'error');
        return;
      }

      currentUser.balance = Number((Number(currentUser.balance) - amount).toFixed(2));
      currentUser.transactions = currentUser.transactions || [];
      currentUser.transactions.push({
        id: `txn-${Date.now()}`,
        date: new Date().toISOString(),
        amount,
        type: 'Debit',
        description: 'Transfer sent',
        recipientAccount
      });

      bank.updateCurrentUser(currentUser);
      bank.showFeedback(messageBox, 'Transfer successful. Redirecting to transactions...', 'success');
      transferForm.reset();
      if (balanceElement) balanceElement.textContent = bank.formatCurrency(currentUser.balance);

      setTimeout(() => {
        window.location.href = 'transactions.html';
      }, 1000);
    });
  };

  renderDashboard();
  renderTransactionsTable();
  renderProfile();
  handleTransfer();
});
