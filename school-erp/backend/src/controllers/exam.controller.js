const mongoose = require('mongoose');
const { Exam } = require('../models/Exam');
const SchoolClass = require('../models/SchoolClass');
const { sendSuccess, sendError } = require('../services/academic.service');
const { validateGradingScale, validateSubjectConfig } = require('../services/result.service');

/** Return true only for real, non-null MongoDB ObjectId strings. */
const isValidOid = (v) => v != null && v !== 'null' && v !== 'undefined' && mongoose.Types.ObjectId.isValid(String(v));

// ─── Validate & sanitize classSubjectConfig ───────────────────────────────
const processClassSubjectConfig = async (classSubjectConfig, classIdMap) => {
  // classIdMap: { classIdString → className } for error messages
  if (!Array.isArray(classSubjectConfig) || classSubjectConfig.length === 0) {
    return [];
  }

  const result = [];
  for (const entry of classSubjectConfig) {
    const classId = String(entry.classId || '');
    // Skip null / 'null' / invalid ObjectId values to prevent Mongoose CastError
    if (!isValidOid(classId)) continue;

    const subjects = (entry.subjects || []).map((s) => ({
      name: String(s.name || '').trim(),
      maxMarks: Number(s.maxMarks),
      passMarks: Number(s.passMarks),
    }));

    const className = classIdMap[classId] || classId;
    const validationError = validateSubjectConfig(subjects, className);
    if (validationError) {
      const err = new Error(validationError);
      err.statusCode = 400;
      throw err;
    }

    result.push({ classId, subjects });
  }

  return result;
};

// ─── Validate & sanitize gradingScale ────────────────────────────────────
const processGradingScale = (gradingScale) => {
  if (!Array.isArray(gradingScale) || gradingScale.length === 0) {
    return [];
  }

  const cleaned = gradingScale.map((entry) => ({
    grade: String(entry.grade || '').trim(),
    minPercent: Number(entry.minPercent),
    maxPercent: Number(entry.maxPercent),
  }));

  const validationError = validateGradingScale(cleaned);
  if (validationError) {
    const err = new Error(validationError);
    err.statusCode = 400;
    throw err;
  }

  return cleaned;
};

// ─── Controllers ─────────────────────────────────────────────────────────

const getAllExams = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      filter.status = { $in: req.query.status.split(',') };
    }
    const exams = await Exam.find(filter)
      .sort({ startDate: -1, createdAt: -1 })
      .lean();
    return sendSuccess(res, 200, 'Exams fetched', exams);
  } catch (error) {
    return sendError(res, error);
  }
};

