import os
import json
import base64
import asyncio
import difflib
from contextlib import asynccontextmanager

import fitz  # PyMuPDF
from fastapi import FastAPI
from supabase import create_client
from openai import OpenAI

# --- Конфигурация из переменных окружения ---
SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
GIGACHAT_CREDENTIALS = os.environ.get("GIGACHAT_CREDENTIALS", "")

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


def recognize_document_gigachat(file_bytes: bytes, mime_type: str, fields: list[str], model: str) -> dict:
    """Отправляет документ в GigaChat (vision) и извлекает поля."""
    from gigachat import GigaChat
    from gigachat.models import Chat, Messages, MessagesRole

    all_fields = fields if "Вид документа" in fields else ["Вид документа", *fields]
    field_list = "\n".join(f"- {f}" for f in all_fields)

    # Загружаем изображение в GigaChat Files API, получаем file_id
    with GigaChat(credentials=GIGACHAT_CREDENTIALS, verify_ssl_certs=False) as giga:
        upload = giga.upload_file(("document.png", file_bytes, "image/png"))
        file_id = upload.id

        prompt = (
            "Ты — система точного извлечения данных из официальных документов "
            "(справки, свидетельства, счета, договоры).\n\n"
            "Извлеки следующие поля:\n"
            f"{field_list}\n\n"
            "ОПРЕДЕЛЕНИЕ ВИДА ДОКУМЕНТА:\n"
            "Поле \"Вид документа\" должно содержать краткое и точное название типа "
            "документа, например: \"Паспорт РФ\", \"Свидетельство ИНН\", \"СТС\", \"ПТС\" и т.п. "
            "Если тип определить невозможно — напиши \"Неизвестный документ\".\n\n"
            "ПРАВИЛА ЧТЕНИЯ ЧИСЕЛ И КОДОВ:\n"
            "- Для ИНН, VIN, СНИЛС — одна непрерывная строка без пробелов.\n"
            "- Для остальных номеров (серия/номер паспорта, свидетельства) — "
            "сохраняй точный формат с пробелами как на документе.\n"
            "- Не путай похожие символы: 0/О, 1/7, 3/8.\n\n"
            "ПРОВЕРКА ИМЁН:\n"
            "Если среди полей есть \"Имя\", \"Фамилия\", \"Отчество\" или \"ФИО\" — "
            "проверяй каждое слово на правдоподобность как русское имя/отчество. "
            "Отчества заканчиваются на -ович/-евич/-овна/-евна. "
            "Если слово не похоже на реальное имя/отчество — исправь или снизь _confidence до ≤60.\n\n"
            "Ответь СТРОГО в формате JSON, без markdown и пояснений. "
            "Ключи JSON должны точно совпадать с названиями полей выше. "
            "Если поле не найдено — используй пустую строку \"\". "
            "Также добавь ключ \"_confidence\" — целое число от 0 до 100."
        )

        payload = Chat(
            model=model,
            messages=[
                Messages(
                    role=MessagesRole.USER,
                    content=prompt,
                    attachments=[file_id],
                )
            ],
            temperature=0,
            max_tokens=1000,
        )

        response = giga.chat(payload)
        raw = response.choices[0].message.content.strip()

    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    return json.loads(raw)


def recognize_document(file_bytes: bytes, mime_type: str, fields: list[str], model: str = "gpt-4o-mini") -> dict:
    """Роутер: выбирает OpenAI или GigaChat в зависимости от модели."""
    if model.startswith("GigaChat"):
        return recognize_document_gigachat(file_bytes, mime_type, fields, model)
    return recognize_document_openai(file_bytes, mime_type, fields, model)


def recognize_document_openai(file_bytes: bytes, mime_type: str, fields: list[str], model: str = "gpt-4o-mini") -> dict:
    """Отправляет документ в OpenAI и просит извлечь указанные поля."""
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
        model=model,
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


