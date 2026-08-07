from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, Request

from app.cloudinary.client import upload_file
from app.database.mongo import get_db
from app.knowledgebase.processor import chunk_text, extract_pdf_text, index_document
from app.middleware.auth import require_admin
from app.models.base import BadRequestException, NotFoundException
from app.utils.helpers import clean_text, paginate, serialize
from app.utils.logger import upload_logger

router = APIRouter(prefix="/api/knowledge", tags=["Knowledge Base"])

ALLOWED_DOC_TYPES = {
    "prospectus", "rules", "academic_calendar", "syllabus", "exam_schedule",
    "fee_structure", "faculty_list", "placement_brochure", "hostel_rules",
    "transport_details", "library_rules", "other",
}


@router.get("", summary="List knowledge documents")
async def list_documents(page: int = 1, page_size: int = 20, doc_type: str | None = None, search: str | None = None):
    db = get_db()
    query: dict = {}
    if doc_type:
        query["doc_type"] = doc_type
    if search:
        query["$or"] = [{"title": {"$regex": search, "$options": "i"}}, {"description": {"$regex": search, "$options": "i"}}]
    return await paginate(db.knowledge_base, query, page, page_size, [("created_at", -1)])


@router.get("/types", summary="Document types and stats")
async def doc_types():
    db = get_db()
    rows = [r async for r in db.knowledge_base.aggregate([{"$group": {"_id": "$doc_type", "count": {"$sum": 1}}}])]
    return {"items": [{"doc_type": r["_id"], "count": r["count"]} for r in rows]}


@router.get("/{doc_id}", summary="Get document")
async def get_document(doc_id: str):
    db = get_db()
    doc = await db.knowledge_base.find_one({"_id": ObjectId(doc_id)})
    if not doc:
        raise NotFoundException("Document not found")
    return serialize(doc)


@router.post("", status_code=201, summary="Upload a PDF into the knowledge base (admin)")
async def upload_document(request: Request, admin=Depends(require_admin())):
    form = await request.form()
    file = form.get("file")
    doc_type = form.get("doc_type") or "other"
    description = form.get("description")
    if not file:
        raise BadRequestException("No file provided")
    if doc_type not in ALLOWED_DOC_TYPES:
        raise BadRequestException(f"Invalid document type. Allowed: {', '.join(sorted(ALLOWED_DOC_TYPES))}")
    if file.content_type != "application/pdf" and not (file.filename or "").lower().endswith(".pdf"):
        raise BadRequestException("Only PDF files are allowed")

    content = await file.read()
    text = extract_pdf_text(content)
    chunks = chunk_text(text)

    asset = await upload_file(content, file.filename or "document.pdf", "application/pdf", "pdf", "documents")

    db = get_db()
    result = await db.knowledge_base.insert_one(
        {
            "title": clean_text(file.filename) or "Untitled document",
            "doc_type": doc_type,
            "description": clean_text(description) if description else None,
            "url": asset["url"],
            "public_id": asset["public_id"],
            "file_size": len(content),
            "page_count": 0,
            "chunk_count": len(chunks),
            "uploaded_by": admin["user_id"],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
    )
    record = await db.knowledge_base.find_one({"_id": result.inserted_id})
    await index_document(record, chunks, record["title"], doc_type, admin["user_id"])
    upload_logger.info("Knowledge document indexed: %s (%s chunks)", file.filename, len(chunks))
    return serialize(record)


@router.delete("/{doc_id}", status_code=204, summary="Delete document and its chunks (admin)", dependencies=[Depends(require_admin())])
async def delete_document(doc_id: str):
    db = get_db()
    doc = await db.knowledge_base.find_one({"_id": ObjectId(doc_id)})
    if not doc:
        raise NotFoundException("Document not found")
    if doc.get("public_id"):
        from app.cloudinary.client import delete_file

        await delete_file(doc["public_id"])
    await db.knowledge_chunks.delete_many({"document_id": doc["_id"]})
    await db.knowledge_base.delete_one({"_id": doc["_id"]})


@router.get("/{doc_id}/chunks", summary="Inspect chunks of a document (admin)")
async def document_chunks(doc_id: str, admin=Depends(require_admin()), page: int = 1, page_size: int = 20):
    db = get_db()
    return await paginate(
        db.knowledge_chunks,
        {"document_id": ObjectId(doc_id)},
        page,
        page_size,
        [("chunk_index", 1)],
    )
