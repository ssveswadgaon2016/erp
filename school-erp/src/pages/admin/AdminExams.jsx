import { useCallback, useEffect, useMemo, useState } from 'react';
import { createExam, getClasses, getExams, getMarksByExamAndClass, getStudents, getExamById, updateExam, getClassResultSheet } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';
import FormInput from '../../components/FormInput';
import SelectInput from '../../components/SelectInput';
import Button from '../../components/Button';
import { Plus, Printer, FileText, FileSpreadsheet, Download, Trash2, ChevronRight, ChevronLeft } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// â”€â”€â”€ Default grading scale â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DEFAULT_GRADING_SCALE = [
  { grade: 'A+', minPercent: 90,   maxPercent: 100  },
  { grade: 'A',  minPercent: 80,   maxPercent: 89.99 },
  { grade: 'B+', minPercent: 70,   maxPercent: 79.99 },
  { grade: 'B',  minPercent: 60,   maxPercent: 69.99 },
  { grade: 'C',  minPercent: 50,   maxPercent: 59.99 },
  { grade: 'D',  minPercent: 35,   maxPercent: 49.99 },
  { grade: 'F',  minPercent: 0,    maxPercent: 34.99 },
];

// â”€â”€â”€ Grading scale validation (mirrors backend result.service.js) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const validateGradingScaleFE = (scale) => {
  if (!scale || scale.length === 0) return null; // Optional â€” no scale = use default
  const labels = new Set();
  for (const e of scale) {
    if (!e.grade?.trim()) return 'Each grade entry must have a label.';
    if (labels.has(e.grade.trim())) return `Duplicate grade: "${e.grade}".`;
    labels.add(e.grade.trim());
    const min = Number(e.minPercent);
    const max = Number(e.maxPercent);
    if (isNaN(min) || isNaN(max)) return `Grade "${e.grade}": invalid percentages.`;
    if (min > max) return `Grade "${e.grade}": min > max.`;
    if (min < 0 || max > 100) return `Grade "${e.grade}": must be between 0â€“100.`;
  }
  const sorted = [...scale].sort((a, b) => Number(a.minPercent) - Number(b.minPercent));
  if (Number(sorted[0].minPercent) !== 0) return 'Grading scale must start at 0%.';
  if (Number(sorted[sorted.length - 1].maxPercent) !== 100) return 'Grading scale must end at 100%.';
  return null;
};

// â”€â”€â”€ Subject config validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const validateSubjectConfigFE = (subjects, className) => {
  if (!subjects || subjects.length === 0) return null; // No subjects = optional
  const names = new Set();
  for (const s of subjects) {
    if (!s.name?.trim()) return `Each subject in class "${className}" needs a name.`;
    if (names.has(s.name.trim().toLowerCase())) return `Duplicate subject "${s.name}" in class "${className}".`;
    names.add(s.name.trim().toLowerCase());
    const max = Number(s.maxMarks);
    const pass = Number(s.passMarks);
    if (!max || max <= 0) return `Subject "${s.name}" needs valid max marks.`;
    if (isNaN(pass) || pass < 0) return `Subject "${s.name}" needs valid pass marks.`;
    if (pass > max) return `Subject "${s.name}" pass marks cannot exceed max marks.`;
  }
  return null;
};

