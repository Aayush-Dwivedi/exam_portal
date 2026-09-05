import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  PlusCircle, ArrowRight, ArrowLeft, Check, BookOpen, 
  Layers, Settings, Calendar, Eye, Send, CheckCircle2, AlertCircle, Trash2
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Question, Section } from '../../types';
import { Badge } from '../../components/common/Badge';

export const ExamBuilderPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 7;

  // Step 1: Basic Details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('1. Ensure webcam is enabled at all times.\n2. Do not switch tabs during examination.\n3. Each question carries marks with negative marking for wrong answers.');
  const [durationMinutes, setDurationMinutes] = useState(45);

  // Step 2: Sections
  const [sections, setSections] = useState<{ id?: number; title: string; sequence: number }[]>([
    { title: 'Core Assessment', sequence: 0 }
  ]);

  // Step 3: Question Assignment
  const [availableQuestions, setAvailableQuestions] = useState<Question[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [questionSectionMap, setQuestionSectionMap] = useState<Record<number, number>>({});

  // Step 4: Rules
  const [negativeMarking, setNegativeMarking] = useState(true);
  const [allowNavigation, setAllowNavigation] = useState(true);
  const [allowMarkReview, setAllowMarkReview] = useState(true);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [proctoringEnabled, setProctoringEnabled] = useState(true);

  // Step 5: Schedule
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // Status and Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadQuestions = async () => {
      try {
        const res = await apiClient.get<Question[]>('/questions');
        setAvailableQuestions(res.data);
      } catch (err) {
        console.error('Failed to load questions', err);
      }
    };
    loadQuestions();
  }, []);

  const handleAddSection = () => {
    setSections((prev) => [
      ...prev,
      { title: `Section ${prev.length + 1}`, sequence: prev.length }
    ]);
  };

  const handleRemoveSection = (idx: number) => {
    if (sections.length <= 1) return;
    setSections((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleToggleQuestion = (qId: number) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(qId) ? prev.filter((id) => id !== qId) : [...prev, qId]
    );
  };

  const handleAssignSection = (qId: number, secIdx: number) => {
    setQuestionSectionMap((prev) => ({
      ...prev,
      [qId]: secIdx,
    }));
  };

  const handleNextStep = () => {
    if (currentStep === 1 && !title.trim()) {
      setError('Please provide an Examination Title.');
      return;
    }
    if (currentStep === 3 && selectedQuestionIds.length === 0) {
      setError('Please assign at least one question to the examination.');
      return;
    }
    setError(null);
    setCurrentStep((prev) => Math.min(totalSteps, prev + 1));
  };

  const handlePrevStep = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const handleSubmitExam = async (submitForReview: boolean) => {
    try {
      setSubmitting(true);
      setError(null);

      // Create Exam payload
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        duration_minutes: durationMinutes,
        start_time: startTime ? new Date(startTime).toISOString() : undefined,
        end_time: endTime ? new Date(endTime).toISOString() : undefined,
        negative_marking: negativeMarking,
        allow_navigation: allowNavigation,
        allow_mark_review: allowMarkReview,
        shuffle_questions: shuffleQuestions,
        shuffle_options: shuffleOptions,
        proctoring_enabled: proctoringEnabled,
        sections: sections.map((sec, idx) => ({
          title: sec.title.trim(),
          sequence: idx,
        })),
        questions: selectedQuestionIds.map((qId, idx) => ({
          question_id: qId,
          sequence: idx,
        })),
      };

      const res = await apiClient.post<{ id: number }>('/exams', payload);
      const examId = res.data.id;

      if (submitForReview) {
        await apiClient.post(`/exams/${examId}/submit-for-review`);
      }

      navigate('/setter/exams');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to submit examination blueprint');
    } finally {
      setSubmitting(false);
    }
  };

  const stepsList = [
    { num: 1, label: 'Details', icon: BookOpen },
    { num: 2, label: 'Sections', icon: Layers },
    { num: 3, label: 'Questions', icon: PlusCircle },
    { num: 4, label: 'Rules', icon: Settings },
    { num: 5, label: 'Schedule', icon: Calendar },
    { num: 6, label: 'Preview', icon: Eye },
    { num: 7, label: 'Submit', icon: Send },
  ];

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Wizard Progress Bar */}
      <div className="card-cream p-3 sm:p-4 rounded-2xl">
        <div className="flex items-center justify-between overflow-x-auto gap-2 pb-1">
          {stepsList.map((st) => (
            <div key={st.num} className="flex items-center gap-1.5">
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  currentStep === st.num
                    ? 'bg-stone-900 text-white shadow-xs'
                    : currentStep > st.num
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-stone-100 text-stone-400 border border-stone-200'
                }`}
              >
                {currentStep > st.num ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <st.icon className="w-3.5 h-3.5" />
                )}
                <span>{st.num}. {st.label}</span>
              </div>
              {st.num < totalSteps && (
                <div className="w-3 h-[1px] bg-stone-200 hidden sm:block" />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step Contents */}
      <div className="card-cream p-5 sm:p-7 rounded-2xl min-h-[400px]">
        {/* Step 1: Basic Details */}
        {currentStep === 1 && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="text-base font-bold text-stone-900">Step 1: Examination Overview</h2>
            <div>
              <label className="block text-[11px] font-semibold text-stone-700 uppercase tracking-wider mb-1">
                Examination Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Distributed Systems & Cloud Architecture Final Assessment"
                className="input-cream"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-stone-700 uppercase tracking-wider mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Summary description of topics and scope..."
                className="input-cream"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Duration (Minutes)
                </label>
                <input
                  type="number"
                  min="5"
                  max="360"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 45)}
                  className="input-cream font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-stone-700 uppercase tracking-wider mb-1">
                Candidate Instructions
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                className="input-cream"
              />
            </div>
          </div>
        )}

        {/* Step 2: Sections */}
        {currentStep === 2 && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-stone-900">Step 2: Paper Sections</h2>
              <button
                type="button"
                onClick={handleAddSection}
                className="text-xs font-semibold text-stone-700 hover:text-stone-900 underline"
              >
                + Add Section
              </button>
            </div>

            <div className="space-y-2.5">
              {sections.map((sec, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center gap-2.5">
                  <span className="font-mono text-xs text-stone-700 font-bold px-2 py-0.5 bg-stone-200/70 rounded-lg">
                    #{idx + 1}
                  </span>
                  <input
                    type="text"
                    value={sec.title}
                    onChange={(e) => {
                      const updated = [...sections];
                      updated[idx].title = e.target.value;
                      setSections(updated);
                    }}
                    placeholder={`Section ${idx + 1} Title`}
                    className="input-cream py-1.5 text-xs flex-1"
                  />
                  {sections.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSection(idx)}
                      className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Question Assignment */}
        {currentStep === 3 && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-stone-900">Step 3: Select Questions</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Selected <strong className="text-stone-900 font-semibold">{selectedQuestionIds.length}</strong> questions from bank
                </p>
              </div>
            </div>

            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {availableQuestions.map((q) => {
                const isSelected = selectedQuestionIds.includes(q.id);
                return (
                  <div
                    key={q.id}
                    onClick={() => handleToggleQuestion(q.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-stone-100 border-stone-800 shadow-xs'
                        : 'bg-white border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          isSelected ? 'bg-stone-900 border-stone-900 text-white' : 'border-stone-300 bg-white'
                        }`}>
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-stone-900">{q.question_text}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] text-stone-500 font-medium">{q.subject} · {q.topic}</span>
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-semibold text-stone-600">+{q.marks}m</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 4: Examination Rules */}
        {currentStep === 4 && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="text-base font-bold text-stone-900">Step 4: Assessment Rules & Integrity</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center justify-between p-3.5 rounded-xl bg-stone-50 border border-stone-200 cursor-pointer">
                <div>
                  <span className="text-xs font-semibold text-stone-900">Negative Marking</span>
                  <p className="text-[11px] text-stone-500">Deduct penalty for incorrect choices</p>
                </div>
                <input
                  type="checkbox"
                  checked={negativeMarking}
                  onChange={(e) => setNegativeMarking(e.target.checked)}
                  className="w-4 h-4 accent-stone-900 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-xl bg-stone-50 border border-stone-200 cursor-pointer">
                <div>
                  <span className="text-xs font-semibold text-stone-900">Question Navigation</span>
                  <p className="text-[11px] text-stone-500">Allow free jumping between questions</p>
                </div>
                <input
                  type="checkbox"
                  checked={allowNavigation}
                  onChange={(e) => setAllowNavigation(e.target.checked)}
                  className="w-4 h-4 accent-stone-900 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-xl bg-stone-50 border border-stone-200 cursor-pointer">
                <div>
                  <span className="text-xs font-semibold text-stone-900">Mark for Review</span>
                  <p className="text-[11px] text-stone-500">Allow flagging questions on palette</p>
                </div>
                <input
                  type="checkbox"
                  checked={allowMarkReview}
                  onChange={(e) => setAllowMarkReview(e.target.checked)}
                  className="w-4 h-4 accent-stone-900 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-xl bg-stone-50 border border-stone-200 cursor-pointer">
                <div>
                  <span className="text-xs font-semibold text-stone-900">Shuffle Questions</span>
                  <p className="text-[11px] text-stone-500">Randomize question order per candidate</p>
                </div>
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                  className="w-4 h-4 accent-stone-900 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-xl bg-stone-50 border border-stone-200 cursor-pointer">
                <div>
                  <span className="text-xs font-semibold text-stone-900">Shuffle Options</span>
                  <p className="text-[11px] text-stone-500">Randomize option choices per candidate</p>
                </div>
                <input
                  type="checkbox"
                  checked={shuffleOptions}
                  onChange={(e) => setShuffleOptions(e.target.checked)}
                  className="w-4 h-4 accent-stone-900 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-xl bg-stone-50 border border-stone-200 cursor-pointer">
                <div>
                  <span className="text-xs font-semibold text-stone-900">AI Proctoring System</span>
                  <p className="text-[11px] text-stone-500">Monitor webcam and generate risk events</p>
                </div>
                <input
                  type="checkbox"
                  checked={proctoringEnabled}
                  onChange={(e) => setProctoringEnabled(e.target.checked)}
                  className="w-4 h-4 accent-stone-900 rounded"
                />
              </label>
            </div>
          </div>
        )}

        {/* Step 5: Schedule */}
        {currentStep === 5 && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="text-base font-bold text-stone-900">Step 5: Assessment Window Schedule</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Window Opens At
                </label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="input-cream"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Window Closes At
                </label>
                <input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="input-cream"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 6: Preview */}
        {currentStep === 6 && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="text-base font-bold text-stone-900">Step 6: Paper Preview & Blueprint</h2>

            <div className="p-4 sm:p-5 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-stone-900">{title || 'Untitled Exam'}</h3>
                <Badge label={`${durationMinutes} Mins`} variant="purple" size="sm" />
              </div>
              <p className="text-xs text-stone-500">{description || 'No description'}</p>

              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-stone-200 text-xs">
                <div>
                  <span className="text-stone-500">Sections:</span> <strong className="text-stone-900">{sections.length}</strong>
                </div>
                <div>
                  <span className="text-stone-500">Questions:</span> <strong className="text-stone-900">{selectedQuestionIds.length}</strong>
                </div>
                <div>
                  <span className="text-stone-500">Negative Marks:</span> <strong className="text-stone-900">{negativeMarking ? 'Active' : 'Disabled'}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 7: Submit */}
        {currentStep === 7 && (
          <div className="space-y-5 text-center py-6 animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-stone-100 text-stone-800 flex items-center justify-center mx-auto border border-stone-200">
              <Send className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">Ready to Submit Examination</h2>
              <p className="text-xs text-stone-500 max-w-md mx-auto mt-1">
                You can submit this examination directly for Administrator Review or save it as a private Draft to edit later.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleSubmitExam(false)}
                disabled={submitting}
                className="btn-secondary py-2.5 px-5 text-xs font-semibold"
              >
                Save as Draft
              </button>
              <button
                type="button"
                onClick={() => handleSubmitExam(true)}
                disabled={submitting}
                className="btn-primary py-2.5 px-5 text-xs font-semibold"
              >
                {submitting ? 'Submitting...' : 'Submit for Admin Approval'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Footer Controls */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={handlePrevStep}
          disabled={currentStep === 1}
          className="btn-secondary py-2 px-3.5 text-xs flex items-center gap-1.5 disabled:opacity-30"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Previous Step</span>
        </button>

        {currentStep < totalSteps && (
          <button
            type="button"
            onClick={handleNextStep}
            className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-1.5"
          >
            <span>Next Step</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
