import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { getMe } from './lib/api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SellersList from './pages/SellersList';
import SellerProfile from './pages/SellerProfile';
import ConversationsList from './pages/ConversationsList';
import ConversationDetail from './pages/ConversationDetail';
import TeamView from './pages/TeamView';
import AgentChat from './pages/AgentChat';
import Settings from './pages/Settings';

// ========================
// Auth Context
// ========================
const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('mave_token');
    if (!token) {
      setUser(null);
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }

    try {
      const response = await getMe();
      const userData = response.data;
      setUser(userData);
      setIsAuthenticated(true);
      localStorage.setItem('mave_user', JSON.stringify(userData));
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('mave_token');
      localStorage.removeItem('mave_user');
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const loginUser = useCallback((token, userData) => {
    localStorage.setItem('mave_token', token);
    localStorage.setItem('mave_user', JSON.stringify(userData));
    setUser(userData);
    setIsAuthenticated(true);
  }, []);

  const logoutUser = useCallback(() => {
    localStorage.removeItem('mave_token');
    localStorage.removeItem('mave_user');
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated,
    loginUser,
    logoutUser,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ========================
// Protected Route
// ========================
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-mave-200 border-t-mave-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

// ========================
// Public Route (redirects to dashboard if already logged in)
// ========================
function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-mave-200 border-t-mave-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    const from = location.state?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  return children;
}

// ========================
// App Component
// ========================
function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public route */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        {/* Protected routes wrapped in Layout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="sellers" element={<SellersList />} />
          <Route path="sellers/:id" element={<SellerProfile />} />
          <Route path="conversations" element={<ConversationsList />} />
          <Route path="conversations/:id" element={<ConversationDetail />} />
          <Route path="team" element={<TeamView />} />
          <Route path="agent" element={<AgentChat />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
