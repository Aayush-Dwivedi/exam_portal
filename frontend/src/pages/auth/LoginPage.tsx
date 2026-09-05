import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck, Lock, ArrowRight, AlertCircle, KeyRound, Mail,
  Info, UserCheck, Shield, CheckCircle2,
  Copy, Check, Eye, EyeOff
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../api/client';
import { Modal } from '../../components/common/Modal';

interface DemoCandidateData {
  user_id: number;
  name: string;
  email: string;
  roll_number: string;
  password: string;
  role: string;
  enrolled_exams_count: number;
}

export const LoginPage: React.FC = () => {
  const [loginMode, setLoginMode] = useState<'CANDIDATE' | 'STAFF'>('CANDIDATE');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Demo candidate states
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);
  const [demoData, setDemoData] = useState<DemoCandidateData | null>(null);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<'roll' | 'password' | 'all' | null>(null);
  const [showModalPassword, setShowModalPassword] = useState(true);
  const [autoFilledNotice, setAutoFilledNotice] = useState<string | null>(null);

  const { login, getRedirectPath } = useAuth();
  const navigate = useNavigate();

  const handleModeChange = (mode: 'CANDIDATE' | 'STAFF') => {
    setLoginMode(mode);
    setIdentifier('');
    setPassword('');
    setError(null);
  };

  const handleGenerateDemoCandidate = async () => {
    try {
      setIsGeneratingDemo(true);
      setError(null);
      const response = await apiClient.post<DemoCandidateData>('/auth/demo-candidate');
      const data = response.data;

      // Auto-fill form fields and ensure candidate tab
      setLoginMode('CANDIDATE');
      setIdentifier(data.roll_number);
      setPassword(data.password);
      setDemoData(data);
      setShowModalPassword(true);
      setIsDemoModalOpen(true);
      setAutoFilledNotice(`Demo credentials generated & auto-filled (${data.roll_number})`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate demo candidate. Please try again.');
    } finally {
      setIsGeneratingDemo(false);
    }
  };

  const copyToClipboard = (text: string, field: 'roll' | 'password' | 'all') => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleInstantSignIn = async () => {
    if (!demoData) return;
    try {
      setIsSubmitting(true);
      setIsDemoModalOpen(false);
      const role = await login(demoData.roll_number, demoData.password);
      navigate(getRedirectPath(role), { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to sign in with demo candidate.');
    } finally {
      setIsSubmitting(false);
    }
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
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col justify-center py-4 sm:py-6 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-lg text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-stone-900 text-white shadow-xs mb-2">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
          Exam Portal
        </h2>
        <p className="mt-0.5 text-xs text-stone-500 max-w-sm mx-auto">
          AI-Proctored Examination Management & Assessment Platform
        </p>
      </div>

      <div className="mt-4 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-card space-y-3.5">
          {/* Role Switcher Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-100/80 rounded-xl border border-stone-200">
            <button
              type="button"
              onClick={() => handleModeChange('CANDIDATE')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${loginMode === 'CANDIDATE'
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
              className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${loginMode === 'STAFF'
                  ? 'bg-white text-stone-900 shadow-xs border border-stone-200/80'
                  : 'text-stone-500 hover:text-stone-800'
                }`}
            >
              <Shield className="w-3.5 h-3.5 text-stone-700" />
              <span>Admin / Setter</span>
            </button>
          </div>

          {/* Quick Demo Candidate Callout Card (No Icons) */}
          <div className="relative overflow-hidden rounded-xl border border-amber-200/90 bg-gradient-to-b from-amber-50/75 via-amber-50/40 to-stone-50/30 p-3.5 sm:p-4 text-xs shadow-xs space-y-2.5">
            {/* Header: Title & Subtitle + Badge */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="font-bold text-stone-900 text-xs tracking-tight">Testing & Demo Portal</span>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Try mock exams & proctoring instantly without registration
                </p>
              </div>

              <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-200/80 text-amber-900 rounded-md border border-amber-300/60 shrink-0">
                1-Click Setup
              </span>
            </div>

            {/* Description */}
            <p className="text-[11px] text-stone-600 leading-relaxed">
              Generate a unique mock candidate, reveal credentials in a popup, and auto-fill login to test the assessment environment.
            </p>

            {/* Full-width Action Button (No Icons) */}
            <button
              type="button"
              id="generate-demo-candidate-btn"
              onClick={handleGenerateDemoCandidate}
              disabled={isGeneratingDemo || isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 active:scale-[0.99] text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-all disabled:opacity-60 cursor-pointer"
            >
              {isGeneratingDemo ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Generating Demo Candidate...</span>
                </>
              ) : (
                <span>Generate Demo Candidate</span>
              )}
            </button>

            {/* Auto-filled status banner (No Icons) */}
            {autoFilledNotice && demoData && (
              <div className="pt-2 border-t border-amber-200/70 flex items-center justify-between gap-2 text-[11px]">
                <div className="text-emerald-800 font-medium truncate">
                  Auto-filled: <strong className="font-mono text-emerald-950 font-bold">{demoData.roll_number}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDemoModalOpen(true)}
                  className="text-stone-700 hover:text-stone-950 font-semibold underline shrink-0 px-1 py-0.5 rounded hover:bg-amber-100/50 transition-colors cursor-pointer"
                >
                  View Credentials
                </button>
              </div>
            )}
          </div>

          {/* Candidate notice */}
          {loginMode === 'CANDIDATE' && !autoFilledNotice && (
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

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                {loginMode === 'CANDIDATE' ? 'Candidate Roll Number' : 'Institutional Email'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  {loginMode === 'CANDIDATE' ? <KeyRound className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                </div>
                <input
                  id="login-identifier-input"
                  type={loginMode === 'CANDIDATE' ? 'text' : 'email'}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  placeholder={loginMode === 'CANDIDATE' ? 'e.g. CS2026-001 or DEMO-12345' : 'admin@examportal.com'}
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
                  id="login-password-input"
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
              id="login-submit-btn"
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full mt-1.5 py-2.5 text-xs font-semibold cursor-pointer"
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

        <p className="mt-3 text-center text-[11px] text-stone-500 max-w-sm mx-auto leading-relaxed">
          Examination credentials are encrypted and issued directly by your examination department.
        </p>
      </div>

      {/* Demo Credentials Popup Modal */}
      <Modal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
        title="Demo Candidate Created"
        maxWidth="md"
      >
        {demoData && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-850 text-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-emerald-950">Credentials Generated & Auto-Filled!</p>
                <p className="text-[11px] text-emerald-800 mt-0.5 leading-relaxed">
                  A unique mock candidate has been generated and pre-enrolled in {demoData.enrolled_exams_count} mock assessment(s). Credentials have been auto-filled into the form below.
                </p>
              </div>
            </div>

            {/* Credentials Card */}
            <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4 space-y-3">
              <div className="flex items-center justify-between pb-2.5 border-b border-stone-200 text-xs">
                <span className="text-stone-500">Candidate Name:</span>
                <span className="font-semibold text-stone-900">{demoData.name}</span>
              </div>

              {/* Roll Number (User ID) */}
              <div>
                <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">
                  User ID / Candidate Roll Number
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 bg-white rounded-lg border border-stone-300 font-mono font-bold text-sm text-stone-900 select-all shadow-2xs">
                    {demoData.roll_number}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(demoData.roll_number, 'roll')}
                    className="px-3 py-2 bg-white hover:bg-stone-100 border border-stone-300 rounded-lg text-xs font-semibold text-stone-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    {copiedField === 'roll' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">
                  Password
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 bg-white rounded-lg border border-stone-300 font-mono font-bold text-sm text-stone-900 select-all flex items-center justify-between shadow-2xs">
                    <span>{showModalPassword ? demoData.password : '••••••••••••'}</span>
                    <button
                      type="button"
                      onClick={() => setShowModalPassword(!showModalPassword)}
                      className="text-stone-400 hover:text-stone-700 p-0.5 cursor-pointer"
                      title={showModalPassword ? 'Hide password' : 'Show password'}
                    >
                      {showModalPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(demoData.password, 'password')}
                    className="px-3 py-2 bg-white hover:bg-stone-100 border border-stone-300 rounded-lg text-xs font-semibold text-stone-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    {copiedField === 'password' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Demo Email */}
              <div className="pt-1 flex items-center justify-between text-[11px] text-stone-500">
                <span>Demo Email:</span>
                <span className="font-mono text-stone-700">{demoData.email}</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
              <button
                type="button"
                id="demo-modal-signin-btn"
                onClick={handleInstantSignIn}
                disabled={isSubmitting}
                className="btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 order-1 sm:order-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Sign In & Launch Mock Exam</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsDemoModalOpen(false)}
                className="btn-secondary w-full sm:w-auto py-2.5 px-4 text-xs font-semibold order-2 sm:order-1 cursor-pointer"
              >
                Close & Review Form
              </button>
            </div>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => copyToClipboard(`Roll Number: ${demoData.roll_number}\nPassword: ${demoData.password}`, 'all')}
                className="text-[11px] text-stone-500 hover:text-stone-900 inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                {copiedField === 'all' ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-700 font-medium">All credentials copied to clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy both ID & Password</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
