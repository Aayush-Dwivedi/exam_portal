import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import asyncio
from datetime import datetime, timedelta, timezone
from sqlalchemy.future import select

from app.database.session import AsyncSessionLocal
from app.models import (
    User, Exam, Section, Question, Option, ExamQuestion, 
    CandidateEnrollment, UserRole, ExamStatus, QuestionType, DifficultyLevel
)

async def create_dummy_exam():
    async with AsyncSessionLocal() as db:
        # Check if already exists
        existing = await db.execute(
            select(Exam).where(Exam.title.ilike("%Practice Mock Exam%"))
        )
        exam = existing.scalars().first()
        if exam:
            print(f"[!] Practice exam already exists with ID: {exam.id}. Ensuring allow_reattempts is True...")
            exam.allow_reattempts = True
            exam.status = ExamStatus.PUBLISHED
            exam.proctoring_enabled = True
            await db.commit()
            print("[+] Updated existing practice exam.")
        else:
            print("[+] Creating new permanent multi-attempt practice mock exam...")
            admin_user = (await db.execute(select(User).where(User.role == UserRole.ADMIN))).scalars().first()
            setter_user = (await db.execute(select(User).where(User.role == UserRole.PAPER_SETTER))).scalars().first()
            creator_id = setter_user.id if setter_user else (admin_user.id if admin_user else 1)
            approver_id = admin_user.id if admin_user else creator_id

            now = datetime.now(timezone.utc).replace(tzinfo=None)

            exam = Exam(
                title="🧪 System Diagnostics & Practice Mock Exam",
                description="Practice assessment for all candidates. Test camera proctoring, microphone detection, eye gaze alerts, and question answering. Can be attempted unlimited times for testing.",
                instructions="1. Ensure webcam and microphone permissions are enabled.\n2. Test navigating questions, marking for review, and typing answers.\n3. This mock examination can be retaken as many times as you like.",
                duration_minutes=15,
                start_time=now - timedelta(days=30),
                end_time=now + timedelta(days=365 * 5),
                status=ExamStatus.PUBLISHED,
                negative_marking=False,
                allow_navigation=True,
                allow_mark_review=True,
                shuffle_questions=False,
                shuffle_options=False,
                proctoring_enabled=True,
                allow_reattempts=True,
                created_by=creator_id,
                approved_by=approver_id
            )
            db.add(exam)
            await db.flush()

            # Section
            section = Section(
                exam_id=exam.id,
                title="System Readiness & Platform Diagnostics",
                description="Practice questions testing various input mechanisms and proctoring feedback",
                sequence=0
            )
            db.add(section)
            await db.flush()

            # Questions Pool
            questions_data = [
                {
                    "text": "Which modern browser API is utilized by this exam portal to access local camera and microphone streams without plugins?",
                    "type": QuestionType.MCQ,
                    "subject": "Platform Architecture",
                    "topic": "WebRTC",
                    "diff": DifficultyLevel.EASY,
                    "marks": 2.0,
                    "neg": 0.0,
                    "exp": "WebRTC navigator.mediaDevices.getUserMedia API is the secure modern standard for camera and audio capture.",
                    "options": [
                        ("WebRTC MediaDevices API", True),
                        ("Adobe Flash Player Plugin", False),
                        ("ActiveX Video Streamer", False),
                        ("Silverlight Runtime", False)
                    ]
                },
                {
                    "text": "Looking away from the screen or having another person enter the camera frame during a proctored exam generates automated warnings.",
                    "type": QuestionType.TRUE_FALSE,
                    "subject": "Exam Integrity",
                    "topic": "Proctoring Protocols",
                    "diff": DifficultyLevel.EASY,
                    "marks": 1.0,
                    "neg": 0.0,
                    "exp": "Computer vision models continuously analyze face presence, multiple faces, and gaze deviation to uphold exam integrity.",
                    "options": [
                        ("True", True),
                        ("False", False)
                    ]
                },
                {
                    "text": "If a candidate completes 6 practice questions in 12 minutes, what is their average time per question in minutes?",
                    "type": QuestionType.NUMERICAL,
                    "subject": "General Aptitude",
                    "topic": "Basic Arithmetic",
                    "diff": DifficultyLevel.EASY,
                    "marks": 2.0,
                    "neg": 0.0,
                    "exp": "12 minutes / 6 questions = 2 minutes per question.",
                    "options": [
                        ("2", True)
                    ]
                },
                {
                    "text": "In the Question Palette on the right panel, which color indicates that a question has been marked for review?",
                    "type": QuestionType.MCQ,
                    "subject": "User Interface",
                    "topic": "Question Palette",
                    "diff": DifficultyLevel.EASY,
                    "marks": 1.0,
                    "neg": 0.0,
                    "exp": "Purple indicates marked for review, green indicates answered, yellow indicates not answered, and gray indicates unvisited.",
                    "options": [
                        ("Purple", True),
                        ("Emerald Green", False),
                        ("Amber Yellow", False),
                        ("Stone Gray", False)
                    ]
                },
                {
                    "text": "Which environmental conditions are actively tracked by the live proctoring engine? (Select all that apply)",
                    "type": QuestionType.MULTI_SELECT,
                    "subject": "Exam Integrity",
                    "topic": "AI Proctoring",
                    "diff": DifficultyLevel.MEDIUM,
                    "marks": 3.0,
                    "neg": 0.0,
                    "exp": "Multiple faces, phone presence, camera blockage, looking away/gaze anomaly, and sustained audio disturbance are monitored.",
                    "options": [
                        ("Multiple faces in frame", True),
                        ("Mobile phone presence", True),
                        ("Audio disturbance / sustained speech", True),
                        ("Ambient room temperature", False)
                    ]
                },
                {
                    "text": "This practice mock exam can be retaken as many times as you like for testing your hardware and familiarizing yourself with the platform.",
                    "type": QuestionType.TRUE_FALSE,
                    "subject": "Platform Guidelines",
                    "topic": "Trial Testing",
                    "diff": DifficultyLevel.EASY,
                    "marks": 1.0,
                    "neg": 0.0,
                    "exp": "This dummy exam is permanently enabled for multi-attempt testing.",
                    "options": [
                        ("True", True),
                        ("False", False)
                    ]
                }
            ]

            for seq, q_data in enumerate(questions_data):
                q = Question(
                    question_text=q_data["text"],
                    question_type=q_data["type"],
                    subject=q_data["subject"],
                    topic=q_data["topic"],
                    difficulty=q_data["diff"],
                    marks=q_data["marks"],
                    negative_marks=q_data["neg"],
                    explanation=q_data["exp"],
                    created_by=creator_id
                )
                db.add(q)
                await db.flush()

                for opt_idx, (opt_text, is_correct) in enumerate(q_data["options"]):
                    opt = Option(
                        question_id=q.id,
                        option_text=opt_text,
                        sequence=opt_idx,
                        is_correct=is_correct
                    )
                    db.add(opt)

                eq = ExamQuestion(
                    exam_id=exam.id,
                    question_id=q.id,
                    section_id=section.id,
                    sequence=seq
                )
                db.add(eq)

            print(f"[+] Added 6 questions to practice exam ID: {exam.id}")

        # Enroll all candidates
        candidates = (await db.execute(select(User).where(User.role == UserRole.CANDIDATE))).scalars().all()
        enrolled_count = 0
        for cand in candidates:
            enr_check = await db.execute(
                select(CandidateEnrollment).where(
                    CandidateEnrollment.candidate_id == cand.id,
                    CandidateEnrollment.exam_id == exam.id
                )
            )
            if not enr_check.scalars().first():
                db.add(CandidateEnrollment(
                    candidate_id=cand.id,
                    exam_id=exam.id,
                    status="ENROLLED"
                ))
                enrolled_count += 1

        await db.commit()
        print(f"[+] Enrolled {enrolled_count} candidates in Practice Mock Exam.")
        print(f"[SUCCESS] Multi-attempt Practice Exam is ready! ID: {exam.id}")

if __name__ == "__main__":
    asyncio.run(create_dummy_exam())
