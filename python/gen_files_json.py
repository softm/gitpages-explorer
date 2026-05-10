#!/usr/bin/env python3
"""Generate searchable directory metadata for the current directory."""

from __future__ import annotations

import html
import argparse
import hashlib
import json
import mimetypes
import os
import re
import shutil
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote
import xml.etree.ElementTree as ET


ROOT = Path.cwd()
JSON_OUTPUT = ROOT / "files.json"
SELF = Path(__file__).resolve()
HTML_OUTPUT = ROOT / "files.html"
OLD_HTML_OUTPUT = ROOT / "index.html"
WORDCLOUD_HTML_OUTPUT = ROOT / "wordcloud.html"
PREVIEW_DIRNAME = ".viewer-previews"
GENERATED_NAMES = {"files.json", "files_info.json", "attach_files.json", "wordcloud.json", "files.html", "grant.json", "admin.json"}
EXCLUDED_NAMES = {".DS_Store", ".git", ".github", "__pycache__", *GENERATED_NAMES}
EXCLUDED_PATHS = {"lib", "lib/baguetteBox", "python", PREVIEW_DIRNAME}
OUTPUT_ALIASES = ("json", "html")
GRANT_FILENAME = "grant.json"
GRANT_OUTPUT = ROOT / GRANT_FILENAME
GRANT_RULES: dict[str, Any] = {"private_paths": []}
PREVIEWABLE_EXTENSIONS = {"hwp", "hwpx", "pptx"}


def iso_time(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).astimezone().isoformat(timespec="seconds")


