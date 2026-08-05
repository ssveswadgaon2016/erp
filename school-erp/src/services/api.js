import apiClient from './apiClient';

const API = apiClient;

const toUpperRole = (role = '') => String(role).toUpperCase();

const getErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }

  if (error?.message) {
    return error.message;
  }

  return fallback;
};

const unwrapResponse = (response) => {
  const payload = response?.data;

  if (payload?.success === false) {
    throw new Error(payload.message || 'Request failed');
  }

  return payload?.data;
};

const toDateString = (value) => {
  if (!value) return '';
  return new Date(value).toISOString().split('T')[0];
};

const mapStudent = (student) => {
  const className = student?.academic?.class || '';
  const section = student?.academic?.section || '';

  return {
    id: student?._id,
    studentId: student?.studentId,
    grNo: student?.generalRegisterNumber || '',

    name: student?.name || '-',
    surname: student?.surname || '',
    rollNumber: student?.academic?.rollNumber || null,
    class: section ? `${className}-${section}` : className,
    gender: student?.gender ? `${student.gender[0].toUpperCase()}${student.gender.slice(1)}` : '-',
    phone: student?.contact || '-',
    status: student?.status ? `${student.status[0].toUpperCase()}${student.status.slice(1)}` : 'Active',
    admissionDate: toDateString(student?.academic?.admissionDate),
    feeStatus: 'Pending',
    raw: student,
  };
};


const mapFeeStatus = (status) => {
  if (status === 'paid') return 'Paid';
  if (status === 'partial') return 'Partial';
  return 'Pending';
};

const mapFeeRecord = (feeDetails) => {
  const fee = feeDetails?.fee;
  const student = fee?.studentId;

  if (!fee || !student) return null;

  const className = student?.academic?.class || '';
  const section = student?.academic?.section || '';

  return {
    id: fee?._id,
    studentId: student?._id,
    studentName: student?.surname ? `${student.name} ${student.surname}` : (student?.name || '-'),
    class: section ? `${className}-${section}` : className,
    amount: fee?.totalAmount || 0,
    paid: fee?.paidAmount || 0,
    due: fee?.dueAmount || 0,
    status: mapFeeStatus(fee?.status),
    date: toDateString(fee?.updatedAt || fee?.createdAt),
    paymentHistory: feeDetails?.paymentHistory || [],
  };
};

const fetchStudentPageRaw = async (params = {}) => {
  const response = await apiClient.get('/api/students', { params });
  const data = unwrapResponse(response);
  return {
    students: data?.students || [],
    pagination: data?.pagination || null,
  };
};

const fetchStudentListRaw = async (params = {}) => {
  const { students } = await fetchStudentPageRaw(params);
  return students;
};

export const loginUser = async (email, password) => {
  try {
    const response = await API.post('/api/auth/login', { email, password });
    const data = unwrapResponse(response);

    return {
      token: data.token,
      user: {
        ...data.user,
        id: data.user.id,
        role: toUpperRole(data.user.role),
      },
    };
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Login failed. Please try again.'));
  }
};

