const Mark = require('../models/Mark');
const { Student } = require('../models/Student');
const SchoolClassModel = require('../models/SchoolClass');
const { sendSuccess, sendError } = require('../services/academic.service');
const { calculateStudentResult, applyGradingScale } = require('../services/result.service');


// ─── getMarks ──────────────────────────────────────────────────────────────
// Returns marks for a class-subject-exam combination.
// Also returns the exam's subjectConfig for this class (read-only for teachers).
const getMarks = async (req, res) => {
  try {
    const className = String(req.query.class || '').trim();
    const section = String(req.query.section || '').trim();
    const examName = String(req.query.examName || '').trim();
    const subjectName = String(req.query.subjectName || '').trim();

    if (!examName || !className) {
      const error = new Error('examName and className are required');
      error.statusCode = 400;
      throw error;
    }

    const filter = { className, section, examName };
    if (subjectName) filter.subjectName = subjectName;
    
    if (req.user.role === 'teacher') {
      filter.teacherId = req.user._id;
    }

    const marks = await Mark.find(filter).populate('studentId', 'name').lean();

    const { Exam } = require('../models/Exam');
    const SchoolClass = require('../models/SchoolClass');
    const Subject = require('../models/Subject');

    const exam = await Exam.findOne({ name: examName }).lean();
    const schoolClass = await SchoolClass.findOne({ name: className }).lean();
    const subject = subjectName ? await Subject.findOne({ name: subjectName }).lean() : null;

    let submissionStatus = 'Draft';
    // If subjectName is omitted, we determine status from the first subject in the exam config
    if (exam && schoolClass) {
      if (subjectName) {
        const submission = exam.subjectSubmissions?.find((s) =>
          String(s.classId) === String(schoolClass._id) &&
          s.section === section &&
          (subject ? String(s.subjectId) === String(subject._id) : (s.subjectName || '').toLowerCase() === subjectName.toLowerCase())
        );
        if (submission) {
          submissionStatus = submission.status;
        }
      } else {
        const firstSubmission = exam.subjectSubmissions?.find((s) =>
          String(s.classId) === String(schoolClass._id) &&
          s.section === section
        );
        if (firstSubmission) {
          submissionStatus = firstSubmission.status;
        }
      }
    }

    // ── NEW: Return subject config for this class (teacher reads max/pass marks) ──
    let subjectConfig = null;
    let allSubjectsConfig = [];
    if (exam && schoolClass && exam.classSubjectConfig) {
      const classConfig = exam.classSubjectConfig.find(
        (c) => String(c.classId) === String(schoolClass._id)
      );
      if (classConfig) {
        allSubjectsConfig = classConfig.subjects || [];
        if (subjectName) {
          subjectConfig = allSubjectsConfig.find(
            (s) => s.name.toLowerCase() === subjectName.toLowerCase()
          ) || null;
        } else {
          subjectConfig = allSubjectsConfig;
        }
      }
    }

    return sendSuccess(res, 200, 'Marks fetched', { marks, submissionStatus, subjectConfig });
  } catch (error) {
    return sendError(res, error);
  }
};

