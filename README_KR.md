# Blowback

> Vite MCP Server에서 Blowback로 이름이 변경되었습니다.
>
> Blowback은 Vite 이외의 다양한 FE 개발 환경을 지원하기 위해 만들어졌습니다.

FE 개발 서버를 Claude Desktop, Cursor 등의 AI 도구와 통합하는 Model Context Protocol(MCP) 서버입니다.

## How to Use

커맨드 (Claude Code):
```bash
claude mcp add blowback -s project -e PROJECT_ROOT=/path/to/your/project -- npx -y blowback-context
```

또는 json 설정:
- Claude Code: `{PROJECT_ROOT}/.mcp.json`
- Cursor: `{PROJECT_ROOT}/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "blowback": {
      "command": "npx",
      "args": ["-y", "blowback-context"],
      "env": {
        "PROJECT_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

### 환경 변수

- `PROJECT_ROOT`: 프로젝트 루트 경로 (선택사항, 기본값: 현재 작업 디렉토리)
- `ENABLE_BASE64`: base64 인코딩된 이미지를 tool 응답에 포함 (기본값 false / 사용하는 경우 토큰 사용량 및 컨텍스트 윈도우에 영향을 줍니다)

## 주요 기능

- 로컬 개발 서버와 MCP 서버 통합
- 브라우저 콘솔 로그 캡처 및 MCP를 통한 전송
- 체크포인트 기반 로그 관리
- 스크린샷 캡처 및 SQLite 데이터베이스 관리
- HMR(Hot Module Replacement) 이벤트 모니터링
- 브라우저 자동화 및 요소 검사

## init 프롬프트

`init` 프롬프트는 AI가 다음 기능들을 효과적으로 사용할 수 있도록 가이드를 제공합니다:

**Cursor Chat** 에서는 MCP 프롬프트 기능을 지원하지 않으므로 이 기능을 사용할 수 없습니다. (Claude Code 권장)
필요한 경우 다음 프롬프트를 수동으로 입력하세요


> head에 `<meta name="__mcp_checkpoint" data-id="">`를 삽입하여 현재 상태의 명명된 스냅샷을 생성하는 체크포인트 기능을 사용할 수 있습니다.
> data-id 속성은 체크포인트의 고유 식별자입니다.
>
> 체크포인트가 활성화된 동안 브라우저에서 생성된 콘솔 로그는 체크포인트 ID로 태그되어 개별적으로 조회할 수 있습니다.
>
> 참고: 일부 개발환경에서는 파일 저장 시 hot reload가 트리거되므로, 메타 태그 변경과 관찰하려는 변경 사항 간의 순서를 신중히 고려하세요. 추적하려는 변경 사항을 만들기 전에 체크포인트 메타 태그를 설정해야 합니다.
>
> capture-screenshot 도구를 사용하여 스크린샷을 캡처할 수 있습니다. 캡처된 스크린샷은 @.mcp_screenshot/ 디렉토리에 저장됩니다.

## Tools

### HMR 도구

| 도구 이름 | 설명 |
|-----------|-------------|
| `get-hmr-events` | 최근 HMR 이벤트를 가져옵니다 |
| `check-hmr-status` | HMR 상태를 확인합니다 |

> **참고**: HMR 연결은 필수가 아닌 선택입니다. 브라우저가 시작되면 자동으로 HMR 이벤트 모니터링이 시작됩니다.

### 브라우저 도구

| 도구 이름 | 설명 |
|-----------|-------------|
| `start-browser` | 브라우저 인스턴스를 시작하고 개발 서버로 이동합니다. HMR 모니터링이 자동으로 시작됩니다 |
| `capture-screenshot` | 현재 페이지 또는 특정 요소의 스크린샷을 캡처합니다. 스크린샷 ID와 리소스 URI를 반환합니다 |
| `get-element-properties` | 특정 요소의 속성 및 상태 정보를 가져옵니다 |
| `get-element-styles` | 특정 요소의 스타일 정보를 가져옵니다 |
| `get-element-dimensions` | 특정 요소의 치수 및 위치 정보를 가져옵니다 |
| `monitor-network` | 지정된 시간 동안 브라우저의 네트워크 요청을 모니터링합니다 |
| `get-element-html` | 특정 요소와 그 자식 요소의 HTML 내용을 가져옵니다 |
| `get-console-logs` | 브라우저 세션에서 콘솔 로그를 가져오며, 선택적으로 필터링이 가능합니다 |
| `execute-browser-commands` | 미리 정의된 브라우저 명령을 안전하게 실행합니다 |

### 도움말 도구

| 도구 이름 | 설명 |
|-----------|-------------|
| `how-to-use` | 서버의 특정 기능 사용법에 대한 설명을 제공합니다 |

## Resources

### screenshots

모든 캡처된 스크린샷을 조회하는 리소스입니다. `capture-screenshot` tool로 캡쳐된 이미지의 참조 id를 여러 기준으로 조회할 수 있습니다.

참조 id에 해당하는 이미지는 `{PROJECT_ROOT}/.mcp_screenshot/` 디렉토리에서 관리됩니다.

- URI: `screenshot://`
- 모든 스크린샷 목록을 반환합니다

