"""Application exceptions with user-safe messages.

Lower-level code should raise these when it can describe what went wrong.
Routes in ``app.py`` can then log the full exception while returning the
short ``user_message`` to the browser or template.
"""


class DegreeVizError(Exception):
    """Base exception for expected DegreeViz failures."""

    status_code = 400
    user_message = "Something went wrong. Please try again."

    def __init__(self, message=None, *, user_message=None, status_code=None, details=None):
        super().__init__(message or user_message or self.user_message)
        if user_message is not None:
            self.user_message = user_message
        if status_code is not None:
            self.status_code = status_code
        self.details = details or {}


class AuthError(DegreeVizError):
    """Raised when a user is missing or has invalid authentication."""

    status_code = 401
    user_message = "Please log in and try again."


class GraphValidationError(DegreeVizError):
    """Raised when graph data does not match the expected shape."""

    status_code = 400
    user_message = "The graph data is invalid."


class ProgramScrapeError(DegreeVizError):
    """Raised when a McGill program page cannot be processed."""

    status_code = 502
    user_message = "Unable to scrape that program. Please try again later."


class DatabaseError(DegreeVizError):
    """Raised when Supabase persistence fails."""

    status_code = 500
    user_message = "Unable to update your saved plans right now."