const createExam = async (req, res) => {
  try {
    const { name, startDate, endDate, academicYear, examType, status, maxMarks } = req.body;
    let { applicableClasses } = req.body;
    let className = req.body.class || 'All'; // legacy fallback

    if (!name || !startDate || !endDate) {
      const error = new Error('name, startDate and endDate are required');
      error.statusCode = 400;
      throw error;
    }

    if (new Date(endDate) < new Date(startDate)) {
      const error = new Error('endDate cannot be before startDate');
      error.statusCode = 400;
      throw error;
    }

    const query = { name: String(name).trim() };
    if (academicYear) query.academicYear = String(academicYear).trim();
    const existingExam = await Exam.findOne(query).lean();
    if (existingExam) {
      const error = new Error('An exam with this name already exists for this academic year');
      error.statusCode = 400;
      throw error;
    }

    // Resolve and validate applicable classes
    let classIdMap = {};
    if (Array.isArray(applicableClasses) && applicableClasses.length > 0) {
      // Strip out null / 'null' / non-ObjectId values before querying
      const uniqueClasses = [...new Set(applicableClasses.map(String).filter(isValidOid))];
      if (uniqueClasses.length === 0) {
        const error = new Error('No valid class IDs provided in applicableClasses');
        error.statusCode = 400;
        throw error;
      }
      const classes = await SchoolClass.find({ _id: { $in: uniqueClasses } }).lean();
      if (classes.length === 0) {
        const error = new Error('One or more applicable classes are invalid or not found');
        error.statusCode = 400;
        throw error;
      }
      classes.forEach((c) => { classIdMap[String(c._id)] = c.name; });
      className = classes.map((c) => c.name).join(', ');
      applicableClasses = classes.map((c) => c._id.toString());
    }

    // ── NEW: Validate and process classSubjectConfig ──────────────────────
    const classSubjectConfig = await processClassSubjectConfig(
      req.body.classSubjectConfig,
      classIdMap,
    );

    // ── NEW: Validate and process gradingScale ────────────────────────────
    const gradingScale = processGradingScale(req.body.gradingScale);

    const payload = {
      createdBy: req.user._id,
    };
    if (name) payload.name = String(name).trim();
    if (className) payload.class = className;
    if (startDate) payload.startDate = startDate;
    if (endDate) payload.endDate = endDate;
    if (academicYear) payload.academicYear = String(academicYear).trim();
    if (examType) payload.examType = String(examType).trim();
    if (applicableClasses) {
      const uniqueClasses = [...new Set(applicableClasses.map(String))];
      payload.applicableClasses = uniqueClasses;
    }
    if (status) payload.status = String(status).trim();
    if (maxMarks !== undefined) payload.maxMarks = Number(maxMarks);
    if (classSubjectConfig.length > 0) payload.classSubjectConfig = classSubjectConfig;
    if (gradingScale.length > 0) payload.gradingScale = gradingScale;

    const exam = await Exam.create(payload);

    return sendSuccess(res, 201, 'Exam created', exam);
  } catch (error) {
    return sendError(res, error);
  }
};

