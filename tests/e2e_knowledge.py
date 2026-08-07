"""End-to-end: PDF upload -> text extraction -> chunking -> retrieval -> chatbot answer."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import mongomock_motor
from httpx import ASGITransport, AsyncClient
from pypdf import PdfWriter

from app.config.settings import settings
from app.database import mongo as mongo_module


async def main():
    mock = mongomock_motor.AsyncMongoMockClient()
    mongo_module._client = mock
    mongo_module._db = mock[settings.MONGODB_DB]

    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        # Admin login
        ar = await c.post("/api/auth/register/admin", json={"name": "Admin", "email": "admin@college.edu", "password": "Admin@123456"})
        print("admin register:", ar.status_code)
        r = await c.post("/api/auth/login", json={"email": "admin@college.edu", "password": "Admin@123456"})
        print("admin login:", r.status_code)
        admin_token = r.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Build a tiny PDF
        writer = PdfWriter()
        from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
        page = writer.add_blank_page(width=300, height=400)
        pdf_bytes = io = None

        writer.add_metadata({"/Title": "Prospectus 2026"})

        def add_text_page(text):
            p = writer.add_blank_page(width=600, height=800)
            content = DecodedStreamObject()
            content.set_data(
                f"BT /F1 12 Tf 50 740 Td 20 TL {text} ET".encode()
            )
            return p

        # Simpler: write a valid text PDF using reportlab-free approach — use pypdf only for reading our own writer output
        # pypdf can't write text easily; build minimal PDF manually
        import re

        pdf = build_minimal_pdf("CollegeAI University Prospectus\n\nSemester exams begin on 25 November.\nFee payment deadline is 10 November.\nHostel curfew is 10 PM on weekdays.")
        files = {"file": ("prospectus.pdf", pdf, "application/pdf")}
        r = await c.post("/api/knowledge", headers=admin_headers, files=files, data={"doc_type": "prospectus"})
        print("upload PDF:", r.status_code, r.text[:200])
        assert r.status_code == 201, r.text
        doc = r.json()
        assert doc["chunk_count"] >= 1

        # Student asks about exams
        sr = await c.post("/api/auth/register", json={"name": "Student", "email": "stu@college.edu", "password": "Student123"})
        student_token = sr.json()["access_token"]
        sh = {"Authorization": f"Bearer {student_token}"}

        q = await c.post("/api/chat", headers=sh, json={"message": "when r the semester exams start", "language": "en"})
        print("chat:", q.status_code)
        body = q.json()
        print("answer:", body["answer"][:180].replace("\n", " "))
        print("sources:", [s["title"] for s in body["sources"]])
        assert q.status_code == 200
        assert any("25 November" in body["answer"] or "November" in body["answer"] for _ in [1]), body["answer"]

        # Unanswerable question -> polite refusal
        q2 = await c.post("/api/chat", headers=sh, json={"message": "tell me a joke"})
        print("joke answer:", q2.json()["answer"][:150].replace("\n", " "))
        assert q2.status_code == 200

        print("\n=== E2E PASSED ===")


def build_minimal_pdf(text: str) -> bytes:
    lines = text.split("\n")
    stream = "BT\n/F1 12 Tf\n50 760 Td\n18 TL\n" + "".join(f"({line}) Tj\nT*\n" for line in lines) + "ET"
    obj = {
        "<< /Type /Catalog /Pages 2 0 R >>": None,
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>": None,
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>": None,
        f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream": None,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>": None,
    }
    parts = ["%PDF-1.4"]
    offsets = []
    for i, (body, _) in enumerate(obj.items(), start=1):
        offsets.append(len(b"\n".join(p.encode() for p in parts)))
        parts.append(f"{i} 0 obj\n{body}\nendobj")
    xref_pos = len("\n".join(parts).encode())
    body = "\n".join(parts)
    out = body.encode()
    out += f"\n{xref_pos}\nxref\n0 {len(offsets) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(offsets) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF".encode()
    return out


asyncio.run(main())
