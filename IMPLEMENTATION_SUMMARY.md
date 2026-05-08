# 구현 현황 정리

작성일: 2026-05-08

## 목표

임의의 파일/디렉토리 기반 자료 저장소를 스캔해 정적 인덱스로 정보화하고, 브라우저에서 검색어 입력, 결과 탐색, 첨부 파일 확인이 가능한 웹 자료실 기반을 구축한다.

현재 작업 디렉토리는 `/Users/softm/Work/farm`이고 예시 데이터가 농장/교육/구매/재배 로그를 많이 포함하지만, 구현 자체는 특정 주제나 디렉토리명에 종속되지 않는다. 어떤 저장소든 파일과 디렉토리 구조가 있으면 `python/gen_files_json.py`로 인덱스를 만들고, GitHub Pages에서 `https://<계정>.github.io/<레포명>/` 형태로 접근해 탐색할 수 있는 정적 웹 페이지를 제공하는 것이 핵심이다.

기존 프로젝트의 `index.html`, `dataroom.html` 형태를 참고해 정적 HTML + JavaScript + Python 인덱스 생성 + GitHub Actions 자동 갱신 방식으로 구성했다.

## 현재 구성

### 주요 화면

- `index.html`
  - 메인 검색/탐색 화면.
  - 디렉토리 노트를 중심으로 목록을 보여주고, 선택한 항목의 내용과 첨부를 확인한다.
  - 검색어, 제목 검색, 첨부 유형 필터를 지원한다.

- `dataroom.html`
  - 자료실 화면.
  - 파일/디렉토리 목록과 우측 탐색기를 제공한다.
  - 이미지, 동영상, 오디오, 문서 첨부를 유형별로 필터링한다.
  - 선택 상태, 검색 조건, 뷰어 상태를 URL query/history에 반영한다.

- `wordcloud.html`
  - 파일명과 경로를 토큰화해 워드클라우드 형태로 표시한다.
  - 태그를 클릭하면 `index.html` 검색으로 이동한다.

- `admin.html`
  - `grant.json` 기반의 비공개 경로 관리 화면.
  - `-private`, 개인정보/계약/계좌 등 민감 패턴 후보를 검출한다.
  - 기본 로그인 정보는 `admin.json`의 `admin / admin` 구조를 사용한다.

### 공통 JavaScript

- `lib/files-index-utils.js`
  - `files.json`을 로드하고, 하위 디렉토리의 `files.json`을 재귀적으로 병합한다.
  - 디렉토리 노트, 첨부 목록, 워드클라우드 데이터를 생성한다.

- `lib/attachment-utils.js`
  - 첨부 파일 URL 생성, 이미지 lazy loading, 호스트별 첨부 도메인 규칙을 담당한다.

- `lib/index-page.js`
  - 메인 화면의 검색, 필터, 디렉토리 탐색, 첨부 미리보기, 공유 기능 등을 처리한다.

- `lib/dataroom-page.js`
  - 자료실 화면의 파일 검색, 필터, 뷰어, 디렉토리 브라우저, 히스토리 복원 기능을 처리한다.

- `lib/wordcloud-page.js`
  - 워드클라우드 렌더링과 태그 검색 이동을 처리한다.

- `lib/admin-page.js`
  - 관리자 로그인, 민감 경로 후보 표시, `grant.json` 저장/다운로드를 처리한다.

## 인덱스 생성 구조

### Python 스크립트

`python/gen_files_json.py`가 현재 구현의 핵심 생성 도구다.

주요 역할:

- 대상 디렉토리와 하위 파일을 스캔한다.
- 파일명, 경로, 확장자, MIME 타입, 그룹, 크기, 수정일을 수집한다.
- 디렉토리별 파일 수, 하위 디렉토리 수, 전체 용량을 계산한다.
- 각 디렉토리에 `files.json` manifest를 생성한다.
- 선택적으로 `files.html` 확인용 인덱스 페이지를 생성한다.
- `grant.json`과 `-private` 접미사를 기준으로 비공개 여부를 메타데이터에 반영한다.

실행:

```bash
python3 python/gen_files_json.py
```

특정 디렉토리 갱신:

```bash
python3 python/gen_files_json.py 교육
python3 python/gen_files_json.py "방법로그/슈퍼상추.장돌뱅이"
```

단일 디렉토리만 갱신:

```bash
python3 python/gen_files_json.py --no-re 교육
```

HTML 확인 페이지 포함:

```bash
python3 python/gen_files_json.py --outputs json,html .
```

## GitHub 자동 갱신 구조

`.github/workflows/run-python.yml`을 통해 GitHub에 push하면 인덱스가 자동 갱신되도록 구성했다.

동작 흐름:

1. `main` 브랜치에 push한다.
2. GitHub Actions가 Ubuntu runner에서 저장소를 checkout한다.
3. Python 3.x를 설정한다.
4. 아래 명령을 실행해 `files.json`과 `files.html`을 생성한다.

```bash
python python/gen_files_json.py --outputs json,html .
```

5. 생성된 `files.json`, `files.html` 변경분을 git에 추가한다.
6. 변경이 있으면 `github-actions[bot]` 계정으로 `Update generated file indexes` 커밋을 만들고 다시 push한다.
7. GitHub Pages가 활성화되어 있으면 갱신된 정적 파일을 기준으로 웹 자료실이 제공된다.

