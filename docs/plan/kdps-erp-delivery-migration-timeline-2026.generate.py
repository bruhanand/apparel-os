#!/usr/bin/env python3
"""Generate client-facing KDPS delivery and migration timeline PDF (one page)."""

from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parent / "kdps-erp-delivery-migration-timeline-2026.pdf"

# Sand & Navy (design-language.md, light theme)
BG = colors.HexColor("#f7f5f0")
SURFACE = colors.HexColor("#fffefb")
BORDER = colors.HexColor("#ddd8cc")
TEXT = colors.HexColor("#1a1a1c")
TEXT_2 = colors.HexColor("#4d4a44")
TEXT_3 = colors.HexColor("#66625a")
ACCENT = colors.HexColor("#1f3a68")
TINT = colors.HexColor("#e4e9f2")

MARGIN = 22 * mm
PAGE_W, PAGE_H = A4

PHASES = [
    (
        "18–19 Oct",
        "Planning and preparation",
        "Final checks and data review before the first store starts on the new ERP.",
    ),
    (
        "20 Oct",
        "First store goes live",
        "The pilot store begins billing on the new system. The old system stays available where needed.",
    ),
    (
        "21 Oct",
        "Staff training",
        "In-store training for shop floor and office staff, with training videos for reference.",
    ),
    (
        "21–31 Oct",
        "Pilot period",
        "Daily use at the pilot store, feedback, fixes and settling in before other stores join.",
    ),
    (
        "1–30 Nov",
        "Other stores go live",
        "Remaining stores switch to the new ERP in planned groups. Dates agreed with KDPS.",
    ),
]


def _try_register_source_sans() -> tuple[str, str, str]:
    """Prefer Source Sans 3 if installed; fall back to Helvetica."""
    candidates = [
        (
            "/Library/Fonts/SourceSans3-Regular.otf",
            "/Library/Fonts/SourceSans3-Semibold.otf",
            "/Library/Fonts/SourceSans3-Bold.otf",
        ),
        (
            str(Path.home() / "Library/Fonts/SourceSans3-Regular.otf"),
            str(Path.home() / "Library/Fonts/SourceSans3-Semibold.otf"),
            str(Path.home() / "Library/Fonts/SourceSans3-Bold.otf"),
        ),
    ]
    for reg, semi, bold in candidates:
        if Path(reg).is_file() and Path(semi).is_file() and Path(bold).is_file():
            pdfmetrics.registerFont(TTFont("SourceSans3", reg))
            pdfmetrics.registerFont(TTFont("SourceSans3-Semi", semi))
            pdfmetrics.registerFont(TTFont("SourceSans3-Bold", bold))
            return "SourceSans3", "SourceSans3-Semi", "SourceSans3-Bold"
    return "Helvetica", "Helvetica-Bold", "Helvetica-Bold"


