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
QWEN_API_KEY = os.environ.get("QWEN_API_KEY", "")
QWEN_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"

POLL_INTERVAL_SECONDS = 10
STORAGE_BUCKET = "documents"

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
openai_client = OpenAI(api_key=OPENAI_API_KEY)
qwen_client = OpenAI(api_key=QWEN_API_KEY, base_url=QWEN_BASE_URL) if QWEN_API_KEY else None


def guess_mime_type(filename: str) -> str:
    ext = filename.lower().split(".")[-1]
    return {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "gif": "image/gif",
    }.get(ext, "image/jpeg")


def is_valid_inn(inn: str) -> bool | None:
    """Проверяет контрольную сумму ИНН по алгоритму ФНС.
    Возвращает True/False для валидного формата (10 или 12 цифр),
    или None если строка не похожа на ИНН (другая длина/не только цифры)."""
    digits = inn.strip()
    if not digits.isdigit():
        return None

    if len(digits) == 12:
        # ИНН физлица: n11 — контроль по первым 10 цифрам, n12 — по первым 11
        coef_11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
        coef_12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
        n = [int(c) for c in digits]

        check_11 = sum(n[i] * coef_11[i] for i in range(10)) % 11 % 10
        check_12 = sum(n[i] * coef_12[i] for i in range(11)) % 11 % 10

        return check_11 == n[10] and check_12 == n[11]

    elif len(digits) == 10:
        # ИНН организации: 1 контрольная цифра, считается по первым 9 цифрам
        coef_10 = [2, 4, 10, 3, 5, 9, 4, 6, 8]
        n = [int(c) for c in digits]

        check_10 = sum(n[i] * coef_10[i] for i in range(9)) % 11 % 10
        return check_10 == n[9]

    return None


def is_plausible_russian_name(word: str, is_patronymic: bool = False) -> bool:
    """Эвристическая проверка, похоже ли слово на настоящее русское имя/фамилию/отчество.
    Не использует словарь — только структурные признаки, по которым обычно
    отличаются реальные слова от OCR-мусора."""
    w = word.strip()
    if len(w) < 2:
        return False

    # Должна быть только кириллица (плюс дефис для двойных имён/фамилий)
    if not all(c.isalpha() and ('а' <= c.lower() <= 'я' or c.lower() == 'ё') or c == '-' for c in w):
        return False

    # Отчества почти всегда заканчиваются на одно из этих окончаний
    if is_patronymic:
        valid_endings = ('ович', 'евич', 'овна', 'евна', 'ич', 'инична')
        if not w.lower().endswith(valid_endings):
            return False

    # Не должно быть трёх одинаковых букв подряд или трёх согласных подряд без гласной —
    # частый признак ошибки OCR, а не реального слова
    vowels = set('аеёиоуыэюя')
    consecutive_consonants = 0
    for c in w.lower():
        if c == '-':
            consecutive_consonants = 0
            continue
        if c in vowels:
            consecutive_consonants = 0
        else:
            consecutive_consonants += 1
            if consecutive_consonants >= 4:
                return False

    return True


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
        file_id = upload.id_

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
            "- ИНН, СНИЛС: если цифры написаны в отдельных клетках, разделённых "
            "вертикальными линиями — распознавай КАЖДУЮ КЛЕТКУ ПО ОТДЕЛЬНОСТИ, "
            "слева направо, затем объединяй без пробелов. Для ИНН физлица "
            "должно получиться РОВНО 12 цифр, для организации — РОВНО 10. "
            "Если количество не совпадает — пересчитай клетки заново.\n"
            "- VIN читай как непрерывную строку из 17 символов без пробелов.\n"
            "- НОМЕР ДОКУМЕНТА: если рядом с номером указана серия "
            "(например \"серия 50 № 002880829\"), включи в значение поля ВСЮ "
            "строку целиком: слово \"серия\", номер серии, № и сам номер.\n"
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


def recognize_document_qwen(file_bytes: bytes, mime_type: str, fields: list[str], model: str = "qwen-vl-plus") -> dict:
    """Отправляет документ в Qwen (через DashScope, OpenAI-совместимый API)."""
    if qwen_client is None:
        raise RuntimeError(
            "QWEN_API_KEY не задан в переменных окружения — невозможно использовать модель Qwen"
        )
    return recognize_document_openai(file_bytes, mime_type, fields, model, client=qwen_client)


