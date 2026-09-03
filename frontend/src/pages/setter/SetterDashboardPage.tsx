import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  BookOpen, PlusCircle, FileText, Clock, 
  CheckCircle2, Edit3 
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Exam, Question } from '../../types';
import { StatsCard } from '../../components/common/StatsCard';
import { Badge } from '../../components/common/Badge';

export const SetterDashboardPage: React.FC = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [examsRes, qRes] = await Promise.all([
          apiClient.get<Exam[]>('/exams?my_exams_only=true'),
          apiClient.get<Question[]>('/questions?my_questions_only=true'),
        ]);
        setExams(examsRes.data);
        setQuestions(qRes.data);
      } catch (error) {
        console.error('Failed to load setter dashboard data', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const pendingCount = exams.filter((e) => e.status === 'UNDER_REVIEW').length;
  const approvedCount = exams.filter((e) => e.status === 'APPROVED' || e.status === 'PUBLISHED').length;

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="card-cream p-6 sm:p-7 rounded-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-stone-100 border border-stone-200 text-stone-700 text-xs font-medium mb-3">
              <Edit3 className="w-3.5 h-3.5 text-stone-700" />
              <span>Paper Setter Studio Active</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
              Authoring & Examination Builder
            </h1>
            <p className="text-stone-500 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Create comprehensive question banks, configure multi-section assessments with positive/negative marks, and submit papers for administrative approval.
            </p>
          </div>
          <div className="flex items-center gap-2.5 self-start md:self-auto">
            <Link
              to="/setter/exams/create"
              className="btn-primary py-2 px-3.5 text-xs font-semibold"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Create New Exam</span>
            </Link>
            <Link
              to="/setter/questions"
              className="btn-secondary py-2 px-3.5 text-xs font-semibold"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Question Bank</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Authored Questions"
          value={questions.length}
          subtitle="In your personal bank"
          icon={BookOpen}
          color="purple"
        />
        <StatsCard
          title="Total Examinations"
          value={exams.length}
          subtitle="Authored assessments"
          icon={FileText}
          color="brand"
        />
        <StatsCard
          title="Pending Approval"
          value={pendingCount}
          subtitle="Under administrative review"
          icon={Clock}
          color="amber"
        />
        <StatsCard
          title="Approved / Published"
          value={approvedCount}
          subtitle="Ready or active"
          icon={CheckCircle2}
          color="emerald"
        />
      </div>

      {/* Authored Exams Preview */}
      <div className="card-cream p-5 sm:p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-stone-700" />
            My Recent Examinations
          </h2>
          <Link to="/setter/exams" className="text-xs font-semibold text-stone-700 hover:text-stone-900 underline underline-offset-2">
            View All ({exams.length})
          </Link>
        </div>

        {exams.length === 0 ? (
          <div className="py-8 text-center text-stone-500 text-xs">
            No examinations authored yet. Click "Create New Exam" to begin.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {exams.slice(0, 3).map((ex) => (
              <div key={ex.id} className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge
                    label={ex.status}
                    variant={
                      ex.status === 'PUBLISHED' || ex.status === 'APPROVED'
                        ? 'success'
                        : ex.status === 'UNDER_REVIEW'
                        ? 'warning'
                        : ex.status === 'REJECTED'
                        ? 'danger'
                        : 'neutral'
                    }
                    size="sm"
                  />
                  <span className="text-xs text-stone-500 font-mono">{ex.duration_minutes}m</span>
                </div>
                <h3 className="font-bold text-xs text-stone-900 line-clamp-1">{ex.title}</h3>
                <p className="text-xs text-stone-500 line-clamp-2 leading-relaxed">{ex.description || 'No description'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