const updateExam = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};

    if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
    if (req.body.startDate !== undefined) updates.startDate = req.body.startDate;
    if (req.body.endDate !== undefined) updates.endDate = req.body.endDate;
    if (req.body.academicYear !== undefined) updates.academicYear = String(req.body.academicYear).trim();
    if (req.body.examType !== undefined) updates.examType = String(req.body.examType).trim();
    if (req.body.status !== undefined) updates.status = String(req.body.status).trim();
    if (req.body.maxMarks !== undefined) updates.maxMarks = Number(req.body.maxMarks);

    // Support legacy and new workflow for classes
    if (req.body.applicableClasses !== undefined) {
      if (Array.isArray(req.body.applicableClasses) && req.body.applicableClasses.length > 0) {
        // Strip out null / 'null' / non-ObjectId values before querying
        const uniqueClasses = [...new Set(req.body.applicableClasses.map(String).filter(isValidOid))];
        const classes = uniqueClasses.length > 0
          ? await SchoolClass.find({ _id: { $in: uniqueClasses } }).lean()
          : [];
        if (classes.length === 0) {
          const error = new Error('One or more applicable classes are invalid or not found');
          error.statusCode = 400;
          throw error;
        }
        updates.class = classes.map((c) => c.name).join(', ');
        updates.applicableClasses = classes.map((c) => c._id.toString());
      } else {
        updates.applicableClasses = [];
        updates.class = 'All';
      }
    } else if (req.body.class !== undefined) {
      updates.class = String(req.body.class).trim() || 'All';
    }

    const exam = await Exam.findById(id);
    if (!exam) {
      const error = new Error('Exam not found');
      error.statusCode = 404;
      throw error;
    }

    // ── NEW: Validate and update classSubjectConfig ───────────────────────
    if (req.body.classSubjectConfig !== undefined) {
      if (exam.status === 'Published') {
        throw Object.assign(
          new Error('Cannot modify subject configuration for a Published exam.'),
          { statusCode: 400 }
        );
      }
      // Build classIdMap from existing applicable classes
      const classIds = exam.applicableClasses.map(String);
      const classes = await SchoolClass.find({ _id: { $in: classIds } }).lean();
      const classIdMap = {};
      classes.forEach((c) => { classIdMap[String(c._id)] = c.name; });

      updates.classSubjectConfig = await processClassSubjectConfig(
        req.body.classSubjectConfig,
        classIdMap,
      );
    }

    // ── NEW: Validate and update gradingScale ─────────────────────────────
    if (req.body.gradingScale !== undefined) {
      if (exam.status === 'Published') {
        throw Object.assign(
          new Error('Cannot modify grading scale for a Published exam.'),
          { statusCode: 400 }
        );
      }
      updates.gradingScale = processGradingScale(req.body.gradingScale);
    }

    // Handle Admin Review of a specific submission
    if (req.body.reviewSubmission) {
      if (['Published', 'Closed'].includes(exam.status)) {
        throw Object.assign(new Error('Cannot review submissions for a ' + exam.status + ' exam.'), { statusCode: 400 });
      }

      const { classId, section, subjectId, subjectName, status, remarks } = req.body.reviewSubmission;

      if (!['Approved', 'Rejected', 'Unlocked'].includes(status)) {
        throw Object.assign(new Error('Invalid review status'), { statusCode: 400 });
      }
      if (status === 'Rejected' && (!remarks || remarks.trim() === '')) {
        throw Object.assign(new Error('Remarks are mandatory when rejecting a submission'), { statusCode: 400 });
      }

      // Match by subjectId if provided, otherwise by subjectName
      const matchCriteria = { classId, section };
      if (subjectId) matchCriteria.subjectId = subjectId;
      else if (subjectName) matchCriteria.subjectName = subjectName;

      const updateResult = await Exam.updateOne(
        {
          _id: exam._id,
          subjectSubmissions: {
            $elemMatch: matchCriteria
          }
        },
        {
          $set: {
            'subjectSubmissions.$.status': status,
            'subjectSubmissions.$.remarks': remarks || '',
            'subjectSubmissions.$.approvedBy': req.user._id,
            'subjectSubmissions.$.approvedAt': new Date()
          }
        }
      );

      if (updateResult.modifiedCount === 0) {
        throw Object.assign(new Error('Submission not found'), { statusCode: 404 });
      }

      return sendSuccess(res, 200, 'Submission updated', null);
    }

    if (updates.status === 'Published' && exam.status !== 'Published') {
      const unapprovedSubmissions = exam.subjectSubmissions?.filter((s) => s.status !== 'Approved');
      if (unapprovedSubmissions && unapprovedSubmissions.length > 0) {
        throw Object.assign(new Error('Cannot publish exam. All entered subject submissions must be Approved first.'), { statusCode: 400 });
      }
      updates.publishedBy = req.user._id;
      updates.publishedAt = new Date();
    }

    Object.assign(exam, updates);
    if (exam.endDate && exam.startDate && new Date(exam.endDate) < new Date(exam.startDate)) {
      const error = new Error('endDate cannot be before startDate');
      error.statusCode = 400;
      throw error;
    }

    await exam.save();
    return sendSuccess(res, 200, 'Exam updated', exam);
  } catch (error) {
    return sendError(res, error);
  }
};

const deleteExam = async (req, res) => {
  try {
    const { id } = req.params;
    const exam = await Exam.findByIdAndDelete(id);

    if (!exam) {
      const error = new Error('Exam not found');
      error.statusCode = 404;
      throw error;
    }

    return sendSuccess(res, 200, 'Exam deleted', exam);
  } catch (error) {
    return sendError(res, error);
  }
};

const getExamById = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('subjectSubmissions.classId', 'name')
      .populate('subjectSubmissions.subjectId', 'name')
      .populate('subjectSubmissions.teacherId', 'name')
      .populate('subjectSubmissions.approvedBy', 'name')
      .populate('classSubjectConfig.classId', 'name')
      .lean();

    if (!exam) {
      const error = new Error('Exam not found');
      error.statusCode = 404;
      throw error;
    }

    return sendSuccess(res, 200, 'Exam fetched', exam);
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports = {
  getAllExams,
  createExam,
  updateExam,
  deleteExam,
  getExamById,
};
