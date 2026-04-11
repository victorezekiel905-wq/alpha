document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('admin') !== 'true') {
    window.location.href = 'index.html';
    return;
  }

  const bank = window.AlphaBank;
  if (!bank) return;

  const session = bank.getSession();
  if (!session || session.role !== 'admin') {
    bank.setSession({
      isLoggedIn: true,
      role: 'admin',
      username: 'alpha@gmail.com'
    });
  }

  const adminMessage = document.getElementById('adminMessage');
  const createUserForm = document.getElementById('adminCreateUserForm');
  const addBalanceForm = document.getElementById('adminAddBalanceForm');
  const usersTable = document.getElementById('adminUsersTable');
  const transactionsTable = document.getElementById('adminTransactionsTable');

  const statusBadge = (status) => `<span class="status-badge ${bank.escapeHtml(status)}">${bank.escapeHtml(status)}</span>`;

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
            <th>Email</th>
            <th>Phone</th>
            <th>Account Number</th>
            <th>Region</th>
            <th>Currency</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          ${users.map((user) => `
            <tr>
              <td>${bank.escapeHtml(user.user_name || '-')}</td>
              <td>${bank.escapeHtml(user.email || '-')}</td>
              <td>${bank.escapeHtml(user.phone || '-')}</td>
              <td class="receipt-text">${bank.escapeHtml(user.account_number || '-')}</td>
              <td>${bank.escapeHtml(user.region || '-')}</td>
              <td>${bank.escapeHtml(user.currency || 'USD')}</td>
              <td>${bank.formatCurrency(user.balance, user.currency || 'USD')}</td>
            </tr>
          `).join('')}
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
            return `
              <tr>
                <td>${bank.formatDate(transaction.created_at)}</td>
                <td class="receipt-text">${bank.escapeHtml(transaction.receipt || '-')}</td>
                <td>${bank.formatCurrency(transaction.amount, transaction.currency || 'USD')}</td>
                <td>${bank.escapeHtml(senderLabel)}</td>
                <td>${bank.escapeHtml(receiverLabel)}</td>
                <td>${bank.escapeHtml(type || '-')}</td>
                <td>${statusBadge(transaction.status || 'success')}</td>
                <td>
                  ${isDebit ? `
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

    bank.setText('#bankReserveBalance', bank.formatCurrency(reserve.balance, reserve.currency || 'USD'));
    bank.setText('#adminUserCount', String(users.length));
    bank.setText('#adminTransactionCount', String(transactions.filter((txn) => String(txn.transaction_type || '').toLowerCase() === 'debit').length));

    renderUsers(users);
    await renderTransactions(transactions, users);

    return { users, transactions };
  };

  const senderFundsHeld = (status) => ['success', 'pending'].includes(String(status || '').toLowerCase());
  const receiverGetsFunds = (status) => String(status || '').toLowerCase() === 'success';

  const changeTransactionStatus = async (receipt, nextStatus) => {
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
      netAmount: charges.netAmount
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
        netAmount: charges.netAmount
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

        await bank.updateUserByAccountNumber(accountNumber, {
          balance: bank.roundMoney(Number(user.balance || 0) + amount)
        });

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
        await changeTransactionStatus(receipt, action);
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
