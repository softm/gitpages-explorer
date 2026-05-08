# Python Scripts

## gen_files_json.py

지정한 디렉토리를 분석해 검색/자료실/워드클라우드에 필요한 정적 데이터를 생성한다.

생성 파일:
- `files.json`: 전체 파일 트리, 통계, 확장자/그룹별 요약
- `files.html`: 선택 생성 가능한 독립 실행 트리형 파일 인덱스

기본 제외 디렉토리:
- `lib`
- `lib/baguetteBox`
- `python`

`index.html`, `dataroom.html`, `wordcloud.html`은 모두 루트 `files.json` 하나에서 시작한다. 루트 `files.json`은 전체 상세를 직접 담지 않고 하위 디렉토리의 `files.json` 경로를 참조하며, 브라우저가 필요한 하위 인덱스를 따라 읽어 화면용 데이터를 구성한다.

실행:

```bash
python3 python/gen_files_json.py
```

기본 실행은 현재 디렉토리와 모든 하위 디렉토리에 `files.json`을 생성한다.

특정 디렉토리만 갱신:

```bash
python3 python/gen_files_json.py 교육
python3 python/gen_files_json.py "방법로그/슈퍼상추.장돌뱅이"
```

위 명령은 지정 디렉토리와 모든 하위 디렉토리의 `files.json`을 생성한다.

단일 디렉토리의 `files.json`만 갱신:

```bash
python3 python/gen_files_json.py --no-re 교육
```

기본 명령은 한 번 전체를 스캔한 뒤 각 디렉토리에 manifest 형식의 `files.json`을 쓴다. 각 파일에는 직접 포함된 파일 목록과 하위 디렉토리 인덱스 참조, 재귀 요약값만 들어간다.

HTML 확인 페이지까지 함께 갱신:

```bash
python3 python/gen_files_json.py --outputs json,html .
```