export const getCurrentUser = async () => {
  try {
    const response = await apiClient.get('/api/auth/me');
    const data = unwrapResponse(response);

    return {
      ...data.user,
      role: toUpperRole(data.user.role),
    };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const getStudents = async (params = {}) => {
  const queryKey = JSON.stringify(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));

  try {
    return await withShortCache(`students:${queryKey}`, 12000, async () => {
      const students = await fetchStudentListRaw(params);
      return students.map(mapStudent);
    });
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch students.'));
  }
};

export const createStudent = async (formData) => {
  try {
    const classParts = String(formData.class || '').split('-');
    const academicClass = classParts[0] || '10';
    const section = classParts[1] || 'A';
    const today = new Date();
    const defaultDob = new Date(today.getFullYear() - 10, today.getMonth(), today.getDate());

    const payload = {
      generalRegisterNumber: formData.grNo || formData.generalRegisterNumber,
      aadhaarNumber: formData.aadhaarNumber,
      penNumber: formData.penNumber,
      name: formData.name,
      surname: formData.surname || '',
      dob: formData.dob || defaultDob.toISOString().split('T')[0],
      gender: String(formData.gender || 'other').toLowerCase(),
      contact: formData.phone || '0000000000',
      address: formData.address || 'Not provided',
      passportPhoto: formData.passportPhoto || '',
      religion: formData.religion || '',
      previousSchool: formData.previousSchool || '',
      caste: formData.caste || '',
      subCaste: formData.subCaste || '',
      placeOfBirth: formData.placeOfBirth || '',
      nationality: formData.nationality || 'Indian',
      fatherEducation: formData.fatherEducation || '',
      motherEducation: formData.motherEducation || '',
      parent: {
        fatherName: formData.fatherName || 'Not provided',
        motherName: formData.motherName || 'Not provided',
        parentContact: formData.parentContact || formData.phone || '0000000000',
      },
      academic: {
        class: academicClass,
        section,

        admissionDate: formData.admissionDate || new Date().toISOString().split('T')[0],
      },
      status: String(formData.status || 'active').toLowerCase(),
      isTcIssued: formData.isTcIssued || false,
      ...(formData.isRTE !== undefined && { isRTE: formData.isRTE }),
    };

    const response = await apiClient.post('/api/students', payload);
    const data = unwrapResponse(response);
    invalidateCache('students:');
    return mapStudent(data);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to create student.'));
  }
};

export const updateStudentById = async (id, formData) => {
  try {
    const classParts = String(formData.class || '').split('-');
    const academicClass = classParts[0] || '10';
    const section = classParts[1] || 'A';

    const payload = {
      generalRegisterNumber: formData.grNo || formData.generalRegisterNumber,
      aadhaarNumber: formData.aadhaarNumber,
      penNumber: formData.penNumber,
      name: formData.name,
      surname: formData.surname,
      contact: formData.phone,
      gender: String(formData.gender || '').toLowerCase(),
      passportPhoto: formData.passportPhoto,
      dob: formData.dob,
      address: formData.address,
      religion: formData.religion,
      previousSchool: formData.previousSchool,
      caste: formData.caste,
      subCaste: formData.subCaste,
      placeOfBirth: formData.placeOfBirth,
      nationality: formData.nationality,
      fatherEducation: formData.fatherEducation,
      motherEducation: formData.motherEducation,
      parent: {
        fatherName: formData.fatherName,
        motherName: formData.motherName,
        parentContact: formData.parentContact || formData.phone || '0000000000',
      },
      academic: {
        class: academicClass,
        section,

        admissionDate: formData.admissionDate,
      },
      status: String(formData.status || 'active').toLowerCase(),
      ...(formData.isRTE !== undefined && { isRTE: formData.isRTE }),
    };

    const response = await apiClient.put(`/api/students/${id}`, payload);
    const data = unwrapResponse(response);
    invalidateCache('students:');
    return mapStudent(data);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to update student.'));
  }
};

export const deleteStudentById = async (id) => {
  try {
    const response = await apiClient.delete(`/api/students/${id}`);
    invalidateCache('students:');
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to delete student.'));
  }
};

export const getAllStaff = async (params = {}) => {
  const queryKey = JSON.stringify(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));

  try {
    return await withShortCache(`staff:${queryKey}`, 12000, async () => {
      const response = await apiClient.get('/api/staff', { params });
      const data = unwrapResponse(response);
      return data?.staff || [];
    });
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch staff.'));
  }
};

export const createStaff = async (payload) => {
  try {
    const response = await apiClient.post('/api/staff', payload);
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to create staff member.'));
  }
};

export const updateStaffById = async (id, payload) => {
  try {
    const response = await apiClient.put(`/api/staff/${id}`, payload);
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to update staff member.'));
  }
};

export const deleteStaffById = async (id) => {
  try {
    const response = await apiClient.delete(`/api/staff/${id}`);
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to deactivate staff member.'));
  }
};

export const getClerks = async () => {
  try {
    const staffList = await getAllStaff({ role: 'clerk' });
    return staffList.map((clerk) => ({
      id: clerk.id || clerk._id,
      name: clerk.name,
      phone: clerk.contact || '-',
      email: clerk.email,
      status: clerk.status === 'active' ? 'Active' : 'Inactive',
      joinDate: toDateString(clerk.createdAt),
      role: toUpperRole(clerk.role),
    }));
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch clerks.'));
  }
};

