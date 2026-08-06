const express = require('express');

const {
  createFeeStructure,
  getAllFees,
  getStudentFees,
  getDefaulters,
} = require('../controllers/fee.controller');
const { getPendingFeesOverview } = require('../controllers/feeOverview.controller');
const { verifyToken, allowRoles } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(verifyToken);

router.get('/', allowRoles('admin', 'clerk'), getAllFees);
router.post('/', allowRoles('admin', 'clerk'), createFeeStructure);
router.get('/defaulters', allowRoles('admin', 'clerk'), getDefaulters);
router.get('/pending-overview', allowRoles('admin', 'clerk'), getPendingFeesOverview);
router.get('/:studentId', allowRoles('admin', 'clerk'), getStudentFees);

module.exports = router;