def human_size(size: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    value = float(size)
    for unit in units:
        if value < 1024 or unit == units[-1]:
            return f"{value:.1f} {unit}" if unit != "B" else f"{int(value)} B"
        value /= 1024
    return f"{size} B"


def classify(path: Path) -> tuple[str, str]:
    ext = path.suffix.lower().lstrip(".") or "no-extension"
    mime, _ = mimetypes.guess_type(path.name)
    if mime:
        group = mime.split("/", 1)[0]
    elif ext in {"zip", "rar", "7z", "gz", "tar"}:
        group = "archive"
    elif ext in {"md", "txt", "csv", "json", "html", "css", "js", "py"}:
        group = "text"
    else:
        group = "other"
    return ext, group


def clean_extracted_text(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+\n", "\n", text.replace("\r\n", "\n").replace("\r", "\n"))).strip()


def xml_text_values(xml_bytes: bytes, tag_names: set[str]) -> list[str]:
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return []
    values: list[str] = []
    for elem in root.iter():
        local_name = elem.tag.rsplit("}", 1)[-1].lower()
        if local_name in tag_names and elem.text and elem.text.strip():
            values.append(elem.text.strip())
    return values


def extract_pptx_text(path: Path) -> str:
    parts: list[str] = []
    with zipfile.ZipFile(path) as archive:
        slide_names = sorted(
            (name for name in archive.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", name, re.I)),
            key=lambda name: int(re.search(r"slide(\d+)\.xml", name, re.I).group(1)),
        )
        for index, name in enumerate(slide_names, start=1):
            values = xml_text_values(archive.read(name), {"t"})
            if values:
                parts.append(f"[Slide {index}]\n" + "\n".join(values))
    return clean_extracted_text("\n\n".join(parts))


def extract_hwpx_text(path: Path) -> str:
    parts: list[str] = []
    with zipfile.ZipFile(path) as archive:
        names = sorted(
            name for name in archive.namelist()
            if name.lower().endswith(".xml") and re.match(r"contents?/", name, re.I)
        )
        for name in names:
            values = xml_text_values(archive.read(name), {"t", "text"})
            if values:
                parts.append("\n".join(values))
    return clean_extracted_text("\n\n".join(parts))


def extract_hwp_text(path: Path) -> str:
    hwp5txt = shutil.which("hwp5txt")
    if not hwp5txt:
        return ""
    try:
        result = subprocess.run(
            [hwp5txt, str(path)],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""
    return clean_extracted_text(result.stdout if result.returncode == 0 else result.stdout)


def preview_path_for(rel_path: str, ext: str) -> Path:
    digest = hashlib.sha1(rel_path.encode("utf-8")).hexdigest()[:16]
    return ROOT / PREVIEW_DIRNAME / f"{digest}.{ext}.txt"


def build_text_preview(path: Path, rel_path: str, ext: str) -> dict[str, Any] | None:
    if ext not in PREVIEWABLE_EXTENSIONS:
        return None
    extractors = {
        "hwp": extract_hwp_text,
        "hwpx": extract_hwpx_text,
        "pptx": extract_pptx_text,
    }
    try:
        text = extractors[ext](path)
    except (OSError, zipfile.BadZipFile, RuntimeError):
        text = ""
    if not text:
        return {"available": False, "kind": "text", "error": "no-text-extracted"}

    output_path = preview_path_for(rel_path, ext)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(text, encoding="utf-8")
    preview_rel = output_path.relative_to(ROOT).as_posix()
    return {
        "available": True,
        "kind": "text",
        "path": preview_rel,
        "size": output_path.stat().st_size,
        "size_human": human_size(output_path.stat().st_size),
    }


def is_private_name(name: str) -> bool:
    stem = Path(name).stem if "." in name else name
    return stem.endswith("-private")


def load_grant_rules(root: Path) -> dict[str, Any]:
    grant_path = root / GRANT_FILENAME
    if not grant_path.exists():
        return {"schema_version": 1, "private_paths": []}
    try:
        data = json.loads(grant_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"schema_version": 1, "private_paths": []}
    paths = data.get("private_paths", [])
    if not isinstance(paths, list):
        paths = []
    return {
        "schema_version": 1,
        "private_paths": sorted({str(path) for path in paths if str(path).strip()}),
    }


def write_grant_rules(root: Path, rules: dict[str, Any]) -> Path:
    grant_path = root / GRANT_FILENAME
    grant_path.write_text(
        json.dumps({
            "schema_version": 1,
            "private_paths": sorted({str(path) for path in rules.get("private_paths", []) if str(path).strip()}),
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return grant_path


def is_private_path(rel_path: str) -> bool:
    normalized = str(rel_path or ".")
    configured = set(GRANT_RULES.get("private_paths", []))
    if normalized in configured:
        return True
    parts = [part for part in normalized.split("/") if part and part != "."]
    return any(is_private_name(part) for part in parts)


def security_meta(rel_path: str) -> dict[str, Any]:
    private = is_private_path(rel_path)
    return {
        "private": private,
        "source": "suffix-or-grant" if private else "public",
    }


def new_directory_node(path: Path, rel_path: str, stat_result: os.stat_result | None) -> dict[str, Any]:
    modified = iso_time(stat_result.st_mtime) if stat_result else None
    return {
        "type": "directory",
        "name": path.name if rel_path != "." else ROOT.name,
        "path": rel_path,
        "modified": modified,
        "children": [],
        "file_count": 0,
        "directory_count": 0,
        "total_size": 0,
        "total_size_human": "0 B",
        "security": security_meta(rel_path),
    }


def scan_directory(path: Path, root: Path, errors: list[dict[str, str]]) -> dict[str, Any]:
    rel_path = "." if path == root else path.relative_to(root).as_posix()
    try:
        stat_result = path.stat()
    except OSError as exc:
        errors.append({"path": rel_path, "error": str(exc)})
        stat_result = None

    node = new_directory_node(path, rel_path, stat_result)
    try:
        entries = sorted(path.iterdir(), key=lambda item: (not item.is_dir(), item.name.casefold()))
    except OSError as exc:
        errors.append({"path": rel_path, "error": str(exc)})
        return node

    for entry in entries:
        if entry.name in EXCLUDED_NAMES or entry.resolve() in {SELF}:
            continue

        child_rel = entry.relative_to(root).as_posix()
        if child_rel in EXCLUDED_PATHS or any(child_rel.startswith(f"{excluded}/") for excluded in EXCLUDED_PATHS):
            continue
        try:
            if entry.is_dir():
                child = scan_directory(entry, root, errors)
                node["children"].append(child)
                node["file_count"] += child["file_count"]
                node["directory_count"] += child["directory_count"] + 1
                node["total_size"] += child["total_size"]
                continue

            stat_result = entry.stat()
            ext, group = classify(entry)
            file_node = {
                "type": "file",
                "name": entry.name,
                "path": child_rel,
                "extension": ext,
                "group": group,
                "mime_type": mimetypes.guess_type(entry.name)[0],
                "size": stat_result.st_size,
                "size_human": human_size(stat_result.st_size),
                "modified": iso_time(stat_result.st_mtime),
                "security": security_meta(child_rel),
            }
            preview = build_text_preview(entry, child_rel, ext)
            if preview:
                file_node["preview"] = preview
            node["children"].append(file_node)
            node["file_count"] += 1
            node["total_size"] += stat_result.st_size
        except OSError as exc:
            errors.append({"path": child_rel, "error": str(exc)})

    node["total_size_human"] = human_size(node["total_size"])
    return node


def flatten_files(node: dict[str, Any]) -> list[dict[str, Any]]:
    files: list[dict[str, Any]] = []
    for child in node.get("children", []):
        if child["type"] == "directory":
            files.extend(flatten_files(child))
        else:
            files.append(child)
    return files


def summarize(tree: dict[str, Any], files: list[dict[str, Any]]) -> dict[str, Any]:
    by_extension: dict[str, dict[str, Any]] = {}
    by_group: dict[str, dict[str, Any]] = {}

    for item in files:
        for bucket, key in ((by_extension, item["extension"]), (by_group, item["group"])):
            bucket.setdefault(key, {"count": 0, "size": 0, "size_human": "0 B"})
            bucket[key]["count"] += 1
            bucket[key]["size"] += item["size"]
            bucket[key]["size_human"] = human_size(bucket[key]["size"])

    largest = sorted(files, key=lambda item: item["size"], reverse=True)[:20]
    recent = sorted(files, key=lambda item: item["modified"], reverse=True)[:20]

    return {
        "root": str(ROOT),
        "generated_at": iso_time(datetime.now().timestamp()),
        "file_count": tree["file_count"],
        "directory_count": tree["directory_count"],
        "total_size": tree["total_size"],
        "total_size_human": tree["total_size_human"],
        "by_extension": dict(sorted(by_extension.items())),
        "by_group": dict(sorted(by_group.items())),
        "largest_files": largest,
        "recent_files": recent,
    }


def build_payload() -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    tree = scan_directory(ROOT, ROOT, errors)
    files = flatten_files(tree)
    return {
        "schema_version": 1,
        "summary": summarize(tree, files),
        "tree": tree,
        "files": files,
        "errors": errors,
    }


def child_index_path(child_path: str) -> str:
    return "files.json" if child_path == "." else f"{child_path}/files.json"


def manifest_for_node(node: dict[str, Any]) -> dict[str, Any]:
    direct_files = [child for child in node.get("children", []) if child.get("type") == "file"]
    child_dirs = [child for child in node.get("children", []) if child.get("type") == "directory"]
    rel_path = node["path"]
    root_path = ROOT if rel_path == "." else ROOT / rel_path

    shallow_children: list[dict[str, Any]] = []
    child_indexes: list[dict[str, Any]] = []
    for child in child_dirs:
        child_ref = {
            "type": "directory",
            "name": child["name"],
            "path": child["path"],
            "index": child_index_path(child["path"]),
            "modified": child.get("modified"),
            "file_count": child.get("file_count", 0),
            "directory_count": child.get("directory_count", 0),
            "total_size": child.get("total_size", 0),
            "total_size_human": child.get("total_size_human", "0 B"),
            "security": child.get("security", security_meta(child["path"])),
        }
        shallow_children.append(child_ref)
        child_indexes.append(child_ref.copy())

    shallow_children.extend(direct_files)

    return {
        "schema_version": 2,
        "index_type": "directory-manifest",
        "summary": {
            "root": str(root_path),
            "path": rel_path,
            "generated_at": iso_time(datetime.now().timestamp()),
            "file_count": node.get("file_count", 0),
            "directory_count": node.get("directory_count", 0),
            "direct_file_count": len(direct_files),
            "direct_directory_count": len(child_dirs),
            "total_size": node.get("total_size", 0),
            "total_size_human": node.get("total_size_human", "0 B"),
        },
        "tree": {
            "type": "directory",
            "name": node["name"],
            "path": rel_path,
            "index": child_index_path(rel_path),
            "modified": node.get("modified"),
            "children": shallow_children,
            "file_count": node.get("file_count", 0),
            "directory_count": node.get("directory_count", 0),
            "total_size": node.get("total_size", 0),
            "total_size_human": node.get("total_size_human", "0 B"),
            "security": node.get("security", security_meta(rel_path)),
        },
        "files": direct_files,
        "child_indexes": child_indexes,
        "errors": [],
    }


def write_manifest_files(node: dict[str, Any]) -> list[Path]:
    written: list[Path] = []
    rel_path = node["path"]
    output_dir = ROOT if rel_path == "." else ROOT / rel_path
    output_path = output_dir / "files.json"
    output_path.write_text(
        json.dumps(manifest_for_node(node), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    written.append(output_path)

    for child in node.get("children", []):
        if child.get("type") == "directory":
            written.extend(write_manifest_files(child))
    return written


def configure_root(root: Path) -> None:
    global ROOT, JSON_OUTPUT, HTML_OUTPUT, OLD_HTML_OUTPUT, WORDCLOUD_HTML_OUTPUT, GRANT_OUTPUT, GRANT_RULES

    ROOT = root.resolve()
    JSON_OUTPUT = ROOT / "files.json"
    HTML_OUTPUT = ROOT / "files.html"
    OLD_HTML_OUTPUT = ROOT / "index.html"
    WORDCLOUD_HTML_OUTPUT = ROOT / "wordcloud.html"
    GRANT_OUTPUT = ROOT / GRANT_FILENAME
    GRANT_RULES = load_grant_rules(ROOT)


def file_link(path: str) -> str:
    return quote(path, safe="/.#-_%()[]{}@!$&'*,;=+~ ")


def tree_to_html(node: dict[str, Any]) -> str:
    children = node.get("children", [])
    if node["type"] == "file":
        href = file_link(node["path"])
        return (
            f'<li data-name="{html.escape(node["name"].lower())}" data-path="{html.escape(node["path"].lower())}">'
            f'<a href="{html.escape(href)}" title="{html.escape(node["path"])}">'
            f'<span class="icon file">file</span>{html.escape(node["name"])}</a>'
            f'<span class="meta">{html.escape(node["size_human"])} · {html.escape(node["extension"])}</span></li>'
        )

    open_attr = " open" if node["path"] == "." else ""
    label = f'{html.escape(node["name"])} <span class="meta">{node["file_count"]} files · {node["total_size_human"]}</span>'
    content = "".join(tree_to_html(child) for child in children)
    return f"<li><details{open_attr}><summary><span class=\"icon dir\">dir</span>{label}</summary><ul>{content}</ul></details></li>"


def generate_html(payload: dict[str, Any]) -> str:
    summary = payload["summary"]
    group_rows = "\n".join(
        f"<tr><td>{html.escape(group)}</td><td>{data['count']:,}</td><td>{html.escape(data['size_human'])}</td></tr>"
        for group, data in sorted(summary["by_group"].items(), key=lambda item: item[1]["count"], reverse=True)
    )
    largest_rows = "\n".join(
        f'<tr><td><a href="{html.escape(file_link(item["path"]))}">{html.escape(item["path"])}</a></td>'
        f"<td>{html.escape(item['size_human'])}</td><td>{html.escape(item['modified'])}</td></tr>"
        for item in summary["largest_files"][:10]
    )
    tree_markup = tree_to_html(payload["tree"])
    escaped_root = html.escape(summary["root"])

    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>파일 인덱스</title>
  <style>
    :root {{ color-scheme: light; --bg:#f7f8f5; --panel:#fff; --text:#20231f; --muted:#667064; --line:#dfe5dc; --accent:#2f6f4e; }}
    * {{ box-sizing: border-box; }}
    body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--bg); color:var(--text); }}
    header {{ padding:28px 32px 18px; border-bottom:1px solid var(--line); background:var(--panel); }}
    h1 {{ margin:0 0 8px; font-size:28px; letter-spacing:0; }}
    .root {{ color:var(--muted); font-size:14px; word-break:break-all; }}
    main {{ padding:24px 32px 40px; max-width:1280px; margin:0 auto; }}
    .stats {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:20px; }}
    .stat {{ background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }}
    .label {{ color:var(--muted); font-size:13px; }}
    .value {{ margin-top:6px; font-size:24px; font-weight:700; }}
    .layout {{ display:grid; grid-template-columns:minmax(0,1fr) 360px; gap:18px; align-items:start; }}
    section {{ background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:18px; }}
    h2 {{ margin:0 0 14px; font-size:18px; }}
    input {{ width:100%; height:40px; border:1px solid var(--line); border-radius:6px; padding:0 12px; font-size:15px; margin-bottom:14px; }}
    ul {{ list-style:none; margin:0; padding-left:18px; }}
    .tree > ul {{ padding-left:0; }}
    li {{ margin:4px 0; line-height:1.5; }}
    summary {{ cursor:pointer; user-select:none; }}
    a {{ color:var(--accent); text-decoration:none; overflow-wrap:anywhere; }}
    a:hover {{ text-decoration:underline; }}
    .icon {{ display:inline-flex; width:36px; height:20px; align-items:center; justify-content:center; border-radius:4px; margin-right:8px; font-size:11px; font-weight:700; }}
    .dir {{ background:#e2efe6; color:#255b3d; }}
    .file {{ background:#edf0f2; color:#596069; }}
    .meta {{ color:var(--muted); font-size:12px; margin-left:8px; }}
    table {{ width:100%; border-collapse:collapse; font-size:14px; }}
    th, td {{ text-align:left; border-bottom:1px solid var(--line); padding:9px 4px; vertical-align:top; }}
    th {{ color:var(--muted); font-weight:600; }}
    .hidden {{ display:none; }}
    @media (max-width: 900px) {{ header, main {{ padding-left:16px; padding-right:16px; }} .layout {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
  <header>
    <h1>파일 인덱스</h1>
    <div class="root">{escaped_root}</div>
  </header>
  <main>
    <div class="stats">
      <div class="stat"><div class="label">파일</div><div class="value">{summary['file_count']:,}</div></div>
      <div class="stat"><div class="label">디렉토리</div><div class="value">{summary['directory_count']:,}</div></div>
      <div class="stat"><div class="label">전체 용량</div><div class="value">{html.escape(summary['total_size_human'])}</div></div>
      <div class="stat"><div class="label">생성 시각</div><div class="value" style="font-size:15px">{html.escape(summary['generated_at'])}</div></div>
    </div>
    <div class="layout">
      <section class="tree">
        <h2>디렉토리 구조</h2>
        <input id="search" type="search" placeholder="파일명 또는 경로 검색">
        <ul>{tree_markup}</ul>
      </section>
      <aside>
        <section>
          <h2>파일 종류</h2>
          <table><thead><tr><th>종류</th><th>개수</th><th>용량</th></tr></thead><tbody>{group_rows}</tbody></table>
        </section>
        <section style="margin-top:18px">
          <h2>큰 파일 Top 10</h2>
          <table><thead><tr><th>경로</th><th>용량</th><th>수정일</th></tr></thead><tbody>{largest_rows}</tbody></table>
        </section>
      </aside>
    </div>
  </main>
  <script>
    const search = document.getElementById('search');
    search.addEventListener('input', () => {{
      const query = search.value.trim().toLowerCase();
      document.querySelectorAll('[data-path]').forEach((item) => {{
        const visible = !query || item.dataset.path.includes(query) || item.dataset.name.includes(query);
        item.classList.toggle('hidden', !visible);
      }});
      if (query) document.querySelectorAll('details').forEach((details) => details.open = true);
    }});
  </script>
</body>
</html>
"""


def normalize_outputs(value: str) -> set[str]:
    requested = {item.strip() for item in (value or "json").split(",") if item.strip()}
    if "all" in requested:
        return set(OUTPUT_ALIASES)
    invalid = requested - set(OUTPUT_ALIASES)
    if invalid:
        raise SystemExit(f"Invalid output value: {', '.join(sorted(invalid))}")
    return requested


def iter_target_roots(targets: list[Path], recursive_targets: bool) -> list[Path]:
    seen: set[Path] = set()
    roots: list[Path] = []

    def add(root: Path) -> None:
        resolved = root.resolve()
        if resolved in seen:
            return
        seen.add(resolved)
        roots.append(resolved)

    for target in targets:
        if not target.exists() or not target.is_dir():
            raise SystemExit(f"Target is not a directory: {target}")
        add(target)
        if recursive_targets:
            for child in sorted(target.rglob("*"), key=lambda item: item.as_posix()):
                if child.is_dir() and child.name not in EXCLUDED_NAMES:
                    add(child)

    return roots


def update_grant_for_root(root: Path, add_paths: list[str], remove_paths: list[str], list_only: bool) -> bool:
    rules = load_grant_rules(root)
    paths = {str(path) for path in rules.get("private_paths", []) if str(path).strip()}
    for path in add_paths:
        paths.add(str(Path(path).as_posix()).strip())
    for path in remove_paths:
        paths.discard(str(Path(path).as_posix()).strip())
    changed = bool(add_paths or remove_paths)
    rules["private_paths"] = sorted(path for path in paths if path)
    if changed:
        written = write_grant_rules(root, rules)
        print(f"Grant updated: {written}")
    if list_only or changed:
        print(f"\nGrant: {root / GRANT_FILENAME}")
        if rules["private_paths"]:
            for path in rules["private_paths"]:
                print(f"- {path}")
        else:
            print("(empty)")
    return changed or list_only


def write_outputs(payload: dict[str, Any], outputs: set[str], recursive_targets: bool = False) -> list[Path]:
    written: list[Path] = []
    if "json" in outputs:
        if recursive_targets:
            written.extend(write_manifest_files(payload["tree"]))
        else:
            JSON_OUTPUT.write_text(
                json.dumps(manifest_for_node(payload["tree"]), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            written.append(JSON_OUTPUT)
    if "html" in outputs:
        HTML_OUTPUT.write_text(generate_html(payload), encoding="utf-8")
        written.append(HTML_OUTPUT)
    return written


def generate_for_root(root: Path, outputs: set[str], recursive_targets: bool = False) -> dict[str, Any]:
    configure_root(root)
    payload = build_payload()
    written = write_outputs(payload, outputs, recursive_targets)
    summary = payload["summary"]
    print(f"\nTarget: {ROOT}")
    print(f"Generated: {len(written):,} file(s)")
    print(f"Files: {summary['file_count']:,}")
    print(f"Directories: {summary['directory_count']:,}")
    print(f"Total size: {summary['total_size_human']}")
    if payload["errors"]:
        print(f"Warnings: {len(payload['errors'])} paths could not be read")
    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate searchable file metadata for one or more target directories."
    )
    parser.add_argument(
        "targets",
        nargs="*",
        type=Path,
        default=[Path.cwd()],
        help="Target directory paths. Defaults to the current working directory.",
    )
    parser.add_argument(
        "--recursive-targets",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Generate outputs for each target and every child directory. Enabled by default; use --no-recursive-targets for only the target directory.",
    )
    parser.add_argument(
        "--no-re",
        action="store_true",
        help="Alias for --no-recursive-targets.",
    )
    parser.add_argument(
        "--outputs",
        default="json",
        help="Comma-separated outputs to write: json,html,all. Defaults to json.",
    )
    parser.add_argument("--grant-list", action="store_true", help="List private paths from grant.json and exit.")
    parser.add_argument("--grant-add", action="append", default=[], help="Add a private path to grant.json.")
    parser.add_argument("--grant-remove", action="append", default=[], help="Remove a private path from grant.json.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.no_re:
        args.recursive_targets = False
    outputs = normalize_outputs(args.outputs)
    target_roots = iter_target_roots(args.targets, False)

    print(f"Targets: {len(target_roots):,}")
    for target_root in target_roots:
        if update_grant_for_root(target_root, args.grant_add, args.grant_remove, args.grant_list):
            if args.grant_list and not args.grant_add and not args.grant_remove:
                continue
        generate_for_root(target_root, outputs, args.recursive_targets)


if __name__ == "__main__":
    main()
