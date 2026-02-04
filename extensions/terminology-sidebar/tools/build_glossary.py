import gzip
import io
import json
import os
import time
import hashlib
import urllib.parse
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(ROOT_DIR, "data")
CACHE_DIR = os.path.join(os.path.dirname(__file__), ".cache")

def clean_old_cache():
    """Clean cache files older than 14 days."""
    if not os.path.exists(CACHE_DIR):
        return
    
    print("Checking for old cache files...")
    now = time.time()
    ttl = 14 * 24 * 3600  # 14 days
    count = 0
    
    for filename in os.listdir(CACHE_DIR):
        file_path = os.path.join(CACHE_DIR, filename)
        if os.path.isfile(file_path):
            try:
                if now - os.path.getmtime(file_path) > ttl:
                    os.remove(file_path)
                    count += 1
            except OSError:
                pass
    
    if count > 0:
        print(f"Cleaned {count} old cache files.")

clean_old_cache()

USER_AGENT = "TerminologySidebarBuild/1.0 (data build script)"
SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"
MESH_YEAR = 2026
MESH_DESC_URL = f"https://nlmpubs.nlm.nih.gov/projects/mesh/MESH_FILES/xmlmesh/desc{MESH_YEAR}.gz"
FIBO_TBOX_URL = "https://raw.githubusercontent.com/edmcouncil/fibo/master/AboutFIBOProd-TBoxOnly.rdf"

TARGET_TOTAL = 3000
DOMAIN_LIMIT = 800
ROOT_LIMIT = 300
REQUEST_DELAY_SEC = 0.6
RETRY_LIMIT = 4
RETRY_BACKOFF_SEC = 1.2
HTTP_TIMEOUT_SEC = 60
SCHEMA_VERSION = 2
ALIASES_FILE = os.path.join(DATA_DIR, "aliases_en.json")
MAX_AUTO_ALIASES = 1
MESH_CACHE_FILE = os.path.join(CACHE_DIR, f"mesh_desc_{MESH_YEAR}.gz")
FIBO_CACHE_FILE = os.path.join(CACHE_DIR, "fibo_prod_tbox.rdf")
FIBO_IMPORT_FILTERS = ("/FND/", "/FBC/", "/SEC/")
FIBO_IMPORT_LIMIT = 25
FIBO_MAX_BYTES = 8 * 1024 * 1024
DOMAIN_DATA_DIR = os.path.join(DATA_DIR, "domains")

DOMAINS = [
    {
        "name": "Software Engineering",
        "roots": ["Q80993", "Q21198", "Q8366", "Q175263", "Q9143"]
    },
    {
        "name": "Finance",
        "roots": ["Q8134", "Q3435731", "Q247506"]
    },
    {
        "name": "Legal",
        "roots": ["Q7748", "Q2135465", "Q820655"]
    },
    {
        "name": "Medical",
        "roots": ["Q11190", "Q12136", "Q796194", "Q12140"]
    }
]

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(CACHE_DIR, exist_ok=True)


def _cache_path(url):
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()
    return os.path.join(CACHE_DIR, f"{digest}.json")


def download_file(url, dest_path, delay_sec=REQUEST_DELAY_SEC):
    if os.path.exists(dest_path):
        return dest_path
    attempt = 0
    while True:
        attempt += 1
        time.sleep(delay_sec)
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": USER_AGENT
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SEC) as response:
                with open(dest_path, "wb") as f:
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        f.write(chunk)
            return dest_path
        except urllib.error.HTTPError as exc:
            if attempt >= RETRY_LIMIT:
                raise exc
            if exc.code == 429:
                time.sleep(RETRY_BACKOFF_SEC * attempt * 3)
            else:
                time.sleep(RETRY_BACKOFF_SEC * attempt)
        except urllib.error.URLError as exc:
            if attempt >= RETRY_LIMIT:
                raise exc
            time.sleep(RETRY_BACKOFF_SEC * attempt)
        except Exception as exc:
            if attempt >= RETRY_LIMIT:
                raise exc
            time.sleep(RETRY_BACKOFF_SEC * attempt)