### screenshot-by-url

URL 경로를 기반으로 특정 스크린샷을 조회하는 리소스입니다.

> **참고**: 1.0 버전부터는 리소스를 통한 Blob 응답을 기본적으로 비활성화하고, 파일 참조 정보를 반환합니다.

- URI 템플릿: `screenshot://{+path}`
- 예시: `screenshot://localhost:5173/about`
- 프로토콜(http://, https://)을 포함하지 않은 URL 경로를 사용합니다


## 데이터 저장 구조

### 스크린샷 저장
- 스크린샷 이미지: `{PROJECT_ROOT}/.mcp_screenshot/` 디렉토리에 저장
- 메타데이터: 임시 디렉토리의 SQLite 데이터베이스에서 관리
- `.mcp_screenshot/` 디렉토리를 `.gitignore`에 추가하는 것을 권장합니다

### 로그 관리 시스템
- 브라우저의 console log를 캡쳐하여 파일에 저장하고 조회합니다
- 체크포인트 로그는 체크포인트가 활성화 된 경우에만 저장됩니다

## 체크포인트 시스템

### 체크포인트 동작 방식
- 체크포인트는 특정 버전의 스냅샷, 로그, 스크린샷 등을 관리할 때 사용됩니다
- `head`에 `<meta name="__mcp_checkpoint" data-id="">`를 삽입하면 data-id 속성을 식별자로 하여 데이터를 별도로 기록합니다

## 아키텍처 및 데이터 흐름

### 핵심 구성 요소

1. **MCP 서버**: AI 도구에 도구와 리소스를 제공하는 Model Context Protocol SDK 기반의 중앙 모듈입니다.

2. **브라우저 자동화**: Playwright를 사용하여 Chrome을 제어하고 변경 사항을 시각적으로 검사할 수 있게 합니다.

3. **체크포인트 시스템**: 비교 및 테스트를 위해 브라우저 상태의 스냅샷을 유지합니다.

4. **SQLite 데이터베이스**: 스크린샷 메타데이터를 효율적으로 관리하고 URL 기반으로 빠르게 조회합니다.

### 데이터 소스 및 상태 관리

서버는 여러 중요한 데이터 저장소를 유지합니다:

- **HMR 이벤트 기록**: 개발 서버에서 발생한 최근 HMR 이벤트(업데이트, 오류)를 추적합니다.
- **콘솔 메시지 로그**: 디버깅을 위한 브라우저 콘솔 출력을 캡처합니다.
- **체크포인트 저장소**: DOM 스냅샷을 포함한 브라우저 상태의 이름이 지정된 스냅샷을 저장합니다.
- **스크린샷 저장소**: 프로젝트 디렉토리에 이미지를 저장하고 SQLite로 메타데이터를 관리합니다.

### 통신 흐름

1. **MCP Client → 개발 서버**:
   - MCP Client가 소스 코드를 변경하고 개발 서버가 변경을 감지합니다
   - 개발 서버가 자동으로 브라우저를 업데이트하거나 HMR 이벤트를 발생시킵니다

2. **웹 브라우저 → MCP Server**:
   - HMR 이벤트와 콘솔 로그가 Playwright를 통해 캡처됩니다
   - MCP 서버가 브라우저의 현재 상태를 쿼리하거나 스크린샷을 캡처합니다

3. **MCP Server → MCP Client**:
   - 서버가 HMR 이벤트를 구조화된 응답으로 변환합니다
   - MCP Client가 HMR 상태를 쿼리하고 스크린샷을 캡처하는 등의 도구를 제공합니다

### 상태 유지

서버는 다음에 대한 참조 객체를 유지합니다:
- 현재 브라우저 및 페이지 인스턴스
- 최근 HMR 이벤트
