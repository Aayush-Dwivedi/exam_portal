import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, Plus, Search, Filter, Trash2, Edit, 
  Copy, CheckCircle2, AlertCircle, Sparkles, HelpCircle, Download, Upload 
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Question, QuestionType, DifficultyLevel, Option } from '../../types';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';

export const QuestionBankPage: React.FC = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(questions, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "questions_bank_export.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJSON = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string);
          if (Array.isArray(imported)) {
            for (const q of imported) {
              await apiClient.post('/questions', {
                question_text: q.question_text,
                question_type: q.question_type || 'MCQ',
                subject: q.subject || 'General',
                topic: q.topic || 'General',
                difficulty: q.difficulty || 'MEDIUM',
                marks: q.marks || 1.0,
                negative_marks: q.negative_marks || 0.25,
                explanation: q.explanation || undefined,
                options: q.options || [],
              });
            }
            fetchQuestions();
            alert(`Successfully imported ${imported.length} questions.`);
          }
        } catch (parseErr) {
          alert('Failed to parse question JSON file.');
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error('Import failed', err);
    }
  };

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  // Form states
  const [questionText, setQuestionText] = useState('');
  const [questionType, setQuestionType] = useState<QuestionType>('MCQ');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('MEDIUM');
  const [marks, setMarks] = useState(1.0);
  const [negativeMarks, setNegativeMarks] = useState(0.25);
  const [explanation, setExplanation] = useState('');
  const [options, setOptions] = useState<{ option_text: string; is_correct: boolean }[]>([
    { option_text: '', is_correct: false },
    { option_text: '', is_correct: false },
    { option_text: '', is_correct: false },
    { option_text: '', is_correct: false },
  ]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      let query = '/questions?';
      if (typeFilter !== 'ALL') query += `question_type=${typeFilter}&`;
      if (search.trim()) query += `search=${encodeURIComponent(search.trim())}&`;

      const res = await apiClient.get<Question[]>(query);
      setQuestions(res.data);
    } catch (error) {
      console.error('Failed to fetch questions', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, [typeFilter]);

  const handleOpenCreate = () => {
    setEditingQuestion(null);
    setQuestionText('');
    setQuestionType('MCQ');
    setSubject('Computer Science');
    setTopic('Data Structures');
    setDifficulty('MEDIUM');
    setMarks(2.0);
    setNegativeMarks(0.5);
    setExplanation('');
    setOptions([
      { option_text: '', is_correct: true },
      { option_text: '', is_correct: false },
      { option_text: '', is_correct: false },
      { option_text: '', is_correct: false },
    ]);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (q: Question) => {
    setEditingQuestion(q);
    setQuestionText(q.question_text);
    setQuestionType(q.question_type);
    setSubject(q.subject);
    setTopic(q.topic);
    setDifficulty(q.difficulty);
    setMarks(q.marks);
    setNegativeMarks(q.negative_marks);
    setExplanation(q.explanation || '');
    setOptions(
      q.options && q.options.length > 0
        ? q.options.map((o) => ({ option_text: o.option_text, is_correct: !!o.is_correct }))
        : [{ option_text: '', is_correct: true }]
    );
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOptionTextChange = (idx: number, text: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[idx].option_text = text;
      return next;
    });
  };

  const handleToggleCorrect = (idx: number) => {
    setOptions((prev) => {
      if (questionType === 'MCQ' || questionType === 'TRUE_FALSE') {
        // Single correct
        return prev.map((opt, i) => ({
          ...opt,
          is_correct: i === idx,
        }));
      } else {
        // Multi select
        const next = [...prev];
        next[idx].is_correct = !next[idx].is_correct;
        return next;
      }
    });
  };

  const handleAddOption = () => {
    setOptions((prev) => [...prev, { option_text: '', is_correct: false }]);
  };

  const handleRemoveOption = (idx: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim() || !subject.trim() || !topic.trim()) {
      setFormError('Please fill in question text, subject, and topic.');
      return;
    }

    if (['MCQ', 'MULTI_SELECT', 'TRUE_FALSE'].includes(questionType)) {
      const filledOptions = options.filter((o) => o.option_text.trim() !== '');
      if (filledOptions.length < 2) {
        setFormError('Please provide at least two valid options.');
        return;
      }
      const hasCorrect = filledOptions.some((o) => o.is_correct);
      if (!hasCorrect) {
        setFormError('Please mark at least one correct option.');
        return;
      }
    }

    try {
      setSubmitting(true);
      setFormError(null);

      const payload = {
        question_text: questionText.trim(),
        question_type: questionType,
        subject: subject.trim(),
        topic: topic.trim(),
        difficulty,
        marks: parseFloat(marks.toString()),
        negative_marks: parseFloat(negativeMarks.toString()),
        explanation: explanation.trim() || undefined,
        options: options.map((opt, seq) => ({
          option_text: opt.option_text.trim(),
          sequence: seq,
          is_correct: opt.is_correct,
        })),
      };

      if (editingQuestion) {
        await apiClient.patch(`/questions/${editingQuestion.id}`, payload);
      } else {
        await apiClient.post('/questions', payload);
      }

      setIsModalOpen(false);
      fetchQuestions();
    } catch (err: any) {
      setFormError(err.response?.data?.detail || 'Failed to save question');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDuplicate = async (questionId: number) => {
    try {
      await apiClient.post(`/questions/${questionId}/duplicate`);
      fetchQuestions();
    } catch (error) {
      console.error('Failed to duplicate question', error);
    }
  };

  const handleDelete = async (questionId: number) => {
    if (!window.confirm('Are you sure you want to delete this question?')) return;
    try {
      await apiClient.delete(`/questions/${questionId}`);
      fetchQuestions();
    } catch (error) {
      console.error('Failed to delete question', error);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-stone-700" />
            Question Bank Repository
          </h1>
          <p className="text-stone-500 text-xs mt-0.5">
            Author, categorize, and curate questions for examinations
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportJSON}
            accept=".json"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary py-2 px-3 text-xs"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import JSON</span>
          </button>
          <button
            onClick={handleExportJSON}
            className="btn-secondary py-2 px-3 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
          <button
            onClick={handleOpenCreate}
            className="btn-primary py-2 px-3.5 text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Question</span>
          </button>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="card-cream p-3.5 rounded-2xl flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchQuestions()}
            placeholder="Search questions by text, subject, or topic..."
            className="input-cream pl-10 py-2 text-xs"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-400"
          >
            <option value="ALL">All Types</option>
            <option value="MCQ">Single MCQ</option>
            <option value="MULTI_SELECT">Multi-Select</option>
            <option value="TRUE_FALSE">True / False</option>
            <option value="NUMERICAL">Numerical</option>
          </select>
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-3.5">
        {loading ? (
          <div className="py-12 text-center text-stone-500">
            <div className="w-7 h-7 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Loading questions...</p>
          </div>
        ) : questions.length === 0 ? (
          <div className="card-cream p-10 rounded-2xl text-center">
            <HelpCircle className="w-10 h-10 text-stone-400 mx-auto mb-2.5" />
            <h3 className="text-sm font-semibold text-stone-800">No questions found</h3>
            <p className="text-xs text-stone-500 mt-1">
              Click 'Create Question' to add your first authored question.
            </p>
          </div>
        ) : (
          questions.map((q, idx) => (
            <div
              key={q.id}
              className="card-cream card-cream-hover p-5 rounded-2xl space-y-3"
            >
              {/* Question Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-stone-700 text-xs px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200">
                    #{idx + 1}
                  </span>
                  <Badge label={q.subject} variant="purple" size="sm" />
                  <Badge label={q.topic} variant="neutral" size="sm" />
                  <Badge label={q.question_type} variant="info" size="sm" />
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto text-xs font-mono text-stone-500">
                  <span>Marks: <strong className="text-emerald-700 font-semibold">+{q.marks}</strong></span>
                  <span>Penalty: <strong className="text-rose-700 font-semibold">-{q.negative_marks}</strong></span>
                </div>
              </div>

              {/* Question Text */}
              <p className="text-xs sm:text-sm font-medium text-stone-900 leading-relaxed">
                {q.question_text}
              </p>

              {/* Options Grid */}
              {q.options && q.options.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                  {q.options.map((opt) => (
                    <div
                      key={opt.sequence}
                      className={`p-2.5 rounded-xl border text-xs flex items-center justify-between transition-colors ${
                        opt.is_correct
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold'
                          : 'bg-stone-50 border-stone-200 text-stone-700'
                      }`}
                    >
                      <span>{opt.option_text}</span>
                      {opt.is_correct && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Explanation & Action Bar */}
              <div className="pt-2.5 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="text-xs text-stone-500">
                  {q.explanation && (
                    <p className="line-clamp-1">
                      <strong className="text-stone-700">Explanation:</strong> {q.explanation}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <button
                    onClick={() => handleDuplicate(q.id)}
                    title="Duplicate Question"
                    className="btn-secondary py-1 px-2.5 text-xs inline-flex"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Duplicate</span>
                  </button>
                  <button
                    onClick={() => handleOpenEdit(q)}
                    title="Edit Question"
                    className="btn-secondary py-1 px-2.5 text-xs inline-flex"
                  >
                    <Edit className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => handleDelete(q.id)}
                    title="Delete Question"
                    className="py-1 px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs inline-flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create / Edit Question Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingQuestion ? 'Edit Question' : 'Create New Question'}
        maxWidth="2xl"
      >
        <form onSubmit={handleSaveQuestion} className="space-y-3.5">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-stone-700 uppercase tracking-wider mb-1">
                Type
              </label>
              <select
                value={questionType}
                onChange={(e) => setQuestionType(e.target.value as QuestionType)}
                className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
              >
                <option value="MCQ">Single MCQ</option>
                <option value="MULTI_SELECT">Multi-Select</option>
                <option value="TRUE_FALSE">True/False</option>
                <option value="NUMERICAL">Numerical</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-stone-700 uppercase tracking-wider mb-1">
                Marks (+)
              </label>
              <input
                type="number"
                step="0.25"
                min="0.5"
                value={marks}
                onChange={(e) => setMarks(parseFloat(e.target.value) || 1.0)}
                className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400 font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-stone-700 uppercase tracking-wider mb-1">
                Penalty (-)
              </label>
              <input
                type="number"
                step="0.05"
                min="0"
                value={negativeMarks}
                onChange={(e) => setNegativeMarks(parseFloat(e.target.value) || 0.0)}
                className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-stone-700 uppercase tracking-wider mb-1">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                placeholder="e.g. Computer Science"
                className="input-cream py-1.5 text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-stone-700 uppercase tracking-wider mb-1">
                Topic
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                required
                placeholder="e.g. Trees & Graphs"
                className="input-cream py-1.5 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-stone-700 uppercase tracking-wider mb-1">
              Question Text
            </label>
            <textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              rows={3}
              required
              placeholder="Type your question prompt here..."
              className="input-cream py-2 text-xs"
            />
          </div>

          {/* Options Manager */}
          {['MCQ', 'MULTI_SELECT', 'TRUE_FALSE'].includes(questionType) && (
            <div className="space-y-2 pt-2 border-t border-stone-200">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-stone-700 uppercase tracking-wider">
                  Options & Correct Answer
                </label>
                {questionType !== 'TRUE_FALSE' && (
                  <button
                    type="button"
                    onClick={handleAddOption}
                    className="text-xs text-stone-700 hover:text-stone-900 font-semibold underline"
                  >
                    + Add Option
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleCorrect(idx)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1 transition-all ${
                        opt.is_correct
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-white text-stone-500 border-stone-300 hover:bg-stone-50'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{opt.is_correct ? 'Correct' : 'Mark'}</span>
                    </button>

                    <input
                      type="text"
                      value={opt.option_text}
                      onChange={(e) => handleOptionTextChange(idx, e.target.value)}
                      placeholder={`Option ${idx + 1}`}
                      className="input-cream py-1.5 text-xs flex-1"
                    />

                    {questionType !== 'TRUE_FALSE' && options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-stone-700 uppercase tracking-wider mb-1">
              Explanation (Revealed in results)
            </label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={2}
              placeholder="Step-by-step reasoning for the correct answer..."
              className="input-cream py-2 text-xs"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2.5 border-t border-stone-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary text-xs"
            >
              {submitting ? 'Saving...' : 'Save Question'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
