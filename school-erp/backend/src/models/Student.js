const mongoose = require('mongoose');
const StudentCounter = require('./StudentCounter');

const GENDERS = ['male', 'female', 'other'];
const STATUSES = ['active', 'inactive'];

const studentSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    generalRegisterNumber: {
      type: String,
      trim: true,
      default: '',
    },
    prnNumber: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    aadhaarNumber: {
      type: String,
      trim: true,
      default: '',
    },
    penNumber: {
      type: String,
      trim: true,
      default: '',
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    surname: {
      type: String,
      trim: true,
      default: '',
    },
    dob: {

      type: Date,
      required: true,
    },
    gender: {
      type: String,
      enum: GENDERS,
      required: true,
    },
    contact: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    passportPhoto: {
      type: String,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      default: '',
    },
    previousSchool: {
      type: String,
      trim: true,
      default: '',
    },
    caste: {
      type: String,
      trim: true,
      default: '',
    },
    subCaste: {
      type: String,
      trim: true,
      default: '',
    },
    placeOfBirth: {
      type: String,
      trim: true,
      default: '',
    },
    nationality: {
      type: String,
      trim: true,
      default: 'Indian',
    },
    religion: {
      type: String,
      trim: true,
      default: '',
    },
    fatherEducation: {
      type: String,
      trim: true,
      default: '',
    },
    motherEducation: {
      type: String,
      trim: true,
      default: '',
    },
    parent: {
      fatherName: {
        type: String,
        required: true,
        trim: true,
      },
      motherName: {
        type: String,
        required: true,
        trim: true,
      },
      parentContact: {
        type: String,
        required: true,
        trim: true,
      },
    },
    academic: {
      class: {
        type: String,
        required: true,
        trim: true,
      },
      section: {
        type: String,
        required: true,
        trim: true,
      },
      admissionDate: {
        type: Date,
        required: true,
      },
    },
    documents: [
      {
        type: String,
        trim: true,
      },
    ],
    tcCertificate: {
      tcNumber: {
        type: String,
      },
      downloadCount: {
        type: Number,
        default: 0,
      },
      firstDownloadedAt: {
        type: Date,
      },
      lastDownloadedAt: {
        type: Date,
      },
      lastDownloadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'active',
    },
    isRTE: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

studentSchema.pre('validate', async function generateStudentId() {
  if (!this.isNew || this.studentId) {
    return;
  }

  const currentYear = new Date().getFullYear();
  const counterKey = `studentId:${currentYear}`;

  const counter = await StudentCounter.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  this.studentId = `SCH${currentYear}-${String(counter.seq).padStart(3, '0')}`;
});

studentSchema.pre('validate', async function generatePrnNumber() {
  if (!this.isNew || this.prnNumber) {
    return;
  }

  const counterKey = `prnNumber:global`;

  const counter = await StudentCounter.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  this.prnNumber = `SSVES-${String(counter.seq).padStart(3, '0')}`;
});


studentSchema.index(
  { generalRegisterNumber: 1 },
  { 
    unique: true, 
    partialFilterExpression: { generalRegisterNumber: { $gt: '' } },
    name: 'unique_gr_number'
  }
);

studentSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

studentSchema.index({ 'academic.class': 1, 'academic.section': 1, status: 1 });

const Student = mongoose.model('Student', studentSchema);

// Automatically drop the orphaned unique index on generalRegisterNumber if it exists in the DB
Student.collection.dropIndex('generalRegisterNumber_1').catch((err) => {
  // Silently ignore if the index doesn't exist
});

// Drop the old rollNumber unique index
Student.collection.dropIndex('academic.class_1_academic.section_1_academic.rollNumber_1').catch(() => {});

module.exports = {
  Student,
  GENDERS,
  STATUSES,
};