import { useEffect, useState, useMemo } from 'react';
import { getPendingFeesOverview } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import { formatCurrency } from '../../utils/helpers';
import { Search } from 'lucide-react';
import SelectInput from '../../components/SelectInput';

const AdminPendingFees = () => {
  const [data, setData] = useState({
    schoolTotals: { totalFees: 0, collectedFees: 0, pendingFees: 0, studentCount: 0 },
    classWiseTotals: [],
    studentWiseDetails: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState('All Classes');

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    setLoading(true);
    setError('');
    try {
      const overviewData = await getPendingFeesOverview();
      setData(overviewData);
    } catch (err) {
      setError(err.message || 'Unable to load pending fees overview.');
    } finally {
      setLoading(false);
    }
  };

  const classOptions = useMemo(() => {
    const classes = data.classWiseTotals.map(c => c.className);
    return ['All Classes', ...classes];
  }, [data.classWiseTotals]);

  const filteredStudents = useMemo(() => {
    return data.studentWiseDetails.filter(student => {
      const matchesSearch = 
        student.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        student.studentId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesClass = selectedClass === 'All Classes' || student.className === selectedClass;
      return matchesSearch && matchesClass;
    });
  }, [data.studentWiseDetails, searchQuery, selectedClass]);

  const studentColumns = [
    { key: 'studentId', label: 'Student ID', render: (val) => <span className="font-medium text-indigo-600">{val}</span> },
    { key: 'name', label: 'Name', render: (val, row) => (
        <div>
          <div className="font-semibold text-slate-800">{val}</div>
          <div className="text-xs text-slate-500">Roll No: {row.rollNumber}</div>
        </div>
      ) 
    },
    { key: 'className', label: 'Class', render: (val, row) => `${val} ${row.section ? `- ${row.section}` : ''}` },
    { key: 'totalFee', label: 'Total Fee', render: (val) => formatCurrency(val) },
    { key: 'collectedFee', label: 'Paid Till Date', render: (val) => formatCurrency(val) },
    { key: 'pendingFee', label: 'Pending Fee', render: (val) => (
        <span className={`font-semibold ${val > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
          {formatCurrency(val)}
        </span>
      ) 
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Pending Fees Overview" 
        subtitle="School-wide fee collection and pending dues for all active students" 
      />

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-sm">
          {error}
        </div>
      )}

      {/* School Totals */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
          <span className="text-slate-500 text-sm font-medium mb-1">Total Active Students</span>
          <span className="text-3xl font-bold text-slate-800">{data.schoolTotals.studentCount}</span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
          <span className="text-slate-500 text-sm font-medium mb-1">Total Fees Assigned</span>
          <span className="text-3xl font-bold text-slate-800">{formatCurrency(data.schoolTotals.totalFees)}</span>
        </div>
        <div className="bg-emerald-50 p-5 rounded-xl border border-emerald-100 shadow-sm flex flex-col justify-center">
          <span className="text-emerald-700 text-sm font-medium mb-1">Total Collected</span>
          <span className="text-3xl font-bold text-emerald-800">{formatCurrency(data.schoolTotals.collectedFees)}</span>
        </div>
        <div className="bg-red-50 p-5 rounded-xl border border-red-100 shadow-sm flex flex-col justify-center">
          <span className="text-red-700 text-sm font-medium mb-1">Total Pending</span>
          <span className="text-3xl font-bold text-red-800">{formatCurrency(data.schoolTotals.pendingFees)}</span>
        </div>
      </div>

      {/* Class-wise Totals Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h3 className="font-semibold text-slate-800">Class-wise Overview</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {data.classWiseTotals.map((cls) => (
              <div key={cls.className} className="border border-slate-200 rounded-lg p-4 hover:border-indigo-300 transition-colors">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-bold text-lg text-slate-800">Class {cls.className}</span>
                  <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-medium">{cls.studentCount} Students</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total:</span>
                    <span className="font-medium">{formatCurrency(cls.totalFees)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Collected:</span>
                    <span className="font-medium text-emerald-600">{formatCurrency(cls.collectedFees)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-100">
                    <span className="text-slate-500 font-medium">Pending:</span>
                    <span className="font-bold text-red-600">{formatCurrency(cls.pendingFees)}</span>
                  </div>
                </div>
              </div>
            ))}
            {!loading && data.classWiseTotals.length === 0 && (
              <div className="col-span-full text-center py-6 text-slate-500">
                No class data available.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Student-wise Data Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h3 className="font-semibold text-slate-800">Student Details</h3>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="relative flex-grow sm:min-w-[250px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text"
                placeholder="Search student name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              />
            </div>
            <div className="w-full sm:w-48">
              <SelectInput
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                options={classOptions.map(c => ({ value: c, label: c }))}
              />
            </div>
          </div>
        </div>
        
        <DataTable 
          columns={studentColumns} 
          data={filteredStudents} 
          loading={loading} 
          emptyMessage="No students found matching your criteria."
        />
      </div>
    </div>
  );
};

export default AdminPendingFees;
