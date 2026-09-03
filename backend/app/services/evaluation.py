import json
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.models import (
    ExamSession, Exam, Question, Option, Answer, Result, 
    SessionStatus, ExamQuestion, Section
)
from app.core.logging import logger

async def evaluate_exam_session(
    db: AsyncSession,
    session_id: int
) -> Result:
    """
    Authoritative server-side evaluation of an exam session.
    Calculates correct, incorrect, unanswered counts, total score,
    max score, percentage, and section-wise breakdown.
    """
    # Fetch session with exam, questions, and options
    stmt = (
        select(ExamSession)
        .options(
            selectinload(ExamSession.exam).selectinload(Exam.sections),
            selectinload(ExamSession.exam).selectinload(Exam.exam_questions).selectinload(ExamQuestion.question).selectinload(Question.options),
            selectinload(ExamSession.answers)
        )
        .where(ExamSession.id == session_id)
    )
    result = await db.execute(stmt)
    session = result.scalars().first()
    if not session:
        raise ValueError(f"Exam session {session_id} not found")

    exam = session.exam
    exam_questions_map = {eq.question_id: eq for eq in exam.exam_questions}
    answers_map: Dict[int, Answer] = {a.question_id: a for a in session.answers}

    total_questions = len(exam.exam_questions)
    attempted = 0
    correct_count = 0
    incorrect_count = 0
    unanswered_count = 0
    total_score = 0.0
    max_score = 0.0

    section_stats: Dict[str, Dict[str, Any]] = {}
    sections_map = {s.id: s.title for s in exam.sections}

    for eq in exam.exam_questions:
        q = eq.question
        q_marks = eq.marks_override if eq.marks_override is not None else q.marks
        q_negative = eq.negative_marks_override if eq.negative_marks_override is not None else (
            q.negative_marks if exam.negative_marking else 0.0
        )
        if not exam.negative_marking:
            q_negative = 0.0

        max_score += q_marks
        section_title = sections_map.get(eq.section_id, "General")
        if section_title not in section_stats:
            section_stats[section_title] = {
                "total": 0,
                "attempted": 0,
                "correct": 0,
                "incorrect": 0,
                "score": 0.0,
                "max_score": 0.0
            }
        section_stats[section_title]["total"] += 1
        section_stats[section_title]["max_score"] += q_marks

        ans = answers_map.get(q.id)
        has_answer = False
        is_correct = False

        if ans:
            if q.question_type in ["MCQ", "TRUE_FALSE"]:
                if ans.selected_option and ans.selected_option.strip():
                    has_answer = True
                    # Find the correct option id
                    correct_option = next((str(opt.id) for opt in q.options if opt.is_correct), None)
                    if correct_option and str(ans.selected_option).strip() == correct_option:
                        is_correct = True
            elif q.question_type == "MULTI_SELECT":
                if ans.selected_option:
                    has_answer = True
                    try:
                        selected_ids = set(map(str, json.loads(ans.selected_option))) if isinstance(ans.selected_option, str) and ans.selected_option.startswith("[") else {str(ans.selected_option)}
                    except Exception:
                        selected_ids = {str(ans.selected_option)}
                    
                    correct_ids = {str(opt.id) for opt in q.options if opt.is_correct}
                    if selected_ids and selected_ids == correct_ids:
                        is_correct = True
            elif q.question_type in ["NUMERICAL", "SHORT_ANSWER"]:
                if ans.answer_text and ans.answer_text.strip():
                    has_answer = True
                    # Check against correct option or explanation
                    correct_texts = [opt.option_text.strip().lower() for opt in q.options if opt.is_correct]
                    if ans.answer_text.strip().lower() in correct_texts:
                        is_correct = True

        if has_answer:
            attempted += 1
            section_stats[section_title]["attempted"] += 1
            if is_correct:
                correct_count += 1
                total_score += q_marks
                section_stats[section_title]["correct"] += 1
                section_stats[section_title]["score"] += q_marks
            else:
                incorrect_count += 1
                total_score -= q_negative
                section_stats[section_title]["incorrect"] += 1
                section_stats[section_title]["score"] -= q_negative
        else:
            unanswered_count += 1

    # Clamp total score at minimum 0 if negative marking exceeds
    final_score = round(max(0.0, total_score), 2)
    max_score = round(max(1.0, max_score), 2)
    percentage = round((final_score / max_score) * 100.0, 2)

    # Check if existing result exists or create new
    existing_stmt = select(Result).where(Result.session_id == session_id)
    res_query = await db.execute(existing_stmt)
    result_obj = res_query.scalars().first()

    # For practice/mock exams where reattempts are allowed, auto-publish results immediately
    # so candidates get their scorecard and breakdown without waiting for manual examiner approval
    is_auto_publish = bool(getattr(exam, 'allow_reattempts', False))

    if not result_obj:
        result_obj = Result(
            session_id=session.id,
            candidate_id=session.candidate_id,
            exam_id=session.exam_id,
            total_questions=total_questions,
            attempted=attempted,
            correct=correct_count,
            incorrect=incorrect_count,
            unanswered=unanswered_count,
            score=final_score,
            max_score=max_score,
            percentage=percentage,
            section_scores=section_stats,
            is_published=is_auto_publish
        )
        db.add(result_obj)
    else:
        result_obj.total_questions = total_questions
        result_obj.attempted = attempted
        result_obj.correct = correct_count
        result_obj.incorrect = incorrect_count
        result_obj.unanswered = unanswered_count
        result_obj.score = final_score
        result_obj.max_score = max_score
        result_obj.percentage = percentage
        result_obj.section_scores = section_stats
        if is_auto_publish:
            result_obj.is_published = True

    await db.commit()
    await db.refresh(result_obj)
    logger.info(f"EVALUATION: session_id={session_id} score={final_score}/{max_score} ({percentage}%)")
    return result_obj
