import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, PlusCircle, Clock, Send } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Exam, ExamStatus } from '../../types';
import { Badge } from '../../components/common/Badge';

export const MyExamsPage: React.FC = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExams = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<Exam[]>('/exams?my_exams_only=true');
      setExams(res.data);
    } catch (err) {
      console.error('Failed to load exams', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  const handleSubmitForReview = async (examId: number) => {
    try {
      await apiClient.post(`/exams/${examId}/submit-for-review`);
      fetchExams();
    } catch (err) {
      console.error('Failed to submit exam', err);
    }
  };

  const getStatusBadge = (status: ExamStatus) => {
    switch (status) {
      case 'UNDER_REVIEW':
        return <Badge label="Under Review" variant="warning" size="sm" dot />;
      case 'APPROVED':
        return <Badge label="Approved by Admin" variant="success" size="sm" />;
      case 'PUBLISHED':
        return <Badge label="Published" variant="primary" size="sm" dot />;
      case 'REJECTED':
        return <Badge label="Changes Requested" variant="danger" size="sm" />;
      case 'DRAFT':
        return <Badge label="Draft" variant="neutral" size="sm" />;
      default:
        return <Badge label={status} variant="neutral" size="sm" />;
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-stone-700" />
            My Authored Examinations
          </h1>
          <p className="text-stone-500 text-xs mt-0.5">
            Track approval statuses, view admin feedback, and publish approved papers
          </p>
        </div>
        <Link
          to="/setter/exams/create"
          className="btn-primary py-2 px-3.5 text-xs font-semibold self-start sm:self-auto"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Create New Exam</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-12 text-center text-stone-500">
            <div className="w-7 h-7 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Loading authored exams...</p>
          </div>
        ) : exams.length === 0 ? (
          <div className="col-span-full card-cream p-10 text-center">
            <FileText className="w-10 h-10 text-stone-400 mx-auto mb-2.5" />
            <h3 className="text-sm font-semibold text-stone-800">No authored exams yet</h3>
            <p className="text-xs text-stone-500 mt-1">
              Click 'Create New Exam' to author your first assessment paper.
            </p>
          </div>
        ) : (
          exams.map((ex) => (
            <div
              key={ex.id}
              className="card-cream card-cream-hover p-5 rounded-2xl flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  {getStatusBadge(ex.status)}
                  <span className="text-xs text-stone-500 flex items-center gap-1 font-mono">
                    <Clock className="w-3.5 h-3.5 text-stone-400" />
                    {ex.duration_minutes} mins
                  </span>
                </div>

                <h3 className="font-bold text-sm text-stone-900 line-clamp-2 leading-snug">{ex.title}</h3>
                <p className="text-xs text-stone-500 mt-1.5 line-clamp-2 leading-relaxed">
                  {ex.description || 'No description provided.'}
                </p>

                {ex.rejection_reason && (
                  <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                    <strong className="text-rose-900 block mb-0.5">Admin Feedback:</strong>
                    {ex.rejection_reason}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-stone-500">
                  {ex.total_questions || ex.sections?.length || '--'} Questions
                </span>

                <div className="flex items-center gap-2">
                  {ex.status === 'DRAFT' && (
                    <button
                      onClick={() => handleSubmitForReview(ex.id)}
                      className="btn-primary py-1 px-3 text-xs"
                    >
                      <Send className="w-3 h-3" />
                      <span>Submit for Review</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
