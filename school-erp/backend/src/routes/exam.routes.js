const express = require('express');

const {
  getAllExams,
  createExam,
  updateExam,
  deleteExam,
  getExamById,
} = require('../controllers/exam.controller');
const { verifyToken, allowRoles } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(verifyToken);

router.get('/', allowRoles('admin', 'clerk', 'teacher'), getAllExams);
router.get('/:id', allowRoles('admin', 'clerk', 'teacher'), getExamById);
router.post('/', allowRoles('admin'), createExam);
router.put('/:id', allowRoles('admin'), updateExam);
router.delete('/:id', allowRoles('admin'), deleteExam);

module.exports = router;
