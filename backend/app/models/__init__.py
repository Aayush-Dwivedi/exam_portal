import enum
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, Float, DateTime, ForeignKey, 
    Enum as SQLEnum, JSON, Index, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.database.base import Base

def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    PAPER_SETTER = "PAPER_SETTER"
    CANDIDATE = "CANDIDATE"

class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    PENDING = "PENDING"

class ExamStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED = "APPROVED"
    PUBLISHED = "PUBLISHED"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    ARCHIVED = "ARCHIVED"
    REJECTED = "REJECTED"

class QuestionType(str, enum.Enum):
    MCQ = "MCQ"
    MULTI_SELECT = "MULTI_SELECT"
    TRUE_FALSE = "TRUE_FALSE"
    NUMERICAL = "NUMERICAL"
    SHORT_ANSWER = "SHORT_ANSWER"

class DifficultyLevel(str, enum.Enum):
    EASY = "EASY"
    MEDIUM = "MEDIUM"
    HARD = "HARD"

class SessionStatus(str, enum.Enum):
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    SUBMITTED = "SUBMITTED"
    AUTO_SUBMITTED = "AUTO_SUBMITTED"
    ABANDONED = "ABANDONED"
    CANCELLED = "CANCELLED"

class ProctoringEventType(str, enum.Enum):
    FACE_NOT_DETECTED = "FACE_NOT_DETECTED"
    MULTIPLE_FACES = "MULTIPLE_FACES"
    LOOKING_AWAY = "LOOKING_AWAY"
    PHONE_DETECTED = "PHONE_DETECTED"
    CAMERA_BLOCKED = "CAMERA_BLOCKED"
    SPOOF_DETECTED = "SPOOF_DETECTED"
    UNKNOWN_OBJECT = "UNKNOWN_OBJECT"
    PERSON_ENTERED_FRAME = "PERSON_ENTERED_FRAME"
    AUDIO_DISTURBANCE = "AUDIO_DISTURBANCE"
    EYE_TRACKING_ANOMALY = "EYE_TRACKING_ANOMALY"
    FULLSCREEN_EXITED = "FULLSCREEN_EXITED"
    CAMERA_DISCONNECTED = "CAMERA_DISCONNECTED"
    MICROPHONE_DISCONNECTED = "MICROPHONE_DISCONNECTED"
    NETWORK_INTERRUPTION = "NETWORK_INTERRUPTION"
    CV_PERFORMANCE_DEGRADED = "CV_PERFORMANCE_DEGRADED"
    BROWSER_TAB_HIDDEN = "BROWSER_TAB_HIDDEN"

class EventSeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"

class ReviewStatus(str, enum.Enum):
    UNREVIEWED = "UNREVIEWED"
    REVIEWED = "REVIEWED"
    DISMISSED = "DISMISSED"
    CONFIRMED = "CONFIRMED"

# ----------------- MODELS -----------------

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    roll_number = Column(String(100), unique=True, index=True, nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(SQLEnum(UserRole), default=UserRole.CANDIDATE, nullable=False, index=True)
    status = Column(SQLEnum(UserStatus), default=UserStatus.ACTIVE, nullable=False, index=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)
    last_login = Column(DateTime, nullable=True)

    # Relationships
    exams_created = relationship("Exam", back_populates="creator", foreign_keys="Exam.created_by")
    exams_approved = relationship("Exam", back_populates="approver", foreign_keys="Exam.approved_by")
    questions_created = relationship("Question", back_populates="creator")
    exam_sessions = relationship("ExamSession", back_populates="candidate")
    enrollments = relationship("CandidateEnrollment", back_populates="candidate")


class Exam(Base):
    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    instructions = Column(Text, nullable=True)
    duration_minutes = Column(Integer, nullable=False, default=60)
    start_time = Column(DateTime, nullable=True, index=True)
    end_time = Column(DateTime, nullable=True, index=True)
    status = Column(SQLEnum(ExamStatus), default=ExamStatus.DRAFT, nullable=False, index=True)
    
    # Rules / settings
    negative_marking = Column(Boolean, default=True)
    allow_navigation = Column(Boolean, default=True)
    allow_mark_review = Column(Boolean, default=True)
    shuffle_questions = Column(Boolean, default=False)
    shuffle_options = Column(Boolean, default=False)
    proctoring_enabled = Column(Boolean, default=True)
    allow_reattempts = Column(Boolean, default=False, nullable=False)
    
    rejection_reason = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    creator = relationship("User", back_populates="exams_created", foreign_keys=[created_by])
    approver = relationship("User", back_populates="exams_approved", foreign_keys=[approved_by])
    sections = relationship("Section", back_populates="exam", cascade="all, delete-orphan", order_by="Section.sequence")
    exam_questions = relationship("ExamQuestion", back_populates="exam", cascade="all, delete-orphan")
    sessions = relationship("ExamSession", back_populates="exam", cascade="all, delete-orphan")
    enrollments = relationship("CandidateEnrollment", back_populates="exam", cascade="all, delete-orphan")


class Section(Base):
    __tablename__ = "sections"

    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    sequence = Column(Integer, default=0, nullable=False)

    # Relationships
    exam = relationship("Exam", back_populates="sections")
    exam_questions = relationship("ExamQuestion", back_populates="section", cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    question_text = Column(Text, nullable=False)
    question_type = Column(SQLEnum(QuestionType), default=QuestionType.MCQ, nullable=False)
    subject = Column(String(100), nullable=False, index=True)
    topic = Column(String(100), nullable=False, index=True)
    difficulty = Column(SQLEnum(DifficultyLevel), default=DifficultyLevel.MEDIUM, nullable=False, index=True)
    marks = Column(Float, default=1.0, nullable=False)
    negative_marks = Column(Float, default=0.25, nullable=False)
    explanation = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    creator = relationship("User", back_populates="questions_created")
    options = relationship("Option", back_populates="question", cascade="all, delete-orphan", order_by="Option.sequence")
    exam_questions = relationship("ExamQuestion", back_populates="question")


class Option(Base):
    __tablename__ = "options"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    option_text = Column(Text, nullable=False)
    sequence = Column(Integer, default=0, nullable=False)
    is_correct = Column(Boolean, default=False, nullable=False)

    question = relationship("Question", back_populates="options")


class ExamQuestion(Base):
    __tablename__ = "exam_questions"

    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    section_id = Column(Integer, ForeignKey("sections.id", ondelete="CASCADE"), nullable=True)
    sequence = Column(Integer, default=0, nullable=False)
    marks_override = Column(Float, nullable=True)
    negative_marks_override = Column(Float, nullable=True)

    exam = relationship("Exam", back_populates="exam_questions")
    question = relationship("Question", back_populates="exam_questions")
    section = relationship("Section", back_populates="exam_questions")


class CandidateEnrollment(Base):
    __tablename__ = "candidate_enrollments"

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), default="ENROLLED", nullable=False)
    assigned_at = Column(DateTime, default=utc_now, nullable=False)

    candidate = relationship("User", back_populates="enrollments")
    exam = relationship("Exam", back_populates="enrollments")

    __table_args__ = (UniqueConstraint("candidate_id", "exam_id", name="uq_candidate_exam"),)