def fetch_json(url, delay_sec=REQUEST_DELAY_SEC):
    cache_file = _cache_path(url)
    if os.path.exists(cache_file):
        with open(cache_file, "r", encoding="utf-8") as f:
            return json.load(f)

    attempt = 0
    while True:
        attempt += 1
        time.sleep(delay_sec)
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/json"
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SEC) as response:
                raw = response.read().decode("utf-8")
                data = json.loads(raw)
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            return data
        except urllib.error.HTTPError as exc:
            if attempt >= RETRY_LIMIT:
                raise exc
            if exc.code == 429:
                time.sleep(RETRY_BACKOFF_SEC * attempt * 3)
            else:
                time.sleep(RETRY_BACKOFF_SEC * attempt)
        except urllib.error.URLError as exc:
            if attempt >= RETRY_LIMIT:
                raise exc
            time.sleep(RETRY_BACKOFF_SEC * attempt)
        except Exception as exc:
            if attempt >= RETRY_LIMIT:
                raise exc
            time.sleep(RETRY_BACKOFF_SEC * attempt)


def fetch_bytes(url, accept, max_bytes):
    attempt = 0
    while True:
        attempt += 1
        time.sleep(REQUEST_DELAY_SEC)
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": accept
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SEC) as response:
                length = response.headers.get("Content-Length")
                if length and int(length) > max_bytes:
                    return b""
                chunks = []
                total = 0
                while True:
                    chunk = response.read(1024 * 512)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        return b""
                    chunks.append(chunk)
                return b"".join(chunks)
        except urllib.error.HTTPError as exc:
            if attempt >= RETRY_LIMIT:
                return b""
            if exc.code == 429:
                time.sleep(RETRY_BACKOFF_SEC * attempt * 3)
            else:
                time.sleep(RETRY_BACKOFF_SEC * attempt)
        except urllib.error.URLError:
            if attempt >= RETRY_LIMIT:
                return b""
            time.sleep(RETRY_BACKOFF_SEC * attempt)
        except Exception:
            if attempt >= RETRY_LIMIT:
                return b""
            time.sleep(RETRY_BACKOFF_SEC * attempt)


def extract_sentence(text):
    if not text:
        return ""
    normalized = " ".join(str(text).split()).strip()
    if not normalized:
        return ""
    for sep in ["。", ". ", "！", "!", "？", "?"]:
        idx = normalized.find(sep)
        if idx > 0:
            return normalized[:idx + (1 if sep in ["。", "！", "!", "？", "?"] else 0)].strip()
    return normalized[:240]


def has_cjk(text):
    for ch in text:
        if "\u4e00" <= ch <= "\u9fff":
            return True
    return False


def is_en_term_clean(text):
    if not text or has_cjk(text):
        return False
    letters = sum(1 for ch in text if ch.isalpha())
    alnum = sum(1 for ch in text if ch.isalnum())
    if letters < 2:
        return False
    if alnum == 0:
        return False
    return (letters / alnum) >= 0.4


def _text_by_localname(elem, localname, lang=None):
    for child in elem.iter():
        if not isinstance(child.tag, str):
            continue
        if child.tag.split("}")[-1] != localname:
            continue
        if lang:
            value = child.attrib.get("{http://www.w3.org/XML/1998/namespace}lang")
            if value and value.lower() != lang:
                continue
        if child.text:
            return child.text.strip()
    return ""


def load_mesh_definitions():
    try:
        download_file(MESH_DESC_URL, MESH_CACHE_FILE)
    except Exception:
        return {}

    definitions = {}
    try:
        with gzip.open(MESH_CACHE_FILE, "rb") as f:
            context = ET.iterparse(f, events=("end",))
            for _, elem in context:
                if not isinstance(elem.tag, str):
                    continue
                if elem.tag.split("}")[-1] != "DescriptorRecord":
                    continue
                mesh_id = _text_by_localname(elem, "DescriptorUI")
                scope_note = _text_by_localname(elem, "ScopeNote")
                if mesh_id and scope_note:
                    definitions[mesh_id] = extract_sentence(scope_note)
                elem.clear()
    except Exception:
        return {}
    return definitions


