/**
 * result.service.js
 *
 * Reusable calculation service for the class-wise Result Sheet.
 * Used by: getClassResultSheet (mark.controller), PDF, Excel, CSV exports.
 *
 * ARCHITECTURE NOTE: The ERP generates a class-wise Result Sheet only.
 * Results are NOT stored permanently. All calculations are done dynamically.
 */

/**
 * Apply a configurable grading scale to a percentage.
 * Falls back to hardcoded legacy grading if no scale is provided.
 *
 * @param {number} percent - Percentage obtained (0–100)
 * @param {Array}  gradingScale - Array of { grade, minPercent, maxPercent }
 * @returns {string} grade label e.g. "A+", "B", "F"
 */
const applyGradingScale = (percent, gradingScale) => {
  if (Array.isArray(gradingScale) && gradingScale.length > 0) {
    // Sort descending by minPercent so highest bracket is checked first
    const sorted = [...gradingScale].sort((a, b) => b.minPercent - a.minPercent);
    for (const entry of sorted) {
      if (percent >= entry.minPercent && percent <= entry.maxPercent) {
        return entry.grade;
      }
    }
    // If out of all ranges (shouldn't happen with valid scale), return lowest grade
    const lowest = sorted[sorted.length - 1];
    return lowest ? lowest.grade : 'F';
  }

  // --- Legacy hardcoded fallback ---
  if (percent >= 90) return 'A+';
  if (percent >= 80) return 'A';
  if (percent >= 70) return 'B+';
  if (percent >= 60) return 'B';
  if (percent >= 50) return 'C';
  if (percent >= 35) return 'D';
  return 'F';
};

/**
 * Determine the legacy pass threshold from a grading scale.
 * The "pass" threshold is the minimum percentage of the lowest non-F grade.
 * Falls back to 35 if no scale provided.
 *
 * @param {Array} gradingScale
 * @returns {number}
 */
const getPassThreshold = (gradingScale) => {
  if (Array.isArray(gradingScale) && gradingScale.length > 0) {
    // Find the lowest minPercent among non-F grades
    const nonFail = gradingScale
      .filter((e) => e.grade !== 'F')
      .sort((a, b) => a.minPercent - b.minPercent);
    if (nonFail.length > 0) return nonFail[0].minPercent;
  }
  return 35; // legacy default
};

/**
 * Calculate a single student's result.
 *
 * @param {Object} studentSubjectMarks
 *   Map of subjectName → { marks: Number, attendanceStatus: String }
 *
 * @param {Array} subjectConfigs
 *   Array of { name: String, maxMarks: Number, passMarks: Number }
 *   If empty/null, only overall percentage logic runs (backward compat).
 *
 * @param {Array} gradingScale
 *   Array of { grade, minPercent, maxPercent }
 *   Pass null/empty to use legacy hardcoded grading.
 *
 * @param {number} legacyMaxMarksPerSubject
 *   Used as fallback maxMarks when subjectConfigs are not available.
 *
 * @returns {Object} {
 *   totalObtained:  Number,
 *   totalMaxMarks:  Number,
 *   percentage:     String (2 decimal places),
 *   grade:          String,
 *   result:         'Pass' | 'Fail',
 *   failedSubjects: String[],
 * }
 */
const calculateStudentResult = (
  studentSubjectMarks,
  subjectConfigs,
  gradingScale,
  legacyMaxMarksPerSubject = 100,
) => {
  let totalObtained = 0;
  let totalMaxMarks = 0;
  const failedSubjects = [];

  const hasConfig = Array.isArray(subjectConfigs) && subjectConfigs.length > 0;

  if (hasConfig) {
    // --- New workflow: use per-subject config ---
    for (const config of subjectConfigs) {
      const entry = studentSubjectMarks[config.name];
      const attendanceStatus = entry?.attendanceStatus || 'Present';

      totalMaxMarks += config.maxMarks;

      if (attendanceStatus !== 'Present') {
        // Absent / Exempt: treat as 0 obtained, counts as failed
        failedSubjects.push(config.name);
        continue;
      }

      const obtained = Number(entry?.marks) || 0;
      totalObtained += obtained;

      if (obtained < config.passMarks) {
        failedSubjects.push(config.name);
      }
    }
  } else {
    // --- Legacy fallback: use marks map directly ---
    for (const [subjectName, entry] of Object.entries(studentSubjectMarks)) {
      const attendanceStatus = entry?.attendanceStatus || 'Present';
      totalMaxMarks += legacyMaxMarksPerSubject;

      if (attendanceStatus === 'Present') {
        totalObtained += Number(entry?.marks) || 0;
      }
    }
  }

  const percentage = totalMaxMarks > 0 ? (totalObtained / totalMaxMarks) * 100 : 0;
  const grade = applyGradingScale(percentage, gradingScale);
  const passThreshold = getPassThreshold(gradingScale);

  // Student passes ONLY if:
  //   1. No subject is individually failed (based on passMarks), AND
  //   2. Overall percentage >= pass threshold
  const result =
    failedSubjects.length === 0 && percentage >= passThreshold ? 'Pass' : 'Fail';

  return {
    totalObtained,
    totalMaxMarks,
    percentage: percentage.toFixed(2),
    grade,
    result,
    failedSubjects,
  };
};

