const express = require('express');

const {
  getMarks,
  saveMarks,
  getStudentMarks,
  getClassResultSheet,
} = require('../controllers/mark.controller');
const { verifyToken, allowRoles } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(verifyToken);

router.get('/', allowRoles('admin', 'teacher'), getMarks);
router.post('/bulk', allowRoles('admin', 'teacher'), saveMarks);

// Using verifyToken to ensure only authenticated users can access,
// but in the future this could be made public or use a different auth for students
router.get('/student/:studentId/exam/:examName', getStudentMarks);

// Class Result Sheet for Admins/Clerks (Module 7)
router.get('/class-sheet', allowRoles('admin', 'clerk'), getClassResultSheet);

module.exports = router;
