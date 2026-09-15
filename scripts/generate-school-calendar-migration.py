"""Génère migrations/247_school_calendar.sql depuis sql/school_calendar_2026_2027.json."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / "sql" / "school_calendar_2026_2027.json").read_text(encoding="utf-8"))
lines = [
    "-- Calendrier scolaire 2026-2027 (jours ouverts/fermes) + tables.",
    "-- Source: Calendrier de travail annualise Lyautey 2026/2027 (Excel).",
    "-- Idempotent: CREATE IF NOT EXISTS + INSERT IGNORE.",
    "",
    "CREATE TABLE IF NOT EXISTS school_calendar_years (",
    "  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,",
    "  label VARCHAR(64) NOT NULL,",
    "  starts_on DATE NOT NULL,",
    "  ends_on DATE NOT NULL,",
    "  active TINYINT(1) NOT NULL DEFAULT 1,",
    "  UNIQUE KEY uq_school_calendar_years_label (label)",
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
    "",
    "CREATE TABLE IF NOT EXISTS school_calendar_days (",
    "  day_date DATE NOT NULL PRIMARY KEY,",
    "  year_id INT UNSIGNED NOT NULL,",
    "  is_open TINYINT(1) NOT NULL DEFAULT 0,",
    "  kind VARCHAR(16) NOT NULL DEFAULT 'open',",
    "  label VARCHAR(128) NULL DEFAULT NULL,",
    "  KEY idx_school_calendar_days_year (year_id),",
    "  KEY idx_school_calendar_days_open (is_open),",
    "  CONSTRAINT fk_school_calendar_days_year FOREIGN KEY (year_id) REFERENCES school_calendar_years(id) ON DELETE CASCADE",
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
    "",
    "INSERT IGNORE INTO school_calendar_years (id, label, starts_on, ends_on, active)",
    "  VALUES (1, '2026-2027', '2026-09-01', '2027-08-31', 1);",
    "",
]
batch = []
for day in data["days"]:
    batch.append(f"('{day['date']}', 1, {day['is_open']}, '{day['kind']}', NULL)")
for i in range(0, len(batch), 50):
    chunk = batch[i : i + 50]
    lines.append(
        "INSERT IGNORE INTO school_calendar_days (day_date, year_id, is_open, kind, label) VALUES"
    )
    lines.append(",\n".join(chunk) + ";")
    lines.append("")

out = ROOT / "migrations" / "247_school_calendar.sql"
out.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {out} ({len(data['days'])} days)")
