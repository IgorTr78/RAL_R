import os
import json
import base64
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from supabase import create_client
from openai import OpenAI

# --- Конфигурация из переменных окружения ---
SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

POLL_INTERVAL_SECONDS = 10
STORAGE_BUCKET = "documents"

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
openai_client = OpenAI(api_key=OPENAI_API_KEY)


def guess_mime_type(filename: str) -> str:
    ext = filename.lower().split(".")[-1]
    return {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "gif": "image/gif",
    }.get(ext, "image/jpeg")


def recognize_document(file_bytes: bytes, mime_type: str, fields: list[str]) -> dict:
    """Отправляет документ в GPT-4o и просит извлечь указанные поля."""
    b64 = base64.b64encode(file_bytes).decode("utf-8")
    data_url = f"data:{mime_type};base64,{b64}"

    field_list = "\n".join(f"- {f}" for f in fields)

    prompt = (
        "Ты — система точного извлечения данных из официальных документов "
        "(справки, свидетельства, счета, договоры).\n\n"
        "Извлеки следующие поля:\n"
        f"{field_list}\n\n"
        "ПРАВИЛА ЧТЕНИЯ ЧИСЕЛ И КОДОВ:\n"
        "- Если число или код написан по отдельным клеткам/ячейкам — читай цифры "
        "строго слева направо, без пробелов, как одну непрерывную строку.\n"
        "- Не путай похожие цифры: 0 и О, 1 и 7, 3 и 8, 5 и 6 — внимательно "
        "сверяй форму каждого символа.\n"
        "- Считай количество цифр в поле перед тем как дать ответ — для ИНН "
        "физлица должно быть 12 цифр, для ИНН организации — 10.\n"
        "- Перепроверь результат, сверив его с изображением ещё раз перед ответом.\n\n"
        "Ответь СТРОГО в формате JSON, без markdown и пояснений. "
        "Ключи JSON должны точно совпадать с названиями полей выше. "
        "Если поле не найдено на документе — используй пустую строку \"\". "
        "Также добавь ключ \"_confidence\" — целое число от 0 до 100, "
        "отражающее общую уверенность распознавания."
    )

    response = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_url, "detail": "high"}},
                ],
            }
        ],
        max_tokens=1000,
        temperature=0,
    )

    raw = response.choices[0].message.content.strip()

    # Убираем возможные markdown-обёртки ```json ... ```
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    return json.loads(raw)


def process_document(doc: dict, fields: list[str]):
    doc_id = doc["id"]
    file_path = doc["file_path"]
    filename = doc["filename"]

    try:
        file_bytes = supabase.storage.from_(STORAGE_BUCKET).download(file_path)
        mime_type = guess_mime_type(filename)

        result = recognize_document(file_bytes, mime_type, fields)
        confidence = result.pop("_confidence", 50)

        empty_fields = [f for f in fields if not result.get(f)]
        if confidence >= 80 and not empty_fields:
            status = "ok"
        elif confidence < 40 or len(empty_fields) == len(fields):
            status = "error"
        else:
            status = "warning"

        supabase.table("documents").update({
            "values": result,
            "confidence": confidence,
            "status": status,
            "error_message": None,
        }).eq("id", doc_id).execute()

        return status

    except Exception as e:
        supabase.table("documents").update({
            "status": "error",
            "error_message": str(e),
        }).eq("id", doc_id).execute()
        return "error"


def process_pending_tasks():
    tasks_resp = supabase.table("tasks").select("*").eq("status", "pending").limit(1).execute()
    tasks = tasks_resp.data

    for task in tasks:
        task_id = task["id"]
        fields = task.get("fields") or []

        # Помечаем задачу как "в обработке"
        supabase.table("tasks").update({"status": "processing"}).eq("id", task_id).execute()

        docs_resp = supabase.table("documents").select("*").eq("task_id", task_id).execute()
        documents = docs_resp.data

        statuses = []
        for doc in documents:
            status = process_document(doc, fields)
            statuses.append(status)

        if all(s == "ok" for s in statuses):
            final_status = "done"
        elif all(s == "error" for s in statuses):
            final_status = "failed"
        elif any(s == "ok" for s in statuses):
            final_status = "partial"
        else:
            final_status = "done"  # все warning — результаты есть, но требуют проверки

        supabase.table("tasks").update({"status": final_status}).eq("id", task_id).execute()


async def polling_loop():
    while True:
        try:
            process_pending_tasks()
        except Exception as e:
            print(f"Ошибка в цикле обработки: {e}")
        await asyncio.sleep(POLL_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(polling_loop())
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan)


@app.get("/")
def health():
    return {"status": "ok", "service": "docrecognizer-worker"}


@app.post("/process-now")
def process_now():
    """Запускает обработку очереди вручную (для тестирования)."""
    process_pending_tasks()
    return {"status": "triggered"}
