"""Knowledge base: PDF text extraction, chunking, storage, and retrieval.

Chunks are indexed in MongoDB with a lightweight TF-based scorer. If OpenAI
embeddings are configured, vector embeddings are stored and used for ranking.
"""
from __future__ import annotations

import asyncio
import io
import math
import re
import uuid
from collections import Counter
from datetime import datetime
from typing import Any

from bson import ObjectId
from pypdf import PdfReader

from app.config.settings import settings
from app.database.mongo import get_db
from app.models.base import BadRequestException
from app.utils.logger import app_logger

CHUNK_SIZE = 1200
CHUNK_OVERLAP = 150

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "if", "then", "else", "for", "of", "to", "in",
    "on", "at", "by", "with", "is", "are", "was", "were", "be", "been", "being", "it",
    "this", "that", "these", "those", "from", "as", "per", "each", "your", "our", "you",
    "we", "they", "he", "she", "i", "shall", "will", "may", "must", "can", "could", "should",
    "would", "has", "have", "had", "do", "does", "did", "not", "no", "yes", "all", "any",
    "also", "etc", "eg", "ie", "please", "the", "not", "into", "over", "under", "during",
    "within", "without", "after", "before", "about", "between", "more", "most", "some",
}


def _tokenize(text: str) -> list[str]:
    tokens = re.findall(r"[a-zA-Z][a-zA-Z0-9\-']*", text.lower())
    return [t for t in tokens if t not in STOPWORDS and len(t) > 1]


def extract_pdf_text(content: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(content))
        pages = []
        for page in reader.pages:
            try:
                pages.append(page.extract_text() or "")
            except Exception:
                continue
        text = "\n".join(pages)
    except Exception as exc:
        app_logger.error("PDF extraction failed: %s", exc)
        raise BadRequestException("Could not read this PDF file. It may be corrupt or scanned.")
    if not text.strip():
        raise BadRequestException("No extractable text found in this PDF (scanned PDFs are not supported)")
    return re.sub(r"\n{3,}", "\n\n", text)


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n+", text) if p.strip()]
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        if len(current) + len(para) < chunk_size:
            current = f"{current}\n{para}".strip()
        else:
            if current:
                chunks.append(current)
            current = para
    if current:
        chunks.append(current)

    final: list[str] = []
    for chunk in chunks:
        if len(chunk) <= chunk_size:
            final.append(chunk)
        else:
            words = chunk.split()
            buf = ""
            for word in words:
                if len(buf) + len(word) + 1 > chunk_size and buf:
                    final.append(buf.strip())
                    buf = ""
                buf += f" {word}"
            if buf.strip():
                final.append(buf.strip())

    merged: list[str] = []
    for chunk in final:
        if merged and len(merged[-1]) < chunk_size * 0.7:
            merged[-1] += "\n" + chunk
        else:
            merged.append(chunk)
    return merged


async def generate_embedding(text: str) -> list[float] | None:
    """Return embedding if OpenAI is configured, else None."""
    if not (settings.AI_PROVIDER == "openai" and settings.OPENAI_API_KEY):
        return None
    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        resp = await client.embeddings.create(model="text-embedding-3-small", input=text[:8000])
        return resp.data[0].embedding
    except Exception as exc:
        app_logger.warning("Embedding generation failed, falling back to keyword scoring: %s", exc)
        return None


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if not na or not nb:
        return 0.0
    return dot / (na * nb)


def keyword_score(query_tokens: Counter, chunk_tokens: Counter, chunk_length: int) -> float:
    score = 0.0
    for token, qcount in query_tokens.items():
        if token in chunk_tokens:
            score += qcount * (1 + math.log(chunk_tokens[token] + 1))
    if score == 0:
        return 0.0
    return score / math.sqrt(chunk_length + 1)


async def index_document(record: dict, chunks: list[str], title: str, doc_type: str, uploaded_by: str) -> int:
    db = get_db()
    doc_id = record["_id"]
    for idx, chunk in enumerate(chunks):
        embedding = await generate_embedding(chunk)
        await db.knowledge_chunks.insert_one(
            {
                "document_id": doc_id,
                "title": title,
                "doc_type": doc_type,
                "chunk_index": idx,
                "content": chunk,
                "tokens": _tokenize(chunk),
                "embedding": embedding,
                "created_at": datetime.utcnow(),
            }
        )
    return len(chunks)


