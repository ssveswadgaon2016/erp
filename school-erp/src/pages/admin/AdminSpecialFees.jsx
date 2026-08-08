import { useEffect, useState, useMemo } from 'react';
import { getStudents, updateStudentSpecialFee } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import FormInput from '../../components/FormInput';
import { formatCurrency } from '../../utils/helpers';
import { Search, Edit, UserCheck, DollarSign } from 'lucide-react';

const AdminSpecialFees = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Search
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [form, setForm] = useState({ customFee: '', customFeeReason: '' });
  const [enableSpecialFee, setEnableSpecialFee] = useState(false);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    setError('');
    try {
      // Get all active students
      const response = await getStudents({ status: 'active' });
      setStudents(Array.isArray(response) ? response : (response.students || []));
    } catch (err) {
      setError(err.message || 'Unable to load students.');
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      return (
        (student.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
        (student.studentId || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  }, [students, searchQuery]);

  const handleEdit = (student) => {
    setSelectedStudent(student);
    const rawStudent = student.raw || student;
    const hasCustomFee = rawStudent.customFee !== null && rawStudent.customFee !== undefined;
    
    setEnableSpecialFee(hasCustomFee);
    setForm({
      customFee: hasCustomFee ? String(rawStudent.customFee) : '',
      customFeeReason: rawStudent.customFeeReason || ''
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!selectedStudent) return;
    
    setSaving(true);
    setError('');
    
    try {
      const payload = {
        customFee: enableSpecialFee ? form.customFee : null,
        customFeeReason: enableSpecialFee ? form.customFeeReason : ''
      };
      
      await updateStudentSpecialFee(selectedStudent.id || selectedStudent._id, payload);
      await fetchStudents();
      setModalOpen(false);
    } catch (err) {
      setError(err.message || 'Unable to update special fee structure.');
    } finally {
      setSaving(false);
    }
  };

  const studentColumns = [
    { key: 'studentId', label: 'Student ID', render: (val) => <span className="font-medium text-indigo-600">{val}</span> },
    { key: 'name', label: 'Name', render: (val, row) => (
        <div>
          <div className="font-semibold text-slate-800">{val} {row.surname}</div>
          <div className="text-xs text-slate-500">Roll No: {(row.raw?.academic || row.academic)?.rollNumber || '-'}</div>
        </div>
      ) 
    },
    { key: 'className', label: 'Class', render: (_, row) => {
      const acad = row.raw?.academic || row.academic;
      return `${acad?.class || row.class} ${acad?.section ? `- ${acad.section}` : ''}`;
    } },
    { key: 'feeType', label: 'Fee Structure', render: (_, row) => {
        const rawStudent = row.raw || row;
        if (rawStudent.isRTE) {
          return <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-xs font-semibold">RTE (Zero Fee)</span>;
        }
        if (rawStudent.customFee !== null && rawStudent.customFee !== undefined) {
          return (
            <div className="flex flex-col items-start">
              <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-xs font-semibold mb-1">
                Custom: {formatCurrency(rawStudent.customFee)}
              </span>
              <span className="text-xs text-slate-500 italic">{rawStudent.customFeeReason}</span>
            </div>
          );
        }
        return <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-medium">Standard Class Fee</span>;
      } 
    },
    { key: 'actions', label: 'Actions', render: (_, row) => (
        <button 
          onClick={() => handleEdit(row)}
          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          title="Edit Fee Structure"
        >
          <Edit className="w-4 h-4" />
        </button>
      ) 
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Special Fees & Discounts" 
        subtitle="Manage custom fee structures for specific students (e.g., Staff discounts, Scholarships)" 
      />

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-sm">
          {error}
        </div>
      )}

      {/* Student List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-indigo-500" />
            Manage Student Fees
          </h3>
          
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text"
              placeholder="Search student name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            />
          </div>
        </div>
        
        <DataTable 
          columns={studentColumns} 
          data={filteredStudents} 
          loading={loading} 
          emptyMessage="No students found."
        />
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="Override Student Fee"
        icon={DollarSign}
      >
        <form onSubmit={handleSave} className="space-y-6">
          {selectedStudent && (() => {
            const rawSelected = selectedStudent.raw || selectedStudent;
            const acad = rawSelected.academic || {};
            return (
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4">
                <div className="font-semibold text-slate-800">{selectedStudent.name} {selectedStudent.surname}</div>
                <div className="text-sm text-slate-500">{selectedStudent.studentId} | Class: {acad.class} {acad.section}</div>
                {rawSelected.isRTE && (
                  <div className="mt-2 text-sm text-red-600 font-medium">
                    Note: This student is flagged as RTE. The system will force their fee to 0 regardless of custom settings.
                  </div>
                )}
              </div>
            );
          })()}

          <div className="flex items-center gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-lg">
            <input
              type="checkbox"
              id="enableSpecialFee"
              checked={enableSpecialFee}
              onChange={(e) => setEnableSpecialFee(e.target.checked)}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
            />
            <label htmlFor="enableSpecialFee" className="font-medium text-indigo-900 cursor-pointer">
              Enable Special Fee Structure for this student
            </label>
          </div>

          {enableSpecialFee && (
            <div className="space-y-4 pt-2">
              <FormInput
                label="Special Total Fee Amount (₹)"
                type="number"
                min="0"
                required
                value={form.customFee}
                onChange={(e) => setForm({ ...form, customFee: e.target.value })}
                placeholder="e.g. 5000"
              />
              <FormInput
                label="Reason / Note"
                type="text"
                required
                value={form.customFeeReason}
                onChange={(e) => setForm({ ...form, customFeeReason: e.target.value })}
                placeholder="e.g. Staff child discount, Scholarship..."
              />
            </div>
          )}

          {!enableSpecialFee && (
            <div className="text-sm text-slate-500 pt-2">
              If disabled, the student will be charged the standard class fee.
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Structure'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default AdminSpecialFees;