def load_fibo_definitions():
    try:
        download_file(FIBO_TBOX_URL, FIBO_CACHE_FILE)
    except Exception:
        return {}

    def normalize_label(text):
        if not text:
            return ""
        cleaned = []
        for ch in text.lower():
            if ch.isalnum():
                cleaned.append(ch)
            else:
                cleaned.append(" ")
        return " ".join("".join(cleaned).split()).strip()

    def parse_rdf_bytes(content, definitions):
        try:
            context = ET.iterparse(io.BytesIO(content), events=("end",))
        except Exception:
            return
        for _, elem in context:
            if not isinstance(elem.tag, str):
                continue
            local = elem.tag.split("}")[-1]
            if local not in ("Description", "Class", "NamedIndividual"):
                continue
            label = _text_by_localname(elem, "label", lang="en")
            if not label:
                elem.clear()
                continue
            definition = _text_by_localname(elem, "definition", lang="en")
            if not definition:
                definition = _text_by_localname(elem, "comment", lang="en")
            if definition:
                key = normalize_label(label)
                if key and key not in definitions:
                    definitions[key] = extract_sentence(definition)
            elem.clear()

    try:
        with open(FIBO_CACHE_FILE, "rb") as f:
            tbox_content = f.read()
    except Exception:
        tbox_content = b""

    definitions = {}
    if tbox_content:
        parse_rdf_bytes(tbox_content, definitions)

    try:
        tbox_text = tbox_content.decode("utf-8", errors="ignore")
    except Exception:
        tbox_text = ""

    import_urls = []
    for line in tbox_text.splitlines():
        if "owl:imports" not in line:
            continue
        start = line.find("rdf:resource=\"")
        if start == -1:
            continue
        start += len("rdf:resource=\"")
        end = line.find("\"", start)
        if end == -1:
            continue
        import_urls.append(line[start:end])

    filtered = []
    for url in import_urls:
        if any(part in url for part in FIBO_IMPORT_FILTERS):
            filtered.append(url)
        if len(filtered) >= FIBO_IMPORT_LIMIT:
            break

    for url in filtered:
        content = fetch_bytes(url, "application/rdf+xml", FIBO_MAX_BYTES)
        if not content:
            continue
        parse_rdf_bytes(content, definitions)

    return definitions


