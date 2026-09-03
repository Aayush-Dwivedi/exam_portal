import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/common/ProtectedRoute';

// Layouts
import { AdminLayout } from './layouts/AdminLayout';
import { SetterLayout } from './layouts/SetterLayout';
import { CandidateLayout } from './layouts/CandidateLayout';

// Auth Pages
import { LoginPage } from './pages/auth/LoginPage';

// Admin Pages
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { UserManagementPage } from './pages/admin/UserManagementPage';
import { ExamApprovalPage } from './pages/admin/ExamApprovalPage';
import { LiveMonitoringPage } from './pages/admin/LiveMonitoringPage';
import { ProctoringReviewPage } from './pages/admin/ProctoringReviewPage';
import { AdminResultsPage } from './pages/admin/AdminResultsPage';
import { AdminAnalyticsPage } from './pages/admin/AdminAnalyticsPage';
import { AuditLogsPage } from './pages/admin/AuditLogsPage';

// Setter Pages
import { SetterDashboardPage } from './pages/setter/SetterDashboardPage';
import { QuestionBankPage } from './pages/setter/QuestionBankPage';
import { ExamBuilderPage } from './pages/setter/ExamBuilderPage';
import { MyExamsPage } from './pages/setter/MyExamsPage';
import { SetterResultsPage } from './pages/setter/SetterResultsPage';

// Candidate Pages
import { CandidateDashboardPage } from './pages/candidate/CandidateDashboardPage';
import { CandidateResultsPage } from './pages/candidate/CandidateResultsPage';
import { ExamDetailsPage } from './pages/candidate/ExamDetailsPage';
import { PreExamCheckPage } from './pages/candidate/PreExamCheckPage';
import { ExamRoomPage } from './pages/candidate/ExamRoomPage';
import { CandidateResultDetailPage } from './pages/candidate/CandidateResultDetailPage';

const queryClient = new QueryClient();

const RootRedirect: React.FC = () => {
  const { user, role, isAuthenticated, isLoading, getRedirectPath } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-stone-200 border-t-stone-800 rounded-full animate-spin"></div>
      </div>
    );
  }
  if (isAuthenticated && role) {
    return <Navigate to={getRedirectPath(role)} replace />;
  }
  return <Navigate to="/login" replace />;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<Navigate to="/login" replace />} />
            <Route path="/" element={<RootRedirect />} />

            {/* ADMIN ROUTES */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="users" element={<UserManagementPage />} />
              <Route path="exams" element={<ExamApprovalPage />} />
              <Route path="live-monitoring" element={<LiveMonitoringPage />} />
              <Route path="proctoring/:sessionId" element={<ProctoringReviewPage />} />
              <Route path="results" element={<AdminResultsPage />} />
              <Route path="analytics" element={<AdminAnalyticsPage />} />
              <Route path="audit-logs" element={<AuditLogsPage />} />
            </Route>

            {/* PAPER SETTER ROUTES */}
            <Route
              path="/setter"
              element={
                <ProtectedRoute allowedRoles={['PAPER_SETTER', 'ADMIN']}>
                  <SetterLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/setter/dashboard" replace />} />
              <Route path="dashboard" element={<SetterDashboardPage />} />
              <Route path="questions" element={<QuestionBankPage />} />
              <Route path="exams/create" element={<ExamBuilderPage />} />
              <Route path="exams" element={<MyExamsPage />} />
              <Route path="results" element={<SetterResultsPage />} />
            </Route>

            {/* CANDIDATE ROUTES */}
            <Route
              path="/candidate"
              element={
                <ProtectedRoute allowedRoles={['CANDIDATE', 'ADMIN']}>
                  <CandidateLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/candidate/dashboard" replace />} />
              <Route path="dashboard" element={<CandidateDashboardPage />} />
              <Route path="exams/:examId/details" element={<ExamDetailsPage />} />
              <Route path="exams/:examId/pre-check" element={<PreExamCheckPage />} />
              <Route path="results" element={<CandidateResultsPage />} />
              <Route path="results/:id" element={<CandidateResultDetailPage />} />
            </Route>

            {/* DISTRACTION-FREE EXAM ROOM (NO STANDARD NAVBAR) */}
            <Route
              path="/candidate/exams/:examId/room"
              element={
                <ProtectedRoute allowedRoles={['CANDIDATE', 'ADMIN']}>
                  <ExamRoomPage />
                </ProtectedRoute>
              }
            />

            {/* 404 Fallback */}
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
