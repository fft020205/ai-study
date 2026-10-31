"""Automatic history labels; independent of the course dialogue and user-written names."""
from .courses import COURSES


def numbered_history_title(task_id,number):
    return f"{COURSES[task_id]['title']}{number:02d}"
