import React, { useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { GraduationCap, LayoutDashboard, Award, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { exitFullscreenSafe, stopAllHardwareStreams } from '../utils/hardware';

export const CandidateLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  useEffect(() => {
    // When returning to candidate layout from any exam/diagnostic session,
    // guarantee full-screen mode is terminated and all media streams (camera & mic) are stopped,
    // but do not interfere if moving to or inside an exam room.
    if (!location.pathname.includes('/room')) {
      exitFullscreenSafe();
      stopAllHardwareStreams();
    }
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col text-stone-900">
      {/* Candidate Top Navigation Bar */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6 sm:gap-8">
            <NavLink to="/candidate/dashboard" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-stone-900 flex items-center justify-center text-white shadow-xs">
                <GraduationCap className="w-4 h-4" />
              </div>
              <div className="flex items-center">
                <span className="font-bold text-sm text-stone-900 tracking-tight">Exam Portal</span>
                <span className="ml-2 text-[10px] font-semibold tracking-wide text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">Candidate</span>
              </div>
            </NavLink>

            <nav className="hidden sm:flex items-center gap-1">
              <NavLink
                to="/candidate/dashboard"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-stone-900 text-white shadow-xs'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                  }`
                }
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Dashboard & Exams</span>
              </NavLink>

              <NavLink
                to="/candidate/results"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-stone-900 text-white shadow-xs'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                  }`
                }
              >
                <Award className="w-3.5 h-3.5" />
                <span>My Results</span>
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 pl-3 border-l border-stone-200">
              <div className="text-right hidden md:block">
                <p className="text-xs font-semibold text-stone-900 leading-tight">{user?.name}</p>
                <p className="text-[10px] text-stone-500 font-mono">
                  {user?.roll_number ? `Roll: ${user.roll_number}` : user?.email}
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-stone-700 text-xs">
                {user?.name?.charAt(0) || 'C'}
              </div>
              <button
                onClick={logout}
                title="Sign out"
                className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors ml-0.5"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
};