def load_alias_overrides():
    if not os.path.exists(ALIASES_FILE):
        return {}
    with open(ALIASES_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        return {}
    normalized = {}
    for key, aliases in data.items():
        if not key:
            continue
        if not isinstance(aliases, list):
            continue
        clean_key = str(key).strip().lower()
        clean_aliases = [str(a).strip() for a in aliases if str(a).strip()]
        if clean_key and clean_aliases:
            normalized[clean_key] = clean_aliases
    return normalized


def load_domain_details():
    if not os.path.isdir(DOMAIN_DATA_DIR):
        return {}
    details = {}
    for name in os.listdir(DOMAIN_DATA_DIR):
        if not name.endswith(".json"):
            continue
        path = os.path.join(DOMAIN_DATA_DIR, name)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue
        if not isinstance(data, list):
            continue
        for item in data:
            if not isinstance(item, dict):
                continue
            term = str(item.get("term", "")).strip()
            if not term:
                continue
            key = term.lower()
            if key not in details:
                details[key] = item
    return details


def pluralize_word(word):
    lower = word.lower()
    if lower.endswith(("s", "x", "z", "ch", "sh")):
        return word + "es"
    if lower.endswith("y") and len(lower) > 1 and lower[-2] not in "aeiou":
        return word[:-1] + "ies"
    return word + "s"


def generate_plural_variant(term):
    tokens = term.split()
    if not tokens:
        return []
    last = tokens[-1]
    if not last.isalpha():
        return []
    if last.isupper():
        return []
    if len(last) < 3:
        return []
    if last.lower().endswith("s"):
        return []
    plural = pluralize_word(last)
    if plural == last:
        return []
    return [" ".join(tokens[:-1] + [plural])]


def build_sparql_query(root_qid, limit):
    return f"""
SELECT ?item ?itemLabelEn ?itemLabelZh ?enDesc ?zhDesc ?meshId
WHERE {{
  VALUES ?root {{ wd:{root_qid} }}
  ?item (wdt:P31/wdt:P279*|wdt:P279*) ?root .
  ?item rdfs:label ?itemLabelEn FILTER(LANG(?itemLabelEn) = "en") .
  ?item rdfs:label ?itemLabelZh .
  FILTER(LANG(?itemLabelZh) IN ("zh", "zh-hans", "zh-hant"))
  ?item schema:description ?enDesc FILTER(LANG(?enDesc) = "en")
  ?item schema:description ?zhDesc .
  FILTER(LANG(?zhDesc) IN ("zh", "zh-hans", "zh-hant"))
  OPTIONAL {{ ?item wdt:P486 ?meshId }}
}}
GROUP BY ?item ?itemLabelEn ?itemLabelZh ?enDesc ?zhDesc ?meshId
LIMIT {limit}
""".strip()


def sparql_query(query):
    url = f"{SPARQL_ENDPOINT}?format=json&timeout=40&query={urllib.parse.quote(query)}"
    return fetch_json(url, delay_sec=REQUEST_DELAY_SEC)


def collect_items():
    all_items = {}
    domain_stats = {}
    domain_seen = {}
    for domain in DOMAINS:
        domain_name = domain["name"]
        domain_stats[domain_name] = 0
        domain_seen[domain_name] = set()
        for root in domain["roots"]:
            query = build_sparql_query(root, ROOT_LIMIT)
            data = sparql_query(query)
            rows = data.get("results", {}).get("bindings", [])
            for row in rows:
                if len(domain_seen[domain_name]) >= DOMAIN_LIMIT:
                    break
                qid = row["item"]["value"].split("/")[-1]
                if qid not in all_items:
                    all_items[qid] = {
                        "qid": qid,
                        "en": row["itemLabelEn"]["value"],
                        "zh": row["itemLabelZh"]["value"],
                        "enDesc": row.get("enDesc", {}).get("value", ""),
                        "zhDesc": row.get("zhDesc", {}).get("value", ""),
                        "meshId": row.get("meshId", {}).get("value", ""),
                        "altEn": [],
                        "altZh": [],
                        "enDef": extract_sentence(row.get("enDesc", {}).get("value", "")),
                        "zhDef": extract_sentence(row.get("zhDesc", {}).get("value", "")),
                        "enDefSource": "wikidata",
                        "zhDefSource": "wikidata",
                        "domains": [domain_name]
                    }
                else:
                    if domain_name not in all_items[qid]["domains"]:
                        all_items[qid]["domains"].append(domain_name)
                domain_seen[domain_name].add(qid)
            if len(domain_seen[domain_name]) >= DOMAIN_LIMIT:
                break
        domain_stats[domain_name] = len(domain_seen[domain_name])
    return all_items, domain_stats


def build_entries(items):
    entries = []
    missing = 0
    alias_overrides = load_alias_overrides()
    mesh_defs = load_mesh_definitions()
    fibo_defs = load_fibo_definitions()
    domain_details = load_domain_details()
    for item in items.values():
        en_def = item.get("enDef", "")
        zh_def = item.get("zhDef", "")
        sources = [
            {
                "source": "wikidata",
                "qid": item["qid"],
                "license": "CC0"
            }
        ]

        if not en_def or not zh_def:
            missing += 1
            continue

        term = item["en"]
        zh_term = item.get("zh", "")
        if not is_en_term_clean(term):
            missing += 1
            continue
        if not zh_term or not has_cjk(zh_term):
            missing += 1
            continue
        if not has_cjk(zh_def):
            missing += 1
            continue
        if "Medical" in item.get("domains", []):
            mesh_id = item.get("meshId", "")
            mesh_note = mesh_defs.get(mesh_id)
            if mesh_id and mesh_note:
                en_def = mesh_note
                sources.append({
                    "source": "mesh",
                    "id": mesh_id,
                    "license": "NLM Terms and Conditions"
                })
        if "Finance" in item.get("domains", []):
            normalized = "".join([ch.lower() if ch.isalnum() else " " for ch in term])
            normalized = " ".join(normalized.split()).strip()
            fibo_def = fibo_defs.get(normalized)
            if fibo_def:
                en_def = fibo_def
                sources.append({
                    "source": "fibo",
                    "license": "MIT"
                })
        domain_detail = domain_details.get(term.lower())
        if domain_detail:
            detail_en_def = str(domain_detail.get("definition_en", "")).strip()
            detail_zh_def = str(domain_detail.get("definition_zh", "")).strip()
            if detail_en_def:
                en_def = detail_en_def
            if detail_zh_def:
                zh_def = detail_zh_def
        aliases = []
        overrides = alias_overrides.get(term.lower(), [])
        aliases.extend(overrides)
        aliases.extend(generate_plural_variant(term))
        seen = set()
        cleaned_aliases = []
        for alias in aliases:
            if not alias:
                continue
            key = alias.lower()
            if key == term.lower():
                continue
            if key in seen:
                continue
            seen.add(key)
            cleaned_aliases.append(alias)
            if len(cleaned_aliases) >= MAX_AUTO_ALIASES + len(overrides):
                break

        desc_en = str(item.get("enDesc", "")).strip() or en_def
        desc_zh = str(item.get("zhDesc", "")).strip() or zh_def
        examples_en = []
        examples_zh = []
        if domain_detail:
            examples_en = [str(x).strip() for x in domain_detail.get("examples_en", []) if str(x).strip()]
            examples_zh = [str(x).strip() for x in domain_detail.get("examples_zh", []) if str(x).strip()]
        detail_examples = []
        total_examples = max(len(examples_en), len(examples_zh))
        for idx in range(total_examples):
            desc = {}
            if idx < len(examples_en):
                desc["en"] = examples_en[idx]
            if idx < len(examples_zh):
                desc["zh_CN"] = examples_zh[idx]
            if desc:
                detail_examples.append({
                    "title": "",
                    "description": desc
                })
        detail = {
            "definition": {
                "en": en_def,
                "zh_CN": zh_def
            },
            "detailedExplanation": {
                "en": desc_en,
                "zh_CN": desc_zh
            },
            "scenarios": {
                "use": [],
                "avoid": []
            },
            "examples": detail_examples,
            "pitfalls": [],
            "related": []
        }
        entries.append({
            "id": item["qid"],
            "term": term,
            "aliases": cleaned_aliases,
            "definition": {
                "en": en_def,
                "zh_CN": zh_def
            },
            "examples": {
                "en": examples_en,
                "zh_CN": examples_zh
            },
            "category": item["domains"][0] if item["domains"] else "General",
            "sources": sources,
            "zhTerm": item["zh"],
            "detail": detail
        })
    return entries, missing


def build_meta(domain_stats):
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sources": [
            {
                "name": "wikidata",
                "license": "CC0"
            },
            {
                "name": "mesh",
                "license": "NLM Terms and Conditions",
                "year": MESH_YEAR
            },
            {
                "name": "fibo",
                "license": "MIT",
                "version": "master",
                "subset": "FND,FBC,SEC",
                "importLimit": FIBO_IMPORT_LIMIT
            }
        ],
        "domainStats": domain_stats,
        "limits": {
            "targetTotal": TARGET_TOTAL,
            "domainLimit": DOMAIN_LIMIT,
            "rootLimit": ROOT_LIMIT
        }
    }


