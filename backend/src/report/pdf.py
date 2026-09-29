"""Authoritative R-76-2 PDF rendering (P5-2/P5-3, design.md §9).

ReportLab platypus. Layout rules from design.md §9:
- headers repeated on every page, page numbers "Page X of Y" (exact totals
  via the classic NumberedCanvas two-phase save — one build, no guessing);
- per-test tables with R-76-2 column semantics (L, I, ΔL, E, Ec, MPE, verdict);
- cover page with instrument identity block, verdict summary, QR seal and
  signature blocks; verdicts carry ✓/✗ glyphs so grayscale printing keeps
  meaning (no color dependence).
"""

from __future__ import annotations

import io
from typing import Final
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from .aggregate import ReportData, test_title
from .seal import qr_payload, qr_png_bytes

#: Delta rendered via the Symbol font inside Paragraph markup — the standard
#: Helvetica font is Latin-1-only and cannot encode 'Δ' directly.
_DELTA: Final = '<font name="Symbol">D</font>'

_PAGE_W, _PAGE_H = A4
_MARGIN: Final = 18 * mm
_ACCENT: Final = colors.HexColor("#1a3a5c")
_FAIL_FILL: Final = colors.HexColor("#fde8e8")
_PASS_FILL: Final = colors.HexColor("#e9f7ee")

styles = getSampleStyleSheet()
_h1 = ParagraphStyle("R76H1", parent=styles["Title"], fontSize=15, textColor=_ACCENT, spaceAfter=2)
_h2 = ParagraphStyle("R76H2", parent=styles["Heading2"], fontSize=11.5, textColor=_ACCENT, spaceBefore=10, spaceAfter=4)
_small = ParagraphStyle("R76Small", parent=styles["Normal"], fontSize=8, leading=10)
_cell = ParagraphStyle("R76Cell", parent=styles["Normal"], fontSize=8.5, leading=10)
_th = ParagraphStyle("R76TH", parent=_cell, textColor=colors.white, fontName="Helvetica-Bold")
_td = ParagraphStyle("R76TD", parent=_cell)
_lab = ParagraphStyle("R76Lab", parent=styles["Normal"], fontSize=9.5, leading=12)
_big = ParagraphStyle("R76Big", parent=styles["Title"], fontSize=20)


class _NumberedCanvas(Canvas):
    """Buffers page states so every footer knows the true total (X of Y)."""

    def __init__(self, *args: object, **kw: object) -> None:
        super().__init__(*args, **kw)  # type: ignore[arg-type]
        self._saved_page_states: list[dict[str, object]] = []

    def showPage(self) -> None:  # noqa: N802 - reportlab API
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:  # noqa: N802 - reportlab API
        total = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.setFont("Helvetica", 7.5)
            self.drawCentredString(_PAGE_W / 2, 10 * mm, f"Page {self._pageNumber} of {total}")
            Canvas.showPage(self)
        Canvas.save(self)


def _kv_table(pairs: list[tuple[str, str]]) -> Table:
    """Two-column identity table (label / value) with continuous borders."""
    data = [[Paragraph(f"<b>{escape(str(k))}</b>", _cell), Paragraph(escape(str(v)), _cell)] for k, v in pairs]
    t = Table(data, colWidths=[52 * mm, 118 * mm])
    t.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef2f6")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
            ]
        )
    )
    return t


