import { useState, useCallback, useEffect, useMemo } from 'react';
import { getFeeReceiptHtml, getFees } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/Button';
import { Printer, Download, TrendingUp, Calendar, CreditCard, Filter } from 'lucide-react';
import { formatCurrency } from '../../utils/helpers';
import { exportRowsToPdf } from '../../utils/pdfExport';

const AdminFeeAnalytics = () => {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState('');
  const [error, setError] = useState('');
  const [timeFilter, setTimeFilter] = useState('all'); // 'today', 'week', 'month', 'all'

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const feeRecords = await getFees();

      const allReceipts = feeRecords.flatMap((fee) =>
        (fee.paymentHistory || []).map((payment) => ({
          id: payment._id,
          receiptNo: payment.receiptNo || payment._id,
          studentId: fee.studentId,
          student: fee.studentName,
          class: fee.class,
          amount: payment.amount,
          dateObj: new Date(payment.date),
          date: new Date(payment.date).toISOString().split('T')[0],
          mode: String(payment.mode || '').toUpperCase(),
        }))
      );

      // Sort by date descending
      allReceipts.sort((a, b) => b.dateObj - a.dateObj);
      setReceipts(allReceipts);
    } catch (err) {
      setError(err.message || 'Unable to load receipts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  // Derived Statistics
  const stats = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Start of week (Sunday)
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    
    // Start of month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let todayTotal = 0;
    let weekTotal = 0;
    let monthTotal = 0;
    let totalAll = 0;

    receipts.forEach(r => {
      const d = r.dateObj;
      const amt = Number(r.amount) || 0;
      totalAll += amt;

      if (d >= today) {
        todayTotal += amt;
      }
      if (d >= startOfWeek) {
        weekTotal += amt;
      }
      if (d >= startOfMonth) {
        monthTotal += amt;
      }
    });

    return { todayTotal, weekTotal, monthTotal, totalAll, startOfWeek, startOfMonth, today };
  }, [receipts]);

  // Filtered List
  const filteredReceipts = useMemo(() => {
    if (timeFilter === 'all') return receipts;

    return receipts.filter(r => {
      const d = r.dateObj;
      if (timeFilter === 'today') return d >= stats.today;
      if (timeFilter === 'week') return d >= stats.startOfWeek;
      if (timeFilter === 'month') return d >= stats.startOfMonth;
      return true;
    });
  }, [receipts, timeFilter, stats]);

  const handleDownloadReceipt = async (receipt) => {
    setError('');
    setDownloadingId(receipt.id);

    try {
      const html = await getFeeReceiptHtml(receipt.studentId, receipt.id);
      const printWindow = window.open('', '_blank', 'width=1000,height=800');
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
      } else {
        alert('Please allow popups for this site to print the receipt.');
      }
    } catch (err) {
      setError(err.message || 'Unable to download receipt.');
    } finally {
      setDownloadingId('');
    }
  };

  const handleExport = () => {
    let filterTitle = 'All Time';
    if (timeFilter === 'today') filterTitle = 'Today';
    if (timeFilter === 'week') filterTitle = 'This Week';
    if (timeFilter === 'month') filterTitle = 'This Month';

    const totalExportAmount = filteredReceipts.reduce((sum, r) => sum + r.amount, 0);

    exportRowsToPdf({
      title: `Fee Analytics Report - ${filterTitle}`,
      fileName: `fee-analytics-${timeFilter}-${Date.now()}.pdf`,
      summaryLines: [
        `Period: ${filterTitle}`,
        `Total Transactions: ${filteredReceipts.length}`,
        `Total Revenue: ${formatCurrency(totalExportAmount)}`,
      ],
      columns: [
        { header: 'Receipt No', key: 'receiptText' },
        { header: 'Student', key: 'student' },
        { header: 'Class', key: 'class' },
        { header: 'Amount', key: 'amountText' },
        { header: 'Date', key: 'dateText' },
        { header: 'Payment Mode', key: 'mode' },
      ],
      rows: filteredReceipts.map((row) => ({
        ...row,
        receiptText: `#${row.receiptNo}`,
        amountText: formatCurrency(row.amount),
        dateText: row.dateObj.toLocaleDateString(),
      })),
    });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800" /></div>;

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      <PageHeader title="Fee Analytics" subtitle="Track and analyze fee collections across periods">
        <Button variant="secondary" onClick={handleExport}><Download className="w-4 h-4" /> Export Report</Button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
              <Calendar className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-slate-500">Today's Collection</p>
          </div>
          <p className="text-2xl font-bold text-slate-800">{formatCurrency(stats.todayTotal)}</p>
        </div>
        
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <TrendingUp className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-slate-500">This Week's Collection</p>
          </div>
          <p className="text-2xl font-bold text-slate-800">{formatCurrency(stats.weekTotal)}</p>
        </div>
        
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <CreditCard className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-slate-500">This Month's Collection</p>
          </div>
          <p className="text-2xl font-bold text-slate-800">{formatCurrency(stats.monthTotal)}</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
              <Filter className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-slate-500">All-Time Collection</p>
          </div>
          <p className="text-2xl font-bold text-slate-800">{formatCurrency(stats.totalAll)}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Transaction History</h3>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setTimeFilter('today')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${timeFilter === 'today' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeFilter('week')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${timeFilter === 'week' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
            >
              This Week
            </button>
            <button
              onClick={() => setTimeFilter('month')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${timeFilter === 'month' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
            >
              This Month
            </button>
            <button
              onClick={() => setTimeFilter('all')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${timeFilter === 'all' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
            >
              All Time
            </button>
          </div>
        </div>
        
        {filteredReceipts.length > 0 ? (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="table-header">Receipt No</th>
                <th className="table-header">Student</th>
                <th className="table-header">Class</th>
                <th className="table-header">Amount</th>
                <th className="table-header">Date</th>
                <th className="table-header">Payment Mode</th>
                <th className="table-header text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredReceipts.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="table-cell font-medium text-slate-800">#{r.receiptNo}</td>
                  <td className="table-cell">{r.student}</td>
                  <td className="table-cell">{r.class}</td>
                  <td className="table-cell font-medium text-emerald-600">{formatCurrency(r.amount)}</td>
                  <td className="table-cell">{r.dateObj.toLocaleDateString()}</td>
                  <td className="table-cell">
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-md uppercase">
                      {r.mode}
                    </span>
                  </td>
                  <td className="table-cell text-center">
                    <button
                      className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors inline-flex items-center justify-center disabled:opacity-50"
                      title="Print Receipt"
                      onClick={() => handleDownloadReceipt(r)}
                      disabled={downloadingId === r.id}
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-slate-500">
            No transactions found for the selected period.
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminFeeAnalytics;
