# Gemini CLI Project Instructions: gitpages-explorer

이 파일은 `gitpages-explorer` 프로젝트의 아키텍처, 주요 구성 요소 및 개발 워크플로우를 정의합니다. 이 프로젝트에서 작업할 때는 다음 지침을 엄격히 준수하십시오.

## 1. 프로젝트 개요
`gitpages-explorer`는 대규모 파일 저장소를 정적 웹 환경(GitHub Pages 등)에서 효율적으로 탐색, 검색 및 열람할 수 있게 해주는 도구입니다. 서버 사이드 백엔드 없이 Python으로 생성된 정적 JSON 인덱스를 사용하여 동작합니다.

## 2. 핵심 아키텍처
### 2.1. 인덱스 생성 (Python)
- **도구:** `python/gen_files_json.py`
- **역할:**
    - 파일 시스템을 스캔하여 디렉토리별 `files.json` 매니페스트 생성.
    - 문서(`hwp`, `hwpx`, `pptx`)에서 텍스트를 추출하여 `.viewer-previews/`에 저장.
    - 보안 정책(`grant.json` 및 `-private` 접미사)에 따른 비공개 처리.
- **실행:** `python3 python/gen_files_json.py`

### 2.2. 프론트엔드 (JavaScript)
- **로딩 전략:** 루트 `files.json`부터 시작하여 필요한 디렉토리의 인덱스를 재귀적으로 로드하는 Lazy Loading 방식.
- **주요 모듈:**
    - `lib/files-index-utils.js`: 인덱스 로딩 및 검색 데이터 가공.
    - `lib/document-viewer.js`: 브라우저 내 문서 렌더링 (HWPJS, Office Online Viewer 연동 등).
    - `lib/attachment-utils.js`: 다중 도메인(`evernote.softm.net` 등) 첨부 파일 URL 처리.

## 3. 개발 가이드라인
- **데이터 업데이트:** 파일 구조가 변경되면 반드시 `python/gen_files_json.py`를 실행하여 인덱스를 갱신해야 합니다.
- **보안:** 민감한 정보가 포함된 폴더나 파일명 끝에 `-private`을 붙이거나 `grant.json`에 등록하여 정적 인덱스 노출을 방지합니다.
- **의존성:** 프론트엔드는 가급적 외부 라이브러리를 최소화하며, 필요한 경우 `lib/` 폴더 내에 로컬로 관리합니다.

## 4. 자동화 (GitHub Actions)
- `.github/workflows/run-python.yml` 파일이 push 이벤트를 감지하여 자동으로 인덱스를 재생성하고 커밋합니다.
- 직접 인덱스 파일을 커밋하기보다 원본 데이터를 push하여 자동화를 활용하는 것을 권장합니다.

## 5. 주요 파일 및 디렉토리
- `/index.html`: 메인 검색 인터페이스
- `/dataroom.html`: 자료실 스타일 탐색기
- `/lib/`: 공통 JavaScript 유틸리티 및 라이브러리
- `/python/`: 인덱스 생성 스크립트
- `/.viewer-previews/`: 추출된 텍스트 프리뷰 파일 저장소 (커밋 포함)


## 공통
- 중요한 내용으로 판단한 경우, GEMINI.md에 내용 추가
- 코드를 수정,추가한 경우 한줄 변경은 코드 끝에 한줄 주석으로 수정한 내용 (설명 + 날짜)과 함께 표시 (prefix : SOFTM-"키워드"), 여러줄일 경우 블럭주석으로 시작과 끝영역을 표시하고 주석처리한다.
- 설명은 한글로 해줘
- "커밋해줘","커밋" 명령시 : Git Commit message Rule : "codex_" + versionCode + "_" + "수정내용" + "_날짜시분초"