def _observation_table(rows: list[dict[str, str]]) -> Table:
    """R-76-2 column semantics: #, position, L, I, dL, E, Ec, MPE, ±ne, verdict.

    Verdict cells carry a bold word over a light fill — meaningful in
    grayscale printing with no glyph-encoding risk (Latin-1 fonts).
    """
    header_texts = ["#", "Pos", "L", "I", f"{_DELTA}L", "E", "Ec", "MPE", "MPE in e", "Verdict"]
    header = [Paragraph(t, _th) for t in header_texts]
    data: list[list[object]] = [header]
    fail_rows: list[int] = []
    for i, r in enumerate(rows, start=1):
        verdict_cell = Paragraph(
            f"<b>{'PASS' if r['verdict'] == 'PASS' else 'FAIL'}</b>", _cell
        )
        data.append(
            [r["seq"], r["position"], r["L"], r["I"], r["dL"], r["E"], r["Ec"], r["MPE"], r["MPE_e"], verdict_cell]
        )
        if r["verdict"] == "FAIL":
            fail_rows.append(i)
    t = Table(
        data,
        colWidths=[10 * mm, 12 * mm, 20 * mm, 20 * mm, 16 * mm, 20 * mm, 20 * mm, 18 * mm, 15 * mm, 19 * mm],
        repeatRows=1,
    )
    style: list[tuple[object, ...]] = [
        ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
        ("BACKGROUND", (0, 0), (-1, 0), _ACCENT),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTNAME", (0, 1), (-1, -1), "Courier"),
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (1, 0), "CENTER"),
        ("ALIGN", (9, 1), (9, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]
    for row_idx in fail_rows:  # grayscale-safe: fill AND glyph
        style.append(("BACKGROUND", (0, row_idx), (-1, row_idx), _FAIL_FILL))
    t.setStyle(TableStyle(style))
    return t


def _cover(data: ReportData, verify_base_url: str, sha256: str, report_id: str) -> list[object]:
    payload = qr_payload(verify_base_url, report_id, sha256)
    flow: list[object] = [
        Paragraph(escape(data.lab["name"]), _h1),
        Paragraph(escape(data.lab["address"]), ParagraphStyle("addr", parent=_small, alignment=TA_CENTER)),
        Spacer(1, 4 * mm),
        Paragraph(
            "Pattern Evaluation Report — Non-Automatic Weighing Instrument",
            ParagraphStyle("sub", parent=styles["Heading2"], alignment=TA_CENTER, fontSize=12),
        ),
        Paragraph("Compiled in accordance with OIML R 76-2 - " + escape(str(data.overall["clause"])), ParagraphStyle("clause", parent=_small, alignment=TA_CENTER)),
        Spacer(1, 6 * mm),
    ]

    result = str(data.overall["result"])
    summary = Table(
        [[Paragraph("<b>OVERALL RESULT</b>", _cell), Paragraph(f"<b>{result}</b>", _big)]],
        colWidths=[70 * mm, 100 * mm],
    )
    summary.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1, colors.black),
                ("BACKGROUND", (1, 0), (1, 0), _FAIL_FILL if result == "FAIL" else _PASS_FILL),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (1, 0), (1, 0), "CENTER"),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    flow += [summary, Spacer(1, 5 * mm)]

    flow += [
        Paragraph("1 · Instrument identity", _h2),
        _kv_table(list(data.instrument.items())),
        Paragraph("2 · Laboratory & environmental conditions", _h2),
        _kv_table(list(data.conditions.items())),
        Paragraph("3 · Personnel", _h2),
        _kv_table(
            [
                ("Tested by", data.tested_by or "—"),
                ("Authorized Signatory", data.approved_by or "(pending officer sign-off)"),
            ]
        ),
        Spacer(1, 6 * mm),
    ]

    qr_img = Image(io.BytesIO(qr_png_bytes(payload)), width=34 * mm, height=34 * mm)
    seal_block = Table(
        [
            [
                qr_img,
                Paragraph(
                    f"<b>Integrity seal</b><br/>Scan to verify authenticity.<br/><br/>"
                    f"Report ID<br/><font name='Courier' size='7'>{escape(report_id)}</font><br/><br/>"
                    f"SHA-256<br/><font name='Courier' size='6'>{sha256}</font>",
                    _small,
                ),
            ]
        ],
        colWidths=[40 * mm, 130 * mm],
    )
    seal_block.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.8, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    flow += [Paragraph("4 · Verification seal", _h2), seal_block]
    return flow


