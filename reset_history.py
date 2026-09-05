#!/usr/bin/env python3
"""
Reset Exam History Utility
Permanently clears all candidate examination sessions, answers, results,
proctoring events, session audit logs, and on-disk video recordings.

Exams, questions, sections, and registered user accounts remain intact.
Usage:
    python reset_history.py
"""

import os
import glob
import sqlite3

def reset_exam_history():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(root_dir, "exam_portal.db")

    if not os.path.exists(db_path):
        print(f"[-] Database file not found at: {db_path}")
        return

    print("=" * 60)
    print("  EXAM PORTAL - RESET EXAMINATION HISTORY & TRACKINGS")
    print("=" * 60)
    print(f"Target Database: {db_path}")

    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # 1. Proctoring Events
    c.execute("DELETE FROM proctoring_events")
    pe_count = c.rowcount

    # 2. Candidate Answers
    c.execute("DELETE FROM answers")
    ans_count = c.rowcount

    # 3. Candidate Results
    c.execute("DELETE FROM results")
    res_count = c.rowcount

    # 4. Exam Sessions
    c.execute("DELETE FROM exam_sessions")
    sess_count = c.rowcount

    # 5. Session Audit Logs
    c.execute(
        "DELETE FROM audit_logs WHERE action IN ("
        "'EXAM_STARTED', 'EXAM_SUBMITTED', 'RESULT_PUBLISHED', "
        "'RESULT_UNPUBLISHED', 'RESULTS_BULK_PUBLISHED', 'PROCTORING_EVENT'"
        ") OR resource_type LIKE 'EXAM_SESSION%'"
    )
    audit_count = c.rowcount

    conn.commit()
    conn.close()

    # 6. Delete On-Disk Recordings
    rec_dir = os.path.join(root_dir, "backend", "recordings")
    deleted_files = []
    if os.path.exists(rec_dir):
        for f in glob.glob(os.path.join(rec_dir, "*.*")):
            try:
                os.remove(f)
                deleted_files.append(os.path.basename(f))
            except Exception as e:
                print(f"    [!] Error removing file {f}: {e}")

    print("\n[+] Purge Complete:")
    print(f"    - Sessions Deleted:        {sess_count}")
    print(f"    - Results Deleted:         {res_count}")
    print(f"    - Answers Cleared:         {ans_count}")
    print(f"    - Proctoring Events:       {pe_count}")
    print(f"    - Session Audit Logs:      {audit_count}")
    print(f"    - Video Recordings Purged: {len(deleted_files)} files")
    print("\n[OK] Exam history and trackings have been cleanly cleared.")
    print("     Question bank, exams, and user credentials remain ready.")
    print("=" * 60)

if __name__ == "__main__":
    reset_exam_history()