// ─── saveMarks ─────────────────────────────────────────────────────────────
const saveMarks = async (req, res) => {
  try {
    const { className, examName, subjectName, entries = [], isSubmit } = req.body;
    const section = String(req.body.section || 'A').trim();

    if (!className || !examName) {
      const error = new Error('className and examName are required');
      error.statusCode = 400;
      throw error;
    }

    const { Exam } = require('../models/Exam');
    const SchoolClass = require('../models/SchoolClass');
    const Subject = require('../models/Subject');

    const exam = await Exam.findOne({ name: examName }).lean();
    if (!exam) throw Object.assign(new Error('Exam not found'), { statusCode: 404 });

    if (['Closed', 'Published'].includes(exam.status)) {
      throw Object.assign(new Error('Exam is ' + exam.status + ' and cannot be modified'), { statusCode: 400 });
    }

    const schoolClass = await SchoolClass.findOne({ name: className }).lean();
    if (!schoolClass) throw Object.assign(new Error('Class not found'), { statusCode: 404 });

    const targetStatus = isSubmit ? 'Submitted' : 'Draft';
    let subjectsToUpdate = [];

    // Helper to get max marks for a subject
    const getSubjectConfig = (sName) => {
      let confMax = exam.maxMarks || 100;
      if (exam.classSubjectConfig) {
        const classConfig = exam.classSubjectConfig.find(
          (c) => String(c.classId) === String(schoolClass._id)
        );
        if (classConfig && classConfig.subjects) {
          const subjectConfig = classConfig.subjects.find(
            (s) => s.name.toLowerCase() === sName.toLowerCase()
          );
          if (subjectConfig) {
            return subjectConfig;
          }
        }
      }
      return { name: sName, maxMarks: confMax, passMarks: 35 };
    };

    if (subjectName) {
      subjectsToUpdate.push(subjectName);
      const existingSubmission = exam.subjectSubmissions?.find((s) =>
        String(s.classId) === String(schoolClass._id) &&
        s.section === section &&
        (s.subjectName || '').toLowerCase() === subjectName.toLowerCase()
      );
      if (existingSubmission && ['Submitted', 'Approved'].includes(existingSubmission.status)) {
        throw Object.assign(new Error('Marks are already ' + existingSubmission.status + ' and cannot be modified'), { statusCode: 400 });
      }
    } else {
      // Grid mode: update all configured subjects
      if (exam.classSubjectConfig) {
        const classConfig = exam.classSubjectConfig.find(
          (c) => String(c.classId) === String(schoolClass._id)
        );
        if (classConfig && classConfig.subjects) {
          subjectsToUpdate = classConfig.subjects.map(s => s.name);
        }
      }
      // Check if ANY of the subjects are locked
      for (const sName of subjectsToUpdate) {
        const existingSubmission = exam.subjectSubmissions?.find((s) =>
          String(s.classId) === String(schoolClass._id) &&
          s.section === section &&
          (s.subjectName || '').toLowerCase() === sName.toLowerCase()
        );
        if (existingSubmission && ['Submitted', 'Approved'].includes(existingSubmission.status)) {
          throw Object.assign(new Error('Marks for ' + sName + ' are already ' + existingSubmission.status + ' and cannot be modified'), { statusCode: 400 });
        }
      }
    }

    const examGradingScale = exam.gradingScale || [];
    const applyGradingScale = require('../services/result.service').applyGradingScale;

    if (entries.length > 0) {
      const studentIds = [...new Set(entries.map((entry) => entry.studentId))];
      const students = await Student.find({
        _id: { $in: studentIds },
        'academic.class': className,
        'academic.section': section,
      }).select('_id').lean();

      const validStudentIds = new Set(students.map((student) => String(student._id)));

      const bulkOps = entries.map((entry) => {
        const studentId = String(entry.studentId || '');
        const entrySubjectName = subjectName || entry.subjectName;
        
        if (!entrySubjectName) {
           throw Object.assign(new Error('subjectName is missing in entry'), { statusCode: 400 });
        }

        const attendanceStatus = entry.attendanceStatus || 'Present';
        const marks = attendanceStatus === 'Present' ? Number(entry.marks) : 0;

        if (!validStudentIds.has(studentId)) {
          throw Object.assign(new Error('One or more students do not belong to selected class and section'), { statusCode: 400 });
        }

        if (attendanceStatus === 'Present' && (Number.isNaN(marks) || marks < 0)) {
          throw Object.assign(new Error('Each marks value must be a valid number >= 0 when present'), { statusCode: 400 });
        }

        const conf = getSubjectConfig(entrySubjectName);
        if (attendanceStatus === 'Present' && marks > conf.maxMarks) {
          throw Object.assign(new Error(`Marks (${marks}) cannot exceed maximum marks (${conf.maxMarks}) for subject "${entrySubjectName}"`), { statusCode: 400 });
        }

        const gradeForMark = (m) => {
          const pct = conf.maxMarks > 0 ? (m / conf.maxMarks) * 100 : 0;
          return applyGradingScale(pct, examGradingScale);
        };

        const updateData = {
          examName,
          className,
          section,
          subjectName: entrySubjectName,
          studentId,
          teacherId: req.user._id,
          attendanceStatus,
          grade: attendanceStatus === 'Present' ? gradeForMark(marks) : '-',
        };

        if (attendanceStatus === 'Present') {
          updateData.marks = marks;
        }

        return {
          updateOne: {
            filter: { examName, className, section, subjectName: entrySubjectName, studentId },
            update: { $set: updateData },
            upsert: true,
          },
        };
      });

      if (bulkOps.length > 0) {
        await Mark.bulkWrite(bulkOps);
      }
    }

    // Update subjectSubmissions for all subjects involved
    for (const sName of subjectsToUpdate) {
       const existingSubmission = exam.subjectSubmissions?.find((s) =>
         String(s.classId) === String(schoolClass._id) &&
         s.section === section &&
         (s.subjectName || '').toLowerCase() === sName.toLowerCase()
       );

       const updatePayload = {
         'subjectSubmissions.$.status': targetStatus,
         'subjectSubmissions.$.teacherId': req.user._id,
       };
       if (isSubmit) updatePayload['subjectSubmissions.$.submittedAt'] = new Date();

       if (existingSubmission) {
         await Exam.updateOne(
           {
             _id: exam._id,
             subjectSubmissions: {
               $elemMatch: {
                 classId: schoolClass._id,
                 section: section,
                 subjectName: sName
               }
             }
           },
           { $set: updatePayload }
         );
       } else {
         await Exam.updateOne(
           { _id: exam._id },
           {
             $push: {
               subjectSubmissions: {
                 classId: schoolClass._id,
                 section: section,
                 subjectName: sName,
                 teacherId: req.user._id,
                 status: targetStatus,
                 submittedAt: isSubmit ? new Date() : null,
               }
             }
           }
         );
       }
    }

    return require('../services/academic.service').sendSuccess(res, 200, 'Marks saved', null);
  } catch (error) {
    return require('../services/academic.service').sendError(res, error);
  }
};

