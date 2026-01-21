import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { auth } from './services/firebase';
import { User } from 'firebase/auth';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

// Defined interface for props to fix type error
interface PrivateRouteProps {
  children?: React.ReactNode;
  user: User | null;
  loading: boolean;
}

const PrivateRoute = ({ children, user, loading }: PrivateRouteProps) => {
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading auth...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
     const unsubscribe = auth.onAuthStateChanged(async (u) => {
         if (u && u.email) {
           if (!u.email.endsWith('@91app.com') && !u.email.endsWith('@nine-yi.com')) {
             await auth.signOut();
             setUser(null);
             sessionStorage.removeItem('bq_access_token');
           } else {
             setUser(u);
           }
         } else {
           setUser(null);
           sessionStorage.removeItem('bq_access_token');
         }
         setLoading(false);
     });
     
     return () => unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        <Route 
          path="/" 
          element={
            <PrivateRoute user={user} loading={loading}>
              <DashboardPage user={user} />
            </PrivateRoute>
          } 
        />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}