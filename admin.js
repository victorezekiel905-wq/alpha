document.addEventListener('DOMContentLoaded', () => {
  const bank = window.AlphaBank;
  if (!bank) return;

  const session = bank.getSession();
  if (!session || session.role !== 'admin' || localStorage.getItem('admin') !== 'true') return;

  const adminMessage = document.getElementById('adminMessage');
  const createUserForm = document.getElementById('adminCreateUserForm');
  const usersTable = document.getElementById('adminUsersTable');
  const transactionsTable = document.getElementById('adminTransactionsTable');

  const statusBadge = (status) => `<span class="status-badge ${bank.escapeHtml(status)}">${bank.escapeHtml(status)}</span>`;
  const primaryReceipt = (value) => bank.getPrimaryReceiptBase(value || '');
  const secondaryReceipt = (value) => `${primaryReceipt(value)}-CR`;

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
            <th>Username</th>
            <th>Account Number</th>
            <th>Currency</th>
            <th>Balance</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${users.map((user) => `
            <tr>
              <td>${bank.escapeHtml(user.username || 'Pending Registration')}</td>
              <td class="receipt-text">${bank.escapeHtml(user.account_number)}</td>
              <td>${bank.escapeHtml(user.currency || 'USD')}</td>
              <td>${bank.formatCurrency(user.balance, user.currency || 'USD')}</td>
              <td>${statusBadge(user.username && user.password ? 'active' : 'pending')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  };

  const renderTransactions = (transactions) => {
    if (!transactionsTable) return;

    if (!transactions.length) {
      transactionsTable.innerHTML = '<div class="empty-state">No transactions available.</div>';
      return;
    }

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
            const isPrimaryDebit = type === 'debit' && !String(transaction.receipt || '').endsWith('-CR');
            return `
              <tr>
                <td>${bank.formatDate(transaction.created_at || transaction.date)}</td>
                <td class="receipt-text">${bank.escapeHtml(transaction.receipt || '-')}</td>
                <td>${bank.formatCurrency(transaction.amount, transaction.currency || 'USD')}</td>
                <td>${bank.escapeHtml(transaction.sender_account || '-')}</td>
                <td>${bank.escapeHtml(transaction.receiver_account || '-')}</td>
                <td>${bank.escapeHtml(type || '-')}</td>
                <td>${statusBadge(transaction.status || 'pending')}</td>
                <td>
                  ${isPrimaryDebit ? `
                    <div class="action-group">
                      <button class="btn btn-primary admin-action-btn" data-receipt="${bank.escapeHtml(transaction.receipt || '')}" data-action="success">Success</button>
                      <button class="btn btn-secondary admin-action-btn" data-receipt="${bank.escapeHtml(transaction.receipt || '')}" data-action="pending">Pending</button>
                      <button class="btn btn-secondary admin-action-btn" data-receipt="${bank.escapeHtml(transaction.receipt || '')}" data-action="failed">Failed</button>
                      <button class="btn btn-secondary admin-action-btn" data-receipt="${bank.escapeHtml(transaction.receipt || '')}" data-action="disapproved">Disapproved</button>
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
    bank.setText('#adminTransactionCount', String(transactions.length));

    renderUsers(users);
    renderTransactions(transactions);

    return { users, transactions };
  };

  const setMirroredStatus = async (creditReceipt, payload, transaction) => {
    const mirror = await bank.fetchTransactionByReceipt(creditReceipt);
    if (mirror) {
      await bank.updateTransactionByReceipt(creditReceipt, payload);
      return mirror;
    }

    if (payload.status === 'success') {
      await bank.insertRow({
        username: '',
        password: '',
        account_number: '',
        balance: null,
        currency: transaction.currency || 'USD',
        amount: bank.roundMoney(transaction.amount || 0),
        sender_account: transaction.sender_account,
        receiver_account: transaction.receiver_account,
        transaction_type: 'credit',
        status: 'success',
        receipt: creditReceipt
      });
    }

    return null;
  };

  const changeTransactionStatus = async (receipt, nextStatus) => {
    const transaction = await bank.fetchTransactionByReceipt(receipt);
    if (!transaction) throw new Error('Transaction not found.');
    if (String(transaction.transaction_type || '').toLowerCase() !== 'debit') {
      throw new Error('Only debit transactions can be updated.');
    }

    const currentStatus = String(transaction.status || 'success').toLowerCase();
    const receiver = await bank.fetchUserByAccountNumber(transaction.receiver_account);
    const sender = await bank.fetchUserByAccountNumber(transaction.sender_account);
    const amount = bank.roundMoney(transaction.amount || 0);
    const creditReceipt = secondaryReceipt(receipt);

    if (!receiver || !sender) {
      throw new Error('Associated user account could not be found.');
    }

    const wasSuccess = currentStatus === 'success';
    const willBeSuccess = nextStatus === 'success';
    const senderHadFundsHeld = currentStatus === 'success' || currentStatus === 'pending';
    const nextHoldsFunds = nextStatus === 'success' || nextStatus === 'pending';

    let senderBalance = Number(sender.balance || 0);
    let receiverBalance = Number(receiver.balance || 0);

    if (wasSuccess && !willBeSuccess) {
      receiverBalance -= amount;
    }

    if (!wasSuccess && willBeSuccess) {
      receiverBalance += amount;
    }

    if (senderHadFundsHeld && !nextHoldsFunds) {
      senderBalance += amount;
    }

    if (!senderHadFundsHeld && nextHoldsFunds) {
      senderBalance -= amount;
    }

    await bank.updateUserByAccountNumber(sender.account_number, {
      balance: bank.roundMoney(senderBalance)
    });

    await bank.updateUserByAccountNumber(receiver.account_number, {
      balance: bank.roundMoney(receiverBalance)
    });

    await bank.updateTransactionByReceipt(receipt, { status: nextStatus });
    await setMirroredStatus(creditReceipt, { status: nextStatus }, transaction);
  };

  if (createUserForm) {
    createUserForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      bank.hideFeedback(adminMessage);

      const initialBalance = Number(document.getElementById('adminInitialBalance').value);
      const currency = document.getElementById('adminCurrency').value;
      const submitButton = createUserForm.querySelector('button[type="submit"]');

      if (Number.isNaN(initialBalance) || initialBalance < 0) {
        bank.showFeedback(adminMessage, 'Enter a valid opening balance.', 'error');
        return;
      }

      try {
        if (submitButton) submitButton.disabled = true;
        const accountNumber = await bank.generateAccountNumber();

        await bank.insertRow({
          username: '',
          password: '',
          account_number: accountNumber,
          balance: bank.roundMoney(initialBalance),
          currency,
          transaction_type: null,
          status: null,
          receipt: null
        });

        bank.showFeedback(adminMessage, `Customer account created. Account Number: ${accountNumber}`, 'success');
        createUserForm.reset();
        await loadAdminData();
      } catch (error) {
        bank.showFeedback(adminMessage, bank.getFriendlyError(error, 'Unable to create customer account.'), 'error');
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
        bank.showFeedback(adminMessage, bank.getFriendlyError(error, 'Unable to update transaction.'), 'error');
      } finally {
        button.disabled = false;
      }
    });
  }

  loadAdminData().catch((error) => {
    bank.showFeedback(adminMessage, bank.getFriendlyError(error, 'Unable to load admin dashboard.'), 'error');
  });
});
