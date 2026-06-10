"""Replace all emojis in the codebase with ASCII text equivalents."""
import os

PROJECT = r'C:\Users\Pravin\Desktop\main\MA_Stock_Trader'

EXCLUDE_DIRS = {'__pycache__', 'node_modules', '.git', '.venv', 'venv', '.mypy_cache', '.pytest_cache'}
EXTENSIONS = {'.py', '.js', '.jsx', '.ts', '.tsx'}

EMOJI_MAP = [
    ('\U0001F680', '[ROCKET]'),
    ('\U00002705', '[OK]'),
    ('\U0000274C', '[FAIL]'),
    ('\U00002714', '[OK]'),
    ('\U00002717', '[FAIL]'),
    ('\U000023F3', '[WAIT]'),
    ('\U0001F4CA', '[CHART]'),
    ('\U0001F511', '[KEY]'),
    ('\u26A0\uFE0F', '[WARN]'),
    ('\u26A0', '[WARN]'),
    ('\U0001F5D1\uFE0F', '[DELETE]'),
    ('\U0001F5D1', '[DELETE]'),
    ('\U0001F6D1', '[STOP]'),
    ('\U0001F504', '[REFRESH]'),
    ('\U0001F389', '[DONE]'),
    ('\U0001F4C4\uFE0F', '[FILE]'),
    ('\U0001F4C4', '[FILE]'),
    ('\U0001F4E6', '[PACKAGE]'),
    ('\U0001F4CC', '[PIN]'),
    ('\U0001F6A8', '[ALERT]'),
    ('\U0001F6AB', '[NO]'),
    ('\U0001F534', '[RED]'),
    ('\U0001F7E2', '[GREEN]'),
    ('\U0001F50D', '[SEARCH]'),
    ('\U0001F50E', '[SEARCH]'),
    ('\U0001F52C', '[MICROSCOPE]'),
    ('\U0001F527', '[WRENCH]'),
    ('\U0001F512', '[LOCK]'),
    ('\U0001F50C', '[PLUG]'),
    ('\U0001F4E1', '[SATELLITE]'),
    ('\U0001F4E5', '[OUTBOX]'),
    ('\U0001F4E8', '[INBOX]'),
    ('\U0001F4F0', '[NEWS]'),
    ('\U0001F4DD', '[NOTE]'),
    ('\U0001F4CB', '[CLIPBOARD]'),
    ('\U0001F4C1', '[FOLDER]'),
    ('\U0001F4C2', '[OPEN_FOLDER]'),
    ('\U0001F4C5', '[CALENDAR]'),
    ('\U0001F4C8', '[TREND_UP]'),
    ('\U0001F4C9', '[TREND_DOWN]'),
    ('\U0001F4D0', '[TRIANGLE]'),
    ('\U0001F4D6', '[BOOK]'),
    ('\U0001F4BE', '[FLOPPY]'),
    ('\U0001F4B0', '[MONEY]'),
    ('\U0001F3E6', '[BANK]'),
    ('\U0001F947', '[GOLD]'),
    ('\U0001F948', '[SILVER]'),
    ('\U0001F949', '[BRONZE]'),
    ('\U0001F3C6', '[TROPHY]'),
    ('\U0001F3C1', '[FLAG]'),
    ('\U0001F3AF', '[TARGET]'),
    ('\U0001F4A1', '[IDEA]'),
    ('\U0001F4A5', '[BOOM]'),
    ('\U0001F4A7', '[DROP]'),
    ('\U0001F4AA', '[FLEX]'),
    ('\U0001F310', '[GLOBE]'),
    ('\U0001F550\uFE0F', '[CLOCK1]'),
    ('\U0001F550', '[CLOCK1]'),
    ('\U0001F552\uFE0F', '[CLOCK3]'),
    ('\U0001F552', '[CLOCK3]'),
    ('\U0001F9EA', '[TEST_TUBE]'),
    ('\U0001F9EE', '[ABACUS]'),
    ('\U0001F9F9', '[BROOM]'),
    ('\U0001F56F\uFE0F', '[CANDLE]'),
    ('\U0001F56F', '[CANDLE]'),
    ('\U0001F6AA', '[DOOR]'),
    ('\U0001F522', '[INPUT_NUM]'),
    ('\u26D4', '[NO_ENTRY]'),
    ('\u2696\uFE0F', '[SCALES]'),
    ('\u2696', '[SCALES]'),
    ('\u23F0', '[ALARM]'),
    ('\u23F1\uFE0F', '[STOPWATCH]'),
    ('\u23F1', '[STOPWATCH]'),
    ('\u23ED\uFE0F', '[NEXT]'),
    ('\u23ED', '[NEXT]'),
    ('\u23F9\uFE0F', '[STOP_SQ]'),
    ('\u23F9', '[STOP_SQ]'),
    ('\u2757', '[!!]'),
    ('\u2753', '[?]'),
    ('\u20E3', ''),
    ('\uFE0F', ''),
]

total_files = 0
total_replaced = 0

for root, dirs, files in os.walk(PROJECT):
    dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
    for f in files:
        ext = os.path.splitext(f)[1].lower()
        if ext not in EXTENSIONS:
            continue
        path = os.path.join(root, f)
        try:
            with open(path, 'r', encoding='utf-8') as fh:
                content = fh.read()
        except Exception:
            continue

        new_content = content
        file_count = 0
        for emoji, replacement in EMOJI_MAP:
            if emoji in new_content:
                file_count += new_content.count(emoji)
                new_content = new_content.replace(emoji, replacement)

        if new_content != content:
            with open(path, 'w', encoding='utf-8') as fh:
                fh.write(new_content)
            total_files += 1
            total_replaced += file_count
            print(f"  {path}: {file_count} emojis replaced")

print(f"\nDone: {total_files} files modified, {total_replaced} emojis replaced")
