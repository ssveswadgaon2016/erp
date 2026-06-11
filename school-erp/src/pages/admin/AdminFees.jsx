import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getFees,
  getClasses,
  recordPayment,
  getStudents,
  getFeeReceiptHtml,
  getClassFees,
  getClassFeeByPattern,
  saveClassFee,
  deleteClassFee,
} from '../../services/api';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';
import FormInput from '../../components/FormInput';
import SelectInput from '../../components/SelectInput';
import Button from '../../components/Button';
import { Plus, Download, Printer, Settings, Trash2, Edit, History } from 'lucide-react';
import { formatCurrency } from '../../utils/helpers';
import { exportRowsToPdf } from '../../utils/pdfExport';

const AdminFees = () => {
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

  const [form, setForm] = useState({ studentId: '', class: '', amount: '', paid: '', status: 'Pending', mode: 'cash', breakdown: { ...defaultBreakdown } });
  const [classStudents, setClassStudents] = useState([]);

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [classFees, setClassFees] = useState([]);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [configFormOpen, setConfigFormOpen] = useState(false);
  const [configForm, setConfigForm] = useState({ id: '', classPattern: '', totalAmount: '', breakdown: { ...defaultBreakdown } });

  const loadClassFees = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const data = await getClassFees();
      setClassFees(data);
    } catch (err) {
      setError(err.message || 'Unable to load class fees.');
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    if (configModalOpen) {
      loadClassFees();
    }
  }, [configModalOpen, loadClassFees]);

  useEffect(() => {
    const sum = [
      'admission', 'bdf', 'tuition', 'exam', 'computer', 'sport',
      'medical', 'craft', 'library', 'laboratory', 'misc', 'other'
    ].reduce((acc, key) => acc + (Number(configForm.breakdown[key]) || 0), 0);
    
    if (sum !== Number(configForm.totalAmount) && (sum > 0 || configForm.totalAmount !== '')) {
      setConfigForm(prev => ({ ...prev, totalAmount: sum > 0 ? String(sum) : '' }));
    }
  }, [configForm.breakdown]);

  const handleSaveClassFee = async () => {
    setSaving(true);
    setError('');

    try {
      await saveClassFee(configForm);
      await loadClassFees();
      setConfigForm({ id: '', classPattern: '', totalAmount: '', breakdown: { ...defaultBreakdown } });
      setConfigFormOpen(false);
    } catch (err) {
      setError(err.message || 'Unable to save class fee structure.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClassFee = async (id) => {
    if (!window.confirm('Are you sure you want to delete this class fee structure?')) return;
    setError('');

    try {
      await deleteClassFee(id);
      await loadClassFees();
    } catch (err) {
      setError(err.message || 'Unable to delete class fee structure.');
    }
  };

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

  const classTabs = useMemo(() => {
    const counts = fees.reduce((accumulator, item) => {
      const className = item.class || 'Unassigned';
      accumulator[className] = (accumulator[className] || 0) + 1;
      return accumulator;
    }, {});

    return ['All Classes', ...Object.keys(counts).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))].map((className) => ({
      name: className,
      count: className === 'All Classes' ? fees.length : counts[className] || 0,
    }));
  }, [fees]);

  const filteredFees = useMemo(() => {
    if (selectedClass === 'All Classes') {
      return fees;
    }

    return fees.filter((item) => item.class === selectedClass);
  }, [fees, selectedClass]);

  useEffect(() => {
    if (selectedClass !== 'All Classes' && !classTabs.some((tab) => tab.name === selectedClass)) {
      setSelectedClass('All Classes');
    }
  }, [classTabs, selectedClass]);

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

      setForm({ studentId: '', class: '', amount: '', paid: '', status: 'Pending', mode: 'cash', breakdown: { ...defaultBreakdown } });
      setModalOpen(false);
    } catch (err) {
      setError(err.message || 'Unable to save payment.');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'studentName', label: 'Student' },
    { key: 'class', label: 'Class' },
    { key: 'amount', label: 'Total Fee', render: (val) => formatCurrency(val) },
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

  const totalCollected = filteredFees.reduce((s, f) => s + f.paid, 0);
  const totalDue = filteredFees.reduce((s, f) => s + f.due, 0);

  const handleExport = () => {
    exportRowsToPdf({
      title: `Fee Management Report${selectedClass === 'All Classes' ? '' : ` - ${selectedClass}`}`,
      fileName: `fees-${selectedClass.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`,
      summaryLines: [
        `Class Filter: ${selectedClass}`,
        `Total Collected: ${formatCurrency(totalCollected)}`,
        `Total Due: ${formatCurrency(totalDue)}`,
        `Total Records: ${filteredFees.length}`,
      ],
      columns: [
        { header: 'Student', key: 'studentName' },
        { header: 'Class', key: 'class' },
        { header: 'Total Fee', key: 'amountText' },
        { header: 'Paid', key: 'paidText' },
        { header: 'Due', key: 'dueText' },
        { header: 'Status', key: 'status' },
        { header: 'Date', key: 'date' },
        { header: 'Receipt No', key: 'receiptText' },
      ],
      rows: filteredFees.map((row) => ({
        ...row,
        amountText: formatCurrency(row.amount),
        paidText: formatCurrency(row.paid),
        dueText: formatCurrency(row.due),
        receiptText: (row.paymentHistory || []).map(p => `#${p.receiptNo || '?'}`).join(', ') || '-',
      })),
    });
  };

  if (loading || loadingClasses) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800" /></div>;

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      <PageHeader
        title="Fee Management"
        subtitle={selectedClass === 'All Classes' ? 'Manage student fee records class wise' : `Fee records for ${selectedClass}`}
      >
        <Button variant="secondary" onClick={handleExport}><Download className="w-4 h-4" /> Export</Button>
        <Button variant="secondary" onClick={() => setConfigModalOpen(true)} className="flex items-center gap-1.5"><Settings className="w-4 h-4" /> Class Fees Config</Button>
        <Button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5"><Plus className="w-4 h-4" /> Record Payment</Button>
      </PageHeader>

      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Class wise fee records</h3>
            <p className="text-sm text-slate-500">Select a class tab to view student fee data for that class.</p>
          </div>
          <div className="text-sm text-slate-500">
            Showing <span className="font-semibold text-slate-800">{filteredFees.length}</span> records
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {classTabs.map((tab) => {
            const active = tab.name === selectedClass;

            return (
              <button
                key={tab.name}
                type="button"
                onClick={() => setSelectedClass(tab.name)}
                className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
              >
                <span>{tab.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-5"><p className="text-sm text-slate-500">Total Collected</p><p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(totalCollected)}</p></div>
        <div className="card p-5"><p className="text-sm text-slate-500">Total Due</p><p className="text-2xl font-bold text-red-500 mt-1">{formatCurrency(totalDue)}</p></div>
        <div className="card p-5"><p className="text-sm text-slate-500">Total Records</p><p className="text-2xl font-bold text-slate-800 mt-1">{filteredFees.length}</p></div>
      </div>

      {filteredFees.length > 0 ? (
        <DataTable columns={columns} data={filteredFees} />
      ) : (
        <div className="card p-10 text-center text-slate-500">
          No fee records found for this class.
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Record Fee Payment">
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
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Payment'}</Button>
        </div>
      </Modal>

      {/* Class Fee List Configuration Modal */}
      <Modal isOpen={configModalOpen} onClose={() => setConfigModalOpen(false)} title="Class-wise Fees Configuration">
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm text-slate-500">Configure standard class-wise fee structures.</p>
            <Button onClick={() => {
              setConfigForm({ id: '', classPattern: '', totalAmount: '', breakdown: { ...defaultBreakdown } });
              setConfigFormOpen(true);
            }} className="flex items-center gap-1">
              <Plus className="w-4 h-4" /> Add New
            </Button>
          </div>
          {loadingConfig ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-800" /></div>
          ) : (
            <DataTable
              columns={[
                { key: 'classPattern', label: 'Class & Section' },
                { key: 'totalAmount', label: 'Total Standard Fee', render: (val) => formatCurrency(val) },
                {
                  key: 'actions',
                  label: 'Actions',
                  render: (_, row) => (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setConfigForm({
                            id: row._id,
                            classPattern: row.classPattern,
                            totalAmount: String(row.totalAmount),
                            breakdown: {
                              ...defaultBreakdown,
                              admission: String(row.breakdown?.admission ?? ''),
                              bdf: String(row.breakdown?.bdf ?? ''),
                              tuition: String(row.breakdown?.tuition ?? ''),
                              exam: String(row.breakdown?.exam ?? ''),
                              computer: String(row.breakdown?.computer ?? ''),
                              sport: String(row.breakdown?.sport ?? ''),
                              medical: String(row.breakdown?.medical ?? ''),
                              craft: String(row.breakdown?.craft ?? ''),
                              library: String(row.breakdown?.library ?? ''),
                              laboratory: String(row.breakdown?.laboratory ?? ''),
                              misc: String(row.breakdown?.misc ?? ''),
                              other: String(row.breakdown?.other ?? ''),
                            }
                          });
                          setConfigFormOpen(true);
                        }}
                        className="p-1 rounded hover:bg-slate-100 text-blue-600 transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClassFee(row._id)}
                        className="p-1 rounded hover:bg-slate-100 text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )
                }
              ]}
              data={classFees}
              searchable={true}
              pageSize={5}
            />
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setConfigModalOpen(false)}>Close</Button>
        </div>
      </Modal>

      {/* Add/Edit Class Fee Structure Modal */}
      <Modal isOpen={configFormOpen} onClose={() => setConfigFormOpen(false)} title={configForm.id ? "Edit Class Fee Structure" : "Add Class Fee Structure"}>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          <SelectInput
            label="Class Pattern"
            value={configForm.classPattern}
            onChange={(e) => setConfigForm({ ...configForm, classPattern: e.target.value })}
            placeholder="Select Class & Section"
            options={classOptions}
            disabled={!!configForm.id}
            required
          />
          
          <div className="pt-2">
            <h4 className="text-sm font-semibold text-slate-700 mb-3 border-b border-slate-100 pb-2">Block-Wise Fee Standard</h4>
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
              ].map(field => (
                <FormInput
                  key={field.key}
                  label={field.label}
                  type="number"
                  value={configForm.breakdown[field.key]}
                  onChange={(e) => setConfigForm(f => ({ ...f, breakdown: { ...f.breakdown, [field.key]: e.target.value } }))}
                />
              ))}
            </div>
          </div>
          
          <div className="pt-3 border-t border-slate-100 mt-2">
            <FormInput
              label="Total Class Fee (₹) [Auto-calculated]"
              type="number"
              value={configForm.totalAmount}
              readOnly
              required
              className="bg-slate-50 font-bold"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setConfigFormOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveClassFee} disabled={saving}>{saving ? 'Saving...' : 'Save Structure'}</Button>
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

export default AdminFees;