class ExamSession(Base):
    __tablename__ = "exam_sessions"

    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    candidate_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    started_at = Column(DateTime, default=utc_now, nullable=False)
    submitted_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    status = Column(SQLEnum(SessionStatus), default=SessionStatus.IN_PROGRESS, nullable=False, index=True)
    last_activity = Column(DateTime, default=utc_now, nullable=False)
    recording_url = Column(String(500), nullable=True) # URL or path to recorded proctored video
    device_tier = Column(String(50), default="MEDIUM", nullable=True) # HIGH, MEDIUM, LOW, UNSUPPORTED
    cv_status = Column(String(50), default="ACTIVE", nullable=True) # ACTIVE, DEGRADED, PAUSED, FAILED, RECOVERING
    cv_status_reason = Column(String(255), nullable=True)
    network_status = Column(String(50), default="GOOD", nullable=True) # GOOD, DEGRADED, OFFLINE
    
    # Store persistent deterministic shuffled order
    question_order = Column(JSON, nullable=True) # List of question IDs
    option_order = Column(JSON, nullable=True)   # Dict: question_id -> list of option IDs

    exam = relationship("Exam", back_populates="sessions")
    candidate = relationship("User", back_populates="exam_sessions")
    answers = relationship("Answer", back_populates="session", cascade="all, delete-orphan")
    result = relationship("Result", back_populates="session", uselist=False, cascade="all, delete-orphan")
    proctoring_events = relationship("ProctoringEvent", back_populates="session", cascade="all, delete-orphan")


class Answer(Base):
    __tablename__ = "answers"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("exam_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    selected_option = Column(Text, nullable=True) # String or JSON list of selected option IDs
    answer_text = Column(Text, nullable=True)     # For numerical / short-answer questions
    is_marked_review = Column(Boolean, default=False)
    saved_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    session = relationship("ExamSession", back_populates="answers")
    question = relationship("Question")

    __table_args__ = (UniqueConstraint("session_id", "question_id", name="uq_session_question_answer"),)


class Result(Base):
    __tablename__ = "results"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("exam_sessions.id", ondelete="CASCADE"), unique=True, nullable=False)
    candidate_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    total_questions = Column(Integer, default=0, nullable=False)
    attempted = Column(Integer, default=0, nullable=False)
    correct = Column(Integer, default=0, nullable=False)
    incorrect = Column(Integer, default=0, nullable=False)
    unanswered = Column(Integer, default=0, nullable=False)
    score = Column(Float, default=0.0, nullable=False)
    max_score = Column(Float, default=0.0, nullable=False)
    percentage = Column(Float, default=0.0, nullable=False)
    section_scores = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    is_published = Column(Boolean, default=False, nullable=False, index=True)
    approved_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approval_notes = Column(Text, nullable=True)

    session = relationship("ExamSession", back_populates="result")
    candidate = relationship("User", foreign_keys=[candidate_id])
    approver = relationship("User", foreign_keys=[approved_by])
    exam = relationship("Exam")


class ProctoringEvent(Base):
    __tablename__ = "proctoring_events"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("exam_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(SQLEnum(ProctoringEventType), nullable=False, index=True)
    timestamp = Column(DateTime, default=utc_now, nullable=False, index=True)
    duration = Column(Float, default=0.0, nullable=False) # In seconds
    confidence = Column(Float, default=1.0, nullable=False) # 0.0 to 1.0
    severity = Column(SQLEnum(EventSeverity), default=EventSeverity.LOW, nullable=False, index=True)
    evidence_url = Column(String(500), nullable=True)
    metadata_info = Column(JSON, nullable=True)
    review_status = Column(SQLEnum(ReviewStatus), default=ReviewStatus.UNREVIEWED, nullable=False, index=True)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    review_notes = Column(Text, nullable=True)

    session = relationship("ExamSession", back_populates="proctoring_events")
    reviewer = relationship("User", foreign_keys=[reviewed_by])


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String(100), nullable=False, index=True)
    resource_type = Column(String(100), nullable=False)
    resource_id = Column(String(100), nullable=True)
    timestamp = Column(DateTime, default=utc_now, nullable=False, index=True)
    ip_address = Column(String(50), nullable=True)
    details = Column(JSON, nullable=True)

    user = relationship("User")
