import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import SelectInput from '../../components/SelectInput';
import Button from '../../components/Button';
import { Save, CheckCircle, Search } from 'lucide-react';
import {
  getClasses,
  getExams,
  getSubjects,
  getMarksByExamAndClass,
  getStudents,
  saveMarksBulk,
} from '../../services/api';

// ─── Grade preview using a configurable grading scale ───────────────────────
const gradeFromScale = (marks, maxMarks, gradingScale) => {
  if (!maxMarks || maxMarks <= 0) return '—';
  const pct = (marks / maxMarks) * 100;

  if (Array.isArray(gradingScale) && gradingScale.length > 0) {
    const sorted = [...gradingScale].sort((a, b) => b.minPercent - a.minPercent);
    for (const entry of sorted) {
      if (pct >= entry.minPercent && pct <= entry.maxPercent) return entry.grade;
    }
    return sorted[sorted.length - 1]?.grade || 'F';
  }

  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 35) return 'D';
  return 'F';
};

const TeacherMarks = () => {
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedExam, setSelectedExam] = useState('');
  
  // 2D State dictionaries: [studentId][subjectName]
  const [marks, setMarks] = useState({});
  const [attendance, setAttendance] = useState({});
  
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [classOptions, setClassOptions] = useState([]);
  const [examOptions, setExamOptions] = useState([]);
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [allSystemSubjects, setAllSystemSubjects] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState('Draft');

  const [className, section] = useMemo(() => {
    const parts = String(selectedClass).split('::');
    return [parts[0] || '', parts[1] || ''];
  }, [selectedClass]);

  // ─── Bootstrap ────────────────────────────────────────────────────────────
  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [classes, exams, subjects] = await Promise.all([
        getClasses(),
        getExams({ status: 'Active,In Progress' }),
        getSubjects(),
      ]);

      const classesList = classes.flatMap((item) => {
        if (!item.sections || item.sections.length === 0) {
          return [{ value: `${item.name}::`, label: item.name, classObj: item }];
        }
        return item.sections.map((sec) => ({
          value: `${item.name}::${sec}`,
          label: `${item.name}-${sec}`,
          classObj: item,
        }));
      });

      setClassOptions(classesList);
      setExamOptions(exams);
      setAllSystemSubjects(subjects.map((sub) => ({ name: sub.name, maxMarks: 100, passMarks: 35 })));
      setSelectedClass((prev) => prev || classesList[0]?.value || '');
      setSelectedExam((prev) => prev || exams[0]?.name || '');
    } catch (err) {
      setError(err.message || 'Unable to load class and exam data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  // ─── Derive columns & fetch data ──────────────────────────────────────────
  const loadGrid = useCallback(async () => {
    if (!selectedClass || !selectedExam) {
      setStudents([]);
      setMarks({});
      setAttendance({});
      setSubjectOptions([]);
      setSubmissionStatus('Draft');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const [selectedClassName, selectedSection] = String(selectedClass).split('::');
      const exam = examOptions.find((e) => e.name === selectedExam);
      
      const classOpt = classOptions.find((o) => o.value === selectedClass);
      const classId = classOpt?.classObj?.id || classOpt?.classObj?._id;

      const [studentsData, marksResponse] = await Promise.all([
        getStudents({ class: selectedClassName, section: selectedSection, limit: 1000 }),
        getMarksByExamAndClass({
          className: selectedClassName,
          section: selectedSection || 'A',
          examName: selectedExam,
        }),
      ]);

      let subjectsToRender = [];
      let backendStatus = 'Draft';
      
      // Determine columns (subjectOptions)
      if (exam && classId && Array.isArray(exam.classSubjectConfig) && exam.classSubjectConfig.length > 0) {
        const classConfig = exam.classSubjectConfig.find(
          (c) => String(c.classId?._id || c.classId) === String(classId)
        );
        if (classConfig && classConfig.subjects.length > 0) {
          subjectsToRender = classConfig.subjects;
        } else {
          subjectsToRender = allSystemSubjects;
        }
      } else {
        subjectsToRender = allSystemSubjects;
      }
      
      setSubjectOptions(subjectsToRender);

      if (marksResponse) {
        backendStatus = marksResponse.submissionStatus || 'Draft';
      }

      setStudents(studentsData.map((student) => ({ id: student.id, name: student.name })));
      setSubmissionStatus(backendStatus);

      // Map existing marks to 2D dictionaries
      const newMarks = {};
      const newAttendance = {};
      
      studentsData.forEach(student => {
        newMarks[student.id] = {};
        newAttendance[student.id] = {};
      });

      const marksData = marksResponse?.marks || [];
      marksData.forEach((item) => {
        if (!newMarks[item.studentId]) newMarks[item.studentId] = {};
        if (!newAttendance[item.studentId]) newAttendance[item.studentId] = {};
        
        newMarks[item.studentId][item.subjectName] = item.marks;
        newAttendance[item.studentId][item.subjectName] = item.attendanceStatus || 'Present';
      });

      setMarks(newMarks);
      setAttendance(newAttendance);

    } catch (err) {
      setError(err.message || 'Unable to load grid data.');
    } finally {
      setLoading(false);
    }
  }, [selectedClass, selectedExam, classOptions, examOptions, allSystemSubjects]);

  useEffect(() => { loadGrid(); }, [loadGrid]);

  // ─── Change Handlers ──────────────────────────────────────────────────────
  const handleMarkChange = (studentId, subjectName, value, maxMarks) => {
    if (submissionStatus === 'Submitted' || submissionStatus === 'Approved') return;

    const num = Math.min(maxMarks || 100, Math.max(0, Number(value) || 0));
    setMarks((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [subjectName]: value === '' ? '' : num
      }
    }));
  };

  const handleAttendanceToggle = (studentId, subjectName) => {
    if (submissionStatus === 'Submitted' || submissionStatus === 'Approved') return;
    
    setAttendance((prev) => {
      const current = prev[studentId]?.[subjectName] || 'Present';
      let next = 'Present';
      if (current === 'Present') next = 'Absent';
      else if (current === 'Absent') next = 'Exempt';
      else next = 'Present';
      
      return {
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [subjectName]: next
        }
      };
    });
    
    // Clear marks if not present
    setMarks((prev) => {
      const current = attendance[studentId]?.[subjectName] || 'Present';
      if (current === 'Present') { // transitioning to absent
        return {
          ...prev,
          [studentId]: {
            ...prev[studentId],
            [subjectName]: ''
          }
        };
      }
      return prev;
    });
  };

  const handleKeyDown = (e, rowIdx, colIdx) => {
    const maxRow = filteredStudents.length - 1;
    const maxCol = subjectOptions.length - 1;

    let targetRow = rowIdx;
    let targetCol = colIdx;

    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      targetRow = Math.min(rowIdx + 1, maxRow);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      targetRow = Math.max(rowIdx - 1, 0);
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && e.target.selectionStart === e.target.value.length) {
      targetCol = Math.min(colIdx + 1, maxCol);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && e.target.selectionStart === 0) {
      targetCol = Math.max(colIdx - 1, 0);
      e.preventDefault();
    } else {
      return;
    }

    const nextInput = document.getElementById(`input-${targetRow}-${targetCol}`);
    if (nextInput) {
      nextInput.focus();
      nextInput.select();
    }
  };

  const currentExamGradingScale = useMemo(() => {
    const exam = examOptions.find((e) => e.name === selectedExam);
    return exam?.gradingScale || [];
  }, [examOptions, selectedExam]);

  // ─── Save & Submit ────────────────────────────────────────────────────────
  const handleSave = async (isSubmit = false) => {
    if (isSubmit && !window.confirm('Are you sure you want to submit? You cannot edit marks after submission unless an admin unlocks them.')) {
      return;
    }

    // Validation: if submitting, check for missing marks
    if (isSubmit) {
       for (const student of students) {
          for (const sub of subjectOptions) {
             const att = attendance[student.id]?.[sub.name] || 'Present';
             const mk = marks[student.id]?.[sub.name];
             if (att === 'Present' && (mk === undefined || mk === '')) {
                setError(`Missing marks for ${student.name} in ${sub.name}. Cannot submit.`);
                return;
             }
          }
       }
    }

    setSaving(true);
    setError('');

    try {
      const entries = [];
      students.forEach((student) => {
        subjectOptions.forEach((sub) => {
          const status = attendance[student.id]?.[sub.name] || 'Present';
          const markVal = marks[student.id]?.[sub.name];
          
          if (status !== 'Present' || (markVal !== undefined && markVal !== '')) {
            entries.push({
              studentId: student.id,
              subjectName: sub.name,
              attendanceStatus: status,
              marks: status !== 'Present' ? 0 : Number(markVal)
            });
          }
        });
      });

      if (entries.length === 0 && !isSubmit) {
        setSaving(false);
        return;
      }

      await saveMarksBulk({
        className,
        section,
        examName: selectedExam,
        entries,
        isSubmit,
      });

      if (isSubmit) setSubmissionStatus('Submitted');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || 'Unable to save marks.');
    } finally {
      setSaving(false);
    }
  };

  const isLocked = submissionStatus === 'Submitted' || submissionStatus === 'Approved';

  const filteredStudents = students.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      <div className="shrink-0">
        <PageHeader title="Enter Exam Marks" subtitle="Spreadsheet Grid Entry">
          <div className="flex gap-3 flex-wrap">
            <div className="w-48 relative">
               <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
               <input
                 type="text"
                 placeholder="Search Student..."
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-400"
               />
            </div>
            <div className="w-36">
              {classOptions.length === 1 ? (
                <div className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700">{classOptions[0].label}</div>
              ) : classOptions.length > 1 ? (
                <SelectInput value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} options={classOptions} />
              ) : (
                <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-400">No classes assigned</div>
              )}
            </div>
            <div className="w-44">
              <SelectInput
                value={selectedExam}
                onChange={(e) => setSelectedExam(e.target.value)}
                options={examOptions.map((exam) => ({ value: exam.name, label: exam.name }))}
              />
            </div>
          </div>
        </PageHeader>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
        )}

        {saved && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg flex items-center gap-2 transition-opacity">
            <CheckCircle className="w-4 h-4" /> Marks saved successfully!
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800" />
          </div>
        ) : (
          <div className="w-full h-full overflow-auto">
            <table className="w-full min-w-max border-collapse relative">
              <thead className="sticky top-0 z-20 bg-slate-50 shadow-[0_1px_0_0_#e2e8f0]">
                <tr>
                  <th className="sticky left-0 z-30 bg-slate-50 p-3 text-left text-xs font-semibold text-slate-600 border-r border-slate-200 w-16 shadow-[1px_0_0_0_#e2e8f0]">Roll</th>
                  <th className="sticky left-16 z-30 bg-slate-50 p-3 text-left text-xs font-semibold text-slate-600 border-r border-slate-200 w-64 shadow-[1px_0_0_0_#e2e8f0]">Student Name</th>
                  {subjectOptions.map((sub, i) => (
                    <th key={i} className="p-3 text-center border-r border-slate-200 min-w-[140px] align-top">
                      <div className="text-sm font-bold text-slate-800 mb-1">{sub.name}</div>
                      <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider flex justify-center gap-2">
                        <span>Max: {sub.maxMarks || 100}</span>
                        <span>Pass: {sub.passMarks || 35}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((student, idx) => (
                  <tr key={student.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 p-3 text-sm text-slate-600 border-r border-slate-200 font-medium shadow-[1px_0_0_0_#e2e8f0]">
                      {idx + 1}
                    </td>
                    <td className="sticky left-16 z-10 bg-white group-hover:bg-slate-50 p-3 text-sm text-slate-800 border-r border-slate-200 font-semibold shadow-[1px_0_0_0_#e2e8f0] truncate max-w-[16rem]">
                      {student.name}
                    </td>
                    {subjectOptions.map((sub, i) => {
                      const mark = marks[student.id]?.[sub.name];
                      const att = attendance[student.id]?.[sub.name] || 'Present';
                      const max = sub.maxMarks || 100;
                      const pass = sub.passMarks || 35;
                      
                      const isBelowPass = att === 'Present' && mark !== '' && mark !== undefined && Number(mark) < pass;
                      const isOverMax = att === 'Present' && mark !== '' && mark !== undefined && Number(mark) > max;
                      
                      let grade = '—';
                      if (att !== 'Present') grade = att;
                      else if (mark !== undefined && mark !== '') grade = gradeFromScale(Number(mark), max, currentExamGradingScale);

                      return (
                        <td key={i} className="p-2 border-r border-slate-100 relative">
                           <div className="flex items-center gap-1 justify-center">
                             <button
                               onClick={() => handleAttendanceToggle(student.id, sub.name)}
                               disabled={isLocked}
                               title="Click to toggle Present/Absent/Exempt"
                               className={`w-7 h-7 rounded shrink-0 text-xs font-bold transition-colors ${
                                 isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:ring-2 hover:ring-slate-300'
                               } ${
                                 att === 'Present' ? 'bg-slate-100 text-slate-400' :
                                 att === 'Absent' ? 'bg-red-100 text-red-600' :
                                 'bg-amber-100 text-amber-600'
                               }`}
                             >
                               {att === 'Present' ? 'P' : att === 'Absent' ? 'A' : 'E'}
                             </button>
                             <div className="relative flex-1">
                               <input
                                 type="number"
                                 min="0"
                                 max={max}
                                 value={mark ?? ''}
                                 onChange={(e) => handleMarkChange(student.id, sub.name, e.target.value, max)}
                                 disabled={isLocked || att !== 'Present'}
                                 className={`w-full px-2 py-1.5 text-center text-sm border rounded bg-transparent focus:outline-none focus:ring-2 focus:ring-slate-500 ${
                                   (isLocked || att !== 'Present') ? 'text-slate-400 border-transparent bg-slate-50' :
                                   isOverMax ? 'border-red-500 bg-red-50 text-red-700 focus:ring-red-500' :
                                   isBelowPass ? 'border-orange-300 bg-orange-50 text-orange-700' :
                                   'border-slate-200 hover:border-slate-300 bg-white'
                                 }`}
                                 placeholder={att === 'Present' ? '-' : ''}
                                 id={`input-${idx}-${i}`}
                                 onKeyDown={(e) => handleKeyDown(e, idx, i)}
                               />
                             </div>
                             <div className={`w-8 text-center text-xs font-medium shrink-0 ${
                               grade === 'F' ? 'text-red-500' : 
                               grade === 'Absent' || grade === 'Exempt' || grade === '—' ? 'text-slate-400' : 
                               'text-slate-700'
                             }`}>
                               {grade === 'Absent' || grade === 'Exempt' ? '' : grade}
                             </div>
                           </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={subjectOptions.length + 2} className="px-4 py-10 text-center text-slate-400 bg-white">
                      No students found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="shrink-0 flex items-center justify-between mt-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Grid Status</h3>
            <p className="text-xs text-slate-500">Current state of the marks for this class</p>
          </div>
          <span className={`ml-2 px-3 py-1 text-xs font-bold tracking-wide uppercase rounded-full ${
            submissionStatus === 'Draft' || submissionStatus === 'Unlocked' ? 'bg-slate-100 text-slate-700' :
            submissionStatus === 'Submitted' ? 'bg-amber-100 text-amber-700' :
            submissionStatus === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
            'bg-red-100 text-red-700'
          }`}>
            {submissionStatus}
          </span>
        </div>
        
        <div className="flex gap-3">
          {!isLocked && (
            <>
              <Button onClick={() => handleSave(false)} disabled={saving} variant="secondary">
                <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Draft'}
              </Button>
              <Button onClick={() => handleSave(true)} disabled={saving} variant="primary">
                <CheckCircle className="w-4 h-4" /> {saving ? 'Submitting...' : 'Submit to Admin'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherMarks;
