import React, { useState, useEffect } from 'react';
import { 
  FileCheck2, Search, CheckCircle, XCircle, Globe, 
  Clock, Eye, AlertCircle, BookOpen
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Exam, ExamStatus } from '../../types';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';

export const ExamApprovalPage: React.FC = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('UNDER_REVIEW');
  const [search, setSearch] = useState('');

  // Review Inspection Modal
  const [isInspectModalOpen, setIsInspectModalOpen] = useState(false);
  const [selectedExamDetail, setSelectedExamDetail] = useState<Exam | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Reject with feedback modal
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const fetchExams = async () => {
    try {
      setLoading(true);
      let query = '/exams?';
      if (statusFilter !== 'ALL') query += `status_filter=${statusFilter}&`;
      if (search.trim()) query += `search=${encodeURIComponent(search.trim())}&`;

      const res = await apiClient.get<Exam[]>(query);
      setExams(res.data);
    } catch (error) {
      console.error('Failed to fetch exams', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, [statusFilter]);

  const handleInspectExam = async (examId: number) => {
    try {
      setDetailLoading(true);
      setIsInspectModalOpen(true);
      const res = await apiClient.get<Exam>(`/exams/${examId}`);
      setSelectedExamDetail(res.data);
    } catch (error) {
      console.error('Failed to fetch exam detail', error);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApproveExam = async (examId: number) => {
    try {
      setActionSubmitting(true);
      await apiClient.post(`/exams/${examId}/review`, {
        status: 'APPROVED',
      });
      setIsInspectModalOpen(false);
      fetchExams();
    } catch (error) {
      console.error('Failed to approve exam', error);
    } finally {
      setActionSubmitting(false);
    }
  };

  const handlePublishExam = async (examId: number) => {
    try {
      setActionSubmitting(true);
      await apiClient.post(`/exams/${examId}/publish`);
      setIsInspectModalOpen(false);
      fetchExams();
    } catch (error) {
      console.error('Failed to publish exam', error);
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleOpenRejectModal = () => {
    setRejectionReason('');
    setIsRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!selectedExamDetail) return;
    try {
      setActionSubmitting(true);
      await apiClient.post(`/exams/${selectedExamDetail.id}/review`, {
        status: 'REJECTED',
        rejection_reason: rejectionReason || 'Requires modifications per review guidelines',
      });
      setIsRejectModalOpen(false);
      setIsInspectModalOpen(false);
      fetchExams();
    } catch (error) {
      console.error('Failed to reject exam', error);
    } finally {
      setActionSubmitting(false);
    }
  };

  const getStatusBadge = (status: ExamStatus) => {
    switch (status) {
      case 'UNDER_REVIEW':
        return <Badge label="Pending Review" variant="warning" size="sm" dot />;
      case 'APPROVED':
        return <Badge label="Approved" variant="success" size="sm" />;
      case 'PUBLISHED':
        return <Badge label="Published" variant="primary" size="sm" dot />;
      case 'REJECTED':
        return <Badge label="Rejected" variant="danger" size="sm" />;
      case 'DRAFT':
        return <Badge label="Draft" variant="neutral" size="sm" />;
      default:
        return <Badge label={status} variant="neutral" size="sm" />;
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-stone-700" />
            Exam Approvals & Publishing
          </h1>
          <p className="text-stone-500 text-xs mt-0.5">
            Review authored question papers, verify questions & options, and publish assessments
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card-cream p-3.5 rounded-2xl flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchExams()}
            placeholder="Search exams by title..."
            className="input-cream pl-9 py-2 text-xs"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
          {[
            { label: 'Pending Review', value: 'UNDER_REVIEW' },
            { label: 'Approved', value: 'APPROVED' },
            { label: 'Published', value: 'PUBLISHED' },
            { label: 'All Exams', value: 'ALL' },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                statusFilter === tab.value
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:text-stone-900 border border-stone-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Exams Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-12 text-center text-stone-500">
            <div className="w-7 h-7 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Loading question papers...</p>
          </div>
        ) : exams.length === 0 ? (
          <div className="col-span-full card-cream p-10 text-center">
            <BookOpen className="w-10 h-10 text-stone-400 mx-auto mb-2.5" />
            <h3 className="text-sm font-semibold text-stone-800">No examinations found</h3>
            <p className="text-xs text-stone-500 mt-1">
              There are no examinations matching the selected status filter.
            </p>
          </div>
        ) : (
          exams.map((exam) => (
            <div
              key={exam.id}
              className="card-cream card-cream-hover p-5 rounded-2xl flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  {getStatusBadge(exam.status)}
                  <span className="text-xs text-stone-500 flex items-center gap-1 font-mono">
                    <Clock className="w-3.5 h-3.5 text-stone-400" />
                    {exam.duration_minutes} mins
                  </span>
                </div>

                <h2 className="font-bold text-sm text-stone-900 line-clamp-2 leading-snug">
                  {exam.title}
                </h2>
                <p className="text-xs text-stone-500 mt-1.5 line-clamp-2 leading-relaxed">
                  {exam.description || 'No description provided.'}
                </p>

                {exam.rejection_reason && (
                  <div className="mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span><strong>Feedback:</strong> {exam.rejection_reason}</span>
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
                  <span>Questions: <strong className="text-stone-800">{exam.total_questions || exam.sections?.length || '--'}</strong></span>
                  <span>Proctoring: <strong className={exam.proctoring_enabled ? 'text-emerald-700 font-semibold' : 'text-stone-500'}>{exam.proctoring_enabled ? 'Active' : 'Disabled'}</strong></span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center gap-2">
                <button
                  onClick={() => handleInspectExam(exam.id)}
                  className="btn-secondary py-1.5 px-3 text-xs flex-1 inline-flex justify-center"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Inspect Paper</span>
                </button>

                {exam.status === 'APPROVED' && (
                  <button
                    onClick={() => handlePublishExam(exam.id)}
                    className="btn-primary py-1.5 px-3 text-xs bg-emerald-700 hover:bg-emerald-800 inline-flex items-center gap-1"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Publish</span>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Full Paper Inspection Modal */}
      <Modal
        isOpen={isInspectModalOpen}
        onClose={() => setIsInspectModalOpen(false)}
        title="Examination Paper Blueprint & Verification"
        maxWidth="4xl"
      >
        {detailLoading || !selectedExamDetail ? (
          <div className="py-16 text-center text-stone-500">
            <div className="w-7 h-7 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Loading exam blueprint...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary details */}
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-stone-900">
                  {selectedExamDetail.title}
                </h3>
                {getStatusBadge(selectedExamDetail.status)}
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                {selectedExamDetail.description || 'No description.'}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 text-xs border-t border-stone-200">
                <div>
                  <span className="text-stone-500">Duration:</span>{' '}
                  <span className="text-stone-800 font-semibold">{selectedExamDetail.duration_minutes} Mins</span>
                </div>
                <div>
                  <span className="text-stone-500">Negative Marks:</span>{' '}
                  <span className="text-stone-800 font-semibold">{selectedExamDetail.negative_marking ? 'Yes' : 'No'}</span>
                </div>
                <div>
                  <span className="text-stone-500">Shuffle Questions:</span>{' '}
                  <span className="text-stone-800 font-semibold">{selectedExamDetail.shuffle_questions ? 'Yes' : 'No'}</span>
                </div>
                <div>
                  <span className="text-stone-500">AI Proctoring:</span>{' '}
                  <span className="text-emerald-700 font-semibold">{selectedExamDetail.proctoring_enabled ? 'Enabled' : 'Disabled'}</span>
                </div>
              </div>
            </div>

            {/* Questions List */}
            <div>
              <h4 className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-2">
                Assigned Questions ({selectedExamDetail.questions?.length || 0})
              </h4>
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {selectedExamDetail.questions?.map((q, idx) => (
                  <div
                    key={q.id}
                    className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-xs sm:text-sm text-stone-900">
                        <span className="text-stone-600 mr-1.5">Q{idx + 1}.</span>
                        {q.question_text}
                      </p>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Badge label={q.difficulty} size="sm" variant={q.difficulty === 'EASY' ? 'success' : q.difficulty === 'MEDIUM' ? 'warning' : 'danger'} />
                        <span className="text-xs text-stone-500 font-mono">+{q.marks} / -{q.negative_marks}</span>
                      </div>
                    </div>

                    {/* Options list */}
                    {q.options && q.options.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                        {q.options.map((opt) => (
                          <div
                            key={opt.sequence}
                            className={`p-2 rounded-lg border text-xs flex items-center justify-between ${
                              opt.is_correct
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-medium'
                                : 'bg-white border-stone-200 text-stone-700'
                            }`}
                          >
                            <span>{opt.option_text}</span>
                            {opt.is_correct && (
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {q.explanation && (
                      <div className="p-2 rounded-lg bg-stone-100 text-stone-600 text-xs border border-stone-200">
                        <strong className="text-stone-800">Explanation:</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 flex flex-wrap items-center justify-between gap-2.5 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setIsInspectModalOpen(false)}
                className="btn-secondary text-xs"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                {selectedExamDetail.status === 'UNDER_REVIEW' && (
                  <>
                    <button
                      type="button"
                      onClick={handleOpenRejectModal}
                      className="py-1.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors flex items-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject / Request Changes</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveExam(selectedExamDetail.id)}
                      disabled={actionSubmitting}
                      className="btn-primary py-1.5 px-3.5 text-xs bg-emerald-700 hover:bg-emerald-800 flex items-center gap-1"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Approve Paper</span>
                    </button>
                  </>
                )}

                {selectedExamDetail.status === 'APPROVED' && (
                  <button
                    type="button"
                    onClick={() => handlePublishExam(selectedExamDetail.id)}
                    disabled={actionSubmitting}
                    className="btn-primary py-1.5 px-3.5 text-xs flex items-center gap-1"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Publish to Candidates</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject Reason Modal */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Provide Rejection Feedback for Paper Setter"
      >
        <div className="space-y-3.5">
          <p className="text-xs text-stone-600 leading-relaxed">
            Please explain why this examination requires revisions so the paper setter can correct it.
          </p>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={4}
            placeholder="e.g. Please add 5 more questions to Section 2 and adjust negative marking to 0.25."
            className="input-cream text-xs"
          />

          <div className="flex justify-end gap-2.5 pt-3 border-t border-stone-200">
            <button
              onClick={() => setIsRejectModalOpen(false)}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmReject}
              disabled={actionSubmitting}
              className="py-1.5 px-3.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold transition-all"
            >
              {actionSubmitting ? 'Submitting...' : 'Confirm Rejection'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
