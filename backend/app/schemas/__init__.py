from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel as _PydanticBaseModel, EmailStr, Field, ConfigDict, field_serializer
from app.models import (
    UserRole, UserStatus, ExamStatus, QuestionType, 
    DifficultyLevel, SessionStatus, ProctoringEventType, 
    EventSeverity, ReviewStatus
)

class BaseModel(_PydanticBaseModel):
    """
    Base model for all API schemas. Ensures naive UTC datetimes
    are serialized with explicit 'Z' suffix to guarantee accurate
    IST (+05:30) client conversion across browsers.
    """
    @field_serializer('*', mode='plain', check_fields=False, when_used='json')
    def serialize_datetimes_utc(self, val, info):
        if isinstance(val, datetime):
            if val.tzinfo is None:
                val = val.replace(tzinfo=timezone.utc)
            return val.isoformat().replace('+00:00', 'Z')
        return val

# ----------------- AUTH SCHEMAS -----------------

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    user_id: int
    name: str
    email: str
    roll_number: Optional[str] = None

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    role: Optional[str] = None
    exp: Optional[int] = None

class LoginRequest(BaseModel):
    identifier: Optional[str] = None
    email: Optional[str] = None
    password: str

class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    roll_number: Optional[str] = None
    password: str = Field(..., min_length=6)
    role: UserRole = UserRole.CANDIDATE

class DemoCandidateResponse(BaseModel):
    user_id: int
    name: str
    email: str
    roll_number: str
    password: str
    role: UserRole = UserRole.CANDIDATE
    enrolled_exams_count: int = 0

# ----------------- USER SCHEMAS -----------------

class UserBase(BaseModel):
    name: str
    email: EmailStr
    roll_number: Optional[str] = None
    role: UserRole = UserRole.CANDIDATE
    status: UserStatus = UserStatus.ACTIVE

class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    roll_number: Optional[str] = None
    password: str = Field(..., min_length=6)
    role: UserRole
    status: UserStatus = UserStatus.ACTIVE

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    roll_number: Optional[str] = None
    role: Optional[UserRole] = None
    status: Optional[UserStatus] = None
    password: Optional[str] = None

