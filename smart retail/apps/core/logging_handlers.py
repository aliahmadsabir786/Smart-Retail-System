"""Log file handler that survives Windows' file locking.

`runserver` starts two Python processes (the auto-reloader and the real
server) and both write to the same log file. On Windows, when the file reaches
its size limit the plain RotatingFileHandler tries to rename it while the other
process still has it open and fails with
`PermissionError: [WinError 32] ... smartretail.log -> smartretail.log.1`,
printing a long "--- Logging error ---" traceback on every start.

This handler simply skips the rotation when the rename is refused (the message
is still written) and tries again later, so nothing is lost and no traceback is
shown. On Linux/macOS it behaves exactly like RotatingFileHandler.
"""
import time
from logging.handlers import RotatingFileHandler

_RETRY_AFTER_SECONDS = 300


class SafeRotatingFileHandler(RotatingFileHandler):
    _retry_after = 0.0

    def shouldRollover(self, record):
        if time.time() < self._retry_after:
            return False
        return super().shouldRollover(record)

    def doRollover(self):
        try:
            super().doRollover()
        except OSError:
            # Another process holds the file — keep logging to it and retry later.
            self._retry_after = time.time() + _RETRY_AFTER_SECONDS
            if self.stream is None:
                self.stream = self._open()