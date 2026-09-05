export type UserRole = 'ADMIN' | 'PAPER_SETTER' | 'CANDIDATE';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';

export type ExamStatus = 
  | 'DRAFT' 
  | 'SUBMITTED' 
  | 'UNDER_REVIEW' 
  | 'APPROVED' 
  | 'PUBLISHED' 
  | 'ACTIVE' 
  | 'COMPLETED' 
  | 'ARCHIVED' 
  | 'REJECTED';

export type QuestionType = 'MCQ' | 'MULTI_SELECT' | 'TRUE_FALSE' | 'NUMERICAL' | 'SHORT_ANSWER';
export type DifficultyLevel = 'EASY' | 'MEDIUM' | 'HARD';
export type SessionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'ABANDONED' | 'CANCELLED';

export type ProctoringEventType = 
  | 'FACE_NOT_DETECTED' 
  | 'MULTIPLE_FACES' 
  | 'LOOKING_AWAY' 
  | 'PHONE_DETECTED' 
  | 'CAMERA_BLOCKED' 
  | 'SPOOF_DETECTED'
  | 'UNKNOWN_OBJECT' 
  | 'PERSON_ENTERED_FRAME'
  | 'AUDIO_DISTURBANCE'
  | 'EYE_TRACKING_ANOMALY'
  | 'FULLSCREEN_EXITED'
  | 'CAMERA_DISCONNECTED'
  | 'MICROPHONE_DISCONNECTED'
  | 'NETWORK_INTERRUPTION'
  | 'CV_PERFORMANCE_DEGRADED'
  | 'BROWSER_TAB_HIDDEN';

export type DeviceTier = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNSUPPORTED';
export type CvStatus = 'ACTIVE' | 'DEGRADED' | 'PAUSED' | 'FAILED' | 'RECOVERING';
export type NetworkStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'RECONNECTING';

export type EventSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type ReviewStatus = 'UNREVIEWED' | 'REVIEWED' | 'DISMISSED' | 'CONFIRMED';

export interface User {
  id: number;
  name: string;
  email: string;
  roll_number?: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  last_login?: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  role: UserRole;
  user_id: number;
  name: string;
  email: string;
  roll_number?: string | null;
}

export interface Option {
  id?: number;
  option_text: string;
  sequence: number;
  is_correct?: boolean;
}

export interface Question {
  id: number;
  question_text: string;
  question_type: QuestionType;
  subject: string;
  topic: string;
  difficulty: DifficultyLevel;
  marks: number;
  negative_marks: number;
  explanation?: string | null;
  section_id?: number | null;
  sequence?: number;
  created_by?: number;
  created_at?: string;
  options: Option[];
}

export interface Section {
  id: number;
  exam_id: number;
  title: string;
  description?: string | null;
  sequence: number;
}

export interface Exam {
  id: number;
  title: string;
  description?: string | null;
  instructions?: string | null;
  duration_minutes: number;
  start_time?: string | null;
  end_time?: string | null;
  status: ExamStatus;
  negative_marking: boolean;
  allow_navigation: boolean;
  allow_mark_review: boolean;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  proctoring_enabled: boolean;
  allow_reattempts?: boolean;
  rejection_reason?: string | null;
  created_by: number;
  approved_by?: number | null;
  created_at: string;
  updated_at: string;
  sections?: Section[];
  total_questions?: number;
  total_marks?: number;
  questions?: Question[];
}

export interface ExamSessionData {
  session_id: number;
  candidate_id?: number;
  exam_id: number;
  exam_title: string;
  duration_minutes: number;
  started_at: string;
  expires_at: string;
  server_time: string;
  status: SessionStatus;
  questions: Question[];
  sections: Section[];
  saved_answers: Record<number, {
    selected_option?: string | null;
    answer_text?: string | null;
    is_marked_review: boolean;
  }>;
    rules: {
    negative_marking: boolean;
    allow_navigation: boolean;
    allow_mark_review: boolean;
    proctoring_enabled: boolean;
  };
  device_tier?: DeviceTier;
  cv_status?: CvStatus;
  cv_status_reason?: string | null;
  network_status?: NetworkStatus;
}

export interface Result {
  id: number;
  session_id: number;
  candidate_id: number;
  candidate_name?: string;
  candidate_email?: string;
  exam_id: number;
  exam_title?: string;
  total_questions: number;
  attempted: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  score: number;
  max_score: number;
  percentage: number;
  section_scores?: Record<string, {
    score: number;
    max_score: number;
    total: number;
    attempted: number;
    correct: number;
    incorrect: number;
  }>;
  created_at: string;
  is_published?: boolean;
  approved_by?: number | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  approval_notes?: string | null;
  risk_score?: number;
  risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
  session_status?: string | null;
  cancellation_reason?: string | null;
}

export interface ProctoringEvent {
  id: number;
  session_id: number;
  event_type: ProctoringEventType;
  timestamp: string;
  duration: number;
  confidence: number;
  severity: EventSeverity;
  evidence_url?: string | null;
  metadata_info?: Record<string, any> | null;
  review_status: ReviewStatus;
  reviewed_by?: number | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
}

export interface ProctoringReport {
  session_id: number;
  candidate_name: string;
  candidate_email: string;
  exam_title: string;
  session_duration_minutes: number;
  total_events: number;
  low_severity_events: number;
  medium_severity_events: number;
  high_severity_events: number;
  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  recording_url?: string | null;
  started_at?: string | null;
  device_tier?: DeviceTier;
  cv_status?: CvStatus;
  cv_status_reason?: string | null;
  technical_events_count?: number;
  events: ProctoringEvent[];
}

export interface AuditLog {
  id: number;
  user_id?: number | null;
  user_email?: string;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  timestamp: string;
  ip_address?: string | null;
  details?: Record<string, any>;
}

export interface AdminAnalytics {
  total_candidates: number;
  total_paper_setters: number;
  total_exams: number;
  active_exams: number;
  completed_exams: number;
  pending_approvals: number;
  suspicious_sessions_count: number;
  average_score_pct: number;
  pass_rate_pct: number;
  exams_by_status: Record<string, number>;
  recent_events_count: number;
}