def process_document(doc: dict, fields: list[str], model: str = "gpt-4o-mini"):
    doc_id = doc["id"]
    file_path = doc["file_path"]
    filename = doc["filename"]

    try:
        print(f"[doc {doc_id}] начало обработки: {filename}, path={file_path}", flush=True)
        file_bytes = supabase.storage.from_(STORAGE_BUCKET).download(file_path)
        print(f"[doc {doc_id}] файл загружен, размер={len(file_bytes)} байт", flush=True)

        if filename.lower().endswith(".pdf"):
            file_bytes = pdf_first_page_to_png(file_bytes)
            mime_type = "image/png"
        else:
            mime_type = guess_mime_type(filename)

        print(f"[doc {doc_id}] отправка в модель {model}...", flush=True)
        result = recognize_document(file_bytes, mime_type, fields, model)
        confidence = result.pop("_confidence", 50)
        print(f"[doc {doc_id}] confidence={confidence}, result={result}", flush=True)

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
        import traceback
        print(f"[doc {doc_id}] ОШИБКА: {e}", flush=True)
        traceback.print_exc()
        supabase.table("documents").update({
            "status": "error",
            "error_message": str(e),
        }).eq("id", doc_id).execute()
        return "error"


def process_pending_tasks():
    tasks_resp = supabase.table("tasks").select("*").eq("status", "pending").limit(1).execute()
    tasks = tasks_resp.data
    print(f"[tick] найдено задач со статусом pending: {len(tasks)}", flush=True)

    for task in tasks:
        task_id = task["id"]
        fields = task.get("fields") or []
        model = task.get("model") or "gpt-4o-mini"

        # Помечаем задачу как "в обработке"
        supabase.table("tasks").update({"status": "processing"}).eq("id", task_id).execute()

        docs_resp = supabase.table("documents").select("*").eq("task_id", task_id).execute()
        documents = docs_resp.data

        # Обрабатываем только документы со статусом "pending" —
        # это либо новая загрузка (все документы pending),
        # либо повторное распознавание одного конкретного документа
        pending_docs = [d for d in documents if d["status"] == "pending"]
        for doc in pending_docs:
            doc_model = doc.get("model") or model
            process_document(doc, fields, doc_model)

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

        # Перекрёстная сверка имён между документами одной задачи
        if final_status in ("done", "partial") and len(documents) >= 2:
            try:
                cross_check_task_names(task_id)
            except Exception as e:
                import traceback
                print(f"[cross_check] неожиданная ошибка: {e}", flush=True)
                traceback.print_exc()


# Поля, по которым выполняется перекрёстная сверка имён между документами
NAME_FIELD_KEYWORDS = ["имя", "фамилия", "отчество", "фио", "кого выдан", "владелец"]


def is_name_field(field_name: str) -> bool:
    lower = field_name.lower()
    return any(kw in lower for kw in NAME_FIELD_KEYWORDS)


def similar_but_different(a: str, b: str) -> bool:
    """Похожи, но не идентичны — вероятная ошибка OCR в одном из вариантов."""
    a, b = a.strip(), b.strip()
    if not a or not b or a == b:
        return False
    ratio = difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()
    return ratio >= 0.6


