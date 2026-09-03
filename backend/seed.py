import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import asyncio
from datetime import datetime, timedelta
from app.database.session import engine, AsyncSessionLocal
from app.database.base import Base
from app.models import (
    User, Exam, Section, Question, Option, ExamQuestion, 
    CandidateEnrollment, ExamSession, Answer, Result, ProctoringEvent,
    UserRole, UserStatus, ExamStatus, QuestionType, DifficultyLevel, 
    SessionStatus, ProctoringEventType, EventSeverity, ReviewStatus, utc_now
)
from app.auth.security import get_password_hash

async def seed_data():
    print("[+] Initializing database schema and seeding data...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        # Check if already seeded
        from sqlalchemy.future import select
        existing_users = await db.execute(select(User))
        if existing_users.scalars().first():
            print("Database already contains records. Skipping duplicate seeding.")
            return

        # 1. USERS
        admin = User(
            name="Platform Administrator",
            email="admin@examportal.com",
            password_hash=get_password_hash("admin123"),
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE
        )
        setter1 = User(
            name="Alex Turner (CS Lead)",
            email="setter.alex@examportal.com",
            password_hash=get_password_hash("setter123"),
            role=UserRole.PAPER_SETTER,
            status=UserStatus.ACTIVE
        )
        setter2 = User(
            name="Dr. Sarah Jenkins (Quant & Algorithms)",
            email="setter.sarah@examportal.com",
            password_hash=get_password_hash("setter123"),
            role=UserRole.PAPER_SETTER,
            status=UserStatus.ACTIVE
        )
        candidates = [
            User(name="Rahul Sharma", email="rahul.sharma@example.com", roll_number="CS2026-001", password_hash=get_password_hash("candidate123"), role=UserRole.CANDIDATE, status=UserStatus.ACTIVE),
            User(name="Priya Patel", email="priya.patel@example.com", roll_number="CS2026-002", password_hash=get_password_hash("candidate123"), role=UserRole.CANDIDATE, status=UserStatus.ACTIVE),
            User(name="Amit Kumar", email="amit.kumar@example.com", roll_number="CS2026-003", password_hash=get_password_hash("candidate123"), role=UserRole.CANDIDATE, status=UserStatus.ACTIVE),
            User(name="Sneha Reddy", email="sneha.reddy@example.com", roll_number="CS2026-004", password_hash=get_password_hash("candidate123"), role=UserRole.CANDIDATE, status=UserStatus.ACTIVE),
            User(name="Vikram Singh", email="vikram.singh@example.com", roll_number="CS2026-005", password_hash=get_password_hash("candidate123"), role=UserRole.CANDIDATE, status=UserStatus.ACTIVE),
        ]

        db.add_all([admin, setter1, setter2] + candidates)
        await db.flush()

        # 2. QUESTIONS BANK (30+ questions)
        raw_questions = [
            # Frontend & Web
            {
                "text": "In React 18+, which hook is specifically designed for deferring non-urgent state updates to avoid UI stutter?",
                "type": QuestionType.MCQ,
                "subject": "Web Development",
                "topic": "React",
                "diff": DifficultyLevel.MEDIUM,
                "marks": 2.0,
                "neg": 0.5,
                "exp": "useDeferredValue and useTransition allow deferring updates. useDeferredValue accepts a value and returns a new copy that defers behind urgent updates.",
                "setter": setter1.id,
                "options": [
                    ("useDeferredValue", True),
                    ("useLayoutEffect", False),
                    ("useImperativeHandle", False),
                    ("useMemoizedState", False)
                ]
            },
            {
                "text": "What HTTP status code should be returned when a client sends a request with valid authentication credentials, but lacks permission to access the resource?",
                "type": QuestionType.MCQ,
                "subject": "Web Development",
                "topic": "HTTP",
                "diff": DifficultyLevel.EASY,
                "marks": 1.0,
                "neg": 0.25,
                "exp": "403 Forbidden is used when the server understands the request and authentication is valid, but refuses authorization. 401 Unauthorized is for unauthenticated requests.",
                "setter": setter1.id,
                "options": [
                    ("403 Forbidden", True),
                    ("401 Unauthorized", False),
                    ("405 Method Not Allowed", False),
                    ("422 Unprocessable Entity", False)
                ]
            },
            {
                "text": "Select all valid CSS properties that trigger GPU-accelerated compositing without causing browser layout reflows.",
                "type": QuestionType.MULTI_SELECT,
                "subject": "Web Development",
                "topic": "CSS Performance",
                "diff": DifficultyLevel.HARD,
                "marks": 3.0,
                "neg": 1.0,
                "exp": "transform and opacity are handled entirely on the compositor thread and avoid triggering reflow or repaint.",
                "setter": setter1.id,
                "options": [
                    ("transform", True),
                    ("opacity", True),
                    ("height", False),
                    ("margin-left", False)
                ]
            },
            {
                "text": "Is JavaScript execution in the standard browser main thread single-threaded using an event loop?",
                "type": QuestionType.TRUE_FALSE,
                "subject": "Web Development",
                "topic": "JavaScript Runtime",
                "diff": DifficultyLevel.EASY,
                "marks": 1.0,
                "neg": 0.25,
                "exp": "Yes, JavaScript execution on the browser main thread is single-threaded, driven by the event loop and microtask/macrotask queues.",
                "setter": setter1.id,
                "options": [
                    ("True", True),
                    ("False", False)
                ]
            },
            {
                "text": "What is the time complexity of looking up a key in a well-distributed Hash Table on average?",
                "type": QuestionType.MCQ,
                "subject": "Computer Science",
                "topic": "Data Structures",
                "diff": DifficultyLevel.EASY,
                "marks": 1.0,
                "neg": 0.25,
                "exp": "On average, hash tables provide O(1) constant time lookup.",
                "setter": setter2.id,
                "options": [
                    ("O(1)", True),
                    ("O(log n)", False),
                    ("O(n)", False),
                    ("O(n log n)", False)
                ]
            },
            {
                "text": "Which algorithm is best suited for finding the shortest path in a weighted graph with non-negative edge weights?",
                "type": QuestionType.MCQ,
                "subject": "Computer Science",
                "topic": "Algorithms",
                "diff": DifficultyLevel.MEDIUM,
                "marks": 2.0,
                "neg": 0.5,
                "exp": "Dijkstra's algorithm efficiently computes shortest paths from a single source on non-negative weighted graphs in O((V + E) log V).",
                "setter": setter2.id,
                "options": [
                    ("Dijkstra's Algorithm", True),
                    ("Kruskal's Algorithm", False),
                    ("Floyd-Warshall Algorithm", False),
                    ("Breadth-First Search", False)
                ]
            },
            {
                "text": "What is the height of a balanced Binary Search Tree containing 1024 nodes?",
                "type": QuestionType.NUMERICAL,
                "subject": "Computer Science",
                "topic": "Trees",
                "diff": DifficultyLevel.MEDIUM,
                "marks": 2.0,
                "neg": 0.5,
                "exp": "log2(1024) = 10.",
                "setter": setter2.id,
                "options": [
                    ("10", True)
                ]
            },
            {
                "text": "In PostgreSQL and relational databases, what does the 'I' in the ACID transaction model stand for?",
                "type": QuestionType.MCQ,
                "subject": "Database Systems",
                "topic": "Transactions",
                "diff": DifficultyLevel.EASY,
                "marks": 1.0,
                "neg": 0.25,
                "exp": "ACID stands for Atomicity, Consistency, Isolation, and Durability.",
                "setter": setter1.id,
                "options": [
                    ("Isolation", True),
                    ("Integrity", False),
                    ("Immutable", False),
                    ("Indexing", False)
                ]
            },
            {
                "text": "Which database index data structure is typically preferred for range queries (e.g. BETWEEN, >, <)?",
                "type": QuestionType.MCQ,
                "subject": "Database Systems",
                "topic": "Indexing",
                "diff": DifficultyLevel.MEDIUM,
                "marks": 2.0,
                "neg": 0.5,
                "exp": "B-Tree (and B+ Tree) structures keep keys sorted in leaf nodes, making range scans exceptionally fast.",
                "setter": setter1.id,
                "options": [
                    ("B-Tree / B+ Tree", True),
                    ("Hash Index", False),
                    ("Bitmap Index", False),
                    ("Bloom Filter", False)
                ]
            },
            {
                "text": "A train running at a speed of 60 km/hr crosses a pole in 9 seconds. What is the length of the train in meters?",
                "type": QuestionType.MCQ,
                "subject": "Quantitative Aptitude",
                "topic": "Speed & Distance",
                "diff": DifficultyLevel.MEDIUM,
                "marks": 2.0,
                "neg": 0.5,
                "exp": "Speed in m/s = 60 * (5/18) = 50/3 m/s. Length = Speed * Time = (50/3) * 9 = 150 meters.",
                "setter": setter2.id,
                "options": [
                    ("150 meters", True),
                    ("120 meters", False),
                    ("180 meters", False),
                    ("324 meters", False)
                ]
            },
            {
                "text": "If 12 men can complete a project in 20 days, how many men are required to complete the same project in 15 days?",
                "type": QuestionType.NUMERICAL,
                "subject": "Quantitative Aptitude",
                "topic": "Time & Work",
                "diff": DifficultyLevel.EASY,
                "marks": 1.0,
                "neg": 0.25,
                "exp": "M1 * D1 = M2 * D2 -> 12 * 20 = M2 * 15 -> 240 = 15 * M2 -> M2 = 16.",
                "setter": setter2.id,
                "options": [
                    ("16", True)
                ]
            },
            {
                "text": "Which sorting algorithm achieves worst-case O(n log n) time complexity without requiring additional O(n) auxiliary space?",
                "type": QuestionType.MCQ,
                "subject": "Computer Science",
                "topic": "Sorting",
                "diff": DifficultyLevel.HARD,
                "marks": 3.0,
                "neg": 1.0,
                "exp": "Heap Sort is an in-place comparison sort that guarantees O(n log n) worst-case time with O(1) auxiliary space.",
                "setter": setter2.id,
                "options": [
                    ("Heap Sort", True),
                    ("Merge Sort", False),
                    ("Quick Sort", False),
                    ("Insertion Sort", False)
                ]
            }
        ]

        # Add more questions to exceed 30
        subjects_pool = [
            ("Web Development", "Security", "Which header prevents Cross-Site Scripting (XSS) via content restrictions?", "Content-Security-Policy", ["Content-Security-Policy", "X-Frame-Options", "Strict-Transport-Security", "Access-Control-Allow-Origin"]),
            ("Web Development", "WebSockets", "WebSockets initiate communication using an HTTP Upgrade handshake over TCP.", "True", ["True", "False"]),
            ("Computer Science", "Operating Systems", "A deadlock condition can be prevented by breaking at least one of Coffman's four conditions.", "True", ["True", "False"]),
            ("Computer Science", "Networks", "Which protocol operates at the Transport layer to provide reliable, ordered packet delivery?", "TCP", ["TCP", "UDP", "IP", "ICMP"]),
            ("Computer Science", "Complexity", "What is the worst-case space complexity of Recursive Depth-First Search on a tree of maximum depth d?", "O(d)", ["O(d)", "O(1)", "O(n^2)", "O(log d)"]),
            ("Database Systems", "Normalization", "Which normal form requires every non-prime attribute to be non-transitively dependent on every candidate key?", "3NF (Third Normal Form)", ["3NF (Third Normal Form)", "1NF", "2NF", "BCNF"]),
            ("Quantitative Aptitude", "Probability", "What is the probability of obtaining an even number when rolling a standard fair 6-sided die?", "0.5", ["0.5", "0.33", "0.66", "0.25"]),
            ("Quantitative Aptitude", "Percentages", "If the price of a commodity increases by 25%, by what percentage must consumption decrease to keep total expenditure constant?", "20%", ["20%", "25%", "15%", "30%"]),
            ("Quantitative Aptitude", "Series", "Find the next number in sequence: 2, 6, 12, 20, 30, ?", "42", ["42", "40", "44", "48"]),
            ("Computer Science", "Data Structures", "Which queue structure allows insertion and deletion at both ends?", "Deque (Double-Ended Queue)", ["Deque (Double-Ended Queue)", "Priority Queue", "Circular Buffer", "Stack"]),
            ("Web Development", "Docker", "Which Docker command builds a new image from a Dockerfile in the current directory?", "docker build .", ["docker build .", "docker run .", "docker compose up", "docker init"]),
            ("Web Development", "APIs", "RESTful APIs should be stateless, meaning each client request contains all context needed to process it.", "True", ["True", "False"]),
            ("Computer Science", "Algorithms", "Binary search requires the input array to be sorted beforehand.", "True", ["True", "False"]),
            ("Database Systems", "SQL", "Which SQL clause is used to filter groups created by the GROUP BY clause?", "HAVING", ["HAVING", "WHERE", "ORDER BY", "DISTINCT"]),
            ("Computer Science", "Memory", "In C/C++, dynamically allocated memory using malloc or new resides in which memory region?", "Heap", ["Heap", "Stack", "Data Segment", "Code Segment"]),
            ("Quantitative Aptitude", "Averages", "The average of five numbers is 20. If one number is removed, the average becomes 18. What was the removed number?", "28", ["28", "26", "24", "30"]),
            ("Web Development", "TypeScript", "TypeScript types are completely erased during compilation to standard JavaScript.", "True", ["True", "False"]),
            ("Computer Science", "Architecture", "Which caching replacement policy evicts the item that has not been accessed for the longest time?", "LRU (Least Recently Used)", ["LRU (Least Recently Used)", "FIFO", "LFU", "Random"])
        ]

        created_questions = []

        for q_data in raw_questions:
            q_obj = Question(
                question_text=q_data["text"],
                question_type=q_data["type"],
                subject=q_data["subject"],
                topic=q_data["topic"],
                difficulty=q_data["diff"],
                marks=q_data["marks"],
                negative_marks=q_data["neg"],
                explanation=q_data["exp"],
                created_by=q_data["setter"]
            )
            db.add(q_obj)
            await db.flush()
            for idx, (opt_text, is_corr) in enumerate(q_data["options"]):
                opt = Option(
                    question_id=q_obj.id,
                    option_text=opt_text,
                    sequence=idx,
                    is_correct=is_corr
                )
                db.add(opt)
            created_questions.append(q_obj)

        for subj, top, text, correct_ans, all_opts in subjects_pool:
            is_tf = len(all_opts) == 2 and "True" in all_opts
            q_type = QuestionType.TRUE_FALSE if is_tf else QuestionType.MCQ
            q_obj = Question(
                question_text=text,
                question_type=q_type,
                subject=subj,
                topic=top,
                difficulty=DifficultyLevel.MEDIUM,
                marks=2.0,
                negative_marks=0.5,
                explanation=f"The correct answer is {correct_ans}.",
                created_by=setter1.id if "Web" in subj or "Database" in subj else setter2.id
            )
            db.add(q_obj)
            await db.flush()
            for idx, opt_text in enumerate(all_opts):
                opt = Option(
                    question_id=q_obj.id,
                    option_text=opt_text,
                    sequence=idx,
                    is_correct=(opt_text == correct_ans)
                )
                db.add(opt)
            created_questions.append(q_obj)

        await db.flush()
        print(f"[OK] Created {len(created_questions)} questions in question bank.")

        # 3. EXAMS
        now = utc_now()

        # Exam 1: Full Stack Web Engineering
        exam1 = Exam(
            title="Full Stack Web Engineering & Architecture Assessment",
            description="Comprehensive assessment covering modern React architecture, backend APIs, HTTP protocols, and PostgreSQL relational design.",
            instructions="1. Ensure your webcam is enabled and unobstructed at all times.\n2. Do not switch browser tabs or exit fullscreen mode.\n3. Each question carries marks with negative marking for incorrect answers.",
            duration_minutes=45,
            start_time=now - timedelta(days=1),
            end_time=now + timedelta(days=7),
            status=ExamStatus.PUBLISHED,
            negative_marking=True,
            allow_navigation=True,
            allow_mark_review=True,
            shuffle_questions=True,
            shuffle_options=True,
            proctoring_enabled=True,
            created_by=setter1.id,
            approved_by=admin.id
        )
        db.add(exam1)
        await db.flush()

        # Sections for Exam 1
        sec1 = Section(exam_id=exam1.id, title="Frontend & React Architecture", sequence=0)
        sec2 = Section(exam_id=exam1.id, title="Backend & Relational Databases", sequence=1)
        db.add_all([sec1, sec2])
        await db.flush()

        # Assign first 10 questions to Exam 1
        for idx, q in enumerate(created_questions[:10]):
            eq = ExamQuestion(
                exam_id=exam1.id,
                question_id=q.id,
                section_id=sec1.id if idx < 5 else sec2.id,
                sequence=idx
            )
            db.add(eq)

        # Exam 2: Data Structures & Algorithms
        exam2 = Exam(
            title="Data Structures, Algorithms & Problem Solving",
            description="Standard core CS assessment covering trees, graphs, sorting complexity, and dynamic programming.",
            instructions="Solve the algorithmic problems carefully. Timer starts once you begin the examination.",
            duration_minutes=30,
            start_time=now - timedelta(hours=6),
            end_time=now + timedelta(days=5),
            status=ExamStatus.PUBLISHED,
            negative_marking=True,
            allow_navigation=True,
            allow_mark_review=True,
            proctoring_enabled=True,
            created_by=setter2.id,
            approved_by=admin.id
        )
        db.add(exam2)
        await db.flush()

        sec_dsa = Section(exam_id=exam2.id, title="Algorithms & Complexity", sequence=0)
        db.add(sec_dsa)
        await db.flush()

        for idx, q in enumerate(created_questions[10:20]):
            eq = ExamQuestion(
                exam_id=exam2.id,
                question_id=q.id,
                section_id=sec_dsa.id,
                sequence=idx
            )
            db.add(eq)

        # Exam 3: Quantitative Aptitude (Under Review Draft)
        exam3 = Exam(
            title="Quantitative Aptitude & Logical Reasoning",
            description="Speed, distance, time, work, series, and logical reasoning aptitude test.",
            instructions="Standard aptitude test guidelines apply.",
            duration_minutes=30,
            status=ExamStatus.UNDER_REVIEW,
            created_by=setter2.id
        )
        db.add(exam3)
        await db.flush()

        sec_quant = Section(exam_id=exam3.id, title="Numerical Aptitude", sequence=0)
        db.add(sec_quant)
        await db.flush()

        for idx, q in enumerate(created_questions[20:28]):
            eq = ExamQuestion(
                exam_id=exam3.id,
                question_id=q.id,
                section_id=sec_quant.id,
                sequence=idx
            )
            db.add(eq)

        # 4. ENROLL CANDIDATES
        for c in candidates:
            db.add(CandidateEnrollment(candidate_id=c.id, exam_id=exam1.id, status="ENROLLED"))
            db.add(CandidateEnrollment(candidate_id=c.id, exam_id=exam2.id, status="ENROLLED"))

        await db.flush()

        # 5. SAMPLE COMPLETED SESSIONS & PROCTORING EVENTS
        # Rahul's completed session with Low risk
        sess1 = ExamSession(
            exam_id=exam1.id,
            candidate_id=candidates[0].id, # Rahul
            started_at=now - timedelta(hours=3),
            submitted_at=now - timedelta(hours=2, minutes=20),
            expires_at=now - timedelta(hours=2, minutes=15),
            status=SessionStatus.SUBMITTED,
            last_activity=now - timedelta(hours=2, minutes=20)
        )
        db.add(sess1)
        await db.flush()

        res1 = Result(
            session_id=sess1.id,
            candidate_id=candidates[0].id,
            exam_id=exam1.id,
            total_questions=10,
            attempted=10,
            correct=9,
            incorrect=1,
            unanswered=0,
            score=17.5,
            max_score=19.0,
            percentage=92.1,
            section_scores={"Frontend & React Architecture": {"score": 8.5, "max_score": 9.0}, "Backend & Relational Databases": {"score": 9.0, "max_score": 10.0}}
        )
        db.add(res1)

        # Priya's completed session with Medium risk (Looking away events)
        sess2 = ExamSession(
            exam_id=exam1.id,
            candidate_id=candidates[1].id, # Priya
            started_at=now - timedelta(hours=4),
            submitted_at=now - timedelta(hours=3, minutes=18),
            expires_at=now - timedelta(hours=3, minutes=15),
            status=SessionStatus.SUBMITTED,
            last_activity=now - timedelta(hours=3, minutes=18)
        )
        db.add(sess2)
        await db.flush()

        res2 = Result(
            session_id=sess2.id,
            candidate_id=candidates[1].id,
            exam_id=exam1.id,
            total_questions=10,
            attempted=9,
            correct=7,
            incorrect=2,
            unanswered=1,
            score=13.0,
            max_score=19.0,
            percentage=68.4,
            section_scores={"Frontend & React Architecture": {"score": 6.5, "max_score": 9.0}, "Backend & Relational Databases": {"score": 6.5, "max_score": 10.0}}
        )
        db.add(res2)

        # Proctoring events for Priya
        db.add(ProctoringEvent(
            session_id=sess2.id,
            event_type=ProctoringEventType.LOOKING_AWAY,
            timestamp=sess2.started_at + timedelta(minutes=12),
            duration=3.2,
            confidence=0.88,
            severity=EventSeverity.LOW,
            metadata_info={"pose": "RIGHT", "deviation": 0.28}
        ))
        db.add(ProctoringEvent(
            session_id=sess2.id,
            event_type=ProctoringEventType.LOOKING_AWAY,
            timestamp=sess2.started_at + timedelta(minutes=24),
            duration=4.5,
            confidence=0.91,
            severity=EventSeverity.MEDIUM,
            metadata_info={"pose": "LEFT", "deviation": 0.38}
        ))

        # Amit's session with High risk (Phone detected)
        sess3 = ExamSession(
            exam_id=exam1.id,
            candidate_id=candidates[2].id, # Amit
            started_at=now - timedelta(hours=2),
            submitted_at=now - timedelta(hours=1, minutes=15),
            expires_at=now - timedelta(hours=1, minutes=15),
            status=SessionStatus.SUBMITTED,
            last_activity=now - timedelta(hours=1, minutes=15)
        )
        db.add(sess3)
        await db.flush()

        res3 = Result(
            session_id=sess3.id,
            candidate_id=candidates[2].id,
            exam_id=exam1.id,
            total_questions=10,
            attempted=8,
            correct=5,
            incorrect=3,
            unanswered=2,
            score=9.25,
            max_score=19.0,
            percentage=48.7,
            section_scores={"Frontend & React Architecture": {"score": 4.5, "max_score": 9.0}, "Backend & Relational Databases": {"score": 4.75, "max_score": 10.0}}
        )
        db.add(res3)

        db.add(ProctoringEvent(
            session_id=sess3.id,
            event_type=ProctoringEventType.PHONE_DETECTED,
            timestamp=sess3.started_at + timedelta(minutes=18),
            duration=2.4,
            confidence=0.92,
            severity=EventSeverity.HIGH,
            metadata_info={"device": "cell_phone", "confidence": 0.92}
        ))
        db.add(ProctoringEvent(
            session_id=sess3.id,
            event_type=ProctoringEventType.MULTIPLE_FACES,
            timestamp=sess3.started_at + timedelta(minutes=26),
            duration=2.8,
            confidence=0.94,
            severity=EventSeverity.HIGH,
            metadata_info={"face_count": 2}
        ))

        await db.commit()
        print("[SUCCESS] Database successfully seeded with Admins, Paper Setters, Candidates, Exams, Questions, and Sample Proctoring History!")

if __name__ == "__main__":
    asyncio.run(seed_data())
