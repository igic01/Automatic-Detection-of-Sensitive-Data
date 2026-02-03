import argparse
import re
import sys


DATE_REGEXES = [
    re.compile(r"^(0?[1-9]|[12][0-9]|3[01])[./-](0?[1-9]|1[0-2])[./-](\d{2}|\d{4})$"),
    re.compile(r"^(\d{4})[./-](0?[1-9]|1[0-2])[./-](0?[1-9]|[12][0-9]|3[01])$"),
]
EMAIL_REGEX = re.compile(r"^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$", re.IGNORECASE)
IBAN_REGEX = re.compile(r"^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$")
PHONE_REGEX = re.compile(r"^(?:\+|0)[0-9][0-9\s().-]{5,}$")
COMMON_TLDS = (
    "com",
    "net",
    "org",
    "de",
    "at",
    "ch",
    "fr",
    "es",
    "it",
    "nl",
    "be",
    "uk",
    "co",
    "edu",
    "gov",
    "info",
    "io",
)
DATE_FIND_REGEXES = [
    re.compile(r"\b(0?[1-9]|[12][0-9]|3[01])\s*[./-]\s*(0?[1-9]|1[0-2])\s*[./-]\s*(\d{2}|\d{4})\b"),
    re.compile(r"\b(\d{4})\s*[./-]\s*(0?[1-9]|1[0-2])\s*[./-]\s*(0?[1-9]|[12][0-9]|3[01])\b"),
]
EMAIL_FIND_REGEX = re.compile(r"\b[A-Z0-9._%+-]+\s*@\s*[A-Z0-9._-]+\s*[_\.]\s*[A-Z]{2,}\b", re.IGNORECASE)
IBAN_FIND_REGEX = re.compile(r"\b[A-Z]{2}\s*[0-9O]{2}(?:\s*[A-Z0-9]){11,30}\b")
PHONE_FIND_REGEX = re.compile(r"(?<!\w)(?:\+|0)\s*\d[\d\s().-]{5,}\d\b")


def normalize_spaces(text):
    text = text.replace("\t", " ").replace("\r", " ").replace("\n", " ")
    while "  " in text:
        text = text.replace("  ", " ")
    return text.strip()


def normalize_email(text):
    text = normalize_spaces(text)
    text = re.sub(r"\s*@\s*", "@", text)
    text = re.sub(r"\s*\.\s*", ".", text)
    text = re.sub(r"\s*_\s*", "_", text)
    text = re.sub(r"([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+)_([A-Za-z]{2,})$", r"\1@\2.\3", text)
    return text


def normalize_date_token(text):
    text = normalize_spaces(text)
    text = re.sub(r"\s*([./-])\s*", r"\1", text)
    return text


def normalize_phone(text):
    text = normalize_spaces(text)
    return re.sub(r"\s+", " ", text)


def normalize_iban(text):
    cleaned = re.sub(r"\s+", "", text.upper())
    if len(cleaned) >= 4:
        check_digits = cleaned[2:4]
        if "O" in check_digits:
            check_digits = check_digits.replace("O", "0")
            cleaned = cleaned[:2] + check_digits + cleaned[4:]
    return cleaned


def digits_only(text):
    return re.sub(r"\D", "", text)


def clamp_score(value):
    return max(0.0, min(1.0, value))


def edit_distance(a, b):
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)

    rows = len(a) + 1
    cols = len(b) + 1
    dp = [[0] * cols for _ in range(rows)]
    for i in range(rows):
        dp[i][0] = i
    for j in range(cols):
        dp[0][j] = j

    for i in range(1, rows):
        for j in range(1, cols):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,      # deletion
                dp[i][j - 1] + 1,      # insertion
                dp[i - 1][j - 1] + cost,  # substitution
            )
    return dp[-1][-1]


def _add_email_candidate(candidates, candidate):
    if EMAIL_REGEX.match(candidate):
        candidates.add(candidate)


def _add_domain_fixes(candidates, local, domain):
    if not local or not domain:
        return
    if "." in domain:
        _add_email_candidate(candidates, f"{local}@{domain}")
    else:
        for i in range(1, len(domain)):
            _add_email_candidate(candidates, f"{local}@{domain[:i]}.{domain[i:]}")
        for tld in COMMON_TLDS:
            _add_email_candidate(candidates, f"{local}@{domain}.{tld}")