def _body(data: ReportData) -> list[object]:
    flow: list[object] = [Paragraph("5 · Test observations", _h2)]
    for i, (test_type, rows) in enumerate(data.observations.items(), start=1):
        fails = sum(1 for r in rows if r["verdict"] == "FAIL")
        heading = Paragraph(f"5.{i} · {test_title(test_type)} - {len(rows)} reading(s), {fails} failed", _h2)
        flow.append(KeepTogether([heading, _observation_table(rows)]))

    if data.checklist:
        flow.append(Paragraph("5.C · Checklist (R 76-2 sheet 17)", _h2))
        cl_data: list[list[object]] = [[
            Paragraph(t, _th) for t in ("Clause", "Requirement", "Procedure", "Outcome", "Remarks")
        ]]
        for item in data.checklist:
            outcome = item["outcome"]
            cl_data.append([
                Paragraph(escape(item["clause"]), _td),
                Paragraph(escape(item["requirement"]), _td),
                Paragraph(escape(item["test_procedure"]), _td),
                Paragraph(escape(outcome), _td),
                Paragraph(escape(item["remarks"]), _td),
            ])
        widths = [18 * mm, 70 * mm, 22 * mm, 22 * mm, 38 * mm]
        flow.append(
            Table(
                cl_data,
                colWidths=widths,
                repeatRows=1,
                style=TableStyle([
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#9aa4b2")),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("FONTSIZE", (0, 0), (-1, -1), 6.5),
                    *[(
                        "BACKGROUND", (0, i), (-1, i), colors.HexColor("#fee2e2")
                    ) for i in range(1, len(cl_data))
                      if cl_data[i][3].text == "FAILED"
                    ],
                ]),
            )
        )
        prog = data.checklist_progress
        flow.append(
            Paragraph(
                f"Checklist: {prog.get('passed', 0)} passed, "
                f"{prog.get('failed', 0)} failed, {prog.get('open', 0)} open, "
                f"{prog.get('total', 0)} items.",
                _small,
            )
        )

    flow += [
        Paragraph("6 · Result summary", _h2),
        _kv_table(
            [
                ("Readings evaluated", str(data.overall["total"])),
                ("Passed", str(data.overall["pass_count"])),
                ("Failed", str(data.overall["fail_count"])),
                ("Worst MPE utilization", str(data.overall["worst_utilization"])),
                ("Ambient drift (§3.9.2)", str(data.overall["drift_note"])),
                ("Evaluation basis", str(data.overall["clause"])),
            ]
        ),
        Spacer(1, 12 * mm),
        Table(
            [
                [
                    Paragraph("<b>Tested by</b><br/><br/><br/>_________________________<br/>" + escape(data.tested_by or "—"), _lab),
                    Paragraph("<b>Authorized Signatory</b><br/><br/><br/>_________________________<br/>" + escape(data.approved_by or "(pending sign-off)"), _lab),
                ]
            ],
            colWidths=[85 * mm, 85 * mm],
        ),
    ]
    return flow


def _header_footer(canvas: Canvas, data: ReportData) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(_MARGIN, _PAGE_H - 10 * mm, f"{data.lab['name']} - Pattern Evaluation Report (OIML R 76-2)")
    canvas.drawRightString(_PAGE_W - _MARGIN, _PAGE_H - 10 * mm, f"Session {str(data.session_id)[:8]} · template {data.template_version}")
    canvas.setStrokeColor(colors.grey)
    canvas.line(_MARGIN, _PAGE_H - 11.5 * mm, _PAGE_W - _MARGIN, _PAGE_H - 11.5 * mm)
    canvas.restoreState()


def render_pdf(data: ReportData, *, verify_base_url: str, sha256: str, report_id: str) -> bytes:
    """Render the sealed report PDF; returns the complete PDF bytes."""
    buf = io.BytesIO()
    doc = BaseDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=_MARGIN,
        rightMargin=_MARGIN,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Pattern Evaluation Report {report_id}",
        author=str(data.lab["name"]),
    )
    frame = Frame(_MARGIN, 16 * mm, _PAGE_W - 2 * _MARGIN, _PAGE_H - 32 * mm, id="main")
    doc.addPageTemplates(
        [PageTemplate(id="page", frames=[frame], onPage=lambda c, d: _header_footer(c, data))]
    )
    story = _cover(data, verify_base_url, sha256, report_id) + _body(data)
    doc.build(story, canvasmaker=_NumberedCanvas)  # type: ignore[arg-type]
    return buf.getvalue()


__all__ = ["render_pdf"]