워크플로우 특징:

- push 대상 브랜치: `main`
- 수동 실행: `workflow_dispatch` 지원
- 권한: `contents: write`
- `files.json`, `files.html`만 변경된 push는 `paths-ignore`로 다시 실행하지 않아 반복 실행을 방지한다.
- `github.actor != 'github-actions[bot]'` 조건으로 bot 커밋에 의한 무한 루프를 추가로 방지한다.

GitHub Pages 접근:

```text
https://<github-id>.github.io/<repository-name>/
```

예를 들어 저장소명이 `farm`이면 일반적으로 다음 형태가 된다.

```text
https://<github-id>.github.io/farm/
```

GitHub Pages 설정에서 배포 소스를 저장소의 정적 파일이 있는 브랜치/경로로 지정하면 `index.html`, `dataroom.html`, `wordcloud.html`, `admin.html`을 웹에서 사용할 수 있다.

### `files.json` 형식

현재 루트 `files.json`은 `schema_version: 2`, `index_type: directory-manifest` 형식이다.

루트 파일에는 전체 상세 목록을 모두 담지 않고 다음 정보를 담는다.

- 현재 디렉토리의 직접 파일 목록
- 하위 디렉토리별 `files.json` 참조
- 재귀 요약값
- 보안 메타데이터

브라우저에서는 `FilesIndexUtils.loadIndex('files.json')`가 하위 `files.json`을 따라가며 필요한 데이터를 병합한다. 이 방식으로 루트 JSON이 너무 커지는 문제를 줄이고, 디렉토리별 부분 갱신이 가능해졌다.

## 현재 데이터 규모

현재 `/Users/softm/Work/farm` 예시 저장소의 2026-05-06 20:53:54 기준 루트 `files.json` 요약:

- 파일: 6,122개
- 디렉토리: 341개
- 전체 용량: 23.0 GB
- 루트 직접 파일: 8개
- 루트 직접 하위 디렉토리: 12개
- 하위 인덱스 참조: 12개

## 검색/탐색 기능

현재 구현된 검색 축:

- 검색어 기반 검색
- 제목/전체 범위 선택
- 이미지, 동영상, 오디오, 문서 유형 필터
- 유형별 확장자 세부 필터
- 선택 항목 URL 상태 보존
- 자료실 모달 뷰어 이전/다음 이동
- 디렉토리 브라우저 뷰 모드
- 워드클라우드 태그 기반 검색 이동

지원 첨부 유형:

- 이미지: `jpg`, `jpeg`, `png`, `gif`, `bmp`, `webp`, `svg`
- 동영상: `mp4`, `mov`, `webm`, `ogv`, `mkv`, `avi`, `flv`, `wmv`
- 오디오: `mp3`, `m4a`, `aac`, `ogg`, `wav`, `flac`, `3gp`, `wma`
- 문서: `pdf`, `doc`, `docx`, `ppt`, `pptx`, `xls`, `xlsx`, `csv`, `txt`, `md`, `hwp`

## 보안/비공개 처리

비공개 판단 방식:

- 경로 일부가 `-private`으로 끝나면 비공개 처리한다.
- `grant.json`의 `private_paths`에 등록된 경로를 비공개 처리한다.
- 생성된 각 파일/디렉토리 노드에 `security.private`와 `security.source`를 기록한다.

관리 화면:

- `admin.html`에서 민감 후보를 확인하고 `grant.json`에 추가/삭제할 수 있다.
- 브라우저 보안 제한 때문에 파일은 저장 대화상자 또는 다운로드 방식으로 저장한다.

## 제외 대상

Python 인덱스 생성 시 기본 제외:

- `.DS_Store`
- `.git`
- `__pycache__`
- 생성 산출물: `files.json`, `files_info.json`, `attach_files.json`, `wordcloud.json`, `files.html`, `grant.json`, `admin.json`
- 코드/라이브러리 디렉토리: `lib`, `lib/baguetteBox`, `python`

## 산출물

주요 산출물:

- 루트 및 각 하위 디렉토리의 `files.json`
- 선택 생성 가능한 `files.html`
- 메인 검색 페이지 `index.html`
- 자료실 페이지 `dataroom.html`
- 워드클라우드 페이지 `wordcloud.html`
- 관리자 페이지 `admin.html`
- 보안 설정 파일 `grant.json`
- 관리자 설정 파일 `admin.json`
- GitHub Actions 워크플로우 `.github/workflows/run-python.yml`

## 다음 작업 후보

- `index.html`과 `dataroom.html`의 중복 검색/필터 UI를 공통 컴포넌트화.
- 검색 점수화 개선: 파일명 일치, 디렉토리명 일치, 확장자 일치에 가중치 적용.
- `security.private` 항목을 일반 화면에서 숨김/마스킹하는 정책 확정.
- `grant.json` 저장 후 인덱스 재생성까지 연결하는 운영 절차 정리.
- 대용량 이미지/동영상 썸네일 생성 전략 검토.
- `admin.json` 기본 비밀번호 변경 및 배포 전 인증 방식 강화.
- GitHub Pages 활성화 절차와 권장 저장소 설정 문서화.
- 범용 템플릿으로 쓰기 쉽도록 프로젝트명/타이틀/기본 메뉴를 설정 파일화.
