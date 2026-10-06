"""Domain errors raised by services.

Services never import FastAPI's HTTPException. main.py maps these to HTTP responses,
and the WebSocket handler maps them to `error` events.
"""


class ServiceError(Exception):
    status_code = 400

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class BadRequest(ServiceError):
    status_code = 400


class Unauthorized(ServiceError):
    status_code = 401


class Forbidden(ServiceError):
    status_code = 403


class NotFound(ServiceError):
    status_code = 404


class Conflict(ServiceError):
    status_code = 409


class Unavailable(ServiceError):
    status_code = 503
