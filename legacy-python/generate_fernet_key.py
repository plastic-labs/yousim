import os
from cryptography.fernet import Fernet
import base64

# Generate the key
key = Fernet.generate_key()

# Convert to string for storage
key_str = base64.b64encode(key).decode()

print(f"Store this in your .env file: SECRET_KEY={key_str}")

