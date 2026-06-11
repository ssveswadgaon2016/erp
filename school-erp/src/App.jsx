import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import LoginPage from './auth/LoginPage';
import DashboardLayout from './layouts/DashboardLayout';

/* Admin Pages */
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminStudents from './pages/admin/AdminStudents';
import AdminTeachers from './pages/admin/AdminTeachers';
import AdminClerks from './pages/admin/AdminClerks';
import AdminAttendance from './pages/admin/AdminAttendance';
import AdminFees from './pages/admin/AdminFees';
import AdminFeeAnalytics from './pages/admin/AdminFeeAnalytics';
import AdminExams from './pages/admin/AdminExams';
import AdminReports from './pages/admin/AdminReports';
import AdminSettings from './pages/admin/AdminSettings';
import AdminAdmissions from './pages/admin/AdminAdmissions';

import AdminClasses from './pages/admin/AdminClasses';
import AdminTC from './pages/admin/AdminTC';
import AdminRTE from './pages/admin/AdminRTE';

/* Clerk Pages */
import ClerkDashboard from './pages/clerk/ClerkDashboard';
import ClerkAdmissions from './pages/clerk/ClerkAdmissions';
import ClerkRecords from './pages/clerk/ClerkRecords';
import ClerkFees from './pages/clerk/ClerkFees';
import ClerkDocuments from './pages/clerk/ClerkDocuments';
import ClerkReceipts from './pages/clerk/ClerkReceipts';

/* Teacher Pages */
import TeacherDashboard from './pages/teacher/TeacherDashboard';
import TeacherAttendance from './pages/teacher/TeacherAttendance';
import TeacherMarks from './pages/teacher/TeacherMarks';
import TeacherTimetable from './pages/teacher/TeacherTimetable';

const App = () => {
  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="admissions" element={<AdminAdmissions />} />
            <Route path="students" element={<AdminStudents />} />
            <Route path="rte" element={<AdminRTE />} />
            <Route path="classes" element={<AdminClasses />} />
            <Route path="teachers" element={<AdminTeachers />} />
            <Route path="clerks" element={<AdminClerks />} />
            <Route path="attendance" element={<AdminAttendance />} />
            <Route path="fees" element={<AdminFees />} />
            <Route path="fee-analytics" element={<AdminFeeAnalytics />} />
            <Route path="exams" element={<AdminExams />} />

            <Route path="reports" element={<AdminReports />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="tc" element={<AdminTC />} />
          </Route>

          {/* Clerk Routes */}
          <Route
            path="/clerk"
            element={
              <ProtectedRoute allowedRoles={['CLERK']}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<ClerkDashboard />} />
            <Route path="admissions" element={<ClerkAdmissions />} />
            <Route path="records" element={<ClerkRecords />} />
            <Route path="fees" element={<ClerkFees />} />
            <Route path="documents" element={<ClerkDocuments />} />
            <Route path="receipts" element={<ClerkReceipts />} />
          </Route>

          {/* Teacher Routes */}
          <Route
            path="/teacher"
            element={
              <ProtectedRoute allowedRoles={['TEACHER']}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<TeacherDashboard />} />
            <Route path="attendance" element={<TeacherAttendance />} />
            <Route path="marks" element={<TeacherMarks />} />
            <Route path="timetable" element={<TeacherTimetable />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
};

export default App;
