const mongoose = require('mongoose');

const EXAM_STATUSES = ['Upcoming', 'In Progress', 'Completed', 'Draft', 'Active', 'Closed', 'Published'];

// ─── Subject Submission (existing - teacher workflow) ───────────────────────
const subjectSubmissionSchema = new mongoose.Schema({
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    required: true,
  },
  section: {
    type: String,
    required: true,
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: false,
  },
  subjectName: {
    type: String,
    required: true,
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Unlocked'],
    default: 'Draft',
  },
  submittedAt: Date,
  approvedAt: Date,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  remarks: String,
}, { _id: false });

// ─── NEW: Per-subject configuration inside a class ──────────────────────────
const subjectConfigEntrySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  maxMarks: {
    type: Number,
    required: true,
    min: 1,
  },
  passMarks: {
    type: Number,
    required: true,
    min: 0,
  },
}, { _id: false });

// ─── NEW: Per-class subject configuration ───────────────────────────────────
const classSubjectConfigSchema = new mongoose.Schema({
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    required: true,
  },
  subjects: [subjectConfigEntrySchema],
}, { _id: false });

// ─── NEW: Grading scale entry ────────────────────────────────────────────────
const gradingScaleEntrySchema = new mongoose.Schema({
  grade: {
    type: String,
    required: true,
    trim: true,
  },
  minPercent: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  maxPercent: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
}, { _id: false });

// ─── Main Exam Schema ────────────────────────────────────────────────────────
const examSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Legacy field for backward compatibility
    class: {
      type: String,
      trim: true,
      default: 'All',
    },
    // New fields for the redesigned workflow
    academicYear: {
      type: String,
      trim: true,
    },
    examType: {
      type: String,
      trim: true,
    },
    applicableClasses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SchoolClass',
      }
    ],
    // Legacy global max marks — kept for backward compatibility
    maxMarks: {
      type: Number,
      default: 100,
      min: 0,
    },
    // NEW: Per-class subject configuration with max marks and pass marks
    classSubjectConfig: [classSubjectConfigSchema],
    // NEW: Configurable grading scale for this exam
    gradingScale: [gradingScaleEntrySchema],

    subjectSubmissions: [subjectSubmissionSchema],
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: EXAM_STATUSES,
      default: 'Upcoming', // Default kept for legacy. New UI will set to 'Draft'.
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    publishedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

examSchema.pre('validate', function normalizeStatus() {
  if (['Draft', 'Active', 'Closed', 'Published'].includes(this.status)) {
    return; // Do not auto-calculate for new explicit statuses
  }

  // Legacy auto-calculation for old exams
  if (!this.startDate || !this.endDate) {
    return;
  }

  const now = new Date();
  if (now < new Date(this.startDate)) {
    this.status = 'Upcoming';
  } else if (now > new Date(this.endDate)) {
    this.status = 'Completed';
  } else {
    this.status = 'In Progress';
  }
});

examSchema.index({ startDate: 1, endDate: 1 });
examSchema.index({ applicableClasses: 1, status: 1 });

// Indexes for querying efficiency
examSchema.index({ name: 1, academicYear: 1 });
examSchema.index({ academicYear: 1, status: 1 });

const Exam = mongoose.model('Exam', examSchema);

module.exports = {
  Exam,
  EXAM_STATUSES,
};