def recognize_document(file_bytes: bytes, mime_type: str, fields: list[str], model: str = "gpt-4o-mini") -> dict:
    """Роутер: выбирает OpenAI, GigaChat или Qwen в зависимости от модели."""
    if model.startswith("GigaChat"):
        return recognize_document_gigachat(file_bytes, mime_type, fields, model)
    if model.startswith("qwen"):
        return recognize_document_qwen(file_bytes, mime_type, fields, model)
    return recognize_document_openai(file_bytes, mime_type, fields, model)


def recognize_document_openai(file_bytes: bytes, mime_type: str, fields: list[str], model: str = "gpt-4o-mini", client: OpenAI = None) -> dict:
    """Отправляет документ в OpenAI-совместимый API и просит извлечь указанные поля.
    Параметр client позволяет переиспользовать эту же функцию для любого
    OpenAI-совместимого провайдера (например, Qwen через DashScope)."""
    if client is None:
        client = openai_client

    b64 = base64.b64encode(file_bytes).decode("utf-8")
    data_url = f"data:{mime_type};base64,{b64}"

    # "Вид документа" определяется всегда, даже если пользователь его не указал
    all_fields = fields if "Вид документа" in fields else ["Вид документа", *fields]
    field_list = "\n".join(f"- {f}" for f in all_fields)

    prompt = (
        "Ты — система точного извлечения данных из официальных документов.\n\n"
        "Извлеки следующие поля:\n"
        f"{field_list}\n\n"
        "Правила:\n"
        "1. Вид документа — краткое название: Паспорт РФ, Свидетельство ИНН, СТС, ПТС и т.п.\n"
        "2. ФИО — полное имя человека (обычно написано крупно или подчёркнуто).\n"
        "3. Номер ИНН — цифры в рамке рядом со словом ИНН. "
        "Читай каждую клетку отдельно слева направо, объединяй без пробелов. "
        "Физлицо = 12 цифр, юрлицо = 10 цифр. Не путай: 0/О, 1/7, 3/8.\n"
        "4. Дата выдачи — дата выдачи или постановки на учёт на документе.\n"
        "5. Номер документа — серия и номер в формате: серия XX № XXXXXXXXX.\n"
        "6. Название документа — официальное название: Сертификат соответствия, Паспорт РФ и т.п.\n"
        "7. Номер сертификата — строка вида 'RU C-RU.ПФ02.В.08637/24' рядом со знаком № ЕАЭС.\n"
        "8. Номер бланка — серия и номер бланка, вида 'Серия RU № 0506887'.\n"
        "9. Срок действия — диапазон дат: дата начала и дата окончания через 'по', "
        "например '19.07.2024 по 18.07.2029'. Если конечная дата перекрыта печатью — "
        "попробуй прочитать цифры сквозь печать.\n"
        "10. Тип документа — полное официальное название документа как написано в заголовке, "
        "например: 'Акт приема-передачи Предмета лизинга по договору финансовой аренды (лизинга)'.\n"
        "11. Дата документа — дата в документе, формат ДД.ММ.ГГГГ или ДД месяц ГГГГ г.\n"
        "12. Номер договора — номер договора лизинга или купли-продажи, "
        "обычно после слов '№', 'договор №', 'по договору'.\n"
        "13. Если название поля не совпадает с текстом на документе — ищи по смыслу.\n"
        "14. Если поле не найдено — верни пустую строку.\n\n"
        "Также добавь ключ \"_confidence\" — целое число от 0 до 100, "
        "отражающее общую уверенность распознавания.\n\n"
        "ДОПОЛНИТЕЛЬНЫЕ ПРАВИЛА ДЛЯ ИНН:\n"
        "- Если цифры написаны в отдельных клетках — считай каждую клетку по отдельности слева направо.\n"
        "- Перепроверь ИНН дважды: посчитай цифры по клеткам заново и сравни с первым результатом.\n"
        "- Для ИНН физлица должно получиться РОВНО 12 цифр, для ИНН организации — РОВНО 10.\n\n"
        "ПРОВЕРКА ИМЁН:\n"
        "- Отчества обычно заканчиваются на -ович/-евич (мужские) или -овна/-евна (женские).\n"
        "- Если слово не похоже на реальное имя/отчество — исправь на близкое по написанию реально существующее.\n\n"
        "Ответь СТРОГО в формате JSON без markdown и пояснений. "
        "Ключи JSON должны точно совпадать с названиями полей выше."
    )

    response = client.chat.completions.create(
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


def retry_inn_openai(file_bytes: bytes, mime_type: str, field_name: str, wrong_value: str, model: str, client: OpenAI = None) -> str | None:
    """Повторно просит OpenAI-совместимую модель перечитать конкретное поле ИНН,
    сообщив, что контрольная сумма не сошлась. Возвращает исправленное значение или None."""
    if client is None:
        client = openai_client

    b64 = base64.b64encode(file_bytes).decode("utf-8")
    data_url = f"data:{mime_type};base64,{b64}"

    prompt = (
        f"На этом документе в поле \"{field_name}\" ты ранее распознал значение "
        f"\"{wrong_value}\", но контрольная сумма ИНН по алгоритму ФНС не совпадает — "
        "значит, как минимум одна цифра распознана неверно.\n\n"
        "Посмотри на изображение ещё раз ОЧЕНЬ внимательно. Если цифры написаны "
        "в отдельных клетках — считай каждую клетку по отдельности, слева направо, "
        "не пытайся читать число целиком. Особое внимание удели цифрам, которые "
        "легко спутать: 0/8, 1/7, 3/8, 6/5, 8/9, 8/6.\n\n"
        "Ответь СТРОГО в формате JSON без markdown: "
        '{"value": "<исправленное значение, только цифры>"}. '
        "Если после повторной проверки ты получаешь то же самое значение и уверен "
        'в нём — верни его же.'
    )

    response = client.chat.completions.create(
        model=model,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": data_url, "detail": "high"}},
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

    try:
        result = json.loads(raw)
        return result.get("value")
    except (json.JSONDecodeError, AttributeError):
        return None


def retry_inn_gigachat(file_bytes: bytes, field_name: str, wrong_value: str, model: str) -> str | None:
    """Аналог retry_inn_openai, но через GigaChat."""
    from gigachat import GigaChat
    from gigachat.models import Chat, Messages, MessagesRole

    with GigaChat(credentials=GIGACHAT_CREDENTIALS, verify_ssl_certs=False) as giga:
        upload = giga.upload_file(("document.png", file_bytes, "image/png"))
        file_id = upload.id_

        prompt = (
            f"На этом документе в поле \"{field_name}\" ты ранее распознал значение "
            f"\"{wrong_value}\", но контрольная сумма ИНН по алгоритму ФНС не совпадает — "
            "значит, как минимум одна цифра распознана неверно.\n\n"
            "Посмотри на изображение ещё раз ОЧЕНЬ внимательно. Если цифры написаны "
            "в отдельных клетках — считай каждую клетку по отдельности, слева направо. "
            "Особое внимание удели цифрам, которые легко спутать: 0/8, 1/7, 3/8, 6/5, 8/9.\n\n"
            "Ответь СТРОГО в формате JSON без markdown: "
            '{"value": "<исправленное значение, только цифры>"}.'
        )

        payload = Chat(
            model=model,
            messages=[Messages(role=MessagesRole.USER, content=prompt, attachments=[file_id])],
            temperature=0,
            max_tokens=200,
        )

        response = giga.chat(payload)
        raw = response.choices[0].message.content.strip()

    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        result = json.loads(raw)
        return result.get("value")
    except (json.JSONDecodeError, AttributeError):
        return None


INN_CONFUSABLE_DIGITS = {
    "0": ["8"], "8": ["0", "9", "6", "3"], "1": ["7"], "7": ["1"],
    "3": ["8"], "6": ["5"], "5": ["6"], "9": ["8"],
}


def find_inn_correction_candidate(wrong_value: str) -> str | None:
    """Перебирает варианты замены 1-2 'спутываемых' цифр и перестановки
    соседних цифр в ИНН, ищет единственный вариант с правильной контрольной
    суммой. Возвращает кандидата, если он единственный, иначе None."""
    digits = wrong_value.strip()
    if not digits.isdigit() or len(digits) not in (10, 12):
        return None

    candidates = set()

    # Перебор замены ровно одной позиции (спутанные по виду цифры: 0/8, 1/7 и т.п.)
    for i, d in enumerate(digits):
        for alt in INN_CONFUSABLE_DIGITS.get(d, []):
            candidate = digits[:i] + alt + digits[i + 1:]
            if is_valid_inn(candidate) is True:
                candidates.add(candidate)

    # Перебор перестановки каждой пары соседних цифр — частая ошибка при
    # считывании клетчатых полей ИНН (например, 13 вместо 31)
    for i in range(len(digits) - 1):
        if digits[i] == digits[i + 1]:
            continue  # перестановка одинаковых цифр ничего не меняет
        swapped = digits[:i] + digits[i + 1] + digits[i] + digits[i + 2:]
        if is_valid_inn(swapped) is True:
            candidates.add(swapped)

    # Если ничего не нашли — пробуем пары позиций с заменой похожих цифр
    if not candidates:
        for i in range(len(digits)):
            for alt_i in INN_CONFUSABLE_DIGITS.get(digits[i], []):
                base = digits[:i] + alt_i + digits[i + 1:]
                for j in range(i + 1, len(digits)):
                    for alt_j in INN_CONFUSABLE_DIGITS.get(digits[j], []):
                        candidate = base[:j] + alt_j + base[j + 1:]
                        if is_valid_inn(candidate) is True:
                            candidates.add(candidate)

    if len(candidates) == 1:
        return candidates.pop()
    return None


def get_openai_compatible_client(model: str) -> OpenAI:
    """Возвращает подходящий OpenAI-совместимый клиент в зависимости от модели
    (обычный OpenAI или Qwen через DashScope)."""
    if model.startswith("qwen"):
        if qwen_client is None:
            raise RuntimeError(
                "QWEN_API_KEY не задан в переменных окружения — невозможно использовать модель Qwen"
            )
        return qwen_client
    return openai_client


def attempt_inn_correction(file_bytes: bytes, mime_type: str, field_name: str, wrong_value: str, model: str) -> tuple[str | None, bool]:
    """Пытается исправить невалидный ИНН: сначала retry-запросом к модели,
    затем (если не помогло) перебором спутываемых цифр.
    Возвращает (исправленное_значение_или_None, найдено_уверенно)."""

    # Шаг 1: повторный запрос к модели с обратной связью
    try:
        if model.startswith("GigaChat"):
            retried = retry_inn_gigachat(file_bytes, field_name, wrong_value, model)
        else:
            retried = retry_inn_openai(file_bytes, mime_type, field_name, wrong_value, model, client=get_openai_compatible_client(model))
    except Exception as e:
        print(f"[inn_retry] ошибка повторного запроса: {e}", flush=True)
        retried = None

    if retried and is_valid_inn(retried) is True:
        print(f"[inn_retry] retry успешен: '{wrong_value}' -> '{retried}'", flush=True)
        return retried, True

    # Шаг 2: перебор соседних/спутываемых цифр у исходного (или переспрошенного) значения
    for candidate_source in filter(None, [wrong_value, retried]):
        fixed = find_inn_correction_candidate(candidate_source)
        if fixed:
            print(f"[inn_retry] найден кандидат перебором: '{candidate_source}' -> '{fixed}'", flush=True)
            return fixed, True

    print(f"[inn_retry] не удалось исправить ИНН '{wrong_value}'", flush=True)
    return None, False


def retry_name_openai(file_bytes: bytes, mime_type: str, field_name: str, wrong_value: str, model: str, client: OpenAI = None) -> str | None:
    """Повторно просит OpenAI-совместимую модель перечитать конкретное поле ФИО по буквам.
    Возвращает исправленное значение или None."""
    if client is None:
        client = openai_client

    b64 = base64.b64encode(file_bytes).decode("utf-8")
    data_url = f"data:{mime_type};base64,{b64}"

    prompt = (
        f"На этом документе в поле \"{field_name}\" ты ранее распознал значение "
        f"\"{wrong_value}\", но это слово не похоже на реально существующее русское "
        "имя, фамилию или отчество — вероятно, одна или несколько букв распознаны неверно.\n\n"
        "Посмотри на изображение ещё раз ОЧЕНЬ внимательно, прочитай слово по буквам "
        "слева направо, не угадывая по общему виду. Учти типичные ошибки OCR: "
        "путаница рукописных/печатных букв н/п, и/й, ш/щ, ц/щ, о/а, е/ё, и/ы.\n\n"
        "Ответь СТРОГО в формате JSON без markdown: "
        '{"value": "<исправленное значение>"}.'
    )

    response = client.chat.completions.create(
        model=model,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": data_url, "detail": "high"}},
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

    try:
        result = json.loads(raw)
        return result.get("value")
    except (json.JSONDecodeError, AttributeError):
        return None


def retry_name_gigachat(file_bytes: bytes, field_name: str, wrong_value: str, model: str) -> str | None:
    """Аналог retry_name_openai, но через GigaChat."""
    from gigachat import GigaChat
    from gigachat.models import Chat, Messages, MessagesRole

    with GigaChat(credentials=GIGACHAT_CREDENTIALS, verify_ssl_certs=False) as giga:
        upload = giga.upload_file(("document.png", file_bytes, "image/png"))
        file_id = upload.id_

        prompt = (
            f"На этом документе в поле \"{field_name}\" ты ранее распознал значение "
            f"\"{wrong_value}\", но это слово не похоже на реально существующее русское "
            "имя, фамилию или отчество — вероятно, одна или несколько букв распознаны неверно.\n\n"
            "Посмотри на изображение ещё раз ОЧЕНЬ внимательно, прочитай слово по буквам "
            "слева направо. Учти типичные ошибки OCR: путаница рукописных/печатных букв "
            "н/п, и/й, ш/щ, ц/щ, о/а, е/ё, и/ы.\n\n"
            "Ответь СТРОГО в формате JSON без markdown: "
            '{"value": "<исправленное значение>"}.'
        )

        payload = Chat(
            model=model,
            messages=[Messages(role=MessagesRole.USER, content=prompt, attachments=[file_id])],
            temperature=0,
            max_tokens=200,
        )

        response = giga.chat(payload)
        raw = response.choices[0].message.content.strip()

    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        result = json.loads(raw)
        return result.get("value")
    except (json.JSONDecodeError, AttributeError):
        return None


def attempt_name_correction(file_bytes: bytes, mime_type: str, field_name: str, wrong_value: str, model: str, is_patronymic: bool) -> tuple[str | None, bool]:
    """Пытается исправить неправдоподобное имя/фамилию/отчество повторным запросом
    к модели с указанием перечитать слово по буквам.
    Возвращает (исправленное_значение_или_None, найдено_уверенно)."""
    try:
        if model.startswith("GigaChat"):
            retried = retry_name_gigachat(file_bytes, field_name, wrong_value, model)
        else:
            retried = retry_name_openai(file_bytes, mime_type, field_name, wrong_value, model, client=get_openai_compatible_client(model))
    except Exception as e:
        print(f"[name_retry] ошибка повторного запроса: {e}", flush=True)
        retried = None

    if retried and is_plausible_russian_name(retried, is_patronymic):
        print(f"[name_retry] retry успешен: '{wrong_value}' -> '{retried}'", flush=True)
        return retried, True

    print(f"[name_retry] не удалось уверенно исправить '{wrong_value}'", flush=True)
    return None, False


def _openai_chat(model: str, messages: list, max_tokens: int = 1000) -> str:
    """Универсальный вызов OpenAI-совместимого API (OpenAI / Qwen / GigaChat не поддерживает этот путь)."""
    client = get_openai_compatible_client(model)
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=0,
    )
    return response.choices[0].message.content.strip()


def crop_image_strip(img_bytes: bytes, y_start: float, y_end: float) -> bytes:
    """Вырезает горизонтальную полосу изображения (y_start, y_end — доли от 0 до 1)."""
    from PIL import Image
    import io
    img = Image.open(io.BytesIO(img_bytes))
    w, h = img.size
    crop = img.crop((0, int(h * y_start), w, int(h * y_end)))
    crop = crop.resize((crop.width * 2, crop.height * 2), Image.LANCZOS)
    buf = io.BytesIO()
    crop.convert("RGB").save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def retry_empty_fields(file_bytes: bytes, mime_type: str, empty_fields: list, model: str) -> dict:
    """Делает второй запрос к модели только за пустыми полями."""
    if not empty_fields:
        return {}
    b64 = base64.b64encode(file_bytes).decode("utf-8")
    data_url = f"data:{mime_type};base64,{b64}"
    field_list = "\n".join(f"- {f}" for f in empty_fields)
    prompt = (
        "Внимательно изучи документ и найди следующие поля, которые не удалось распознать с первого раза:\n"
        f"{field_list}\n\n"
        "ВАЖНО:\n"
        "- Ищи смысловое соответствие: 'ФИО' = полное имя человека на документе, "
        "'Номер ИНН' = строка цифр в рамке рядом со словом ИНН, "
        "'Дата документа' = любая дата выдачи или постановки на учёт.\n"
        "- Если поле есть на документе — оно ДОЛЖНО быть найдено. Не возвращай пустую строку "
        "если информация видна на документе.\n"
        "- ИНН: читай каждую клетку по отдельности и объединяй без пробелов.\n"
        "- ФИО: ищи полное имя человека, обычно написано крупным шрифтом или подчёркнуто.\n\n"
        "Ответь СТРОГО в формате JSON без markdown. "
        "Ключи должны точно совпадать с названиями полей выше. "
        "Если поле действительно не найдено — используй пустую строку."
    )
    try:
        if model.startswith("GigaChat"):
            from gigachat import GigaChat
            from gigachat.models import Chat, Messages, MessagesRole
            with GigaChat(credentials=GIGACHAT_CREDENTIALS, verify_ssl_certs=False) as giga:
                upload = giga.upload_file(("document.png", file_bytes, "image/png"))
                payload = Chat(
                    model=model,
                    messages=[Messages(role=MessagesRole.USER, content=prompt, attachments=[upload.id_])],
                    temperature=0, max_tokens=500,
                )
                raw = giga.chat(payload).choices[0].message.content.strip()
        else:
            raw = _openai_chat(model, [{"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": data_url}},
            ]}], max_tokens=500)
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        return json.loads(raw)
    except Exception as e:
        print(f"[retry_empty] ошибка: {e}", flush=True)
        return {}