async def search_chunks(query: str, limit: int = 4, doc_types: list[str] | None = None) -> list[dict]:
    db = get_db()
    query_tokens = Counter(_tokenize(query))

    cursor = db.knowledge_chunks.find({"document_id": {"$ne": None}})
    if doc_types:
        cursor = db.knowledge_chunks.find({"doc_type": {"$in": doc_types}})

    chunks = [c async for c in cursor]

    query_embedding = None
    if settings.AI_PROVIDER == "openai" and settings.OPENAI_API_KEY and chunks:
        query_embedding = await generate_embedding(query)

    scored: list[dict] = []
    for chunk in chunks:
        token_hits = sum(1 for t in query_tokens if t in (chunk.get("tokens") or []))
        kw = keyword_score(query_tokens, Counter(chunk.get("tokens") or []), len(chunk.get("content") or ""))
        vec = cosine_similarity(query_embedding, chunk.get("embedding")) if query_embedding and chunk.get("embedding") else 0.0
        combined = kw * 0.7 + vec * 30.0
        if token_hits > 0 or kw > 0 or vec > 0.3:
            scored.append({"chunk": chunk, "score": combined})

    scored.sort(key=lambda x: x["score"], reverse=True)
    results = []
    for item in scored[:limit]:
        chunk = item["chunk"]
        results.append(
            {
                "document_id": str(chunk.get("document_id")),
                "title": chunk.get("title", "Document"),
                "doc_type": chunk.get("doc_type"),
                "content": chunk.get("content", ""),
                "score": round(item["score"], 2),
            }
        )
    return results


def build_prompt(question: str, context_chunks: list[dict], history: list[dict], language: str = "en") -> str:
    context = "\n\n---\n\n".join(
        f"[{c['title']}]:\n{c['content']}" for c in context_chunks
    ) if context_chunks else "No relevant document content was found."

    history_lines = "\n".join(
        f"User: {h.get('question', '')}\nAssistant: {h.get('answer', '')}" for h in history[-6:]
    ) or "No prior conversation."

    lang_hint = {
        "en": "Respond in English.",
        "hi": "Respond in Hindi (Devanagari script).",
        "te": "Respond in Telugu.",
        "ta": "Respond in Tamil.",
        "bn": "Respond in Bengali.",
        "mr": "Respond in Marathi.",
        "gu": "Respond in Gujarati.",
        "kn": "Respond in Kannada.",
        "ml": "Respond in Malayalam.",
    }.get(language, f"Respond in {language}.")

    return f"""You are CollegeAI, the intelligent assistant of a college. You answer questions ONLY using the provided document context below.

RULES:
- Answer only from the context provided. Never invent information.
- If the context does not contain the answer, say: "I'm sorry, I couldn't find this information in our college documents. Please contact the college office or ask the admin for details."
- If the user asks something unrelated to the college, politely say you can only help with college-related queries.
- Be concise, friendly, and well structured. Use short bullet points where helpful.
- Take spelling mistakes into account and understand the user's intent.
- {lang_hint}

Conversation history (recent):
{history_lines}

Document context:
{context}

Question: {question}
Answer:"""


async def build_answer(question: str, chunks: list[dict], history: list[dict], language: str = "en") -> str:
    """Answer a question using the AI provider; fall back to a template answer."""
    from app.utils.logger import ai_logger

    prompt = build_prompt(question, chunks, history, language)
    if settings.AI_PROVIDER == "openai" and settings.OPENAI_API_KEY:
        try:
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            resp = await client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[{"role": "system", "content": prompt}],
                temperature=0.3,
                max_tokens=600,
            )
            answer = resp.choices[0].message.content.strip()
            ai_logger.info("OpenAI answer generated (%s tokens)", resp.usage.total_tokens if resp.usage else "?")
            return answer
        except Exception as exc:
            ai_logger.error("OpenAI call failed: %s", exc)

    elif settings.AI_PROVIDER == "gemini" and settings.GEMINI_API_KEY:
        try:
            import google.generativeai as genai

            genai.configure(api_key=settings.GEMINI_API_KEY)
            model = genai.GenerativeModel(settings.GEMINI_MODEL)
            resp = await asyncio.to_thread(
                lambda: model.generate_content(prompt)
            )
            ai_logger.info("Gemini answer generated")
            return resp.text.strip()
        except Exception as exc:
            ai_logger.error("Gemini call failed: %s", exc)

    # Fallback: template answer from retrieved chunks (no AI configured / failed)
    if chunks:
        top = chunks[0]
        snippet = " ".join(top["content"].split())[:600]
        return (
            f"Based on our college document \"{top['title']}\", here is what I found:\n\n{snippet}\n\n"
            "For complete details, please check the document in the Knowledge Base section."
        )
    return "I'm sorry, I couldn't find this information in our college documents. Please contact the college office or ask the admin for details."