export const getTeachers = async () => {
  try {
    const staffList = await getAllStaff({ role: 'teacher' });

    return staffList.map((teacher) => {
      const teacherId = teacher.id || teacher._id;
      const assignedClasses = Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses : [];
      const resolvedClasses = assignedClasses.filter(Boolean);
      const subject = teacher.subject || 'Not assigned';

      return {
        id: teacherId,
        name: teacher.name,
        subject,
        phone: teacher.contact || '-',
        email: teacher.email,
        classes: resolvedClasses,
        status: teacher.status === 'active' ? 'Active' : 'Inactive',
        joinDate: toDateString(teacher.createdAt),
        role: toUpperRole(teacher.role),
      };
    });
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch teachers.'));
  }
};

export const getClasses = async () => {
  try {
    const response = await apiClient.get('/api/classes');
    const classes = unwrapResponse(response) || [];

    return classes.map((item) => ({
      id: item._id,
      name: item.name,
      sections: item.sections || [],
      students: 0,
      classTeacher: '—',
      raw: item,
    }));
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch classes.'));
  }
};

export const createClass = async ({ name, sections }) => {
  try {
    const response = await apiClient.post('/api/classes', { name, sections });
    const created = unwrapResponse(response);

    return {
      id: created._id,
      name: created.name,
      sections: created.sections || [],
      students: 0,
      classTeacher: '—',
      raw: created,
    };
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to create class.'));
  }
};

export const updateClassById = async (id, payload) => {
  try {
    const response = await apiClient.put(`/api/classes/${id}`, payload);
    const updated = unwrapResponse(response);

    return {
      id: updated._id,
      name: updated.name,
      sections: updated.sections || [],
      students: 0,
      classTeacher: '—',
      raw: updated,
    };
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to update class.'));
  }
};

export const deleteClassById = async (id) => {
  try {
    const response = await apiClient.delete(`/api/classes/${id}`);
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to delete class.'));
  }
};

export const getSubjects = async (classId) => {
  const cacheKey = classId ? `subjects:${classId}` : 'subjects:all';

  try {
    return await withShortCache(cacheKey, 12000, async () => {
      const response = await apiClient.get('/api/subjects', {
        params: classId ? { classId } : undefined,
      });
      return unwrapResponse(response) || [];
    });
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch subjects.'));
  }
};

export const createSubject = async (payload) => {
  try {
    const response = await apiClient.post('/api/subjects', payload);
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to create subject.'));
  }
};

export const getAssignments = async () => {
  try {
    return await withShortCache('assignments:all', 12000, async () => {
      const response = await apiClient.get('/api/assignments');
      return unwrapResponse(response) || [];
    });
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch assignments.'));
  }
};

export const createAssignment = async (payload) => {
  try {
    const response = await apiClient.post('/api/assignments', payload);
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to create assignment.'));
  }
};

export const getAttendance = async () => {
  try {
    const classes = await getClasses();
    const rows = [];
    const today = new Date().toISOString().split('T')[0];

    await Promise.all(
      classes.flatMap((schoolClass) => {
        const sectionsToFetch = (!schoolClass.sections || schoolClass.sections.length === 0) 
          ? [''] 
          : schoolClass.sections;

        return sectionsToFetch.map(async (section) => {
          try {
            const response = await apiClient.get('/api/attendance/report', {
              params: {
                classId: schoolClass.id,
                section,
              },
            });

            const data = unwrapResponse(response);
            const summary = data?.summary;
            const total = summary?.totalMarked || 0;
            const present = summary?.present || 0;
            const absent = summary?.absent || 0;

            const classNameLabel = section ? `${schoolClass.name}-${section}` : schoolClass.name;

            rows.push({
              id: `${schoolClass.id}-${section}`,
              class: classNameLabel,
              date: today,
              present,
              absent,
              total,
              percentage: summary?.presentPercentage || 0,
            });
          } catch {
            // Ignore classes that have no report yet.
          }
        });
      })
    );

    return rows.sort((a, b) => a.class.localeCompare(b.class));
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch attendance report.'));
  }
};