class UserOut(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

# ----------------- QUESTION SCHEMAS -----------------

class OptionBase(BaseModel):
    option_text: str
    sequence: int = 0
    is_correct: bool = False

class OptionCreate(OptionBase):
    pass

class OptionOut(OptionBase):
    id: int
    question_id: int

    model_config = ConfigDict(from_attributes=True)

# Safe option for candidates during exams (is_correct hidden)
class CandidateOptionOut(BaseModel):
    id: int
    option_text: str
    sequence: int

    model_config = ConfigDict(from_attributes=True)

class QuestionBase(BaseModel):
    question_text: str
    question_type: QuestionType = QuestionType.MCQ
    subject: str
    topic: str
    difficulty: DifficultyLevel = DifficultyLevel.MEDIUM
    marks: float = 1.0
    negative_marks: float = 0.25
    explanation: Optional[str] = None

class QuestionCreate(QuestionBase):
    options: Optional[List[OptionCreate]] = None

class QuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    question_type: Optional[QuestionType] = None
    subject: Optional[str] = None
    topic: Optional[str] = None
    difficulty: Optional[DifficultyLevel] = None
    marks: Optional[float] = None
    negative_marks: Optional[float] = None
    explanation: Optional[str] = None
    options: Optional[List[OptionCreate]] = None

class QuestionOut(QuestionBase):
    id: int
    created_by: int
    created_at: datetime
    updated_at: datetime
    options: List[OptionOut] = []

    model_config = ConfigDict(from_attributes=True)

# Safe question for candidates during exams
class CandidateQuestionOut(BaseModel):
    id: int
    question_text: str
    question_type: QuestionType
    subject: str
    topic: str
    difficulty: DifficultyLevel
    marks: float
    negative_marks: float
    section_id: Optional[int] = None
    sequence: int = 0
    options: List[CandidateOptionOut] = []

    model_config = ConfigDict(from_attributes=True)

# ----------------- SECTION SCHEMAS -----------------

class SectionBase(BaseModel):
    title: str
    description: Optional[str] = None
    sequence: int = 0

class SectionCreate(SectionBase):
    pass

class SectionOut(SectionBase):
    id: int
    exam_id: int

    model_config = ConfigDict(from_attributes=True)

# ----------------- EXAM SCHEMAS -----------------

class ExamQuestionAssign(BaseModel):
    question_id: int
    section_id: Optional[int] = None
    sequence: int = 0
    marks_override: Optional[float] = None
    negative_marks_override: Optional[float] = None

class ExamBase(BaseModel):
    title: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    duration_minutes: int = 60
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    negative_marking: bool = True
    allow_navigation: bool = True
    allow_mark_review: bool = True
    shuffle_questions: bool = False
    shuffle_options: bool = False
    proctoring_enabled: bool = True
    allow_reattempts: bool = False

class ExamCreate(ExamBase):
    sections: Optional[List[SectionCreate]] = None
    questions: Optional[List[ExamQuestionAssign]] = None

class ExamUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    duration_minutes: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    negative_marking: Optional[bool] = None
    allow_navigation: Optional[bool] = None
    allow_mark_review: Optional[bool] = None
    shuffle_questions: Optional[bool] = None
    shuffle_options: Optional[bool] = None
    proctoring_enabled: Optional[bool] = None
    allow_reattempts: Optional[bool] = None

class ExamApprovalRequest(BaseModel):
    status: ExamStatus # APPROVED or REJECTED
    rejection_reason: Optional[str] = None

class ExamOut(ExamBase):
    id: int
    status: ExamStatus
    rejection_reason: Optional[str] = None
    created_by: int
    approved_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    sections: List[SectionOut] = []
    total_questions: Optional[int] = 0
    total_marks: Optional[float] = 0.0

    model_config = ConfigDict(from_attributes=True)

class ExamDetailOut(ExamOut):
    questions: List[QuestionOut] = []

# ----------------- ENROLLMENT & SESSION SCHEMAS -----------------

class EnrollmentCreate(BaseModel):
    candidate_emails: List[EmailStr]

class ExamSessionStart(BaseModel):
    exam_id: int

class SaveAnswerRequest(BaseModel):
    question_id: int
    selected_option: Optional[str] = None
    answer_text: Optional[str] = None
    is_marked_review: bool = False

class AnswerOut(BaseModel):
    id: int
    session_id: int
    question_id: int
    selected_option: Optional[str] = None
    answer_text: Optional[str] = None
    is_marked_review: bool
    saved_at: datetime

    model_config = ConfigDict(from_attributes=True)

class CandidateExamSessionOut(BaseModel):
    session_id: int
    exam_id: int
    exam_title: str
    duration_minutes: int
    started_at: datetime
    expires_at: datetime
    server_time: datetime
    status: SessionStatus
    questions: List[CandidateQuestionOut]
    sections: List[SectionOut]
    saved_answers: Dict[int, Any] # question_id -> {selected_option, answer_text, is_marked_review}
    rules: Dict[str, Any]

class SubmitSessionRequest(BaseModel):
    cancellation_reason: Optional[str] = None

# ----------------- RESULT SCHEMAS -----------------

class ResultOut(BaseModel):
    id: int
    session_id: int
    candidate_id: int
    candidate_name: Optional[str] = None
    candidate_email: Optional[str] = None
    exam_id: int
    exam_title: Optional[str] = None
    total_questions: int
    attempted: int
    correct: int
    incorrect: int
    unanswered: int
    score: float
    max_score: float
    percentage: float
    section_scores: Optional[Dict[str, Any]] = None
    created_at: datetime
    is_published: bool = False
    approved_by: Optional[int] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    approval_notes: Optional[str] = None
    risk_score: Optional[int] = 0
    risk_level: Optional[str] = "LOW"
    session_status: Optional[str] = None
    cancellation_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class PublishResultRequest(BaseModel):
    approval_notes: Optional[str] = None

class BulkPublishResultRequest(BaseModel):
    exam_id: Optional[int] = None
    approval_notes: Optional[str] = None

# ----------------- PROCTORING SCHEMAS -----------------

class ProctoringEventCreate(BaseModel):
    session_id: int
    event_type: ProctoringEventType
    duration: float = 0.0
    confidence: float = 1.0
    severity: EventSeverity = EventSeverity.LOW
    evidence_url: Optional[str] = None
    metadata_info: Optional[Dict[str, Any]] = None

class ProctoringEventReview(BaseModel):
    review_status: ReviewStatus
    review_notes: Optional[str] = None

class ProctoringEventOut(BaseModel):
    id: int
    session_id: int
    event_type: ProctoringEventType
    timestamp: datetime
    duration: float
    confidence: float
    severity: EventSeverity
    evidence_url: Optional[str] = None
    metadata_info: Optional[Dict[str, Any]] = None
    review_status: ReviewStatus
    reviewed_by: Optional[int] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class ProctoringSessionReport(BaseModel):
    session_id: int
    candidate_name: str
    candidate_email: str
    exam_title: str
    session_duration_minutes: float
    total_events: int
    low_severity_events: int
    medium_severity_events: int
    high_severity_events: int
    risk_score: int
    risk_level: str # LOW, MEDIUM, HIGH
    recording_url: Optional[str] = None
    started_at: Optional[datetime] = None
    device_tier: Optional[str] = "MEDIUM"
    cv_status: Optional[str] = "ACTIVE"
    cv_status_reason: Optional[str] = None
    technical_events_count: Optional[int] = 0
    events: List[ProctoringEventOut]

# ----------------- AUDIT LOG SCHEMAS -----------------

class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int]
    user_email: Optional[str] = None
    action: str
    resource_type: str
    resource_id: Optional[str]
    timestamp: datetime
    ip_address: Optional[str]
    details: Optional[Dict[str, Any]]

    model_config = ConfigDict(from_attributes=True)

# ----------------- ANALYTICS SCHEMAS -----------------

class AdminAnalyticsOut(BaseModel):
    total_candidates: int
    total_paper_setters: int
    total_exams: int
    active_exams: int
    completed_exams: int
    pending_approvals: int
    suspicious_sessions_count: int
    average_score_pct: float
    pass_rate_pct: float
    exams_by_status: Dict[str, int]
    recent_events_count: int