// ─── getStudentMarks ───────────────────────────────────────────────────────
const getStudentMarks = async (req, res) => {
  try {
    const { studentId, examName } = req.params;

    if (!studentId || !examName) {
      const error = new Error('studentId and examName are required');
      error.statusCode = 400;
      throw error;
    }

    const { Exam } = require('../models/Exam');
    const exam = await Exam.findOne({ name: examName }).lean();
    if (!exam) {
      const error = new Error('Exam not found');
      error.statusCode = 404;
      throw error;
    }
    const marks = await Mark.find({
      studentId: studentId,
      examName: examName,
    }).lean();

    return sendSuccess(res, 200, 'Student marks fetched', marks);
  } catch (error) {
    return sendError(res, error);
  }
};

// ─── getClassResultSheet ───────────────────────────────────────────────────
// Generates the class-wise result sheet dynamically.
// Uses result.service.js for all calculations — no stored results.
const getClassResultSheet = async (req, res) => {
  try {
    const { examName, className, section } = req.query;

    if (!examName || !className || !section) {
      const error = new Error('examName, className, and section are required');
      error.statusCode = 400;
      throw error;
    }

    const { Exam } = require('../models/Exam');

    const exam = await Exam.findOne({ name: examName }).lean();
    if (!exam) {
      const error = new Error('Exam not found');
      error.statusCode = 404;
      throw error;
    }

    // ── NEW: Get per-class subject config ─────────────────────────────────
    const schoolClass = await SchoolClassModel.findOne({ name: className }).lean();
    let subjectConfigs = null; // null = use legacy fallback
    if (schoolClass && Array.isArray(exam.classSubjectConfig) && exam.classSubjectConfig.length > 0) {
      const classConfig = exam.classSubjectConfig.find(
        (c) => String(c.classId) === String(schoolClass._id)
      );
      if (classConfig && classConfig.subjects.length > 0) {
        subjectConfigs = classConfig.subjects; // [{ name, maxMarks, passMarks }]
      }
    }

    const gradingScale = exam.gradingScale || []; // [] = legacy fallback in service

    // 1. Fetch Students
    const students = await Student.find({
      'academic.class': className,
      'academic.section': section,
      status: 'active',
    }).select('name studentId generalRegisterNumber prnNumber rollNumber').lean();

    const studentMap = {};
    students.forEach((s) => {
      studentMap[String(s._id)] = {
        ...s,
        subjects: {}, // { subjectName: { marks, grade, attendanceStatus } }
      };
    });

    // 2. Fetch Marks
    const marks = await Mark.find({ examName, className, section }).lean();

    // 3. Aggregate marks per student
    marks.forEach((m) => {
      const sid = String(m.studentId);
      if (studentMap[sid]) {
        studentMap[sid].subjects[m.subjectName] = {
          marks: m.marks,
          grade: m.grade,
          attendanceStatus: m.attendanceStatus,
        };
      }
    });

    // ── NEW: Build subjects list with max/pass marks ──────────────────────
    let subjectsList;
    if (subjectConfigs) {
      // Configured exam: use admin-defined order and metadata
      subjectsList = subjectConfigs.map((s) => ({
        name: s.name,
        maxMarks: s.maxMarks,
        passMarks: s.passMarks,
      }));
    } else {
      // Legacy fallback: discover subject names from mark records
      const subjectSet = new Set();
      marks.forEach((m) => subjectSet.add(m.subjectName));
      subjectsList = Array.from(subjectSet)
        .sort()
        .map((name) => ({
          name,
          maxMarks: exam.maxMarks || 100,
          passMarks: null, // legacy — no per-subject passing marks
        }));
    }

    // 4. Calculate results using result.service.js — no DB storage
    const resultSheet = Object.values(studentMap).map((student) => {
      const result = calculateStudentResult(
        student.subjects,
        subjectConfigs,
        gradingScale,
        exam.maxMarks || 100,
      );

      return {
        _id: student._id,
        name: student.name,
        rollNumber: student.rollNumber,
        prnNumber: student.prnNumber,
        studentId: student.studentId,
        subjects: student.subjects,
        totalObtained: result.totalObtained,
        totalMaxMarks: result.totalMaxMarks,
        percentage: result.percentage,
        grade: result.grade,
        result: result.result,
        failedSubjects: result.failedSubjects,
        // Backward compat aliases
        totalMarks: result.totalObtained,
        overallGrade: result.grade,
        overallStatus: result.result,
      };
    });

    return sendSuccess(res, 200, 'Class result sheet fetched', {
      examDetails: {
        name: exam.name,
        academicYear: exam.academicYear,
        maxMarks: exam.maxMarks,
        hasSubjectConfig: !!subjectConfigs,
        hasGradingScale: gradingScale.length > 0,
      },
      subjects: subjectsList,
      results: resultSheet,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports = {
  getMarks,
  saveMarks,
  getStudentMarks,
  getClassResultSheet,
};