def email_candidates(text):
    candidates = set()
    _add_email_candidate(candidates, text)

    if "@" in text:
        local, _, domain = text.partition("@")
        _add_domain_fixes(candidates, local, domain)
        if "_" in domain:
            _add_domain_fixes(candidates, local, domain.replace("_", "."))
            _add_domain_fixes(candidates, local, domain.replace("_", ""))
        return candidates

    for i in range(1, len(text)):
        local = text[:i]
        domain = text[i:]
        _add_domain_fixes(candidates, local, domain)
        if "_" in domain:
            _add_domain_fixes(candidates, local, domain.replace("_", "."))
            _add_domain_fixes(candidates, local, domain.replace("_", ""))

    return candidates


def find_matches_for_type(text, entity_type):
    matches = []
    if entity_type == "date":
        for regex in DATE_FIND_REGEXES:
            for match in regex.finditer(text):
                raw = match.group(0)
                matches.append({"raw": raw, "normalized": normalize_date_token(raw), "span": match.span()})
        return matches

    if entity_type == "email":
        for match in EMAIL_FIND_REGEX.finditer(text):
            raw = match.group(0)
            matches.append({"raw": raw, "normalized": normalize_email(raw), "span": match.span()})
        return matches

    if entity_type == "iban":
        for match in IBAN_FIND_REGEX.finditer(text):
            raw = match.group(0)
            normalized = normalize_iban(raw)
            if 12 <= len(normalized) <= 34:
                matches.append({"raw": raw, "normalized": normalized, "span": match.span()})
        return matches

    if entity_type == "phone":
        for match in PHONE_FIND_REGEX.finditer(text):
            raw = match.group(0)
            normalized = normalize_phone(raw)
            digit_count = len(digits_only(normalized))
            if digit_count < 7 or digit_count > 15:
                continue
            if re.search(r"[A-Za-z]", normalized):
                continue
            if not re.search(r"[+()\s.-]", normalized) and digit_count > 10:
                continue
            matches.append({"raw": raw, "normalized": normalized, "span": match.span()})
        return matches

    return matches


def extract_entities(text):
    results = {"date": [], "iban": [], "phone": [], "email": []}
    for key in results.keys():
        matches = find_matches_for_type(text, key)
        values = []
        seen = set()
        for match in matches:
            value = match["normalized"]
            if value in seen:
                continue
            seen.add(value)
            values.append(value)
        results[key] = values
    return results


def score_date(text):
    cleaned = normalize_spaces(text)
    for regex in DATE_REGEXES:
        match = regex.match(cleaned)
        if match:
            parts = match.groups()
            if len(parts) == 3:
                if len(parts[0]) == 4:
                    year = int(parts[0])
                    month = int(parts[1])
                    day = int(parts[2])
                else:
                    day = int(parts[0])
                    month = int(parts[1])
                    year = int(parts[2])
                if 1 <= month <= 12 and 1 <= day <= 31 and 1900 <= year <= 2100:
                    return True, 1.0
            return True, 0.85

    # Partial/near scoring
    score = 0.0
    if re.search(r"\d{1,4}[./-]\d{1,2}[./-]\d{1,4}", cleaned):
        score += 0.4
    if re.search(r"[./-]", cleaned):
        score += 0.2
    nums = re.findall(r"\d+", cleaned)
    if len(nums) >= 3:
        score += 0.2
    if any(len(n) == 4 for n in nums):
        score += 0.2
    return False, clamp_score(score)


def iban_checksum_ok(iban):
    iban = normalize_iban(iban)
    if not IBAN_REGEX.match(iban):
        return False
    rearranged = iban[4:] + iban[:4]
    converted = ""
    for ch in rearranged:
        if ch.isdigit():
            converted += ch
        else:
            converted += str(ord(ch) - 55)
    remainder = 0
    for ch in converted:
        remainder = (remainder * 10 + int(ch)) % 97
    return remainder == 1


