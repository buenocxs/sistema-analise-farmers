import re


def normalize_phone(phone: str) -> str:
    """Normalize phone to digits-only format with country code.

    Returns empty string for invalid phones (e.g. @lid IDs).
    Valid Brazilian phones: 55 + DDD(2) + number(8-9) = 12 or 13 digits.
    """
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    # Remove leading zeros
    digits = digits.lstrip("0")
    # Add Brazil country code if missing
    if len(digits) == 10 or len(digits) == 11:
        digits = "55" + digits
    # Validate: must be 12-13 digits starting with 55
    if not is_valid_br_phone(digits):
        return ""
    return digits


def is_valid_br_phone(digits: str) -> bool:
    """Check if digits represent a valid Brazilian phone number."""
    if not digits:
        return False
    return digits.startswith("55") and len(digits) in (12, 13)


def format_phone_display(phone: str) -> str:
    """Format normalized phone for display."""
    digits = normalize_phone(phone)
    if len(digits) == 13 and digits.startswith("55"):
        return f"+{digits[:2]} ({digits[2:4]}) {digits[4:9]}-{digits[9:]}"
    if len(digits) == 12 and digits.startswith("55"):
        return f"+{digits[:2]} ({digits[2:4]}) {digits[4:8]}-{digits[8:]}"
    return phone


def is_valid_phone(phone: str) -> bool:
    """Check if phone has valid digit count."""
    digits = re.sub(r"\D", "", phone)
    return len(digits) >= 10