def extract_inn_from_crop(file_bytes: bytes, mime_type: str, model: str) -> str | None:
    """Вырезает зону ИНН (50-80% высоты) и делает отдельный запрос для его распознавания."""
    try:
        crop_bytes = crop_image_strip(file_bytes, 0.45, 0.80)
    except Exception as e:
        print(f"[inn_crop] ошибка обрезки: {e}", flush=True)
        return None

    b64 = base64.b64encode(crop_bytes).decode("utf-8")
    data_url = "data:image/jpeg;base64," + b64
    prompt = (
        "На этом фрагменте документа найди строку ИНН. "
        "ИНН напечатан в отдельных клетках-ячейках. "
        "Читай КАЖДУЮ цифру из каждой клетки слева направо и объединяй без пробелов. "
        "ИНН физлица — ровно 12 цифр, юрлица — 10 цифр. "
        "Не путай: 0 и О (буква), 1 и 7, 3 и 8. "
        'Ответь СТРОГО в формате JSON без markdown: {"inn": "<только цифры>"}'
    )
    try:
        if model.startswith("GigaChat"):
            from gigachat import GigaChat
            from gigachat.models import Chat, Messages, MessagesRole
            with GigaChat(credentials=GIGACHAT_CREDENTIALS, verify_ssl_certs=False) as giga:
                upload = giga.upload_file(("crop.jpeg", crop_bytes, "image/jpeg"))
                payload = Chat(
                    model=model,
                    messages=[Messages(role=MessagesRole.USER, content=prompt, attachments=[upload.id_])],
                    temperature=0, max_tokens=100,
                )
                raw = giga.chat(payload).choices[0].message.content.strip()
        else:
            raw = _openai_chat(model, [{"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": data_url}},
            ]}], max_tokens=100)
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        val = json.loads(raw).get("inn", "").strip()
        if val and val.isdigit() and len(val) in (10, 12):
            return val
    except Exception as e:
        print(f"[inn_crop] ошибка запроса: {e}", flush=True)
    return None