def score_iban(text):
    cleaned = normalize_iban(text)
    if IBAN_REGEX.match(cleaned):
        return True, 1.0 if iban_checksum_ok(cleaned) else 0.7

    score = 0.0
    if re.match(r"^[A-Z]{2}", cleaned):
        score += 0.3
    if re.match(r"^[A-Z]{2}\d{2}", cleaned):
        score += 0.2
    length = len(cleaned)
    if 12 <= length <= 34:
        score += 0.2
    if re.match(r"^[A-Z0-9]+$", cleaned):
        score += 0.2
    if length >= 15:
        score += 0.1
    return False, clamp_score(score)


def score_phone(text):
    cleaned = normalize_phone(text)
    if PHONE_REGEX.match(cleaned):
        digit_count = len(digits_only(cleaned))
        if 7 <= digit_count <= 15:
            return True, 1.0
        return True, 0.8

    score = 0.0
    digit_count = len(digits_only(cleaned))
    if digit_count >= 7:
        score += 0.4
    if digit_count <= 15:
        score += 0.2
    if re.search(r"[+()\-\s]", cleaned):
        score += 0.2
    if re.search(r"^\+?\d", cleaned):
        score += 0.2
    return False, clamp_score(score)


def score_email(text):
    cleaned = normalize_email(text)
    if EMAIL_REGEX.match(cleaned):
        return True, 1.0

    candidates = email_candidates(cleaned)
    if not candidates:
        return False, 0.0

    best_score = 0.0
    for candidate in candidates:
        edits = edit_distance(cleaned, candidate)
        denom = max(len(candidate), 1)
        score = 1.0 - (edits / denom)
        if score > best_score:
            best_score = score

    return False, clamp_score(best_score)


def score_entity(entity_type, text):
    if entity_type == "date":
        return score_date(text)
    if entity_type == "iban":
        return score_iban(text)
    if entity_type == "phone":
        return score_phone(text)
    if entity_type == "email":
        return score_email(text)
    return False, 0.0


def is_valid_date(text):
    match, _ = score_date(text)
    return match


def is_valid_email(text):
    cleaned = normalize_email(text)
    return EMAIL_REGEX.match(cleaned) is not None


def is_valid_iban(text):
    cleaned = normalize_iban(text)
    if not IBAN_REGEX.match(cleaned):
        return False
    return iban_checksum_ok(cleaned)


def is_valid_phone(text):
    cleaned = normalize_phone(text)
    if re.search(r"[A-Za-z]", cleaned):
        return False
    digit_count = len(digits_only(cleaned))
    if digit_count < 7 or digit_count > 15:
        return False
    if not PHONE_REGEX.match(cleaned):
        return False
    if not re.search(r"[+()\s.-]", cleaned):
        return False
    return True


def is_valid_entity(entity_type, text):
    if entity_type == "date":
        return is_valid_date(text)
    if entity_type == "iban":
        return is_valid_iban(text)
    if entity_type == "phone":
        return is_valid_phone(text)
    if entity_type == "email":
        return is_valid_email(text)
    return False


def classify_text(text):
    results = {}
    is_date, date_score = score_date(text)
    results["date"] = {"match": is_date, "score": date_score}
    is_iban, iban_score = score_iban(text)
    results["iban"] = {"match": is_iban, "score": iban_score}
    is_phone, phone_score = score_phone(text)
    results["phone"] = {"match": is_phone, "score": phone_score}
    is_email, email_score = score_email(text)
    results["email"] = {"match": is_email, "score": email_score}

    best_type = max(results.items(), key=lambda item: item[1]["score"])
    return {"best": best_type[0], "score": best_type[1]["score"], "results": results}


def parse_args():
    parser = argparse.ArgumentParser(description="Classify text as date, IBAN, phone, or email with closeness.")
    parser.add_argument("text", nargs="?", help="Input text to classify")
    return parser.parse_args()


def main():
    args = parse_args()
    text = args.text
    if not text:
        if sys.stdin.isatty():
            print("Provide text as an argument or via stdin.", file=sys.stderr)
            sys.exit(1)
        text = sys.stdin.read()

    text = normalize_spaces(text)
    result = classify_text(text)
    print(f"Input: {text}")
    print(f"Best: {result['best']} (score={result['score']:.2f})")
    for key in ("date", "iban", "phone", "email"):
        item = result["results"][key]
        print(f"{key}: match={item['match']} score={item['score']:.2f}")


if __name__ == "__main__":
    main()
