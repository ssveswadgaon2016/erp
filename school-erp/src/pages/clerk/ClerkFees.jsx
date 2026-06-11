import { useCallback, useEffect, useMemo, useState } from 'react';
import { getFees, getClasses, recordPayment, getStudents, getFeeReceiptHtml, getClassFeeByPattern } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';
import FormInput from '../../components/FormInput';
import SelectInput from '../../components/SelectInput';
import Button from '../../components/Button';
import { Plus, Printer, History } from 'lucide-react';
import { formatCurrency } from '../../utils/helpers';


const ClerkFees = () => {
  const [fees, setFees] = useState([]);
  const [classOptions, setClassOptions] = useState([]);
  const [selectedClass, setSelectedClass] = useState('All Classes');
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedHistoryRow, setSelectedHistoryRow] = useState(null);
  
  const defaultBreakdown = {
    admission: '', bdf: '', tuition: '', exam: '', computer: '', sport: '', medical: '',
    craft: '', library: '', laboratory: '', misc: '', other: '', late: '', discount: ''
  };
  
  const [form, setForm] = useState({ studentId: '', class: '', amount: '', paid: '', mode: 'cash', breakdown: { ...defaultBreakdown } });
  const [classStudents, setClassStudents] = useState([]);

  const filteredFees = useMemo(() => {
    return selectedClass && selectedClass !== 'All Classes'
      ? fees.filter((fee) => fee.class === selectedClass)
      : fees;
  }, [fees, selectedClass]);

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    setError('');

    try {
      const classes = await getClasses();
      const options = classes.flatMap((item) => {
        if (!item.sections || item.sections.length === 0) {
          return [{ value: item.name, label: item.name }];
        }
        return item.sections.map((section) => {
          const value = `${item.name}-${section}`;
          return { value, label: value };
        });
      });

      setClassOptions(options);
    } catch (err) {
      setError(err.message || 'Unable to load classes.');
    } finally {
      setLoadingClasses(false);
    }
  }, []);

  const loadFees = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await getFees();
      setFees(data);
    } catch (err) {
      setError(err.message || 'Unable to load fee records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    loadFees();
  }, [loadFees]);

  useEffect(() => {
    if (form.class) {
      const [className, section] = String(form.class).split('-');
      getStudents({ class: className, section, limit: 1000, status: 'active' })
        .then(setClassStudents)
        .catch(() => setClassStudents([]));
    } else {
      setClassStudents([]);
      setForm((prev) => ({ ...prev, studentId: '', amount: '', paid: '', breakdown: { ...defaultBreakdown } }));
    }
  }, [form.class]);

  // Auto-calculate total paid based on breakdown inputs
  useEffect(() => {
    const sum = [
      'admission', 'bdf', 'tuition', 'exam', 'computer', 'sport',
      'medical', 'craft', 'library', 'laboratory', 'misc', 'other', 'late'
    ].reduce((acc, key) => acc + (Number(form.breakdown[key]) || 0), 0);
    
    const discount = Number(form.breakdown.discount) || 0;
    const total = sum - discount;
    
    if (total !== Number(form.paid) && (total > 0 || form.paid !== '')) {
      setForm(prev => ({ ...prev, paid: total > 0 ? String(total) : '' }));
    }
  }, [form.breakdown]);

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      const updatedRecord = await recordPayment(form);
      setFees((prev) => {
        const existingIndex = prev.findIndex((item) => item.studentId === updatedRecord.studentId);
        if (existingIndex === -1) return [updatedRecord, ...prev];

        const next = [...prev];
        next[existingIndex] = updatedRecord;
        return next;
      });

      setForm({ studentId: '', class: '', amount: '', paid: '', mode: 'cash', breakdown: { ...defaultBreakdown } });
      setModalOpen(false);
    } catch (err) {
      setError(err.message || 'Unable to record payment.');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'studentName', label: 'Student' },
    { key: 'class', label: 'Class' },
    { key: 'amount', label: 'Total', render: (val) => formatCurrency(val) },
    { key: 'paid', label: 'Paid', render: (val) => formatCurrency(val) },
    { key: 'due', label: 'Due', render: (val) => <span className={val > 0 ? 'text-red-600 font-medium' : ''}>{formatCurrency(val)}</span> },
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
    { key: 'date', label: 'Date' },
    { 
      key: 'receipts', 
      label: 'Receipt No', 
      render: (_, row) => {
        if (!row.paymentHistory || row.paymentHistory.length === 0) return <span className="text-slate-400">-</span>;
        return <span className="font-medium text-slate-700 text-xs">{row.paymentHistory.map(p => `#${p.receiptNo || '?'}`).join(', ')}</span>;
      }
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (!row.paymentHistory || row.paymentHistory.length === 0) {
                alert('No payments have been recorded for this student yet.');
                return;
              }
              setSelectedHistoryRow(row);
              setHistoryModalOpen(true);
            }}
            disabled={!row.paymentHistory || row.paymentHistory.length === 0}
            className={`p-1.5 rounded-lg transition-colors ${
              !row.paymentHistory || row.paymentHistory.length === 0 
                ? 'opacity-50 cursor-not-allowed text-slate-300' 
                : 'hover:bg-slate-100 text-blue-600'
            }`}
            title={!row.paymentHistory || row.paymentHistory.length === 0 ? "No payments recorded" : "View Payment History"}
          >
            <History className="w-4 h-4" />
          </button>
          <button
          onClick={async () => {
            if (!row.paid || row.paid === 0) {
              alert('No payments have been recorded for this student yet.');
              return;
            }
            try {
              const html = await getFeeReceiptHtml(row.studentId);
              const printWindow = window.open('', '_blank', 'width=1000,height=800');
              if (printWindow) {
                printWindow.document.open();
                printWindow.document.write(html);
                printWindow.document.close();
              } else {
                alert('Please allow popups for this site to print the receipt.');
              }
            } catch (err) {
              alert(err.message || 'Error generating receipt');
            }
          }}
          disabled={!row.paid || row.paid === 0}
          className={`p-1.5 rounded-lg transition-colors ${
            !row.paid || row.paid === 0 
              ? 'opacity-50 cursor-not-allowed text-slate-300' 
              : 'hover:bg-slate-100 text-slate-500'
          }`}
          title={!row.paid || row.paid === 0 ? "No payments recorded" : "Print Last Receipt"}
        >
          <Printer className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  if (loading || loadingClasses)
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800" /></div>;

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      <PageHeader
        title="Fee Collection"
        subtitle={selectedClass && selectedClass !== 'All Classes' ? `Showing fee records for ${selectedClass}` : 'Showing all fee records'}
      >
        <Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4" /> Collect Fee</Button>
      </PageHeader>

      <div className="card p-4 mb-4">
        <div className="max-w-xs">
          <SelectInput
            label="Select Class"
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            options={[{ value: 'All Classes', label: 'All Classes' }, ...classOptions]}
            placeholder="Choose class"
          />
        </div>
      </div>

      <DataTable columns={columns} data={filteredFees} />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Collect Fee">
        <div className="space-y-4">
          <SelectInput
            label="Class"
            value={form.class}
            onChange={(e) => setForm({ ...form, class: e.target.value, studentId: '' })}
            placeholder="Select class"
            options={classOptions}
            required
          />
          <SelectInput
            label="Student"
            value={form.studentId}
            onChange={(e) => {
              const studentId = e.target.value;
              const feeRecord = fees.find((f) => f.studentId === studentId);
              if (feeRecord) {
                setForm({
                  ...form,
                  studentId,
                  amount: String(feeRecord.due !== undefined ? feeRecord.due : (feeRecord.amount || '')),
                  paid: '',
                  breakdown: { ...defaultBreakdown }
                });
              } else if (studentId) {
                getClassFeeByPattern(form.class)
                  .then((classFeeConfig) => {
                    if (classFeeConfig) {
                      setForm({
                        ...form,
                        studentId,
                        amount: String(classFeeConfig.totalAmount),
                        paid: '',
                        breakdown: {
                          ...defaultBreakdown,
                          admission: String(classFeeConfig.breakdown?.admission ?? ''),
                          bdf: String(classFeeConfig.breakdown?.bdf ?? ''),
                          tuition: String(classFeeConfig.breakdown?.tuition ?? ''),
                          exam: String(classFeeConfig.breakdown?.exam ?? ''),
                          computer: String(classFeeConfig.breakdown?.computer ?? ''),
                          sport: String(classFeeConfig.breakdown?.sport ?? ''),
                          medical: String(classFeeConfig.breakdown?.medical ?? ''),
                          craft: String(classFeeConfig.breakdown?.craft ?? ''),
                          library: String(classFeeConfig.breakdown?.library ?? ''),
                          laboratory: String(classFeeConfig.breakdown?.laboratory ?? ''),
                          misc: String(classFeeConfig.breakdown?.misc ?? ''),
                          other: String(classFeeConfig.breakdown?.other ?? ''),
                        }
                      });
                    } else {
                      setForm({ ...form, studentId, amount: '', paid: '', breakdown: { ...defaultBreakdown } });
                    }
                  })
                  .catch(() => {
                    setForm({ ...form, studentId, amount: '', paid: '', breakdown: { ...defaultBreakdown } });
                  });
              } else {
                setForm({ ...form, studentId: '', amount: '', paid: '', breakdown: { ...defaultBreakdown } });
              }
            }}
            placeholder={form.class ? 'Select student' : 'Select a class first'}
            options={classStudents.map(s => ({ value: s.id, label: s.surname ? `${s.name} ${s.surname} (${s.grNo || s.studentId})` : `${s.name} (${s.grNo || s.studentId})` }))}
            disabled={!form.class}
            required
          />
          <FormInput
            label="Pending Amount (₹)"
            type="number"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            readOnly={!!form.studentId && fees.some((f) => f.studentId === form.studentId)}
          />
          <SelectInput
            label="Payment Mode"
            value={form.mode}
            onChange={(e) => setForm({ ...form, mode: e.target.value })}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'upi', label: 'UPI' },
              { value: 'bank', label: 'Bank Transfer' },
            ]}
            required
          />
          
          <div className="pt-2">
            <h4 className="text-sm font-semibold text-slate-700 mb-3 border-b border-slate-100 pb-2">Block-Wise Fee Breakdown</h4>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'admission', label: 'Admission Fee' },
                { key: 'bdf', label: 'B.D.F.' },
                { key: 'tuition', label: 'Tuition Fee' },
                { key: 'exam', label: 'Exam Fee' },
                { key: 'computer', label: 'Computer Fee' },
                { key: 'sport', label: 'Sport Fee' },
                { key: 'medical', label: 'Medical Charges' },
                { key: 'craft', label: 'Craft Fee' },
                { key: 'library', label: 'Library' },
                { key: 'laboratory', label: 'Laboratories' },
                { key: 'misc', label: 'Misc.' },
                { key: 'other', label: 'Other' },
                { key: 'late', label: 'Late Fee' },
                { key: 'discount', label: 'Discount' },
              ].map(field => (
                <FormInput
                  key={field.key}
                  label={field.label}
                  type="number"
                  value={form.breakdown[field.key]}
                  onChange={(e) => setForm(f => ({ ...f, breakdown: { ...f.breakdown, [field.key]: e.target.value } }))}
                />
              ))}
            </div>
          </div>
          
          <div className="pt-3 border-t border-slate-100 mt-2">
            <FormInput label="Total Payment Amount (₹) [Auto-calculated]" type="number" value={form.paid} readOnly required className="bg-slate-50 font-bold" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Record Payment'}</Button>
        </div>
      </Modal>

      {/* Payment History Modal */}
      <Modal isOpen={historyModalOpen} onClose={() => setHistoryModalOpen(false)} title={`Payment History - ${selectedHistoryRow?.studentName || ''}`}>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {selectedHistoryRow?.paymentHistory && selectedHistoryRow.paymentHistory.length > 0 ? (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Receipt No</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Mode</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold text-center">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedHistoryRow.paymentHistory.map((payment) => (
                    <tr key={payment._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">#{payment.receiptNo || '-'}</td>
                      <td className="px-4 py-3">{new Date(payment.date).toLocaleDateString()}</td>
                      <td className="px-4 py-3 uppercase text-xs font-semibold">{payment.mode}</td>
                      <td className="px-4 py-3 font-medium text-emerald-600">{formatCurrency(payment.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={async () => {
                            try {
                              const html = await getFeeReceiptHtml(selectedHistoryRow.studentId, payment._id);
                              const printWindow = window.open('', '_blank', 'width=1000,height=800');
                              if (printWindow) {
                                printWindow.document.open();
                                printWindow.document.write(html);
                                printWindow.document.close();
                              } else {
                                alert('Please allow popups for this site to print the receipt.');
                              }
                            } catch (err) {
                              alert(err.message || 'Error generating receipt');
                            }
                          }}
                          className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors inline-block"
                          title="Print Receipt"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-6 text-slate-500">No payment history found.</div>
          )}
        </div>
        <div className="flex justify-end mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setHistoryModalOpen(false)}>Close</Button>
        </div>
      </Modal>
    </div>
  );
};

export default ClerkFees;