def resolve_name_conflict(value_a: str, doc_a: dict, value_b: str, doc_b: dict, field: str) -> str | None:
    """Спрашивает модель, какой из двух похожих вариантов ФИО правильный, глядя на оба изображения.
    Возвращает правильное значение, либо None если не удалось определить."""
    try:
        file_a = supabase.storage.from_(STORAGE_BUCKET).download(doc_a["file_path"])
        file_b = supabase.storage.from_(STORAGE_BUCKET).download(doc_b["file_path"])

        if doc_a["filename"].lower().endswith(".pdf"):
            file_a = pdf_first_page_to_png(file_a)
        if doc_b["filename"].lower().endswith(".pdf"):
            file_b = pdf_first_page_to_png(file_b)

        mime_a = "image/png" if doc_a["filename"].lower().endswith(".pdf") else guess_mime_type(doc_a["filename"])
        mime_b = "image/png" if doc_b["filename"].lower().endswith(".pdf") else guess_mime_type(doc_b["filename"])

        b64_a = base64.b64encode(file_a).decode("utf-8")
        b64_b = base64.b64encode(file_b).decode("utf-8")

        prompt = (
            f"На двух изображениях документов в поле \"{field}\" распознаны два разных, "
            f"но похожих значения, вероятно из-за ошибки OCR:\n"
            f"1) \"{value_a}\"\n"
            f"2) \"{value_b}\"\n\n"
            "Внимательно посмотри на оба изображения и определи правильное написание "
            "этого значения (это, скорее всего, одно и то же имя/фамилия, написанное "
            "с ошибкой на одном из документов).\n\n"
            "Ответь СТРОГО в формате JSON без markdown: "
            "{\"correct_value\": \"<правильное значение>\"}. "
            "Если ты не уверен, какое значение правильное, верни "
            "{\"correct_value\": null}."
        )

        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime_a};base64,{b64_a}", "detail": "high"}},
                    {"type": "image_url", "image_url": {"url": f"data:{mime_b};base64,{b64_b}", "detail": "high"}},
                ],
            }],
            max_tokens=200,
            temperature=0,
        )

        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        result = json.loads(raw)
        return result.get("correct_value")

    except Exception as e:
        print(f"[cross_check] ошибка сравнения: {e}", flush=True)
        return None


def cross_check_task_names(task_id: str):
    """После обработки всех документов задачи — ищет похожие, но разные ФИО
    в разных документах и пытается определить правильное написание."""
    docs_resp = supabase.table("documents").select("*").eq("task_id", task_id).execute()
    documents = [d for d in docs_resp.data if d["status"] in ("ok", "warning") and d.get("values")]

    if len(documents) < 2:
        return

    print(f"[cross_check] задача {task_id}: проверка {len(documents)} документов", flush=True)

    # Собираем все именные поля: (doc, field_name, value)
    name_entries = []
    for doc in documents:
        for field, value in (doc.get("values") or {}).items():
            if is_name_field(field) and isinstance(value, str) and value.strip():
                name_entries.append((doc, field, value.strip()))

    checked_pairs = set()

    for i in range(len(name_entries)):
        for j in range(i + 1, len(name_entries)):
            doc_a, field_a, value_a = name_entries[i]
            doc_b, field_b, value_b = name_entries[j]

            if doc_a["id"] == doc_b["id"]:
                continue

            pair_key = tuple(sorted([f"{doc_a['id']}:{field_a}:{value_a}", f"{doc_b['id']}:{field_b}:{value_b}"]))
            if pair_key in checked_pairs:
                continue

            if not similar_but_different(value_a, value_b):
                continue

            checked_pairs.add(pair_key)
            print(f"[cross_check] похожие значения: '{value_a}' ({doc_a['filename']}) vs '{value_b}' ({doc_b['filename']})", flush=True)

            correct = resolve_name_conflict(value_a, doc_a, value_b, doc_b, field_a)
            if not correct:
                print("[cross_check] модель не смогла определить правильное значение", flush=True)
                continue

            print(f"[cross_check] правильное значение: '{correct}'", flush=True)

            # Обновляем документ(ы), где значение отличается от правильного
            for doc, field, value in [(doc_a, field_a, value_a), (doc_b, field_b, value_b)]:
                if value != correct:
                    new_values = dict(doc.get("values") or {})
                    new_values[field] = correct
                    supabase.table("documents").update({
                        "values": new_values,
                        "status": "ok",
                        "confidence": max(doc.get("confidence") or 0, 90),
                    }).eq("id", doc["id"]).execute()
                    print(f"[cross_check] документ {doc['id']}: '{field}' исправлено на '{correct}'", flush=True)


async def polling_loop():
    print("[polling_loop] запущен", flush=True)
    while True:
        try:
            process_pending_tasks()
        except Exception as e:
            import traceback
            print(f"Ошибка в цикле обработки: {e}", flush=True)
            traceback.print_exc()
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