def recognize_balance(file_bytes: bytes, mime_type: str, model: str) -> dict:
    """Распознавание бухгалтерского баланса: шапка + таблица нарезанная полосами."""
    result = {"Вид документа": "", "ИНН": "", "Отчётная дата": "", "Период": "", "Организация": "", "tablitsa": []}

    def ask_strip(y_start, y_end, prompt_text, max_tok=300):
        crop = crop_image_strip(file_bytes, y_start, y_end)
        b64 = base64.b64encode(crop).decode()
        data_url = "data:image/jpeg;base64," + b64
        if model.startswith("GigaChat"):
            from gigachat import GigaChat
            from gigachat.models import Chat, Messages, MessagesRole
            with GigaChat(credentials=GIGACHAT_CREDENTIALS, verify_ssl_certs=False) as giga:
                upload = giga.upload_file(("crop.jpeg", crop, "image/jpeg"))
                payload = Chat(model=model,
                    messages=[Messages(role=MessagesRole.USER, content=prompt_text, attachments=[upload.id_])],
                    temperature=0, max_tokens=max_tok)
                return giga.chat(payload).choices[0].message.content.strip()
        else:
            return _openai_chat(model, [{"role": "user", "content": [
                {"type": "text", "text": prompt_text},
                {"type": "image_url", "image_url": {"url": data_url}},
            ]}], max_tokens=max_tok)

    def clean_json(raw):
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        if not raw.endswith("}"):
            ob = raw.count("[") - raw.count("]")
            ob2 = raw.count("{") - raw.count("}")
            raw = raw.rstrip(", \n\r") + "]" * ob + "}" * ob2
        return raw

    try:
        raw = clean_json(ask_strip(0.0, 0.22,
            "Это верхняя часть бухгалтерского документа. Извлеки только шапку. "
            'Ответь СТРОГО JSON без markdown: {"vid_dokumenta":"...","inn":"...","otchetnaya_data":"...","period":"...","organizaciya":"..."} '
            "ИНН = строго 10 цифр подряд без пробелов. "
            "Отчётная дата = дата из заголовка в формате ДД.ММ.ГГГГ. "
            "Период = текстовое описание (например: 9 месяцев 2025 г.)."))
        header = json.loads(raw)
        result["Вид документа"] = header.get("vid_dokumenta", "")
        result["ИНН"] = header.get("inn", "")
        result["Отчётная дата"] = header.get("otchetnaya_data", "")
        result["Период"] = header.get("period", "")
        result["Организация"] = header.get("organizaciya", "")
    except Exception as e:
        print(f"[balance] ошибка шапки: {e}", flush=True)

    table_prompt = (
        "Это фрагмент таблицы из бухгалтерского баланса. Извлеки ВСЕ строки таблицы которые видишь. "
        'Ответь СТРОГО JSON без markdown: {"rows": [{"kod": 1110, "nazvanie": "...", "period1": 0, "period2": 0, "period3": 0}]} '
        "Правила: прочерк = null, отрицательные числа в скобках = минус, числа без пробелов."
    )
    for y_start, y_end, label in [(0.20, 0.50, "1-я треть"), (0.48, 0.75, "2-я треть"), (0.73, 1.00, "3-я треть")]:
        try:
            raw = clean_json(ask_strip(y_start, y_end, table_prompt, max_tok=2000))
            rows = json.loads(raw).get("rows", [])
            result["tablitsa"].extend(rows)
            print(f"[balance] {label}: {len(rows)} строк", flush=True)
        except Exception as e:
            print(f"[balance] ошибка {label}: {e}", flush=True)

    seen, unique = set(), []
    for row in result["tablitsa"]:
        kod = row.get("kod")
        if kod not in seen:
            seen.add(kod)
            unique.append(row)
    result["tablitsa"] = unique
    return result


