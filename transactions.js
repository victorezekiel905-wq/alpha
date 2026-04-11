document.addEventListener('DOMContentLoaded', () => {
  const bank = window.AlphaBank;
  if (!bank) return;

  const session = bank.getSession();
  if (!session || session.role !== 'customer') return;

  const transferForm = document.getElementById('transferForm');
  const messageBox = document.getElementById('transferMessage');
  const isTransferPage = Boolean(transferForm);
  let refreshTimer = null;

  const transactionDirection = (transaction, currentAccountNumber) => {
    const type = String(transaction.transaction_type || '').toLowerCase();
    const sender = String(transaction.sender_account || '');
    const receiver = String(transaction.receiver_account || '');
    const account = String(currentAccountNumber || '');

    if (type === 'debit' && sender === account) {
      return {
        label: 'Debit',
        typeClass: 'type-debit',
        amountClass: 'amount-debit',
        prefix: '-'
      };
    }

    if (type === 'credit' && receiver === account) {
      return {
        label: 'Credit',
        typeClass: 'type-credit',
        amountClass: 'amount-credit',
        prefix: '+'
      };
    }

    return {
      label: sender === account ? 'Debit' : 'Credit',
      typeClass: sender === account ? 'type-debit' : 'type-credit',
      amountClass: sender === account ? 'amount-debit' : 'amount-credit',
      prefix: sender === account ? '-' : '+'
    };
  };

  const statusBadge = (status) => `<span class="status-badge ${bank.escapeHtml(status)}">${bank.escapeHtml(status)}</span>`;

  const renderDashboard = (user, transactions) => {
    const recentTransactions = transactions.slice(0, 5);
    const totalCreditsValue = transactions
      .filter((txn) => transactionDirection(txn, user.account_number).label === 'Credit')
      .reduce((sum, txn) => sum + Number(txn.amount || 0), 0);

    const totalDebitsValue = transactions
      .filter((txn) => transactionDirection(txn, user.account_number).label === 'Debit')
      .reduce((sum, txn) => sum + Number(txn.amount || 0), 0);

    bank.setText('[data-user-name]', user.username || 'Customer');
    bank.setText('#dashboardAccountNumber', user.account_number);
    bank.setText('#dashboardBalance', bank.formatCurrency(user.balance, user.currency));
    bank.setText('#miniBalance', bank.formatCurrency(user.balance, user.currency));
    bank.setText('#totalCredits', bank.formatCurrency(totalCreditsValue, user.currency));
    bank.setText('#totalDebits', bank.formatCurrency(totalDebitsValue, user.currency));

    const recentContainer = document.getElementById('recentTransactions');
    if (!recentContainer) return;

    if (!recentTransactions.length) {
      recentContainer.innerHTML = '<div class="empty-state">No transactions yet.</div>';
      return;
    }

    recentContainer.innerHTML = recentTransactions.map((txn) => {
      const displayStatus = bank.getDisplayStatus(txn);
      const direction = transactionDirection(txn, user.account_number);
      const title = direction.label === 'Debit' ? 'Transfer Sent' : 'Transfer Received';

      return `
        <div class="transaction-item">
          <div class="transaction-meta">
            <div class="transaction-avatar">${direction.label === 'Debit' ? '⬆' : '⬇'}</div>
            <div>
              <strong>${title}</strong>
              <p class="muted">${bank.formatDate(txn.created_at || txn.date)}</p>
              <p class="muted-small">${bank.escapeHtml(txn.sender_account || '-')} → ${bank.escapeHtml(txn.receiver_account || '-')}</p>
            </div>
          </div>
          <div style="text-align:right;">
            <span class="transaction-type ${direction.typeClass}">${direction.label}</span>
            <div style="margin-top:8px;">${statusBadge(displayStatus)}</div>
            <p class="${direction.amountClass}" style="margin-top:8px;font-weight:700;">${direction.prefix}${bank.formatCurrency(txn.amount, user.currency)}</p>
          </div>
        </div>
      `;
    }).join('');
  };

  const renderTransactionsTable = (user, transactions) => {
    const wrapper = document.getElementById('transactionsTableWrapper');
    if (!wrapper) return;

    if (!transactions.length) {
      wrapper.innerHTML = '<div class="empty-state">No transaction records available.</div>';
      return;
    }

    wrapper.innerHTML = `
      <table class="transactions-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Receipt</th>
            <th>Sender</th>
            <th>Receiver</th>
            <th>Type</th>
            <th>Status</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${transactions.map((txn) => {
            const displayStatus = bank.getDisplayStatus(txn);
            const direction = transactionDirection(txn, user.account_number);
            return `
              <tr>
                <td>${bank.formatDate(txn.created_at || txn.date)}</td>
                <td class="receipt-text">${bank.escapeHtml(txn.receipt || '-')}</td>
                <td>${bank.escapeHtml(txn.sender_account || '-')}</td>
                <td>${bank.escapeHtml(txn.receiver_account || '-')}</td>
                <td><span class="transaction-type ${direction.typeClass}">${direction.label}</span></td>
                <td>${statusBadge(displayStatus)}</td>
                <td class="${direction.amountClass}">${direction.prefix}${bank.formatCurrency(txn.amount, user.currency)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  };

  const renderProfile = (user, transactions) => {
    bank.setText('#profileUsername', user.username || '-');
    bank.setText('#profileAccountNumber', user.account_number || '-');
    bank.setText('#profileBalance', bank.formatCurrency(user.balance, user.currency));
    bank.setText('#profileTransactionCount', String(transactions.length));
    bank.setText('#profileCurrency', user.currency || 'USD');
  };

  const updateTransferBalance = (user) => {
    const balanceElement = document.getElementById('transferAvailableBalance');
    if (balanceElement) {
      balanceElement.textContent = bank.formatCurrency(user.balance, user.currency);
    }
  };

  const loadPageData = async () => {
    const freshUser = await bank.fetchCurrentUser();
    if (!freshUser) {
      bank.clearSession();
      window.location.replace('index.html');
      return null;
    }

    const rawTransactions = await bank.fetchTransactionsForAccount(freshUser.account_number);
    const userTransactions = bank.getPrimaryTransactionsForCustomer(rawTransactions, freshUser.account_number);

    renderDashboard(freshUser, userTransactions);
    renderTransactionsTable(freshUser, userTransactions);
    renderProfile(freshUser, userTransactions);
    updateTransferBalance(freshUser);
    return { freshUser, userTransactions, rawTransactions };
  };

  if (isTransferPage) {
    transferForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      bank.hideFeedback(messageBox);

      const recipientAccount = document.getElementById('recipientAccount').value.trim();
      const amountInput = document.getElementById('transferAmount');
      const amount = Number(amountInput.value);
      const submitButton = transferForm.querySelector('button[type="submit"]');

      if (!recipientAccount || !amountInput.value.trim()) {
        bank.showFeedback(messageBox, 'Please fill in all transfer fields.', 'error');
        return;
      }

      if (!/^\d{10}$/.test(recipientAccount)) {
        bank.showFeedback(messageBox, 'Recipient account number must be 10 digits.', 'error');
        return;
      }

      if (Number.isNaN(amount) || amount <= 0) {
        bank.showFeedback(messageBox, 'Enter a valid transfer amount.', 'error');
        return;
      }

      try {
        if (submitButton) submitButton.disabled = true;

        const sender = await bank.fetchCurrentUser();
        if (!sender) {
          bank.clearSession();
          window.location.replace('index.html');
          return;
        }

        if (recipientAccount === sender.account_number) {
          bank.showFeedback(messageBox, 'You cannot transfer to your own account number.', 'error');
          return;
        }

        const receiver = await bank.fetchUserByAccountNumber(recipientAccount);
        if (!receiver) {
          bank.showFeedback(messageBox, 'Recipient account not found.', 'error');
          return;
        }

        const transfer = bank.calculateCharges(amount);
        if (transfer.totalDebit > Number(sender.balance || 0)) {
          bank.showFeedback(messageBox, `Insufficient balance. Required: ${bank.formatCurrency(transfer.totalDebit, sender.currency)}.`, 'error');
          return;
        }

        const receipt = bank.generateReceipt();
        const senderBalance = bank.roundMoney(Number(sender.balance || 0) - transfer.totalDebit);
        const receiverBalance = bank.roundMoney(Number(receiver.balance || 0) + transfer.amount);

        await bank.updateUserByAccountNumber(sender.account_number, {
          balance: senderBalance
        });

        await bank.updateUserByAccountNumber(receiver.account_number, {
          balance: receiverBalance
        });

        await bank.insertRow({
          username: sender.username || '',
          password: '',
          account_number: '',
          balance: null,
          currency: sender.currency || 'USD',
          amount: transfer.amount,
          sender_account: sender.account_number,
          receiver_account: receiver.account_number,
          transaction_type: 'debit',
          status: 'success',
          receipt
        });

        await bank.insertRow({
          username: receiver.username || '',
          password: '',
          account_number: '',
          balance: null,
          currency: receiver.currency || sender.currency || 'USD',
          amount: transfer.amount,
          sender_account: sender.account_number,
          receiver_account: receiver.account_number,
          transaction_type: 'credit',
          status: 'success',
          receipt: `${receipt}-CR`
        });

        bank.showFeedback(messageBox, `Transfer successful. Receipt: ${receipt}.`, 'success');
        transferForm.reset();
        await loadPageData();

        setTimeout(() => {
          window.location.href = 'transactions.html';
        }, 1000);
      } catch (error) {
        bank.showFeedback(messageBox, bank.getFriendlyError(error, 'Transfer failed.'), 'error');
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  loadPageData()
    .then((payload) => {
      if (!payload) return;
      bank.startStatusWatcher(payload.freshUser.account_number);
      refreshTimer = window.setInterval(() => {
        loadPageData().catch((error) => console.error(error));
      }, 12000);
    })
    .catch((error) => {
      const target = messageBox || document.getElementById('transactionsTableWrapper') || document.getElementById('recentTransactions');
      if (target) {
        if (target.id === 'transactionsTableWrapper' || target.id === 'recentTransactions') {
          target.innerHTML = `<div class="empty-state">${bank.escapeHtml(bank.getFriendlyError(error, 'Unable to load account data.'))}</div>`;
        } else {
          bank.showFeedback(target, bank.getFriendlyError(error, 'Unable to load account data.'), 'error');
        }
      }
    });

  window.addEventListener('beforeunload', () => {
    if (refreshTimer) window.clearInterval(refreshTimer);
  });
});
