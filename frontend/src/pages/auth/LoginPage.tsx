import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, ArrowRight, AlertCircle, KeyRound, Mail, Info, UserCheck, Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const LoginPage: React.FC = () => {
  const [loginMode, setLoginMode] = useState<'CANDIDATE' | 'STAFF'>('CANDIDATE');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, getRedirectPath } = useAuth();
  const navigate = useNavigate();

  const handleModeChange = (mode: 'CANDIDATE' | 'STAFF') => {
    setLoginMode(mode);
    setIdentifier('');
    setPassword('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError(loginMode === 'CANDIDATE' ? 'Please enter your Roll Number and Password.' : 'Please enter your Email and Password.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const role = await login(identifier.trim(), password);
      navigate(getRedirectPath(role), { replace: true });
    } catch (err: any) {
      setError(
        err.response?.data?.detail || 
        (loginMode === 'CANDIDATE' 
          ? 'Invalid Roll Number or Password. Please check the credentials sent to your email.' 
          : 'Invalid Email or Password. Please verify your credentials.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-stone-900 text-white shadow-xs mb-3">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-stone-900 tracking-tight">
          Exam Portal
        </h2>
        <p className="mt-1 text-xs text-stone-500 max-w-sm mx-auto">
          AI-Proctored Examination Management & Assessment Platform
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-7 shadow-card space-y-5">
          {/* Role Switcher Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-100/80 rounded-xl border border-stone-200">
            <button
              type="button"
              onClick={() => handleModeChange('CANDIDATE')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                loginMode === 'CANDIDATE'
                  ? 'bg-white text-stone-900 shadow-xs border border-stone-200/80'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
              <span>Candidate Portal</span>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange('STAFF')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                loginMode === 'STAFF'
                  ? 'bg-white text-stone-900 shadow-xs border border-stone-200/80'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-stone-700" />
              <span>Admin / Setter</span>
            </button>
          </div>

          {/* Candidate notice */}
          {loginMode === 'CANDIDATE' && (
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-stone-700 text-xs flex items-start gap-2.5">
              <Info className="w-4 h-4 text-stone-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-stone-600">
                Your <strong className="text-stone-900 font-semibold">Roll Number</strong> and secure examination password have been dispatched to your institutional email address.
              </p>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                {loginMode === 'CANDIDATE' ? 'Candidate Roll Number' : 'Institutional Email'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  {loginMode === 'CANDIDATE' ? <KeyRound className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                </div>
                <input
                  type={loginMode === 'CANDIDATE' ? 'text' : 'email'}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  placeholder={loginMode === 'CANDIDATE' ? 'e.g. CS2026-001' : 'admin@examportal.com'}
                  className="input-cream pl-10"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider">
                  Password
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="input-cream pl-10"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full mt-2 py-2.5 text-xs font-semibold"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin mx-auto" />
              ) : (
                <>
                  <span>Sign In as {loginMode === 'CANDIDATE' ? 'Candidate' : 'Staff'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[11px] text-stone-500 max-w-xs mx-auto leading-relaxed">
          Examination credentials are encrypted and issued directly by your examination department.
        </p>
      </div>
    </div>
  );
};
