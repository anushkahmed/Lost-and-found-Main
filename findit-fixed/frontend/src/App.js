// src/App.js
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';

// Pages
import LoginPage        from './pages/LoginPage';
import RegisterPage     from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage  from './pages/ResetPasswordPage';
import DashboardPage    from './pages/DashboardPage';
import PostItemPage     from './pages/PostItemPage';
import SearchPage       from './pages/SearchPage';
import MatchingPage     from './pages/MatchingPage';
import NotificationsPage from './pages/NotificationsPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import ProfilePage      from './pages/ProfilePage';
import AdminUsersPage   from './pages/AdminUsersPage';
import ChatPage         from './pages/ChatPage';
import AdminAnalyticsPage from './pages/AdminAnalyticsPage';
import AdminAbusePage   from './pages/AdminAbusePage';
import LeaderboardPage  from './pages/LeaderboardPage';
import AdminMapPage    from './pages/AdminMapPage';
import AdminCategoriesPage from './pages/AdminCategoriesPage';
import AdminLogsPage   from './pages/AdminLogsPage';

// Layout
import Layout from './components/Layout';

// Route guard — redirect to login if not logged in
const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div style={{padding:'2rem'}}>Loading...</div>;
  return user ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login"    element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password"  element={<ResetPasswordPage />} />

            {/* Protected routes — wrapped in Layout (sidebar + topbar) */}
            <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
              <Route index              element={<DashboardPage />} />
              <Route path="post"        element={<PostItemPage />} />
              <Route path="search"      element={<SearchPage />} />
              <Route path="matching"    element={<MatchingPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="announcements" element={<AnnouncementsPage />} />
              <Route path="profile"     element={<ProfilePage />} />
              <Route path="admin/users"     element={<AdminUsersPage />} />
              <Route path="admin/analytics" element={<AdminAnalyticsPage />} />
              <Route path="admin/abuse"     element={<AdminAbusePage />} />
              <Route path="leaderboard"     element={<LeaderboardPage />} />
              <Route path="admin/map"       element={<AdminMapPage />} />
              <Route path="admin/categories" element={<AdminCategoriesPage />} />
              <Route path="admin/logs"      element={<AdminLogsPage />} />
              <Route path="chat"            element={<ChatPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
