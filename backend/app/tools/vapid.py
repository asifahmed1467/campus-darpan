"""Generate a VAPID key pair for Web Push:  python -m app.tools.vapid"""
import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


if __name__ == "__main__":
    key = ec.generate_private_key(ec.SECP256R1())
    priv = key.private_numbers().private_value.to_bytes(32, "big")
    pub = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    print("VAPID_PRIVATE_KEY=" + b64(priv))
    print("VAPID_PUBLIC_KEY=" + b64(pub))
    print("\nKeep the private key secret (server only). The public key is safe for the browser.")
