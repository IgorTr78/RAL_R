import os
import json
import base64
import asyncio
from contextlib import asynccontextmanager

import fitz  # PyMuPDF
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


def pdf_first_page_to_png(pdf_bytes: bytes) -> bytes:
    """Конвертирует первую страницу PDF в PNG, ограничивая размер ~2000px по большей стороне."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]
    rect = page.rect
    max_dim = 2000.0
    zoom = max_dim / max(rect.width, rect.height)
    zoom = max(1.0, min(zoom, 3.0))
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
    return pix.tobytes("png")


def recognize_document(file_bytes: bytes, mime_type: str, fields: list[str]) -> dict:
    """Отправляет документ в GPT-4o и просит извлечь указанные поля."""
    b64 = base64.b64encode(file_bytes).decode("utf-8")
    data_url = f"data:{mime_type};base64,{b64}"

    # "Вид документа" определяется всегда, даже если пользователь его не указал
    all_fields = fields if "Вид документа" in fields else ["Вид документа", *fields]
    field_list = "\n".join(f"- {f}" for f in all_fields)

    prompt = (
        "Ты — система точного извлечения данных из официальных документов "
        "(справки, свидетельства, счета, договоры).\n\n"
        "Извлеки следующие поля:\n"
        f"{field_list}\n\n"
        "ОПРЕДЕЛЕНИЕ ВИДА ДОКУМЕНТА:\n"
        "Поле \"Вид документа\" должно содержать краткое и точное название типа "
        "документа на основе его заголовка, структуры и печатей, например: "
        "\"Паспорт РФ\", \"Свидетельство ИНН\", \"Счёт на оплату\", "
        "\"Акт выполненных работ\", \"Договор поставки\", \"Товарная накладная\", "
        "\"Доверенность\", \"СТС\" (свидетельство о регистрации ТС), "
        "\"ПТС\" (паспорт транспортного средства) и т.п. "
        "Если тип определить невозможно — напиши \"Неизвестный документ\".\n\n"
        "ПРАВИЛА ЧТЕНИЯ ЧИСЕЛ И КОДОВ:\n"
        "- Считай количество цифр в поле перед тем как дать ответ — для ИНН "
        "физлица должно быть 12 цифр, для ИНН организации — 10. "
        "Для VIN-номера автомобиля — строго 17 символов (латиница и цифры). "
        "Эти значения (ИНН, VIN, СНИЛС) читай как одну непрерывную строку без пробелов, "
        "слева направо, даже если цифры написаны по отдельным клеткам.\n"
        "- Для остальных номеров и серий (например, серия и номер паспорта, "
        "номер свидетельства, бланка, договора) — сохраняй ТОЧНО тот формат, "
        "в котором они написаны на документе, включая пробелы между группами цифр. "
        "Например, если на документе написано \"46 23 482794\", в ответе должно "
        "быть именно \"46 23 482794\", а не \"4623482794\".\n"
        "- Не путай похожие цифры: 0 и О, 1 и 7, 3 и 8, 5 и 6 — внимательно "
        "сверяй форму каждого символа.\n"
        "- Перепроверь результат, сверив его с изображением ещё раз перед ответом.\n\n"
        "ПРОВЕРКА ИМЁН:\n"
        "Если среди полей есть \"Имя\", \"Фамилия\" или \"Отчество\" (или похожие "
        "по смыслу поля, например \"ФИО\", \"На кого выдан\"), проверяй каждое "
        "распознанное слово на правдоподобность как настоящее русское имя/отчество:\n"
        "- Отчества обычно заканчиваются на \"-ович\"/\"-евич\" (мужские) или "
        "\"-овна\"/\"-евна\" (женские).\n"
        "- Если распознанное слово не похоже на реальное существующее имя или "
        "отчество (вероятная ошибка OCR — например, спутаны буквы), исправь его "
        "на наиболее близкое по написанию реально существующее русское имя или "
        "отчество, которое лучше соответствует изображению.\n"
        "- Если совпадений не находится и слово выглядит правдоподобно — "
        "оставь как распознано.\n"
        "- КРИТИЧЕСКИ ВАЖНО: если ты не можешь с уверенностью на 100% сказать, "
        "что распознанное \"Отчество\" является реально существующим русским "
        "отчеством (даже после попытки исправления) — установи значение "
        "\"_confidence\" не выше 60, независимо от качества распознавания "
        "остальных полей. Лучше показать документ пользователю на проверку, "
        "чем выдать неверное отчество с высокой уверенностью.\n\n"
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

        if filename.lower().endswith(".pdf"):
            file_bytes = pdf_first_page_to_png(file_bytes)
            mime_type = "image/png"
        else:
            mime_type = guess_mime_type(filename)

        result = recognize_document(file_bytes, mime_type, fields)
        confidence = result.pop("_confidence", 50)
        print(f"[doc {doc_id}] confidence={confidence}, result={result}")

        result_fields = list(result.keys())
        empty_fields = [f for f in result_fields if not result.get(f)]
        if confidence >= 80 and not empty_fields:
            status = "ok"
        elif confidence < 40 or len(empty_fields) == len(result_fields):
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

        # Обрабатываем только документы со статусом "pending" —
        # это либо новая загрузка (все документы pending),
        # либо повторное распознавание одного конкретного документа
        pending_docs = [d for d in documents if d["status"] == "pending"]
        for doc in pending_docs:
            process_document(doc, fields)

        # Пересчитываем итоговый статус задачи по ВСЕМ документам
        docs_resp = supabase.table("documents").select("status").eq("task_id", task_id).execute()
        statuses = [d["status"] for d in docs_resp.data]

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
