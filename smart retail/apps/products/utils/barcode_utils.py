import io
import base64


def generate_barcode_image(code: str, barcode_format: str = "code128") -> bytes:
    """
    Renders a barcode as PNG bytes using python-barcode.
    code128 works for arbitrary alphanumeric SKUs/barcodes.
    """
    import barcode
    from barcode.writer import ImageWriter

    writer_class = barcode.get_barcode_class(barcode_format)
    buffer = io.BytesIO()
    writer_class(code, writer=ImageWriter()).write(buffer)
    return buffer.getvalue()


def generate_qr_code_image(data: str) -> bytes:
    """Renders a QR code as PNG bytes using qrcode."""
    import qrcode

    qr = qrcode.QRCode(box_size=8, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


def barcode_image_base64(code: str, barcode_format: str = "code128") -> str:
    png_bytes = generate_barcode_image(code, barcode_format)
    return "data:image/png;base64," + base64.b64encode(png_bytes).decode()


def qr_code_image_base64(data: str) -> str:
    png_bytes = generate_qr_code_image(data)
    return "data:image/png;base64," + base64.b64encode(png_bytes).decode()
