const { Student } = require('../models/Student');
const Assignment = require('../models/Assignment');
const SchoolClass = require('../models/SchoolClass');
const {
  isValidObjectId,
  buildStudentFilters,
  buildStudentListOptions,
  normalizeStudentPayload,
} = require('../services/student.service');

const { sendSuccess, sendError } = require('../utils/responseHelper');

const resolveStudentQuery = (identifier) => {
  return isValidObjectId(identifier)
    ? { _id: identifier }
    : { studentId: identifier };
};

const getStudentOrThrow = async (identifier) => {
  const student = await Student.findOne(resolveStudentQuery(identifier));

  if (!student) {
    const error = new Error('Student not found');
    error.statusCode = 404;
    throw error;
  }

  return student;
};

const createStudent = async (req, res) => {
  try {
    const payload = normalizeStudentPayload(req.body, false);
    
    if (req.body.isTcIssued) {
      payload.status = 'inactive';
      payload.tcCertificate = {
        downloadCount: 1,
        firstDownloadedAt: new Date(),
        lastDownloadedAt: new Date(),
      };
    }

    console.log('--- CREATE STUDENT PAYLOAD ---', payload);
    const student = await Student.create(payload);
    console.log('--- CREATED STUDENT ---', student);

    return sendSuccess(res, 201, 'Student created successfully', student);
  } catch (error) {
    if (error.code === 11000) {
      error.statusCode = 409;
      const keys = Object.keys(error.keyPattern || {});
      const keyPattern = keys[0];
      
      if (keyPattern === 'studentId') {
        error.message = 'Duplicate studentId detected. Please retry.';
      } else if (keyPattern === 'prnNumber') {
        error.message = `PRN Number is already in use.`;
      } else {
        error.message = `Duplicate record detected for field(s): ${keys.join(', ')}. Value: ${JSON.stringify(error.keyValue || {})}`;
      }
    }

    return sendError(res, error);
  }
};

const getAllStudents = async (req, res) => {
  try {
    const filters = buildStudentFilters(req.query);

    if (req.user && req.user.role === 'teacher') {
      const assigned = req.user.assignedClasses || [];
      const SchoolClass = require('../models/SchoolClass');
      const schoolClasses = await SchoolClass.find().lean();
      
      const allowedConditions = [];
      for (const c of schoolClasses) {
         if (assigned.includes(c.name)) {
            allowedConditions.push({ 'academic.class': c.name });
         } else if (c.sections) {
            for (const sec of c.sections) {
               if (assigned.includes(`${c.name}-${sec}`)) {
                  allowedConditions.push({ 'academic.class': c.name, 'academic.section': sec });
               }
            }
         }
      }

      if (allowedConditions.length === 0) {
         return sendSuccess(res, 200, 'Students fetched successfully', {
           students: [],
           pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
         });
      }

      if (filters.$and) {
         filters.$and.push({ $or: allowedConditions });
      } else {
         filters.$and = [{ $or: allowedConditions }];
      }
      
      delete filters['academic.class'];
      if (req.query.class) filters['academic.class'] = req.query.class.trim();
      
      filters.status = 'active';
    }

    const options = buildStudentListOptions(req.query);

    const [students, total] = await Promise.all([
      Student.find(filters)
        .sort(options.sort)
        .skip(options.skip)
        .limit(options.limit)
        .lean(),
      Student.countDocuments(filters),
    ]);

    return sendSuccess(res, 200, 'Students fetched successfully', {
      students,
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages: Math.ceil(total / options.limit),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

const getStudentById = async (req, res) => {
  try {
    const { id } = req.params;

    const student = await Student.findOne(resolveStudentQuery(id)).lean();

    if (!student) {
      const error = new Error('Student not found');
      error.statusCode = 404;
      throw error;
    }

    return sendSuccess(res, 200, 'Student fetched successfully', student);
  } catch (error) {
    return sendError(res, error);
  }
};

const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const student = await getStudentOrThrow(id);

    const updates = normalizeStudentPayload(req.body, true);

    // Merge partial nested updates safely.
    if (updates.parent) {
      updates.parent = {
        fatherName: updates.parent.fatherName ?? student.parent.fatherName,
        motherName: updates.parent.motherName ?? student.parent.motherName,
        parentContact: updates.parent.parentContact ?? student.parent.parentContact,
      };
    }

    if (updates.academic) {
      updates.academic = {
        class: updates.academic.class ?? student.academic.class,
        section: updates.academic.section ?? student.academic.section,
        admissionDate: updates.academic.admissionDate ?? student.academic.admissionDate,
      };
    }

    const updatedStudent = await Student.findByIdAndUpdate(student._id, updates, {
      new: true,
      runValidators: true,
    });

    return sendSuccess(res, 200, 'Student updated successfully', updatedStudent);
  } catch (error) {
    return sendError(res, error);
  }
};

const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;

    const student = await Student.findOneAndDelete(resolveStudentQuery(id));

    if (!student) {
      const error = new Error('Student not found');
      error.statusCode = 404;
      throw error;
    }

    return sendSuccess(res, 200, 'Student deleted permanently', student);
  } catch (error) {
    return sendError(res, error);
  }
};

const updateSpecialFee = async (req, res) => {
  try {
    const { id } = req.params;
    const { customFee, customFeeReason } = req.body;

    const student = await getStudentOrThrow(id);

    // If customFee is explicitly null or empty string, we unset it
    let finalCustomFee = null;
    if (customFee !== null && customFee !== undefined && customFee !== '') {
      finalCustomFee = Number(customFee);
      if (Number.isNaN(finalCustomFee) || finalCustomFee < 0) {
        const error = new Error('customFee must be a valid non-negative number');
        error.statusCode = 400;
        throw error;
      }
    }

    student.customFee = finalCustomFee;
    student.customFeeReason = customFeeReason || '';
    
    await student.save();

    return sendSuccess(res, 200, 'Special fee updated successfully', student);
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports = {
  createStudent,
  getAllStudents,
  getStudentById,
  updateStudent,
  deleteStudent,
  updateSpecialFee,
};