document.addEventListener('DOMContentLoaded', () => {
  const bank = window.AlphaBank;
  if (!bank) return;

  const session = bank.getSession();
  const isStrictAdmin = localStorage.getItem('admin') === 'true'
    && session
    && session.role === 'admin'
    && session.username === 'alpha@gmail.com';

  if (!isStrictAdmin) {
    localStorage.removeItem('admin');
    window.location.href = 'index.html';
    return;
  }

  const adminMessage = document.getElementById('adminMessage');
  const createUserForm = document.getElementById('adminCreateUserForm');
  const addBalanceForm = document.getElementById('adminAddBalanceForm');
  const usersTable = document.getElementById('adminUsersTable');
  const transactionsTable = document.getElementById('adminTransactionsTable');
  const userAccountOptions = document.getElementById('adminUserAccountOptions');

  const statusBadge = (status) => `<span class="status-badge ${bank.escapeHtml(status)}">${bank.escapeHtml(status)}</span>`;

  const populateUserOptions = (users) => {
    if (!userAccountOptions) return;
    userAccountOptions.innerHTML = users.map((user) => `<option value="${bank.escapeHtml(user.account_number || '')}" label="${bank.escapeHtml(`${user.user_name || 'Customer'} • ${user.email || 'No email'}`)}"></option>`).join('');
  };

  const renderUsers = (users) => {
    if (!usersTable) return;

    if (!users.length) {
      usersTable.innerHTML = '<div class="empty-state">No customer accounts created yet.</div>';
      return;
    }

    usersTable.innerHTML = `
      <table class="transactions-table">
        <thead>
          <tr>
            <th>Full Name</th>
            <th>Account Number</th>
            <th>Balance</th>
            <th>Email</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${users.map((user) => {
            const flagReason = String(user.history || user.flagMessage || '').trim();
            const isFlagged = Boolean(flagReason);
            return `
              <tr>
                <td data-label="Full Name">${bank.escapeHtml(user.user_name || '-')}</td>
                <td data-label="Account Number" class="receipt-text">${bank.escapeHtml(user.account_number || '-')}</td>
                <td data-label="Balance">${bank.formatCurrency(user.balance, user.currency || 'USD')}</td>
                <td data-label="Email">${bank.escapeHtml(user.email || '-')}</td>
                <td data-label="Status">
                  ${statusBadge(isFlagged ? 'disapproved' : 'success')}
                  <div class="muted-small" style="margin-top:8px;">${bank.escapeHtml(isFlagged ? flagReason : 'Active')}</div>
                </td>
                <td data-label="Actions">
                  <div class="action-group">
                    <button class="btn btn-secondary admin-user-action-btn" data-account="${bank.escapeHtml(user.account_number || '')}" data-action="flag">Flag Transaction</button>
                    <button class="btn btn-secondary admin-user-action-btn" data-account="${bank.escapeHtml(user.account_number || '')}" data-action="unflag">Unflag Transaction</button>
                    <button class="btn btn-primary admin-user-action-btn" data-account="${bank.escapeHtml(user.account_number || '')}" data-action="add-funds">Add Funds</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  };

  const renderTransactions = async (transactions, users) => {
    if (!transactionsTable) return;

    if (!transactions.length) {
      transactionsTable.innerHTML = '<div class="empty-state">No transactions available.</div>';
      return;
    }

    const userMap = new Map(users.map((user) => [String(user.account_number || ''), user]));

    transactionsTable.innerHTML = `
      <table class="transactions-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Receipt</th>
            <th>Amount</th>
            <th>Sender</th>
            <th>Receiver</th>
            <th>Type</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${transactions.map((transaction) => {
            const type = String(transaction.transaction_type || '').toLowerCase();
            const senderUser = userMap.get(String(transaction.sender_account || ''));
            const receiverUser = userMap.get(String(transaction.receiver_account || ''));
            const senderLabel = senderUser ? `${senderUser.user_name} (${transaction.sender_account})` : (transaction.sender_account || '-');
            const receiverLabel = receiverUser ? `${receiverUser.user_name} (${transaction.receiver_account})` : (transaction.receiver_account || '-');
            const isDebit = type === 'debit';
            const canManage = isDebit && senderUser && receiverUser;
            return `
              <tr>
                <td data-label="Date">${bank.formatDate(transaction.created_at)}</td>
                <td data-label="Receipt" class="receipt-text">${bank.escapeHtml(transaction.receipt || '-')}</td>
                <td data-label="Amount">${bank.formatCurrency(transaction.amount, transaction.currency || 'USD')}</td>
                <td data-label="Sender">${bank.escapeHtml(senderLabel)}</td>
                <td data-label="Receiver">${bank.escapeHtml(receiverLabel)}</td>
                <td data-label="Type">${bank.escapeHtml(type || '-')}</td>
                <td data-label="Status">
                  ${statusBadge(transaction.status || 'success')}
                  ${transaction.adminMessage ? `<div class="muted-small" style="margin-top:8px;">${bank.escapeHtml(transaction.adminMessage)}</div>` : ''}
                </td>
                <td data-label="Actions">
                  ${canManage ? `
                    <div class="action-group">
                      <button class="btn btn-primary admin-action-btn" data-receipt="${bank.escapeHtml(transaction.receipt || '')}" data-action="success">Approve</button>
                      <button class="btn btn-secondary admin-action-btn" data-receipt="${bank.escapeHtml(transaction.receipt || '')}" data-action="pending">Pending</button>
                      <button class="btn btn-secondary admin-action-btn" data-receipt="${bank.escapeHtml(transaction.receipt || '')}" data-action="failed">Failed</button>
                      <button class="btn btn-secondary admin-action-btn" data-receipt="${bank.escapeHtml(transaction.receipt || '')}" data-action="disapproved">Disapprove</button>
                    </div>
                  ` : '<span class="muted-small">Read only</span>'}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  };

  const loadAdminData = async () => {
    const reserve = await bank.ensureBankReserve();
    const users = await bank.fetchVisibleUsers();
    const transactions = await bank.fetchAllTransactions();

    if (bank.animateCurrency) {
      bank.animateCurrency('#bankReserveBalance', reserve.balance, reserve.currency || 'USD');
    } else {
      bank.setText('#bankReserveBalance', bank.formatCurrency(reserve.balance, reserve.currency || 'USD'));
    }
    if (bank.animateCount) {
      bank.animateCount('#adminUserCount', users.length);
      bank.animateCount('#adminTransactionCount', transactions.filter((txn) => String(txn.transaction_type || '').toLowerCase() === 'debit').length);
    } else {
      bank.setText('#adminUserCount', String(users.length));
      bank.setText('#adminTransactionCount', String(transactions.filter((txn) => String(txn.transaction_type || '').toLowerCase() === 'debit').length));
    }

    renderUsers(users);
    populateUserOptions(users);
    await renderTransactions(transactions, users);

    return { users, transactions };
  };

  const senderFundsHeld = (status) => ['success', 'pending'].includes(String(status || '').toLowerCase());
  const receiverGetsFunds = (status) => String(status || '').toLowerCase() === 'success';

  const setUserFlag = async (accountNumber, reason) => {
    return bank.updateUserByAccountNumber(accountNumber, {
      history: String(reason || '').trim(),
      flagged: Boolean(String(reason || '').trim())
    });
  };

  const creditUserBalance = async (user, amount) => {
    const cleanAmount = bank.roundMoney(amount);
    if (cleanAmount <= 0) throw new Error('Enter a valid balance amount.');

    await bank.updateUserByAccountNumber(user.account_number, {
      balance: bank.roundMoney(Number(user.balance || 0) + cleanAmount)
    });

    await bank.insertTransaction({
      user_name: user.user_name || '',
      amount: cleanAmount,
      sender_account: 'BANK',
      receiver_account: user.account_number,
      transaction_type: 'credit',
      status: 'success',
      currency: user.currency || 'USD',
      tax: 0,
      fee: 0,
      totalCharges: 0,
      netAmount: cleanAmount,
      receipt: `TOPUP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
    });
  };

  const changeTransactionStatus = async (receipt, nextStatus, adminStatusMessage = '') => {
    const debitTransaction = await bank.fetchTransactionByReceipt(receipt);
    if (!debitTransaction) throw new Error('Transaction not found.');
    if (String(debitTransaction.transaction_type || '').toLowerCase() !== 'debit') {
      throw new Error('Only debit transactions can be updated.');
    }

    const sender = await bank.fetchUserByAccountNumber(debitTransaction.sender_account);
    const receiver = await bank.fetchUserByAccountNumber(debitTransaction.receiver_account);
    if (!sender || !receiver) throw new Error('Associated user account could not be found.');

    const currentStatus = String(debitTransaction.status || 'success').toLowerCase();
    const targetStatus = String(nextStatus || 'success').toLowerCase();
    const charges = bank.calculateCharges(debitTransaction.amount || 0);

    let senderBalance = Number(sender.balance || 0);
    let receiverBalance = Number(receiver.balance || 0);

    if (!senderFundsHeld(currentStatus) && senderFundsHeld(targetStatus)) {
      senderBalance -= charges.amount;
    }
    if (senderFundsHeld(currentStatus) && !senderFundsHeld(targetStatus)) {
      senderBalance += charges.amount;
    }

    if (!receiverGetsFunds(currentStatus) && receiverGetsFunds(targetStatus)) {
      receiverBalance += charges.netAmount;
    }
    if (receiverGetsFunds(currentStatus) && !receiverGetsFunds(targetStatus)) {
      receiverBalance -= charges.netAmount;
    }

    await bank.updateUserByAccountNumber(sender.account_number, { balance: bank.roundMoney(senderBalance) });
    await bank.updateUserByAccountNumber(receiver.account_number, { balance: bank.roundMoney(receiverBalance) });

    await bank.updateTransactionByReceipt(receipt, {
      status: targetStatus,
      currency: debitTransaction.currency,
      tax: charges.tax,
      fee: charges.fee,
      totalCharges: charges.totalCharges,
      netAmount: charges.netAmount,
      adminMessage: adminStatusMessage
    });

    const mirrorReceipt = bank.getCreditReceipt(receipt);
    const mirrorTransaction = await bank.fetchTransactionByReceipt(mirrorReceipt);

    if (mirrorTransaction) {
      await bank.updateTransactionByReceipt(mirrorReceipt, {
        status: targetStatus,
        currency: mirrorTransaction.currency || receiver.currency,
        tax: charges.tax,
        fee: charges.fee,
        totalCharges: charges.totalCharges,
        netAmount: charges.netAmount,
        adminMessage: adminStatusMessage
      });
    } else {
      await bank.insertTransaction({
        user_name: receiver.user_name || '',
        amount: charges.amount,
        sender_account: sender.account_number,
        receiver_account: receiver.account_number,
        transaction_type: 'credit',
        status: targetStatus,
        currency: receiver.currency || debitTransaction.currency || 'USD',
        tax: charges.tax,
        fee: charges.fee,
        totalCharges: charges.totalCharges,
        netAmount: charges.netAmount,
        adminMessage: adminStatusMessage,
        receipt: mirrorReceipt
      });
    }
  };

  if (createUserForm) {
    createUserForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      bank.hideFeedback(adminMessage);

      const fullName = document.getElementById('adminFullName').value.trim();
      const email = document.getElementById('adminEmail').value.trim();
      const phone = document.getElementById('adminPhone').value.trim();
      const password = document.getElementById('adminPassword').value.trim();
      const confirmPassword = document.getElementById('adminConfirmPassword').value.trim();
      const region = document.getElementById('adminRegion').value;
      const currency = document.getElementById('adminCurrency').value;
      const initialBalance = Number(document.getElementById('adminInitialBalance').value);
      const submitButton = createUserForm.querySelector('button[type="submit"]');

      if (!fullName || !email || !phone || !password || !confirmPassword || !region || !currency) {
        bank.showFeedback(adminMessage, 'Please complete all customer fields.', 'error');
        return;
      }

      if (password !== confirmPassword) {
        bank.showFeedback(adminMessage, 'Passwords do not match.', 'error');
        return;
      }

      if (Number.isNaN(initialBalance) || initialBalance < 0) {
        bank.showFeedback(adminMessage, 'Enter a valid opening balance.', 'error');
        return;
      }

      try {
        if (submitButton) submitButton.disabled = true;
        const users = await bank.fetchVisibleUsers();
        const emailExists = users.some((user) => String(user.email || '').toLowerCase() === email.toLowerCase());
        if (emailExists) {
          bank.showFeedback(adminMessage, 'Email already exists.', 'error');
          return;
        }

        const accountNumber = await bank.generateAccountNumber(region);
        await bank.insertUser({
          fullName,
          email,
          phone,
          password,
          account_number: accountNumber,
          balance: bank.roundMoney(initialBalance),
          currency,
          region
        });

        bank.showFeedback(adminMessage, `Customer account created. Account Number: ${accountNumber}`, 'success');
        createUserForm.reset();
        await loadAdminData();
      } catch (error) {
        console.error('[AlphaBank] create user error', error);
        bank.showFeedback(adminMessage, bank.getFriendlyError(error, 'Unable to create customer account.'), 'error');
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  if (addBalanceForm) {
    addBalanceForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      bank.hideFeedback(adminMessage);

      const accountNumber = document.getElementById('adminBalanceAccountNumber').value.trim();
      const amount = Number(document.getElementById('adminBalanceAmount').value);
      const submitButton = addBalanceForm.querySelector('button[type="submit"]');

      if (!bank.isValidAccountNumberFormat(accountNumber)) {
        bank.showFeedback(adminMessage, 'Enter a valid account number.', 'error');
        return;
      }

      if (Number.isNaN(amount) || amount <= 0) {
        bank.showFeedback(adminMessage, 'Enter a valid balance amount.', 'error');
        return;
      }

      try {
        if (submitButton) submitButton.disabled = true;
        const user = await bank.fetchUserByAccountNumber(accountNumber);
        if (!user) {
          bank.showFeedback(adminMessage, 'User account not found.', 'error');
          return;
        }

        await creditUserBalance(user, amount);

        bank.showFeedback(adminMessage, 'Balance updated successfully.', 'success');
        addBalanceForm.reset();
        await loadAdminData();
      } catch (error) {
        console.error('[AlphaBank] add balance error', error);
        bank.showFeedback(adminMessage, bank.getFriendlyError(error, 'Unable to update balance.'), 'error');
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  if (usersTable) {
    usersTable.addEventListener('click', async (event) => {
      const button = event.target.closest('.admin-user-action-btn');
      if (!button) return;

      const accountNumber = String(button.dataset.account || '').trim();
      const action = String(button.dataset.action || '').trim();
      if (!accountNumber || !action) return;

      try {
        button.disabled = true;
        bank.hideFeedback(adminMessage);
        const user = await bank.fetchUserByAccountNumber(accountNumber);
        if (!user) {
          bank.showFeedback(adminMessage, 'User account not found.', 'error');
          return;
        }

        if (action === 'flag') {
          const reason = window.prompt('Enter flag reason', String(user.history || '').trim()) || '';
          if (!reason.trim()) {
            bank.showFeedback(adminMessage, 'Flag reason is required.', 'error');
            return;
          }
          await setUserFlag(accountNumber, reason);
          bank.showFeedback(adminMessage, 'Transaction flag updated successfully.', 'success');
        } else if (action === 'unflag') {
          await setUserFlag(accountNumber, '');
          bank.showFeedback(adminMessage, 'Transaction restriction removed successfully.', 'success');
        } else if (action === 'add-funds') {
          const amountInput = window.prompt('Enter amount to add');
          const amount = Number(amountInput);
          if (!amountInput || Number.isNaN(amount) || amount <= 0) {
            bank.showFeedback(adminMessage, 'Enter a valid balance amount.', 'error');
            return;
          }
          await creditUserBalance(user, amount);
          bank.showFeedback(adminMessage, 'Balance updated successfully.', 'success');
        }

        await loadAdminData();
      } catch (error) {
        console.error('[AlphaBank] user action error', error);
        bank.showFeedback(adminMessage, bank.getFriendlyError(error, 'Unable to update customer account.'), 'error');
      } finally {
        button.disabled = false;
      }
    });
  }

  if (transactionsTable) {
    transactionsTable.addEventListener('click', async (event) => {
      const button = event.target.closest('.admin-action-btn');
      if (!button) return;

      const receipt = button.dataset.receipt;
      const action = button.dataset.action;
      if (!receipt || !action) return;

      try {
        button.disabled = true;
        bank.hideFeedback(adminMessage);
        let adminStatusMessage = '';
        if (action === 'disapproved') {
          adminStatusMessage = window.prompt('Enter disapproval message') || '';
          if (!adminStatusMessage.trim()) {
            bank.showFeedback(adminMessage, 'Disapproval message is required.', 'error');
            return;
          }
        }
        await changeTransactionStatus(receipt, action, adminStatusMessage.trim());
        bank.showFeedback(adminMessage, bank.getNotificationMessage(action), action === 'failed' || action === 'disapproved' ? 'error' : 'success');
        await loadAdminData();
      } catch (error) {
        console.error('[AlphaBank] transaction update error', error);
        bank.showFeedback(adminMessage, bank.getFriendlyError(error, 'Unable to update transaction.'), 'error');
      } finally {
        button.disabled = false;
      }
    });
  }

  loadAdminData().catch((error) => {
    console.error('[AlphaBank] admin dashboard load error', error);
    bank.showFeedback(adminMessage, bank.getFriendlyError(error, 'Unable to load admin dashboard.'), 'error');
  });
});
