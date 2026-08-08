const express = require('express');

const {
  createStudent,
  getAllStudents,
  getStudentById,
  updateStudent,
  deleteStudent,
  updateSpecialFee,
} = require('../controllers/student.controller');
const { verifyToken, allowRoles } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(verifyToken);

router.get('/', allowRoles('admin', 'clerk', 'teacher'), getAllStudents);
router.post('/', allowRoles('admin', 'clerk'), createStudent);
router.get('/:id', allowRoles('admin', 'clerk', 'teacher'), getStudentById);
router.put('/:id/special-fee', allowRoles('admin'), updateSpecialFee);
router.put('/:id', allowRoles('admin', 'clerk'), updateStudent);
router.delete('/:id', allowRoles('admin'), deleteStudent);

module.exports = router;