/**
 * Validate a grading scale array.
 * Returns an error message string if invalid, or null if valid.
 *
 * Rules:
 * - No overlapping ranges
 * - Complete coverage from 0 to 100
 * - minPercent <= maxPercent for each entry
 * - No duplicate grade labels
 *
 * @param {Array} gradingScale
 * @returns {string|null}
 */
const validateGradingScale = (gradingScale) => {
  if (!Array.isArray(gradingScale) || gradingScale.length === 0) {
    return 'Grading scale must have at least one entry.';
  }

  const labels = new Set();
  for (const entry of gradingScale) {
    if (!entry.grade || typeof entry.grade !== 'string' || !entry.grade.trim()) {
      return 'Each grading entry must have a grade label.';
    }
    if (labels.has(entry.grade.trim())) {
      return `Duplicate grade label: "${entry.grade}".`;
    }
    labels.add(entry.grade.trim());

    if (typeof entry.minPercent !== 'number' || typeof entry.maxPercent !== 'number') {
      return `Grade "${entry.grade}" must have numeric minPercent and maxPercent.`;
    }
    if (entry.minPercent > entry.maxPercent) {
      return `Grade "${entry.grade}": minPercent cannot be greater than maxPercent.`;
    }
    if (entry.minPercent < 0 || entry.maxPercent > 100) {
      return `Grade "${entry.grade}": percentages must be between 0 and 100.`;
    }
  }

  // Sort by minPercent and check for overlaps + coverage
  const sorted = [...gradingScale].sort((a, b) => a.minPercent - b.minPercent);

  // Must start at 0
  if (sorted[0].minPercent !== 0) {
    return 'Grading scale must start at 0%.';
  }
  // Must end at 100
  if (sorted[sorted.length - 1].maxPercent !== 100) {
    return 'Grading scale must end at 100%.';
  }

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    // Check for gap or overlap
    if (curr.minPercent !== prev.maxPercent + 0.01 &&
        curr.minPercent !== prev.maxPercent &&
        Math.abs(curr.minPercent - (prev.maxPercent)) > 0.02) {
      return `Grading scale has a gap or overlap between "${prev.grade}" (max ${prev.maxPercent}%) and "${curr.grade}" (min ${curr.minPercent}%).`;
    }
    if (curr.minPercent <= prev.maxPercent && curr.minPercent !== prev.maxPercent) {
      return `Grading scale has overlapping ranges for "${prev.grade}" and "${curr.grade}".`;
    }
  }

  return null; // Valid
};

/**
 * Validate a class subject configuration array.
 * Returns an error message string if invalid, or null if valid.
 *
 * @param {Array} subjects - Array of { name, maxMarks, passMarks }
 * @param {string} className - For error context
 * @returns {string|null}
 */
const validateSubjectConfig = (subjects, className = '') => {
  if (!Array.isArray(subjects) || subjects.length === 0) {
    return `Subject configuration for class "${className}" must have at least one subject.`;
  }

  const names = new Set();
  for (const s of subjects) {
    if (!s.name || typeof s.name !== 'string' || !s.name.trim()) {
      return `Each subject must have a name (class: "${className}").`;
    }
    const normalized = s.name.trim().toLowerCase();
    if (names.has(normalized)) {
      return `Duplicate subject name "${s.name}" in class "${className}".`;
    }
    names.add(normalized);

    if (typeof s.maxMarks !== 'number' || s.maxMarks <= 0) {
      return `Subject "${s.name}" maxMarks must be a positive number (class: "${className}").`;
    }
    if (typeof s.passMarks !== 'number' || s.passMarks < 0) {
      return `Subject "${s.name}" passMarks must be a non-negative number (class: "${className}").`;
    }
    if (s.passMarks > s.maxMarks) {
      return `Subject "${s.name}" passMarks (${s.passMarks}) cannot exceed maxMarks (${s.maxMarks}) (class: "${className}").`;
    }
  }

  return null; // Valid
};

module.exports = {
  applyGradingScale,
  getPassThreshold,
  calculateStudentResult,
  validateGradingScale,
  validateSubjectConfig,
};