export const markAttendance = async ({ classId, section, date, students, markAllPresent = false }) => {
  try {
    const response = await apiClient.post('/api/attendance', {
      classId,
      section,
      date,
      students,
      markAllPresent,
    });
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to save attendance.'));
  }
};

export const getFees = async () => {
  try {
    const response = await apiClient.get('/api/fees');
    const data = unwrapResponse(response) || [];
    return data.map(mapFeeRecord).filter(Boolean);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch fee records.'));
  }
};

const ensureFeeStructure = async (studentId, totalAmount) => {
  try {
    await apiClient.get(`/api/fees/${studentId}`);
  } catch (error) {
    if (error?.response?.status !== 404) {
      throw error;
    }

    await apiClient.post('/api/fees', { studentId, totalAmount });
  }
};

export const recordPayment = async ({ studentId, amount, paid, mode = 'cash', breakdown = {} }) => {
  try {
    if (!studentId) {
      throw new Error('Student ID is required.');
    }

    const totalAmount = Number(amount || paid || 0);
    const paidAmount = Number(paid || 0);

    await ensureFeeStructure(studentId, totalAmount);

    if (paidAmount > 0) {
      await apiClient.post('/api/payments', {
        studentId: studentId,
        amount: paidAmount,
        mode,
        breakdown,
      });
    }

    const feeResponse = await apiClient.get(`/api/fees/${studentId}`);
    return mapFeeRecord(unwrapResponse(feeResponse));
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to record payment.'));
  }
};

export const getExpenses = async (params = {}) => {
  try {
    const response = await apiClient.get('/api/expenses', { params });
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch expenses.'));
  }
};

export const createExpense = async (payload) => {
  try {
    const response = await apiClient.post('/api/expenses', payload);
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to create expense.'));
  }
};

