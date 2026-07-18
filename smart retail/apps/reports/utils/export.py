import csv
import io
from django.http import HttpResponse


def export_to_csv(rows, columns, filename="report.csv"):
    """`columns`: list of (field_key, header_label). `rows`: list of dicts."""
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    writer = csv.writer(response)
    writer.writerow([label for _, label in columns])
    for row in rows:
        writer.writerow([row.get(key, "") for key, _ in columns])
    return response


def export_to_excel(rows, columns, filename="report.xlsx", sheet_title="Report"):
    from openpyxl import Workbook
    from openpyxl.styles import Font

    wb = Workbook()
    ws = wb.active
    ws.title = sheet_title[:31]

    ws.append([label for _, label in columns])
    for cell in ws[1]:
        cell.font = Font(bold=True)

    for row in rows:
        ws.append([row.get(key, "") for key, _ in columns])

    for col_cells in ws.columns:
        max_len = max((len(str(c.value)) for c in col_cells if c.value is not None), default=10)
        ws.column_dimensions[col_cells[0].column_letter].width = min(max_len + 2, 40)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    response = HttpResponse(
        buffer.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def export_to_pdf(rows, columns, filename="report.pdf", title="Report"):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4),
                             leftMargin=1.5 * cm, rightMargin=1.5 * cm,
                             topMargin=1.5 * cm, bottomMargin=1.5 * cm)
    styles = getSampleStyleSheet()

    elements = [Paragraph(title, styles["Title"]), Spacer(1, 12)]

    header = [label for _, label in columns]
    data = [header] + [[str(row.get(key, "")) for key, _ in columns] for row in rows]

    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4f46e5")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(table)
    doc.build(elements)

    buffer.seek(0)
    response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def export_response(request, rows, columns, base_filename, title="Report"):
    """Dispatches to csv/excel/pdf based on ?export= query param. Defaults to a normal
    JSON response (return None) if unset. NOTE: intentionally NOT named 'format' —
    that query param name is reserved by DRF for content-negotiation and colliding
    with it causes DRF to raise Http404 for any value it doesn't recognize as a renderer."""
    fmt = request.query_params.get("export", "").lower()
    if fmt == "csv":
        return export_to_csv(rows, columns, f"{base_filename}.csv")
    if fmt in ("excel", "xlsx"):
        return export_to_excel(rows, columns, f"{base_filename}.xlsx", sheet_title=title)
    if fmt == "pdf":
        return export_to_pdf(rows, columns, f"{base_filename}.pdf", title=title)
    return None  # caller falls back to a normal DRF Response (JSON)
