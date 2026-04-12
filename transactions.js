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
      return { label: 'Debit', typeClass: 'type-debit', amountClass: 'amount-debit', prefix: '-' };
    }

    if (type === 'credit' && receiver === account) {
      return { label: 'Credit', typeClass: 'type-credit', amountClass: 'amount-credit', prefix: '+' };
    }

    return sender === account
      ? { label: 'Debit', typeClass: 'type-debit', amountClass: 'amount-debit', prefix: '-' }
      : { label: 'Credit', typeClass: 'type-credit', amountClass: 'amount-credit', prefix: '+' };
  };

  const statusBadge = (status) => `<span class="status-badge ${bank.escapeHtml(status)}">${bank.escapeHtml(status)}</span>`;

  const renderDashboard = (user, transactions) => {
    const recentTransactions = transactions.slice(0, 5);
    const totalCreditsValue = transactions
      .filter((txn) => transactionDirection(txn, user.account_number).label === 'Credit' && bank.getDisplayStatus(txn) === 'success')
      .reduce((sum, txn) => sum + Number(txn.netAmount || txn.amount || 0), 0);

    const totalDebitsValue = transactions
      .filter((txn) => transactionDirection(txn, user.account_number).label === 'Debit')
      .reduce((sum, txn) => sum + Number(txn.amount || 0), 0);

    bank.setText('[data-user-name]', user.user_name || 'Customer');
    bank.setText('#dashboardAccountNumber', user.account_number);
    if (bank.animateCurrency) {
      bank.animateCurrency('#dashboardBalance', user.balance, user.currency);
      bank.animateCurrency('#dashboardBalanceCard', user.balance, user.currency);
      bank.animateCurrency('#miniBalance', user.balance, user.currency);
      bank.animateCurrency('#totalCredits', totalCreditsValue, user.currency);
      bank.animateCurrency('#totalDebits', totalDebitsValue, user.currency);
    } else {
      bank.setText('#dashboardBalance', bank.formatCurrency(user.balance, user.currency));
      bank.setText('#dashboardBalanceCard', bank.formatCurrency(user.balance, user.currency));
      bank.setText('#miniBalance', bank.formatCurrency(user.balance, user.currency));
      bank.setText('#totalCredits', bank.formatCurrency(totalCreditsValue, user.currency));
      bank.setText('#totalDebits', bank.formatCurrency(totalDebitsValue, user.currency));
    }
    bank.setText('#dashboardEmail', user.email || '-');
    bank.setText('#dashboardPhone', user.phone || '-');
    bank.setText('#dashboardRegion', user.region || '-');
    bank.setText('#dashboardCurrency', user.currency || 'USD');

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
      const valueToShow = direction.label === 'Credit' && displayStatus === 'success' ? txn.netAmount : txn.amount;

      return `
        <div class="transaction-item">
          <div class="transaction-meta">
            <div class="transaction-avatar">${direction.label === 'Debit' ? '⬆' : '⬇'}</div>
            <div>
              <strong>${title}</strong>
              <p class="muted">${bank.formatDate(txn.created_at)}</p>
              <p class="muted-small">${bank.escapeHtml(txn.sender_account || '-')} → ${bank.escapeHtml(txn.receiver_account || '-')}</p>
            </div>
          </div>
          <div style="text-align:right;">
            <span class="transaction-type ${direction.typeClass}">${direction.label}</span>
            <div style="margin-top:8px;">${statusBadge(displayStatus)}</div>
            <p class="${direction.amountClass}" style="margin-top:8px;font-weight:700;">${direction.prefix}${bank.formatCurrency(valueToShow, txn.currency || user.currency)}</p>
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
            const valueToShow = direction.label === 'Credit' && displayStatus === 'success' ? txn.netAmount : txn.amount;
            return `
              <tr>
                <td data-label="Date">${bank.formatDate(txn.created_at)}</td>
                <td data-label="Receipt" class="receipt-text">${bank.escapeHtml(txn.receipt || '-')}</td>
                <td data-label="Sender">${bank.escapeHtml(txn.sender_account || '-')}</td>
                <td data-label="Receiver">${bank.escapeHtml(txn.receiver_account || '-')}</td>
                <td data-label="Type"><span class="transaction-type ${direction.typeClass}">${direction.label}</span></td>
                <td data-label="Status">${statusBadge(displayStatus)}</td>
                <td data-label="Amount" class="${direction.amountClass}">${direction.prefix}${bank.formatCurrency(valueToShow, txn.currency || user.currency)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  };

  const renderProfile = (user, transactions) => {
    bank.setText('#profileFullName', user.user_name || '-');
    bank.setText('#profileAccountNumber', user.account_number || '-');
    bank.setText('#profileEmail', user.email || '-');
    bank.setText('#profilePhone', user.phone || '-');
    bank.setText('#profileRegion', user.region || '-');
    if (bank.animateCurrency) {
      bank.animateCurrency('#profileBalance', user.balance, user.currency);
    } else {
      bank.setText('#profileBalance', bank.formatCurrency(user.balance, user.currency));
    }
    if (bank.animateCount) {
      bank.animateCount('#profileTransactionCount', transactions.length);
    } else {
      bank.setText('#profileTransactionCount', String(transactions.length));
    }
    bank.setText('#profileCurrency', user.currency || 'USD');
  };

  const updateTransferBalance = (user) => {
    const balanceElement = document.getElementById('transferAvailableBalance');
    if (balanceElement) {
      if (bank.animateCurrency) {
        bank.animateCurrency(balanceElement, user.balance, user.currency);
      } else {
        balanceElement.textContent = bank.formatCurrency(user.balance, user.currency);
      }
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

      if (!bank.isValidAccountNumberFormat(recipientAccount)) {
        bank.showFeedback(messageBox, 'Enter a valid recipient account number.', 'error');
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
        const receiverBalance = bank.roundMoney(Number(receiver.balance || 0) + transfer.netAmount);

        console.log('[AlphaBank] creating transfer', { receipt, sender: sender.account_number, receiver: receiver.account_number, amount: transfer.amount });

        await bank.updateUserByAccountNumber(sender.account_number, { balance: senderBalance });
        await bank.updateUserByAccountNumber(receiver.account_number, { balance: receiverBalance });

        await bank.insertTransaction({
          user_name: sender.user_name || '',
          amount: transfer.amount,
          sender_account: sender.account_number,
          receiver_account: receiver.account_number,
          transaction_type: 'debit',
          status: 'success',
          currency: sender.currency || 'USD',
          tax: transfer.tax,
          fee: transfer.fee,
          totalCharges: transfer.totalCharges,
          netAmount: transfer.netAmount,
          receipt
        });

        await bank.insertTransaction({
          user_name: receiver.user_name || '',
          amount: transfer.amount,
          sender_account: sender.account_number,
          receiver_account: receiver.account_number,
          transaction_type: 'credit',
          status: 'success',
          currency: receiver.currency || sender.currency || 'USD',
          tax: transfer.tax,
          fee: transfer.fee,
          totalCharges: transfer.totalCharges,
          netAmount: transfer.netAmount,
          receipt: bank.getCreditReceipt(receipt)
        });

        bank.showFeedback(messageBox, `Transfer successful. Receipt: ${receipt}.`, 'success');
        transferForm.reset();
        await loadPageData();

        setTimeout(() => {
          window.location.href = 'transactions.html';
        }, 900);
      } catch (error) {
        console.error('[AlphaBank] transfer error', error);
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
        loadPageData().catch((error) => console.error('[AlphaBank] refresh error', error));
      }, 12000);
    })
    .catch((error) => {
      console.error('[AlphaBank] load page error', error);
      const target = messageBox || document.getElementById('transactionsTableWrapper') || document.getElementById('recentTransactions');
      if (!target) return;
      if (target.id === 'transactionsTableWrapper' || target.id === 'recentTransactions') {
        target.innerHTML = `<div class="empty-state">${bank.escapeHtml(bank.getFriendlyError(error, 'Unable to load account data.'))}</div>`;
      } else {
        bank.showFeedback(target, bank.getFriendlyError(error, 'Unable to load account data.'), 'error');
      }
    });

  window.addEventListener('beforeunload', () => {
    if (refreshTimer) window.clearInterval(refreshTimer);
  });
});
