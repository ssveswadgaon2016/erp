const { Student } = require('../models/Student');
const ClassFee = require('../models/ClassFee');
const Payment = require('../models/Payment');
const { sendSuccess, sendError } = require('../services/fee.service');

const getPendingFeesOverview = async (req, res) => {
  try {
    // 1. Fetch all active students
    const activeStudents = await Student.find({ status: 'active' })
      .select('studentId name surname academic isRTE customFee customFeeReason')
      .lean();

    // 2. Fetch all ClassFee configurations
    const classFees = await ClassFee.find().lean();
    
    // Map class fees by classPattern for quick lookup
    const classFeeMap = {};
    classFees.forEach(cf => {
      classFeeMap[cf.classPattern.toUpperCase()] = cf.totalAmount;
    });

    // 3. Fetch all Payments
    // We only need payments for active students to calculate their paid amount
    const activeStudentIds = activeStudents.map(s => s._id);
    const payments = await Payment.find({ studentId: { $in: activeStudentIds } }).lean();

    // Group payments by studentId
    const paymentsByStudent = {};
    payments.forEach(p => {
      const sId = String(p.studentId);
      if (!paymentsByStudent[sId]) {
        paymentsByStudent[sId] = 0;
      }
      paymentsByStudent[sId] += (p.amount || 0);
    });

    // 4. Calculate metrics for each student and aggregate class-wise totals
    const schoolTotals = {
      totalFees: 0,
      collectedFees: 0,
      pendingFees: 0,
      studentCount: activeStudents.length
    };

    const classWiseTotalsMap = {};
    
    const studentWiseDetails = activeStudents.map(student => {
      const className = student.academic?.class || 'Unknown';
      const section = student.academic?.section || '';
      
      // Determine total fee for this student based on their class
      // If there's no fee config, we default to 0
      const classKey = className.toUpperCase();
      let totalFee = classFeeMap[classKey] || 0;

      // Special fee structure takes precedence
      if (student.customFee !== null && student.customFee !== undefined) {
        totalFee = student.customFee;
      } else if (student.isRTE) {
        // RTE students have 0 fees
        totalFee = 0;
      }
      
      const collectedFee = paymentsByStudent[String(student._id)] || 0;
      // Pending fee cannot be negative if they overpaid (though they shouldn't)
      const pendingFee = Math.max(0, totalFee - collectedFee);

      // Add to school totals
      schoolTotals.totalFees += totalFee;
      schoolTotals.collectedFees += collectedFee;
      schoolTotals.pendingFees += pendingFee;

      // Add to class totals
      if (!classWiseTotalsMap[className]) {
        classWiseTotalsMap[className] = {
          className,
          studentCount: 0,
          totalFees: 0,
          collectedFees: 0,
          pendingFees: 0
        };
      }
      
      classWiseTotalsMap[className].studentCount += 1;
      classWiseTotalsMap[className].totalFees += totalFee;
      classWiseTotalsMap[className].collectedFees += collectedFee;
      classWiseTotalsMap[className].pendingFees += pendingFee;

      return {
        id: student._id,
        studentId: student.studentId,
        name: `${student.name} ${student.surname || ''}`.trim(),
        className,
        section,
        rollNumber: student.academic?.rollNumber || '-',
        totalFee,
        collectedFee,
        pendingFee,
        isRTE: student.isRTE,
        customFee: student.customFee,
        customFeeReason: student.customFeeReason,
      };
    });

    // Convert classWiseTotalsMap to an array and sort it
    const classWiseTotals = Object.values(classWiseTotalsMap).sort((a, b) => a.className.localeCompare(b.className));

    return sendSuccess(res, 200, 'Pending fees overview fetched successfully', {
      schoolTotals,
      classWiseTotals,
      studentWiseDetails
    });

  } catch (error) {
    console.error('Error fetching pending fees overview:', error);
    return sendError(res, error);
  }
};

module.exports = {
  getPendingFeesOverview
};