export const getBonafideHtml = async (studentId) => {
  try {
    const response = await apiClient.get(`/api/documents/bonafide/${studentId}`, {
      responseType: 'text',
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to generate bonafide certificate.'));
  }
};

// Legacy PDF download — kept for backward compat
export const downloadTC = async (studentId) => {
  try {
    const response = await apiClient.get(`/api/documents/tc/${studentId}`, {
      responseType: 'blob',
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to download transfer certificate.'));
  }
};

// Get TC status for a student (print count, canPrintOriginal, etc.)
export const getTCStatus = async (studentId) => {
  try {
    const response = await apiClient.get(`/api/documents/tc-status/${studentId}`);
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch TC status.'));
  }
};

// Get TC as HTML string for print-window approach (original, one-time)
export const getTCHtml = async (studentId, params = {}) => {
  try {
    const response = await apiClient.get(`/api/documents/tc/${studentId}/html`, {
      params,
      responseType: 'text',
    });
    return response.data; // raw HTML string
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to generate Transfer Certificate. It may have already been printed.'));
  }
};

// Get Admission Form as HTML string for print-window
export const getAdmissionFormHtml = async (studentId) => {
  try {
    const response = await apiClient.get(`/api/documents/admission-form/${studentId}/html`, {
      responseType: 'text',
    });
    return response.data; // raw HTML string
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to generate Admission Form.'));
  }
};

// Get duplicate TC as HTML string for print-window
export const getDuplicateTCHtml = async (studentId, requestId, params = {}) => {
  try {
    const response = await apiClient.get(`/api/documents/tc/${studentId}/duplicate-html`, {
      params: { requestId, ...params },
      responseType: 'text',
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to generate duplicate TC.'));
  }
};

// Get all print logs (optionally filtered by studentId)
export const getTCPrintLogs = async (studentId) => {
  try {
    const response = await apiClient.get('/api/documents/tc-print-logs', {
      params: studentId ? { studentId } : undefined,
    });
    return unwrapResponse(response) || [];
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch print logs.'));
  }
};


export const downloadFeeReceipt = async (studentId, paymentId) => {
  try {
    const response = await apiClient.get(`/api/documents/receipt/${studentId}`, {
      params: paymentId ? { paymentId } : undefined,
      responseType: 'blob',
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to download fee receipt.'));
  }
};

export const getFeeReceiptHtml = async (studentId, paymentId) => {
  try {
    const response = await apiClient.get(`/api/documents/receipt/${studentId}/html`, {
      params: paymentId ? { paymentId } : undefined,
      responseType: 'text',
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch fee receipt HTML.'));
  }
};

const mapDocumentRecord = (record) => ({
  id: record?._id,
  name: record?.name || '-',
  student: record?.student || '-',
  studentId: record?.studentId,
  type: record?.type || 'Other',
  date: toDateString(record?.date),
  status: record?.status || 'Uploaded',
  fileName: record?.fileName || '',
  fileMimeType: record?.fileMimeType || '',
  fileSize: record?.fileSize || 0,
  hasFile: Boolean(record?.hasFile),
});

const mapDuplicateTCRequest = (request) => ({
  id: request?.id,
  studentId: request?.studentId,
  studentName: request?.studentName || '-',
  studentCode: request?.studentCode || '-',
  requestedById: request?.requestedById,
  requestedByName: request?.requestedByName || '-',
  status: request?.status || 'pending',
  reason: request?.reason || '',
  adminComment: request?.adminComment || '',
  consumed: Boolean(request?.consumed),
  reviewedByName: request?.reviewedByName || '',
  reviewedAt: toDateString(request?.reviewedAt),
  createdAt: toDateString(request?.createdAt),
});

export const getDocumentRecords = async () => {
  try {
    const response = await apiClient.get('/api/documents');
    const data = unwrapResponse(response) || [];
    return data.map(mapDocumentRecord);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch document records.'));
  }
};

export const createDocumentRecord = async (payload) => {
  try {
    const response = await apiClient.post('/api/documents', payload);
    return mapDocumentRecord(unwrapResponse(response));
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to create document record.'));
  }
};

export const deleteDocumentRecordById = async (id) => {
  try {
    const response = await apiClient.delete(`/api/documents/${id}`);
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to delete document record.'));
  }
};

export const createDuplicateTCRequest = async (studentId, reason = '', documentInfo = null) => {
  try {
    const payload = {
      reason,
      ...(documentInfo || {}),
    };
    const response = await apiClient.post(`/api/documents/tc/${studentId}/request-duplicate`, payload);
    return mapDuplicateTCRequest(unwrapResponse(response));
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to submit duplicate TC request.'));
  }
};

export const getDuplicateTCRequests = async (params = {}) => {
  try {
    const response = await apiClient.get('/api/documents/tc-duplicate-requests', { params });
    const data = unwrapResponse(response) || [];
    return data.map(mapDuplicateTCRequest);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch duplicate TC requests.'));
  }
};

export const reviewDuplicateTCRequest = async (requestId, action, adminComment = '') => {
  try {
    const response = await apiClient.patch(`/api/documents/tc-duplicate-requests/${requestId}/review`, {
      action,
      adminComment,
    });
    return mapDuplicateTCRequest(unwrapResponse(response));
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to review duplicate TC request.'));
  }
};

const mapNotice = (notice) => ({
  id: notice?._id,
  title: notice?.title || '-',
  content: notice?.content || '-',
  date: toDateString(notice?.createdAt),
  author: notice?.author || '-',
  status: notice?.status || 'Draft',
  priority: notice?.priority || 'Medium',
});

const mapExam = (exam) => ({
  id: exam?._id,
  _id: exam?._id,
  name: exam?.name || '-',
  class: exam?.class || 'All',
  academicYear: exam?.academicYear || '',
  startDate: toDateString(exam?.startDate),
  endDate: toDateString(exam?.endDate),
  status: exam?.status || 'Upcoming',
  // Subject configuration and grading — needed by TeacherMarks and AdminExams
  classSubjectConfig: exam?.classSubjectConfig || [],
  gradingScale: exam?.gradingScale || [],
  applicableClasses: exam?.applicableClasses || [],
});

// Prevent duplicate dashboard network calls caused by rapid remounts in development.
const responseCache = new Map();

const readCache = (key) => {
  const item = responseCache.get(key);
  if (!item) return null;

  if (item.promise) {
    return item.promise;
  }

  if (item.expiresAt > Date.now()) {
    return Promise.resolve(item.data);
  }

  responseCache.delete(key);
  return null;
};

const withShortCache = async (key, ttlMs, fetcher) => {
  const cached = readCache(key);
  if (cached) {
    return cached;
  }

  const inFlight = (async () => {
    try {
      const data = await fetcher();
      responseCache.set(key, {
        data,
        expiresAt: Date.now() + ttlMs,
      });
      return data;
    } catch (error) {
      responseCache.delete(key);
      throw error;
    }
  })();

  responseCache.set(key, {
    promise: inFlight,
    expiresAt: Date.now() + ttlMs,
  });

  return inFlight;
};

export const invalidateCache = (prefix) => {
  if (!prefix) {
    responseCache.clear();
    return;
  }
  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix)) {
      responseCache.delete(key);
    }
  }
};

export const getDashboardStats = async (role) => {
  const normalizedRole = String(role || '').toUpperCase();
  const cacheKey = `dashboard:stats:${normalizedRole}`;

  try {
    return await withShortCache(cacheKey, 15000, async () => {
      const response = await apiClient.get('/api/dashboard/stats', {
        params: { role: normalizedRole },
      });
      return unwrapResponse(response);
    });
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch dashboard stats.'));
  }
};

export const getExams = async () => {
  try {
    const response = await apiClient.get('/api/exams');
    const data = unwrapResponse(response) || [];
    return data.map(mapExam);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch exams.'));
  }
};

export const createExam = async (payload) => {
  try {
    const response = await apiClient.post('/api/exams', payload);
    return mapExam(unwrapResponse(response));
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to create exam.'));
  }
};

export const getTimetable = async () => {
  try {
    const response = await apiClient.get('/api/timetable');
    return unwrapResponse(response) || [];
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch timetable.'));
  }
};

export const getNotices = async () => {
  try {
    const response = await apiClient.get('/api/notices');
    const data = unwrapResponse(response) || [];
    return data.map(mapNotice);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch notices.'));
  }
};

export const createNotice = async (payload) => {
  try {
    const response = await apiClient.post('/api/notices', payload);
    return mapNotice(unwrapResponse(response));
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to create notice.'));
  }
};

export const updateNoticeById = async (id, payload) => {
  try {
    const response = await apiClient.patch(`/api/notices/${id}`, payload);
    return mapNotice(unwrapResponse(response));
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to update notice.'));
  }
};

export const deleteNoticeById = async (id) => {
  try {
    const response = await apiClient.delete(`/api/notices/${id}`);
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to delete notice.'));
  }
};

export const getRecentActivity = async () => {
  try {
    return await withShortCache('dashboard:recent-activity', 10000, async () => {
      const response = await apiClient.get('/api/dashboard/recent-activity');
      return unwrapResponse(response) || [];
    });
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch recent activity.'));
  }
};

export const getAllStudentsForReports = async ({ pageSize = 100 } = {}) => {
  const normalizedPageSize = Math.min(Math.max(Number(pageSize) || 100, 1), 100);
  const allStudents = [];
  let page = 1;
  let totalPages = 1;

  try {
    while (page <= totalPages) {
      const { students, pagination } = await fetchStudentPageRaw({
        page,
        limit: normalizedPageSize,
      });

      allStudents.push(...students);
      totalPages = pagination?.totalPages || 1;
      page += 1;
    }

    return allStudents.map(mapStudent);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch students for report export.'));
  }
};

export const getMarksByExamAndClass = async ({ className, section, examName, subjectName }) => {
  try {
    const response = await apiClient.get('/api/marks', {
      params: {
        class: className,
        section,
        examName,
        subjectName,
      },
    });

    const data = unwrapResponse(response) || {};
    const marksArray = Array.isArray(data) ? data : (data.marks || []);
    const submissionStatus = data.submissionStatus || 'Draft';
    // NEW: subject config returned from backend (maxMarks, passMarks) for teacher UI
    const subjectConfig = data.subjectConfig || null;

    const mappedMarks = marksArray.map((item) => ({
      id: item?._id,
      studentId: item?.studentId?._id || item?.studentId,
      subjectName: item?.subjectName,
      marks: item?.marks,
      grade: item?.grade,
      attendanceStatus: item?.attendanceStatus || 'Present',
    }));
    return { marks: mappedMarks, submissionStatus, subjectConfig };
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch marks.'));
  }
};

export const saveMarksBulk = async ({ className, section, examName, subjectName, entries, rollNumbers, isSubmit }) => {
  try {
    const response = await apiClient.post('/api/marks/bulk', {
      className,
      section,
      examName,
      subjectName,
      entries,
      rollNumbers,
      isSubmit,
    });

    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to save marks.'));
  }
};

export const unlockMarksSubmission = async ({ className, section, examName }) => {
  try {
    const response = await apiClient.put('/api/marks/unlock', {
      className,
      section,
      examName,
    });

    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to unlock marks.'));
  }
};

const mapHomework = (item) => ({
  id: item?._id,
  class: item?.className && item?.section ? `${item.className}-${item.section}` : '-',
  subject: item?.subject || '-',
  title: item?.title || '-',
  description: item?.description || '',
  dueDate: toDateString(item?.dueDate),
  status: item?.status || 'Active',
});

export const getHomework = async (params = {}) => {
  try {
    const response = await apiClient.get('/api/homework', { params });
    const data = unwrapResponse(response) || [];
    return data.map(mapHomework);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch homework list.'));
  }
};

export const createHomework = async (payload) => {
  try {
    const response = await apiClient.post('/api/homework', payload);
    return mapHomework(unwrapResponse(response));
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to create homework.'));
  }
};

export const deleteHomeworkById = async (id) => {
  try {
    const response = await apiClient.delete(`/api/homework/${id}`);
     return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to delete homework.'));
  }
};

export const getSchoolSettings = async () => {
  try {
    const response = await apiClient.get('/api/settings');
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch school settings.'));
  }
};

export const updateSchoolSettings = async (payload) => {
  try {
    const response = await apiClient.put('/api/settings', payload);
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to update school settings.'));
  }
};

export const getClassFees = async () => {
  try {
    const response = await apiClient.get('/api/class-fees');
    return unwrapResponse(response) || [];
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch class fee list.'));
  }
};

export const getClassFeeByPattern = async (classPattern) => {
  try {
    const response = await apiClient.get(`/api/class-fees/${classPattern}`);
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch class fee structure.'));
  }
};

export const saveClassFee = async (payload) => {
  try {
    const response = await apiClient.post('/api/class-fees', payload);
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to save class fee structure.'));
  }
};

export const deleteClassFee = async (id) => {
  try {
    const response = await apiClient.delete(`/api/class-fees/${id}`);
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to delete class fee structure.'));
  }
};

export const getExamById = async (id) => {
  try {
    const response = await apiClient.get('/api/exams/' + id);
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch exam details.'));
  }
};

export const updateExam = async (id, data) => {
  try {
    const response = await apiClient.put('/api/exams/' + id, data);
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to update exam.'));
  }
};

export const getClassResultSheet = async (params) => {
  try {
    const response = await apiClient.get('/api/marks/class-sheet', { params });
    return unwrapResponse(response);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Unable to fetch class result sheet.'));
  }
};

/**
 * Get the subject configuration for a specific class within an exam.
 * Returns the array of { name, maxMarks, passMarks } for that class,
 * or an empty array if the exam has no subject config.
 *
 * @param {string} examId
 * @param {string} classId
 * @returns {Promise<Array>}
 */
export const getExamSubjectConfig = async (examId, classId) => {
  try {
    const exam = await getExamById(examId);
    if (!exam || !Array.isArray(exam.classSubjectConfig)) return [];
    const entry = exam.classSubjectConfig.find(
      (c) => String(c.classId?._id || c.classId) === String(classId)
    );
    return entry ? entry.subjects : [];
  } catch {
    return [];
  }
};
