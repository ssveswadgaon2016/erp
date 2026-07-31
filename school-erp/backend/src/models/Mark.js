const mongoose = require('mongoose');

const markSchema = new mongoose.Schema(
  {
    // Legacy fields for backward compatibility
    examName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    className: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    subjectName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    section: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // New workflow reference fields
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolClass',
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
    },

    // Identifiers
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Performance fields
    attendanceStatus: {
      type: String,
      enum: ['Present', 'Absent', 'Exempt'],
      default: 'Present',
    },
    marks: {
      type: Number,
      required: function() { return this.attendanceStatus === 'Present'; },
      min: 0,
    },
    grade: {
      type: String,
      trim: true,
      default: '-',
    },
  },
  {
    timestamps: true,
  }
);

// We keep the unique index on names for backward compatibility. 
// Note: If using multiple exams with same name, it might conflict, but it's legacy behavior.
markSchema.index({ examName: 1, className: 1, section: 1, subjectName: 1, studentId: 1 }, { unique: true });

// New index for fast querying by the new identifiers
markSchema.index({ examId: 1, classId: 1, subjectId: 1, section: 1 });

const Mark = mongoose.model('Mark', markSchema);

module.exports = Mark;
