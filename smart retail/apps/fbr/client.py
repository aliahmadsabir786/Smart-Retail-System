"""
Thin HTTP client for the PRAL Digital Invoicing API (spec v1.12).

Uses only the standard library (no new dependency). It never raises for
network/HTTP problems — it always returns a ClientResult describing what
happened — and it never logs or returns the token.

Outcome categories (ClientResult.category):
  ok            FBR answered 200 with a body
  auth          HTTP 401 (bad / expired token, or NTN not linked to the token)
  http_error    any other non-200 status (e.g. 5xx) — request was not accepted
  network       could not connect (DNS, refused, no internet) — nothing was sent
  timeout       connection made but no answer in time — FBR MAY have processed it
  disconnected  connection dropped after sending — FBR MAY have processed it
  bad_response  200 but body was not valid JSON

`outcome_unknown` is True for timeout / disconnected: the one situation where
blindly re-posting could create a duplicate at FBR.
"""
import http.client
import json
import logging
import socket
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Optional

from .models import DEFAULT_REFERENCE_BASE_URL

logger = logging.getLogger("apps.fbr")

REFERENCE_ENDPOINTS = {
    "provinces": "provinces",
    "uom": "uom",
    "transtypecode": "transtypecode",   # sale / transaction types
    "doctypecode": "doctypecode",
}


@dataclass
class ClientResult:
    category: str
    http_status: Optional[int] = None
    data: Optional[object] = None
    message: str = ""
    outcome_unknown: bool = False
    extra: dict = field(default_factory=dict)

    @property
    def reached_fbr_ok(self) -> bool:
        return self.category == "ok"


class FBRClient:
    def __init__(self, token: str, timeout: int = 30):
        self._token = token
        self.timeout = timeout

    # ------------------------------------------------------------------
    def _request(self, method: str, url: str, body: Optional[dict] = None) -> ClientResult:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self._token}")
        req.add_header("Accept", "application/json")
        if data is not None:
            req.add_header("Content-Type", "application/json")

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                status = resp.status
                raw = resp.read()
        except urllib.error.HTTPError as exc:
            status = exc.code
            try:
                raw = exc.read()
            except Exception:  # noqa: BLE001
                raw = b""
            category = "auth" if status == 401 else "http_error"
            parsed = _safe_json(raw)
            logger.warning("FBR HTTP error status=%s url_host=%s", status, _host(url))
            return ClientResult(category=category, http_status=status, data=parsed,
                                message=f"FBR returned HTTP {status}")
        except (socket.timeout, TimeoutError):
            logger.warning("FBR request timed out url_host=%s", _host(url))
            return ClientResult(category="timeout", message="FBR did not answer in time",
                                outcome_unknown=True)
        except urllib.error.URLError as exc:
            # Connection could not be established — the request never went out.
            if isinstance(exc.reason, (socket.timeout, TimeoutError)):
                return ClientResult(category="network", message="Could not connect to FBR (connect timeout)")
            logger.warning("FBR network error url_host=%s reason=%s", _host(url), type(exc.reason).__name__)
            return ClientResult(category="network", message="Could not connect to FBR (network unavailable)")
        except (http.client.RemoteDisconnected, ConnectionResetError, http.client.IncompleteRead,
                http.client.BadStatusLine, BrokenPipeError):
            logger.warning("FBR connection dropped after send url_host=%s", _host(url))
            return ClientResult(category="disconnected", message="Connection to FBR dropped",
                                outcome_unknown=True)
        except OSError as exc:
            logger.warning("FBR OS error url_host=%s err=%s", _host(url), type(exc).__name__)
            return ClientResult(category="network", message="Network error while contacting FBR")

        parsed = _safe_json(raw)
        if parsed is None:
            return ClientResult(category="bad_response", http_status=status,
                                message="FBR returned a response that is not valid JSON")
        return ClientResult(category="ok", http_status=status, data=parsed)

    # ------------------------------------------------------------------
    def post_invoice(self, url: str, payload: dict) -> ClientResult:
        return self._request("POST", url, payload)

    def validate_invoice(self, url: str, payload: dict) -> ClientResult:
        return self._request("POST", url, payload)

    def get_reference(self, name: str) -> ClientResult:
        path = REFERENCE_ENDPOINTS.get(name)
        if not path:
            return ClientResult(category="http_error", message="Unknown reference list")
        return self._request("GET", f"{DEFAULT_REFERENCE_BASE_URL}/{path}")


def _safe_json(raw: bytes):
    if not raw:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None


def _host(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).netloc
    except Exception:  # noqa: BLE001
        return "?"