def build_index_entries(entries, lang):
    items = []
    for entry in entries:
        term = entry["term"] if lang == "en" else (entry.get("zhTerm") or entry["term"])
        items.append({
            "id": entry["id"],
            "term": term,
            "aliases": entry["aliases"] if lang == "en" else [],
            "category": entry["category"]
        })
    return items


def build_detail_entries(entries):
    items = {}
    for entry in entries:
        items[entry["id"]] = {
            "id": entry["id"],
            "term": entry["term"],
            "zhTerm": entry.get("zhTerm") or entry["term"],
            "definition": entry["definition"],
            "examples": entry["examples"],
            "category": entry["category"],
            "sources": entry.get("sources", []),
            "detail": entry.get("detail", {})
        }
    return items


def build_cedict(entries):
    cedict = []
    for entry in entries[:600]:
        zh = entry.get("zhTerm") or entry["definition"]["zh_CN"]
        term = entry["term"]
        cedict.append({
            "traditional": zh,
            "simplified": zh,
            "pinyin": "",
            "english": term
        })
    return cedict




def main():
    items, domain_stats = collect_items()
    entries, missing = build_entries(items)
    entries.sort(key=lambda x: x["term"].lower())
    if len(entries) > TARGET_TOTAL:
        entries = entries[:TARGET_TOTAL]

    meta = build_meta(domain_stats)
    en_index = {
        "meta": meta,
        "items": build_index_entries(entries, "en")
    }
    zh_index = {
        "meta": meta,
        "items": build_index_entries(entries, "zh")
    }
    detail = {
        "meta": meta,
        "items": build_detail_entries(entries)
    }

    with open(os.path.join(DATA_DIR, "glossary_en_index.json"), "w", encoding="utf-8") as f:
        json.dump(en_index, f, ensure_ascii=False, indent=2)

    with open(os.path.join(DATA_DIR, "glossary_zh_index.json"), "w", encoding="utf-8") as f:
        json.dump(zh_index, f, ensure_ascii=False, indent=2)

    with open(os.path.join(DATA_DIR, "glossary_detail.json"), "w", encoding="utf-8") as f:
        json.dump(detail, f, ensure_ascii=False, indent=2)

    cedict = build_cedict(entries)
    with open(os.path.join(DATA_DIR, "cedict_min.json"), "w", encoding="utf-8") as f:
        json.dump(cedict, f, ensure_ascii=False, indent=2)

    print("Build summary")
    print(f"Domains queried: {len(DOMAINS)}")
    for domain, count in domain_stats.items():
        print(f"- {domain}: {count} raw rows")
    print(f"Total items fetched: {len(items)}")
    print(f"Entries with bilingual definitions: {len(entries)}")
    print(f"Entries dropped (missing bilingual definition): {missing}")


if __name__ == "__main__":
    main()
