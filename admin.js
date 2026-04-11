document.addEventListener('DOMContentLoaded', () => {
  const bank = window.AlphaBank;
  if (!bank) return;

  const session = bank.getSession();
  if (!session || session.role !== 'admin') return;

  const adminMessage = document.getElementById('adminMessage');
  const createUserForm = document.getElementById('adminCreateUserForm');
  const usersTable = document.getElementById('adminUsersTable');
  const transactionsTable = document.getElementById('adminTransactionsTable');

  const statusBadge = (status) => `<span class="status-badge ${bank.escapeHtml(status)}">${bank.escapeHtml(status)}</span>`;

  const receiptBase = (value) => bank.getPrimaryReceiptBase(value || '');

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
              <td>${bank.formatCurrency(user.balance, user.currency)}</td>
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
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${transactions.map((transaction) => {
            const type = String(transaction.transaction_type || '').toLowerCase();
            const isPrimaryDebit = type === 'debit';
            return `
              <tr>
                <td>${bank.formatDate(transaction.created_at || transaction.date)}</td>
                <td class="receipt-text">${bank.escapeHtml(transaction.receipt || '-')}</td>
                <td>${bank.formatCurrency(transaction.amount, transaction.currency || 'USD')}</td>
                <td>${bank.escapeHtml(transaction.sender_account || '-')}</td>
                <td>${bank.escapeHtml(transaction.receiver_account || '-')}</td>
                <td>${statusBadge(transaction.status || 'pending')}</td>
                <td>
                  ${isPrimaryDebit ? `
                    <div class="action-group">
                      <button class="btn btn-primary admin-action-btn" data-receipt="${bank.escapeHtml(transaction.receipt || '')}" data-action="success">Approve</button>
                      <button class="btn btn-secondary admin-action-btn" data-receipt="${bank.escapeHtml(transaction.receipt || '')}" data-action="pending">Pending</button>
                      <button class="btn btn-secondary admin-action-btn" data-receipt="${bank.escapeHtml(transaction.receipt || '')}" data-action="disapproved">Disapprove</button>
                      <button class="btn btn-secondary admin-action-btn" data-receipt="${bank.escapeHtml(transaction.receipt || '')}" data-action="failed">Failed</button>
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

    return { reserve, users, transactions };
  };

  const createRefundIfNeeded = async (transaction) => {
    const refundReceipt = `${receiptBase(transaction.receipt)}-RF`;
    const existingRefund = await bank.fetchTransactionByReceipt(refundReceipt);
    if (existingRefund) return existingRefund;

    const sender = await bank.fetchUserByAccountNumber(transaction.sender_account);
    if (!sender) throw new Error('Sender account not found for refund.');

    const charges = bank.calculateCharges(transaction.amount || 0);
    await bank.updateUserByAccountNumber(sender.account_number, {
      balance: bank.roundMoney(Number(sender.balance || 0) + charges.totalDebit)
    });

    return bank.insertRow({
      username: sender.username || '',
      password: '',
      account_number: '',
      balance: null,
      currency: sender.currency,
      amount: charges.totalDebit,
      sender_account: bank.APP.reserveAccountNumber,
      receiver_account: sender.account_number,
      transaction_type: 'credit',
      status: 'success',
      receipt: refundReceipt
    });
  };

  const applyApprovalCredit = async (transaction, creditReceipt, existingCredit) => {
    const receiver = await bank.fetchUserByAccountNumber(transaction.receiver_account);
    if (!receiver) throw new Error('Receiver account not found.');

    const reserve = await bank.ensureBankReserve();
    const charges = bank.calculateCharges(transaction.amount || 0);
    const reserveBalance = bank.roundMoney(Number(reserve.balance || 0) - charges.totalDebit);

    await bank.updateUserByAccountNumber(reserve.account_number, {
      balance: reserveBalance
    });

    await bank.updateUserByAccountNumber(receiver.account_number, {
      balance: bank.roundMoney(Number(receiver.balance || 0) + Number(transaction.amount || 0))
    });

    if (existingCredit) {
      await bank.updateTransactionByReceipt(creditReceipt, { status: 'success' });
      return;
    }

    await bank.insertRow({
      username: receiver.username || '',
      password: '',
      account_number: '',
      balance: null,
      currency: receiver.currency,
      amount: bank.roundMoney(transaction.amount || 0),
      sender_account: transaction.sender_account,
      receiver_account: receiver.account_number,
      transaction_type: 'credit',
      status: 'success',
      receipt: creditReceipt
    });
  };

  const reverseApprovalIfNeeded = async (transaction, nextStatus) => {
    const creditReceipt = `${receiptBase(transaction.receipt)}-CR`;
    const existingCredit = await bank.fetchTransactionByReceipt(creditReceipt);

    if (!existingCredit || String(existingCredit.status || '').toLowerCase() !== 'success') {
      return;
    }

    const receiver = await bank.fetchUserByAccountNumber(transaction.receiver_account);
    const reserve = await bank.ensureBankReserve();
    const charges = bank.calculateCharges(transaction.amount || 0);

    if (receiver) {
      await bank.updateUserByAccountNumber(receiver.account_number, {
        balance: bank.roundMoney(Number(receiver.balance || 0) - Number(transaction.amount || 0))
      });
    }

    await bank.updateUserByAccountNumber(reserve.account_number, {
      balance: bank.roundMoney(Number(reserve.balance || 0) + charges.totalDebit)
    });

    await bank.updateTransactionByReceipt(creditReceipt, { status: nextStatus });
  };

  const approveTransaction = async (transaction) => {
    const creditReceipt = `${receiptBase(transaction.receipt)}-CR`;
    const refundReceipt = `${receiptBase(transaction.receipt)}-RF`;
    const existingCredit = await bank.fetchTransactionByReceipt(creditReceipt);
    const existingRefund = await bank.fetchTransactionByReceipt(refundReceipt);

    if (existingRefund) {
      throw new Error('Refunded transactions cannot be approved again.');
    }

    await bank.updateTransactionByReceipt(transaction.receipt, { status: 'success' });

    if (existingCredit && String(existingCredit.status || '').toLowerCase() === 'success') {
      return;
    }

    await applyApprovalCredit(transaction, creditReceipt, existingCredit);
  };

  const changeTransactionStatus = async (receipt, nextStatus) => {
    const transaction = await bank.fetchTransactionByReceipt(receipt);
    if (!transaction) {
      throw new Error('Transaction not found.');
    }

    if (String(transaction.transaction_type || '').toLowerCase() !== 'debit') {
      throw new Error('Only primary debit transactions can be managed here.');
    }

    if (nextStatus === 'success') {
      await approveTransaction(transaction);
      return;
    }

    await bank.updateTransactionByReceipt(receipt, { status: nextStatus });
    await reverseApprovalIfNeeded(transaction, nextStatus);

    if (nextStatus === 'failed' || nextStatus === 'disapproved') {
      await createRefundIfNeeded(transaction);
    }
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
        bank.showFeedback(adminMessage, 'Transaction updated successfully.', 'success');
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