def draw_page(c: canvas.Canvas) -> None:
    reg, semi, bold = _try_register_source_sans()
    content_w = PAGE_W - 2 * MARGIN

    # Background
    c.setFillColor(BG)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # Header band
    band_h = 28 * mm
    c.setFillColor(ACCENT)
    c.rect(0, PAGE_H - band_h, PAGE_W, band_h, fill=1, stroke=0)

    c.setFillColor(colors.white)
    c.setFont(semi, 11)
    c.drawString(MARGIN, PAGE_H - band_h + 10 * mm, "KDPS Lifestyle Pvt. Ltd.")

    c.setFont(reg, 9)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - band_h + 10 * mm, "Planned delivery schedule · 2026")

    y = PAGE_H - band_h - 14 * mm
    c.setFillColor(TEXT)
    c.setFont(bold, 22)
    c.drawString(MARGIN, y, "KDPS ERP")
    title_w = c.stringWidth("KDPS ERP", bold, 22)
    c.setFont(reg, 22)
    c.drawString(MARGIN + title_w + 4, y, "— Delivery and Migration Timeline")

    y -= 8 * mm
    c.setFillColor(TEXT_2)
    c.setFont(reg, 10.5)
    c.drawString(
        MARGIN,
        y,
        "New ERP, store by store, while the current billing system keeps running during the trial",
    )

    # Delay note (above timeline)
    delay_top = y - 9 * mm
    delay_pad = 4 * mm
    delay_text = (
        "Implementation and the first store go-live were planned for September 2026. "
        "The dates below are revised after a delay caused by production issues."
    )
    delay_lines = _wrap(delay_text, reg, 9.5, content_w - 2 * delay_pad)
    delay_box_h = 6 * mm + len(delay_lines) * 4.2 * mm + delay_pad
    delay_bottom = delay_top - delay_box_h
    c.setFillColor(TINT)
    c.setStrokeColor(BORDER)
    c.roundRect(MARGIN, delay_bottom, content_w, delay_box_h, 2.5 * mm, fill=1, stroke=1)
    c.setFillColor(colors.HexColor("#1a3160"))
    c.setFont(semi, 9)
    c.drawString(MARGIN + delay_pad, delay_top - 5 * mm, "Schedule revision")
    c.setFillColor(TEXT_2)
    c.setFont(reg, 9.5)
    for k, line in enumerate(delay_lines):
        c.drawString(MARGIN + delay_pad, delay_top - 10 * mm - k * 4.2 * mm, line)

    # Timeline card
    card_top = delay_bottom - 8 * mm
    card_h = 132 * mm
    card_bottom = card_top - card_h
    c.setFillColor(SURFACE)
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.75)
    c.roundRect(MARGIN, card_bottom, content_w, card_h, 4 * mm, fill=1, stroke=1)

    c.setFillColor(ACCENT)
    c.setFont(semi, 11)
    c.drawString(MARGIN + 6 * mm, card_top - 10 * mm, "Timeline")

    line_x = MARGIN + 38 * mm
    first_center = card_top - 28 * mm
    last_center = card_bottom + 22 * mm
    step = (first_center - last_center) / (len(PHASES) - 1)

    c.setStrokeColor(BORDER)
    c.setLineWidth(1.2)
    c.line(line_x, first_center, line_x, last_center)

    date_x = MARGIN + 8 * mm
    desc_x = line_x + 10 * mm
    desc_w = content_w - (desc_x - MARGIN) - 8 * mm

    for i, (when, title, body) in enumerate(PHASES):
        cy = first_center - i * step

        # Node
        c.setFillColor(SURFACE)
        c.setStrokeColor(ACCENT)
        c.setLineWidth(1.5)
        c.circle(line_x, cy, 3.2 * mm, fill=1, stroke=1)
        c.setFillColor(ACCENT)
        c.circle(line_x, cy, 1.4 * mm, fill=1, stroke=0)

        # Date
        c.setFillColor(ACCENT)
        c.setFont(semi, 10)
        c.drawRightString(line_x - 6 * mm, cy - 3.5, when)

        # Title + body
        c.setFillColor(TEXT)
        c.setFont(semi, 10.5)
        c.drawString(desc_x, cy + 2, title)

        c.setFillColor(TEXT_2)
        c.setFont(reg, 9.5)
        lines = _wrap(body, reg, 9.5, desc_w)
        ty = cy - 4 * mm
        for line in lines:
            c.drawString(desc_x, ty, line)
            ty -= 4.2 * mm

    # Coordination note
    note_y = card_bottom - 12 * mm
    c.setFillColor(TINT)
    c.setStrokeColor(BORDER)
    c.roundRect(MARGIN, note_y - 18 * mm, content_w, 18 * mm, 3 * mm, fill=1, stroke=1)

    c.setFillColor(colors.HexColor("#1a3160"))
    c.setFont(semi, 9.5)
    c.drawString(MARGIN + 5 * mm, note_y - 6 * mm, "Dates for each store")

    c.setFillColor(TEXT_2)
    c.setFont(reg, 9.5)
    note = (
        "This is the planned schedule. The exact date for each store will be agreed "
        "with KDPS before that store moves to the new system."
    )
    for j, line in enumerate(_wrap(note, reg, 9.5, content_w - 10 * mm)):
        c.drawString(MARGIN + 5 * mm, note_y - 11 * mm - j * 4.2 * mm, line)

    # Footer
    c.setFillColor(TEXT_3)
    c.setFont(reg, 8)
    c.drawString(MARGIN, 12 * mm, "Confidential — for KDPS internal planning and partner review")
    c.drawRightString(PAGE_W - MARGIN, 12 * mm, "October 2026")


def _wrap(text: str, font: str, size: float, max_w: float) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if pdfmetrics.stringWidth(trial, font, size) <= max_w:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def main() -> None:
    c = canvas.Canvas(str(OUT), pagesize=A4)
    c.setTitle("KDPS ERP — Delivery and Migration Timeline")
    c.setAuthor("KDPS Lifestyle Pvt. Ltd.")
    c.setSubject("KDPS delivery and migration schedule 2026")
    draw_page(c)
    c.showPage()
    c.save()
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