const AdminExams = () => {
  const [activeModule, setActiveModule] = useState('exams');
  const [exams, setExams] = useState([]);
  const [classOptions, setClassOptions] = useState([]);
  const [classesList, setClassesList] = useState([]); // Raw classes for multi-select
  const [selectedResultYear, setSelectedResultYear] = useState('');
  const [selectedResultExam, setSelectedResultExam] = useState('');
  const [selectedResultClass, setSelectedResultClass] = useState('');
  const [resultRows, setResultRows] = useState([]);
  const [resultSubjects, setResultSubjects] = useState([]); // [{ name, maxMarks, passMarks }]
  const [resultLoading, setResultLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  // Exam creation modal â€” 3-step wizard
  const [modalOpen, setModalOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1); // 1: basic, 2: subjects, 3: grading


  const initialFormState = {
    name: '',
    class: '',
    startDate: '',
    endDate: '',
    academicYear: '2025-26',
    examType: 'Unit Test',
    status: 'Draft',
    maxMarks: 100,
    applicableClasses: [],
    // NEW: per-class subject config { [classId]: [{ name, maxMarks, passMarks }] }
    classSubjectConfig: {},
    // NEW: grading scale
    gradingScale: DEFAULT_GRADING_SCALE,
  };
  const [form, setForm] = useState(initialFormState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [examData, classData] = await Promise.all([getExams(), getClasses()]);

      setExams(examData);
      setClassesList(classData);

      const options = classData.flatMap((item) => {
        if (!item.sections || item.sections.length === 0) {
          return [{ value: item.name, label: item.name }];
        }
        return item.sections.map((section) => {
          const classLabel = `${item.name}-${section}`;
          return { value: classLabel, label: classLabel };
        });
      });

      setClassOptions(options);
      setSelectedResultClass((prev) => prev || options[0]?.value || '');
      setSelectedResultYear((prev) => prev || '2025-26');

      setSelectedResultExam((prev) => prev || examData[0]?.name || '');
      setForm((prev) => ({ ...prev, class: prev.class || options[0]?.value || '' }));
    } catch (err) {
      setError(err.message || 'Unable to load exams.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadResults = useCallback(async () => {
    if (!selectedResultClass || !selectedResultExam) {
      setResultRows([]);
      return;
    }

    const parts = String(selectedResultClass).split('-');
    const className = parts[0];
    const section = parts[1] || 'A';
    setResultLoading(true);
    setError('');

    try {
      const data = await getClassResultSheet({ examName: selectedResultExam, className, section });
      setResultSubjects(data?.subjects || []);
      setResultRows(data?.results || []);
    } catch (err) {
      setError(err.message || 'Unable to load exam results.');
    } finally {
      setResultLoading(false);
    }
  }, [selectedResultClass, selectedResultExam]);

  useEffect(() => {
    if (activeModule === 'results') loadResults();
  }, [activeModule, loadResults]);

  // â”€â”€â”€ Wizard navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleWizardNext = () => {
    setError('');

    if (wizardStep === 1) {
      if (!form.name || !form.startDate || !form.endDate) {
        setError('Please fill all required fields: Exam Name, Start Date, End Date.');
        return;
      }
    }

    if (wizardStep === 2) {
      // Validate each class's subject config
      for (const cls of classesList.filter((c) => form.applicableClasses.includes(c.id || c._id))) {
        const subjects = form.classSubjectConfig[cls.id || cls._id] || [];
        const err = validateSubjectConfigFE(subjects, cls.name);
        if (err) { setError(err); return; }
      }
    }

    setWizardStep((s) => s + 1);
  };

  const handleWizardBack = () => {
    setError('');
    setWizardStep((s) => s - 1);
  };

  // â”€â”€â”€ Subject config helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const addSubject = (classId) => {
    setForm((prev) => ({
      ...prev,
      classSubjectConfig: {
        ...prev.classSubjectConfig,
        [classId]: [...(prev.classSubjectConfig[classId] || []), { name: '', maxMarks: 100, passMarks: 35 }],
      },
    }));
  };

  const removeSubject = (classId, idx) => {
    setForm((prev) => {
      const updated = [...(prev.classSubjectConfig[classId] || [])];
      updated.splice(idx, 1);
      return { ...prev, classSubjectConfig: { ...prev.classSubjectConfig, [classId]: updated } };
    });
  };

  const updateSubject = (classId, idx, field, value) => {
    setForm((prev) => {
      const updated = [...(prev.classSubjectConfig[classId] || [])];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, classSubjectConfig: { ...prev.classSubjectConfig, [classId]: updated } };
    });
  };

  // â”€â”€â”€ Grading scale helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const addGradeRow = () => {
    setForm((prev) => ({
      ...prev,
      gradingScale: [...prev.gradingScale, { grade: '', minPercent: 0, maxPercent: 0 }],
    }));
  };

  const removeGradeRow = (idx) => {
    setForm((prev) => {
      const updated = [...prev.gradingScale];
      updated.splice(idx, 1);
      return { ...prev, gradingScale: updated };
    });
  };

  const updateGradeRow = (idx, field, value) => {
    setForm((prev) => {
      const updated = [...prev.gradingScale];
      updated[idx] = { ...updated[idx], [field]: field === 'grade' ? value : Number(value) };
      return { ...prev, gradingScale: updated };
    });
  };

  // â”€â”€â”€ Save exam â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleSave = async () => {
    setError('');

    // Validate grading scale on step 3
    const gradingErr = validateGradingScaleFE(form.gradingScale);
    if (gradingErr) { setError(gradingErr); return; }

    setSaving(true);

    try {
      // Build classSubjectConfig array for API â€” filter out null/undefined classId keys
      const classSubjectConfig = Object.entries(form.classSubjectConfig)
        .filter(([classId, subjects]) => classId && classId !== 'null' && classId !== 'undefined' && subjects.length > 0)
        .map(([classId, subjects]) => ({
          classId,
          subjects: subjects.map((s) => ({
            name: String(s.name).trim(),
            maxMarks: Number(s.maxMarks),
            passMarks: Number(s.passMarks),
          })),
        }));

      const payload = {
        ...form,
        // Filter out null / falsy class IDs from applicableClasses
        applicableClasses: (form.applicableClasses || []).filter((id) => id && id !== 'null'),
        classSubjectConfig,
        gradingScale: form.gradingScale,
      };
      // Remove UI-only field
      delete payload.classSubjectConfig.__proto__;

      const created = await createExam(payload);
      setExams((prev) => [created, ...prev]);
      setForm({ ...initialFormState, class: classOptions[0]?.value || '' });
      setWizardStep(1);
      setModalOpen(false);
    } catch (err) {
      setError(err.message || 'Unable to create exam.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenModal = () => {
    setWizardStep(1);
    setError('');
    setForm({ ...initialFormState, class: classOptions[0]?.value || '' });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setWizardStep(1);
    setError('');
  };

  // ——————————————————————————————————————————————————————————————————————————————————————————————————



  const today = new Date().toISOString().split('T')[0];
  const upcomingExams = useMemo(() => exams.filter((exam) => exam.endDate >= today), [exams, today]);
  const pastExams = useMemo(() => exams.filter((exam) => exam.endDate < today), [exams, today]);

  const examColumns = [
    { key: 'name', label: 'Exam Name' },
    { key: 'class', label: 'Class' },
    { key: 'startDate', label: 'Start Date', render: (val) => new Date(val).toLocaleDateString() },
    { key: 'endDate', label: 'End Date', render: (val) => new Date(val).toLocaleDateString() },
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
  ];

  // ——————————————————————————————————————————————————————————————————————————————————————————————————
  const resultColumns = useMemo(() => {
    if (resultRows.length === 0 && resultSubjects.length === 0) return [];

    const cols = [
      { key: 'rollNumber', label: 'Roll', render: (val) => val || '-' },
      { key: 'name', label: 'Student Name' },
    ];

    resultSubjects.forEach((subject) => {
      const subName = typeof subject === 'string' ? subject : subject.name;
      const maxMarks = subject.maxMarks || null;
      cols.push({
        key: `subject_${subName}`,
        label: subName,
        render: (_, row) => row.subjects?.[subName]?.marks ?? '-',
      });
    });

    cols.push({ key: 'totalObtained', label: 'Obtained Marks', render: (val, row) => val ?? row.totalMarks ?? '-' });
    cols.push({ key: 'totalMaxMarks', label: 'Total Marks' });
    cols.push({ key: 'percentage', label: 'Percentage', render: (val) => val != null ? `${Number(val).toFixed(2)}%` : '-' });
    cols.push({ key: 'grade', label: 'Grade', render: (val, row) => val || row.overallGrade || '-' });
    cols.push({
      key: 'result',
      label: 'Result',
      render: (val, row) => {
        const status = val || row.overallStatus;
        return <StatusBadge status={status === 'Pass' ? 'Approved' : 'Rejected'} />;
      }
    });
    return cols;
  }, [resultSubjects, resultRows]);

  // â”€â”€â”€ Export helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const getCellValue = (col, row) => {
    if (col.key.startsWith('subject_')) {
      const subName = col.key.replace('subject_', '');
      return row.subjects?.[subName]?.marks ?? '-';
    }
    if (col.key === 'result') return (row.result || row.overallStatus) === 'Pass' ? 'Pass' : 'Fail';
    if (col.key === 'grade') return row.grade || row.overallGrade || '-';
    if (col.key === 'totalObtained') return row.totalObtained ?? row.totalMarks ?? '-';
    if (col.key === 'percentage') return row.percentage != null ? `${Number(row.percentage).toFixed(2)}%` : '-';
    return row[col.key] ?? '-';
  };

  const handlePrint = () => window.print();

  const handleExportCSV = () => {
    if (resultRows.length === 0) return;
    const headers = resultColumns.map((col) => `"${col.label}"`).join(',');
    const rows = resultRows.map((row) => resultColumns.map((col) => `"${getCellValue(col, row)}"`).join(','));
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `ResultSheet_${selectedResultClass}_${selectedResultExam}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    if (resultRows.length === 0) return;
    const tableData = [resultColumns.map((col) => col.label)];
    resultRows.forEach((row) => tableData.push(resultColumns.map((col) => getCellValue(col, row))));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(tableData);
    ws['!cols'] = resultColumns.map(() => ({ wch: 16 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    XLSX.writeFile(wb, `ResultSheet_${selectedResultClass}_${selectedResultExam}.xlsx`);
  };

  const handleExportPDF = () => {
    if (resultRows.length === 0) return;
    const doc = new jsPDF('landscape');
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFontSize(18);
    doc.text('Shree Swami Vivekanand English School', pageW / 2, 15, { align: 'center' });
    doc.setFontSize(12);
    doc.text('Siddhanath Wadgaon, tq. Gangapur Dist. Chhatrapati Sambhajinagar', pageW / 2, 22, { align: 'center' });
    doc.setFontSize(14);
    doc.text('Class Result Sheet', pageW / 2, 32, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Academic Year: ${selectedResultYear}`, 14, 42);
    doc.text(`Exam: ${selectedResultExam}`, 14, 48);
    doc.text(`Class: ${selectedResultClass}`, pageW - 14, 42, { align: 'right' });
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageW - 14, 48, { align: 'right' });

    autoTable(doc, {
      head: [resultColumns.map((col) => col.label)],
      body: resultRows.map((row) => resultColumns.map((col) => String(getCellValue(col, row)))),
      startY: 55,
      theme: 'grid',
      styles: { fontSize: 7 },
      headStyles: { fillColor: [30, 41, 59] },
    });
    doc.save(`ResultSheet_${selectedResultClass}_${selectedResultExam}.pdf`);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800" /></div>;

  // â”€â”€â”€ Wizard step labels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const wizardSteps = ['Basic Info', 'Subjects', 'Grading Scale'];

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      <PageHeader title="Exams & Results" subtitle="Manage exam schedules and class-wise student results">
        {activeModule === 'exams' && (
          <Button onClick={handleOpenModal}><Plus className="w-4 h-4" /> Add Exam</Button>
        )}
      </PageHeader>

      <div className="card p-3 mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveModule('exams')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeModule === 'exams' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
        >
          Exams
        </button>
        <button
          type="button"
          onClick={() => setActiveModule('results')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeModule === 'results' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
        >
          Results
        </button>
      </div>

      {activeModule === 'exams' ? (
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-semibold text-slate-800 mb-3">Upcoming / Active Exams</h3>
            {upcomingExams.length > 0 ? (
              <DataTable columns={examColumns} data={upcomingExams} searchable={false} />
            ) : (
              <div className="card p-8 text-center text-slate-500">No upcoming exams found.</div>
            )}
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800 mb-3">Past Exams</h3>
            {pastExams.length > 0 ? (
              <DataTable columns={examColumns} data={pastExams} searchable={false} />
            ) : (
              <div className="card p-8 text-center text-slate-500">No past exams found.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="card p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SelectInput
              label="Academic Year"
              value={selectedResultYear}
              onChange={(e) => setSelectedResultYear(e.target.value)}
              options={[
                    { value: '2025-26', label: '2025-26' },
                    { value: '2026-27', label: '2026-27' },
                  ]}
            />
            <SelectInput
              label="Select Exam (Published)"
              value={selectedResultExam}
              onChange={(e) => setSelectedResultExam(e.target.value)}
              placeholder="Choose exam"
              options={exams.filter((exam) => exam.academicYear === selectedResultYear).map((exam) => ({ value: exam.name, label: exam.name }))}
            />
            <SelectInput
              label="Select Class"
              value={selectedResultClass}
              onChange={(e) => setSelectedResultClass(e.target.value)}
              placeholder="Choose class"
              options={classOptions}
            />
          </div>

          {resultLoading ? (
            <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800" /></div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-end gap-3 no-print flex-wrap">
                <button type="button" onClick={handlePrint} className="btn-secondary">
                  <Printer className="w-4 h-4" /> Print
                </button>
                <button type="button" onClick={handleExportPDF} className="btn-secondary">
                  <FileText className="w-4 h-4" /> PDF
                </button>
                <button type="button" onClick={handleExportExcel} className="btn-secondary">
                  <FileSpreadsheet className="w-4 h-4" /> Excel
                </button>
                <button type="button" onClick={handleExportCSV} className="btn-secondary">
                  <Download className="w-4 h-4" /> CSV
                </button>
              </div>

              <div className="hidden print:block mb-8 text-center text-black">
                <h1 className="text-2xl font-bold">Shree Swami Vivekanand English School</h1>
                <p className="text-sm text-gray-600">Siddhanath Wadgaon, tq. Gangapur Dist. Chhatrapati Sambhajinagar</p>
                <h2 className="text-lg font-semibold mt-4">Class Result Sheet</h2>
                <div className="flex justify-between mt-6 text-sm font-medium border-b border-gray-300 pb-2">
                  <span>Academic Year: {selectedResultYear}</span>
                  <span>Exam: {selectedResultExam}</span>
                  <span>Class: {selectedResultClass}</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <DataTable columns={resultColumns} data={resultRows} searchable={true} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* â”€â”€â”€ Add Exam Modal (3-step wizard) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Modal isOpen={modalOpen} onClose={handleCloseModal} title="Add New Exam">
        {/* Wizard progress bar */}
        <div className="flex items-center gap-2 mb-6">
          {wizardSteps.map((label, i) => (
            <div key={i} className="flex items-center gap-2 flex-1">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${wizardStep > i + 1 ? 'bg-emerald-500 text-white' : wizardStep === i + 1 ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {i + 1}
              </div>
              <span className={`text-xs font-medium ${wizardStep === i + 1 ? 'text-slate-800' : 'text-slate-400'}`}>{label}</span>
              {i < wizardSteps.length - 1 && <div className="flex-1 h-px bg-slate-200" />}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
        )}

        <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-2">
          {/* â”€â”€ STEP 1: Basic Info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {wizardStep === 1 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SelectInput
                  label="Academic Year"
                  value={form.academicYear}
                  onChange={(e) => setForm({ ...form, academicYear: e.target.value })}
                  options={[
                    { value: '2025-26', label: '2025-26' },
                    { value: '2026-27', label: '2026-27' },
                  ]}
                  required
                />
                <SelectInput
                  label="Exam Type"
                  value={form.examType}
                  onChange={(e) => setForm({ ...form, examType: e.target.value })}
                  options={[
                    { value: 'Unit Test', label: 'Unit Test' },
                    { value: 'Half Yearly', label: 'Half Yearly' },
                    { value: 'Annual', label: 'Annual' },
                  ]}
                  required
                />
              </div>

              <FormInput label="Exam Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Unit Test 1" required />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormInput label="Start Date" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
                <FormInput label="End Date" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormInput label="Max Marks (Legacy/Fallback)" type="number" value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: e.target.value })} />
                <SelectInput
                  label="Status"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  options={[
                    { value: 'Draft', label: 'Draft' },
                    { value: 'Active', label: 'Active' },
                    { value: 'Closed', label: 'Closed' },
                  ]}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  Applicable Classes <span className="text-red-500">*</span>
                </label>
                <div className="max-h-40 overflow-y-auto border border-slate-300 rounded-md p-3 grid grid-cols-2 gap-3 bg-white">
                  {classesList.map((c) => (
                    <label key={c.id || c._id} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.applicableClasses.includes(c.id || c._id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setForm({ ...form, applicableClasses: [...form.applicableClasses, (c.id || c._id)] });
                          } else {
                            setForm({
                              ...form,
                              applicableClasses: form.applicableClasses.filter((id) => id !== (c.id || c._id)),
                            });
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-700">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* â”€â”€ STEP 2: Subject Configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {wizardStep === 2 && (
            <div className="space-y-6">
              {form.applicableClasses.length === 0 ? (
                <div className="text-center text-slate-500 py-10 text-sm">
                  No classes selected. Go back and select at least one class.
                </div>
              ) : (
                classesList
                  .filter((c) => form.applicableClasses.includes(c.id || c._id))
                  .map((cls) => {
                    const subjects = form.classSubjectConfig[cls.id || cls._id] || [];
                    return (
                      <div key={cls.id || cls._id} className="border border-slate-200 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-slate-800">Class: {cls.name}</h4>
                          <button
                            type="button"
                            onClick={() => addSubject(cls.id || cls._id)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            + Add Subject
                          </button>
                        </div>

                        {subjects.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No subjects added. Click "Add Subject" to configure.</p>
                        ) : (
                          <div className="space-y-2">
                            <div className="grid grid-cols-10 gap-2 text-xs font-semibold text-slate-500 px-1">
                              <span className="col-span-4">Subject Name</span>
                              <span className="col-span-2 text-center">Max Marks</span>
                              <span className="col-span-2 text-center">Pass Marks</span>
                              <span className="col-span-2"></span>
                            </div>
                            {subjects.map((sub, idx) => (
                              <div key={idx} className="grid grid-cols-10 gap-2 items-center">
                                <input
                                  type="text"
                                  value={sub.name}
                                  onChange={(e) => updateSubject(cls.id || cls._id, idx, 'name', e.target.value)}
                                  placeholder="e.g. English"
                                  className="col-span-4 px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                                <input
                                  type="number"
                                  value={sub.maxMarks}
                                  min="1"
                                  onChange={(e) => updateSubject(cls.id || cls._id, idx, 'maxMarks', Number(e.target.value))}
                                  className="col-span-2 px-2 py-1.5 border border-slate-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                                <input
                                  type="number"
                                  value={sub.passMarks}
                                  min="0"
                                  onChange={(e) => updateSubject(cls.id || cls._id, idx, 'passMarks', Number(e.target.value))}
                                  className="col-span-2 px-2 py-1.5 border border-slate-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeSubject(cls.id || cls._id, idx)}
                                  className="col-span-2 flex justify-center text-red-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          )}

          {/* â”€â”€ STEP 3: Grading Scale â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {wizardStep === 3 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Define the grading scale for this exam. Must cover 0–100% completely with no gaps or overlaps.
              </p>

              <div className="grid grid-cols-10 gap-2 text-xs font-semibold text-slate-500 px-1">
                <span className="col-span-3">Grade</span>
                <span className="col-span-3 text-center">Min %</span>
                <span className="col-span-3 text-center">Max %</span>
                <span></span>
              </div>

              {form.gradingScale.map((entry, idx) => (
                <div key={idx} className="grid grid-cols-10 gap-2 items-center">
                  <input
                    type="text"
                    value={entry.grade}
                    onChange={(e) => updateGradeRow(idx, 'grade', e.target.value)}
                    placeholder="A+"
                    className="col-span-3 px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <input
                    type="number"
                    value={entry.minPercent}
                    min="0"
                    max="100"
                    step="0.01"
                    onChange={(e) => updateGradeRow(idx, 'minPercent', e.target.value)}
                    className="col-span-3 px-2 py-1.5 border border-slate-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <input
                    type="number"
                    value={entry.maxPercent}
                    min="0"
                    max="100"
                    step="0.01"
                    onChange={(e) => updateGradeRow(idx, 'maxPercent', e.target.value)}
                    className="col-span-3 px-2 py-1.5 border border-slate-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    type="button"
                    onClick={() => removeGradeRow(idx)}
                    className="flex justify-center text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addGradeRow}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium mt-1"
              >
                + Add Grade Row
              </button>
            </div>
          )}
        </div>

        {/* Wizard footer buttons */}
        <div className="flex justify-between gap-3 mt-6 pt-4 border-t border-slate-100 bg-white">
          <div>
            {wizardStep > 1 && (
              <Button variant="secondary" onClick={handleWizardBack}>
                <ChevronLeft className="w-4 h-4" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleCloseModal}>Cancel</Button>
            {wizardStep < 3 ? (
              <Button onClick={handleWizardNext}>
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Create Exam'}
              </Button>
            )}
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default AdminExams;


