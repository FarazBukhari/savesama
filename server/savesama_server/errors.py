"""The API error codes from docs/API.md and the exception that carries them."""

from __future__ import annotations

HTTP_STATUS = {
    "unauthorized": 401,
    "bad_request": 400,
    "unsupported_url": 422,
    "login_required": 422,
    "not_found": 404,
    "rate_limited": 429,
    "unavailable": 422,
    "network": 502,
    "conflict": 409,
    "internal": 500,
}

DEFAULT_MESSAGES = {
    "unauthorized": "Missing or wrong pairing token.",
    "bad_request": "The request was malformed.",
    "unsupported_url": "That link isn't from a supported platform "
    "(YouTube, Instagram, TikTok, Facebook, Threads).",
    "login_required": "This post needs an account to view (private, age-restricted or "
    "members-only). SaveSama never signs in, so it can't be downloaded.",
    "not_found": "This post doesn't exist or was deleted.",
    "rate_limited": "The platform is temporarily limiting requests from this server. "
    "Try again in a few minutes.",
    "unavailable": "This post exists but can't be downloaded.",
    "network": "The server couldn't reach the platform. Check its internet connection.",
    "conflict": "That action isn't possible in the job's current state.",
    "internal": "Something went wrong on the server.",
}

# When several extraction strategies fail, the most specific reason wins.
PRIORITY = ["not_found", "login_required", "unavailable", "rate_limited", "network",
            "unsupported_url", "internal"]


class ApiError(Exception):
    def __init__(self, code: str, message: str | None = None):
        if code not in HTTP_STATUS:
            code = "internal"
        self.code = code
        self.message = message or DEFAULT_MESSAGES[code]
        super().__init__(f"{code}: {self.message}")

    @property
    def status(self) -> int:
        return HTTP_STATUS[self.code]

    def to_dict(self) -> dict:
        return {"code": self.code, "message": self.message}


def most_specific(errors: list[ApiError]) -> ApiError:
    if not errors:
        return ApiError("internal")
    return min(errors, key=lambda e: PRIORITY.index(e.code) if e.code in PRIORITY else 99)