def recognize_leasing_doc(file_bytes: bytes, mime_type: str, model: str) -> dict:
    """Специализированное распознавание лизинговых документов — вырезаем только нужные зоны."""
    result = {"Тип документа": "", "Дата документа": "", "Номер договора": ""}

    def ask_zone(y_start, y_end, prompt_text):
        crop = crop_image_strip(file_bytes, y_start, y_end)
        b64 = base64.b64encode(crop).decode()
        data_url = "data:image/jpeg;base64," + b64
        if model.startswith("GigaChat"):
            from gigachat import GigaChat
            from gigachat.models import Chat, Messages, MessagesRole
            with GigaChat(credentials=GIGACHAT_CREDENTIALS, verify_ssl_certs=False) as giga:
                upload = giga.upload_file(("crop.jpeg", crop, "image/jpeg"))
                payload = Chat(model=model,
                    messages=[Messages(role=MessagesRole.USER, content=prompt_text, attachments=[upload.id_])],
                    temperature=0, max_tokens=200)
                raw = giga.chat(payload).choices[0].message.content.strip()
        else:
            raw = _openai_chat(model, [{"role": "user", "content": [
                {"type": "text", "text": prompt_text},
                {"type": "image_url", "image_url": {"url": data_url}},
            ]}], max_tokens=200)
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        return json.loads(raw)

    try:
        result["Тип документа"] = ask_zone(0.0, 0.18,
            "Это верхняя часть документа. Найди заголовок — название документа. "
            'Ответь СТРОГО JSON без markdown: {"tip": "полное название документа как написано в заголовке"}'
        ).get("tip", "")
    except Exception as e:
        print(f"[leasing] ошибка типа: {e}", flush=True)
    try:
        result["Дата документа"] = ask_zone(0.05, 0.25,
            "Найди дату документа на этом фрагменте. "
            'Ответь СТРОГО JSON без markdown: {"data": "дата в формате ДД месяц ГГГГ г. или ДД.ММ.ГГГГ"}'
        ).get("data", "")
    except Exception as e:
        print(f"[leasing] ошибка даты: {e}", flush=True)
    try:
        result["Номер договора"] = ask_zone(0.10, 0.45,
            "Найди номер договора лизинга или купли-продажи на этом фрагменте. "
            "Номер обычно стоит после слов '№', 'договор №', 'по договору', 'лизинга №'. "
            'Ответь СТРОГО JSON без markdown: {"nomer": "номер договора"}'
        ).get("nomer", "")
    except Exception as e:
        print(f"[leasing] ошибка номера: {e}", flush=True)

    return result


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
            # Сжимаем изображение если оно слишком большое
            try:
                from PIL import Image
                import io
                img = Image.open(io.BytesIO(file_bytes))
                w, h = img.size
                if max(w, h) > 1200:
                    scale = 1200 / max(w, h)
                    img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
                buf = io.BytesIO()
                img.convert("RGB").save(buf, format="JPEG", quality=75)
                file_bytes = buf.getvalue()
                mime_type = "image/jpeg"
            except Exception:
                pass

        print(f"[doc {doc_id}] отправка в модель {model}...", flush=True)

        # Определяем тип шаблона
        is_balance = any("баланс" in f.lower() or "таблиц" in f.lower() or "показател" in f.lower() for f in fields)
        is_leasing = any(f.lower() in ["тип документа", "номер договора"] for f in fields)

        if is_balance:
            print(f"[doc {doc_id}] обнаружен шаблон баланса, нарезаем полосами", flush=True)
            balance_data = recognize_balance(file_bytes, mime_type, model)
            tablitsa = balance_data.pop("tablitsa", [])
            result = balance_data
            result["_tablitsa"] = tablitsa
            confidence = 90 if tablitsa else 50
        elif is_leasing:
            print(f"[doc {doc_id}] обнаружен шаблон лизинга, вырезаем зоны", flush=True)
            result = recognize_leasing_doc(file_bytes, mime_type, model)
            confidence = 85
        else:
            result = recognize_document(file_bytes, mime_type, fields, model)
            confidence = result.pop("_confidence", 50)

        print(f"[doc {doc_id}] confidence={confidence}", flush=True)

        # Второй проход за пустыми полями (только для обычных документов)
        empty_fields = [] if (is_balance or is_leasing) else [f for f in result.keys() if not result.get(f) and f != "_tablitsa"]
        if empty_fields:
            print(f"[doc {doc_id}] пустые поля: {empty_fields}, запускаем второй проход...", flush=True)
            retry_result = retry_empty_fields(file_bytes, mime_type, empty_fields, model)
            for field in empty_fields:
                val = retry_result.get(field, "")
                if val and str(val).strip():
                    result[field] = val
                    print(f"[doc {doc_id}] поле '{field}' заполнено: {val}", flush=True)

        # ИНН crop-распознавание если поле всё ещё пустое
        if not is_balance and not is_leasing:
            for field in list(result.keys()):
                value = result[field]
                if "инн" in field.lower() and (not value or not str(value).strip()):
                    print(f"[doc {doc_id}] ИНН пустой, пробуем crop-распознавание...", flush=True)
                    inn_from_crop = extract_inn_from_crop(file_bytes, mime_type, model)
                    if inn_from_crop:
                        result[field] = inn_from_crop
                        print(f"[doc {doc_id}] ИНН из crop: {inn_from_crop}", flush=True)

        # Проверка контрольной суммы ИНН с попыткой самокоррекции
        for field in list(result.keys()):
            value = result[field]
            if "инн" in field.lower() and isinstance(value, str) and value.strip():
                check = is_valid_inn(value)
                if check is False:
                    print(f"[doc {doc_id}] ВНИМАНИЕ: ИНН '{value}' не прошёл проверку контрольной суммы, пытаюсь исправить", flush=True)
                    fixed, confident = attempt_inn_correction(file_bytes, mime_type, field, value, model)
                    if fixed:
                        result[field] = fixed
                        print(f"[doc {doc_id}] ИНН исправлен: '{value}' -> '{fixed}'", flush=True)
                        confidence = max(confidence, 75) if confident else confidence
                    else:
                        confidence = min(confidence, 50)
                elif check is True:
                    print(f"[doc {doc_id}] ИНН '{value}' прошёл проверку контрольной суммы", flush=True)

        # Проверка правдоподобности ФИО с попыткой самокоррекции
        for field in list(result.keys()):
            value = result[field]
            field_lower = field.lower()
            is_name_like = any(kw in field_lower for kw in ["имя", "фамилия", "отчество", "фио"])
            if is_name_like and isinstance(value, str) and value.strip():
                is_patronymic = "отчество" in field_lower
                # Для составных полей "ФИО" (несколько слов) проверяем только если это одно слово —
                # отдельная разбивка на части здесь не делается, чтобы не плодить ложные срабатывания
                words_to_check = value.split() if "фио" in field_lower else [value]
                plausible = all(is_plausible_russian_name(w, is_patronymic) for w in words_to_check)

                if not plausible:
                    print(f"[doc {doc_id}] ВНИМАНИЕ: значение '{value}' в поле '{field}' не похоже на реальное имя, пытаюсь исправить", flush=True)
                    fixed, confident = attempt_name_correction(file_bytes, mime_type, field, value, model, is_patronymic)
                    if fixed:
                        result[field] = fixed
                        print(f"[doc {doc_id}] значение исправлено: '{value}' -> '{fixed}'", flush=True)
                        confidence = max(confidence, 75) if confident else confidence
                    else:
                        confidence = min(confidence, 60)

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
