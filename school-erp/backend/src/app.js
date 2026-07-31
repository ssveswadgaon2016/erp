const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { rateLimit } = require('express-rate-limit');
const compression = require('compression');

const authRoutes = require('./routes/auth.routes');
const classRoutes = require('./routes/class.routes');
const subjectRoutes = require('./routes/subject.routes');
const assignmentRoutes = require('./routes/assignment.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const feeRoutes = require('./routes/fee.routes');
const paymentRoutes = require('./routes/payment.routes');
const expenseRoutes = require('./routes/expense.routes');
const documentRoutes = require('./routes/document.routes');
const noticeRoutes = require('./routes/notice.routes');
const examRoutes = require('./routes/exam.routes');
const timetableRoutes = require('./routes/timetable.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const markRoutes = require('./routes/mark.routes');
const homeworkRoutes = require('./routes/homework.routes');
const studentRoutes = require('./routes/student.routes');
const staffRoutes = require('./routes/staff.routes');
const settingRoutes = require('./routes/setting.routes');
const academicRoutes = require('./routes/academic.routes');
const classFeeRoutes = require('./routes/classFee.routes');
const notFoundHandler = require('./middleware/notFound.middleware');
const errorHandler = require('./middleware/errorHandler.middleware');

const app = express();

const isProduction = process.env.NODE_ENV === 'production';

if (process.env.TRUST_PROXY === 'true') {
	app.set('trust proxy', 1);
}

app.disable('x-powered-by');

// Global middlewares.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);

const globalWindowMinutes = Number(process.env.RATE_LIMIT_WINDOW_MINUTES || 15);
const globalMaxRequests = Number(process.env.RATE_LIMIT_MAX || 300);
const authWindowMinutes = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES || 15);
const authMaxRequests = Number(process.env.AUTH_RATE_LIMIT_MAX || 20);
const bodyLimitMb = Number(process.env.BODY_LIMIT_MB || 8);

const globalLimiter = rateLimit({
	windowMs: globalWindowMinutes * 60 * 1000,
	max: globalMaxRequests,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		success: false,
		message: 'Too many requests. Please try again later.',
		data: null,
	},
});

const authLimiter = rateLimit({
	windowMs: authWindowMinutes * 60 * 1000,
	max: authMaxRequests,
	skipSuccessfulRequests: true,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		success: false,
		message: 'Too many login attempts. Please try again later.',
		data: null,
	},
});

app.use(
	helmet({
		crossOriginResourcePolicy: false,
	})
);

if (process.env.NODE_ENV !== 'test') {
	app.use(morgan(isProduction ? 'combined' : 'dev'));
}

app.use(cors({
  origin: function(origin, callback) {
    if (
      !origin ||
      origin.includes("vercel.app") ||
      origin === "http://localhost:5173"
    ) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: `${bodyLimitMb}mb` }));
app.use(express.urlencoded({ extended: true, limit: `${bodyLimitMb}mb` }));

// Production hardening: compress payloads
app.use(compression());

app.use('/api', globalLimiter);
app.use('/api/auth/login', authLimiter);

// Basic health route.
app.get('/api/health', (req, res) => {
	return res.status(200).json({
		message: 'API working',
	});
});
app.use('/api/auth', authRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/marks', markRoutes);
app.use('/api/homework', homeworkRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/academic', academicRoutes);
app.use('/api/class-fees', classFeeRoutes);

// Error handling middlewares should stay at the end.
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
