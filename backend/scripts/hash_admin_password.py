"""
Prints the SLACKR_ADMIN_PASSWORD_HASH value for the admin console (username: admin).

  backend\venv\Scripts\python.exe backend/scripts/hash_admin_password.py

Put the printed line in backend/.env locally, and in the backend's environment variables when hosted.
The password itself is never stored anywhere.
"""

import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routers.admin import hash_password  # noqa: E402

if __name__ == "__main__":
    password = getpass.getpass("New admin password: ")
    if password != getpass.getpass("Repeat it: "):
        sys.exit("Passwords don't match.")
    if len(password) < 8:
        sys.exit("Use at least 8 characters.")
    print(f"SLACKR_ADMIN_PASSWORD_HASH={hash_password(password)}")
