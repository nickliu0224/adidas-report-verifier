
import React from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import { Link, useLocation } from 'react-router-dom';

export default function Layout({ children, user }: { children: React.ReactNode, user: any }) {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path ? 'text-white font-bold bg-white/10' : 'text-gray-400 hover:text-white';
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-black text-white px-6 py-4 flex items-center shadow-lg sticky top-0 z-50">
        {/* Left: Brand */}
        <div className="w-1/4 flex items-center gap-3">
          <span className="bg-white text-black p-1 rounded font-bold text-lg">ADS</span>
          <span className="font-bold text-sm tracking-wide whitespace-nowrap hidden sm:inline">Report Verifier</span>
        </div>

        {/* Center: Navigation */}
        <div className="w-2/4 flex justify-center items-center gap-6">
            <Link to="/" className={`px-4 py-2 rounded-lg transition-all text-sm ${isActive('/')}`}>
                Dashboard
            </Link>
            <Link to="/history" className={`px-4 py-2 rounded-lg transition-all text-sm ${isActive('/history')}`}>
                History
            </Link>
        </div>

        {/* Right: Account Info */}
        <div className="w-1/4 flex flex-col items-end gap-0.5">
          <div className="text-xs text-gray-400 font-medium truncate max-w-full">
            {user?.email}
          </div>
          <button 
            onClick={() => signOut(auth)} 
            className="text-xs text-gray-500 hover:text-white underline transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-7xl w-full mx-auto p-6 mt-4 flex-grow">
        {children}
      </main>

      <footer className="w-full py-8 text-center text-gray-400 text-sm border-t border-gray-100 mt-auto bg-white">
        Made by IS PM Nick
      </footer>
    </div>
  );
}
