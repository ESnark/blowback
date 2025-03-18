# Vite MCP Server

Vite 개발 서버에 Model Context Protocol(MCP) 서버를 추가하여 Cursor와의 통합을 지원합니다.

## 주요 기능

- Vite 개발 서버와 MCP 서버 통합
- 브라우저 콘솔 로그 캡처 및 MCP를 통한 전송
- 체크포인트 기반 로그 관리
- 순환 버퍼를 사용한 로그 저장 (최대 1000줄)
- 체크포인트별 로그 파일 관리 (최대 2개 체크포인트 유지)

## 설치

Cursor의 MCP 설정에 서버를 추가합니다:

```json
{
  "vite-hmr": {
    "command": "npx",
    "args": ["-y", "vite-mcp-server"]
  }
}
```

## Resources

### console-logs

브라우저 콘솔 로그를 조회하는 리소스입니다.

현재 Cursor에서는 지원되지 않으므로 `get-console-logs` tool을 사용하면 됩니다.

```typescript
// 로그 조회
const logs = await mcpServer.resource("console-logs", {
  checkpoint: "checkpoint-1", // 선택적: 특정 체크포인트의 로그만 조회
  limit: 10 // 선택적: 반환할 로그 개수 제한
});
```

## Tools

### HMR 도구

| 도구 이름 | 설명 |
|-----------|-------------|
| `init-vite-connection` | 프로젝트의 개발 서버에 연결합니다 |
| `get-hmr-events` | 최근 HMR 이벤트를 가져옵니다 |
| `check-hmr-status` | HMR 상태를 확인합니다 |

### 브라우저 도구

| 도구 이름 | 설명 |
|-----------|-------------|
| `start-browser` | 브라우저 인스턴스를 시작하고 Vite 개발 서버로 이동합니다 |
| `capture-screenshot` | 현재 페이지 또는 특정 요소의 스크린샷을 캡처합니다 |
| `get-element-properties` | 특정 요소의 속성 및 상태 정보를 가져옵니다 |
| `get-element-styles` | 특정 요소의 스타일 정보를 가져옵니다 |
| `get-element-dimensions` | 특정 요소의 치수 및 위치 정보를 가져옵니다 |
| `monitor-network` | 지정된 시간 동안 브라우저의 네트워크 요청을 모니터링합니다 |
| `get-element-html` | 특정 요소와 그 자식 요소의 HTML 내용을 가져옵니다 |
| `get-console-logs` | 브라우저 세션에서 콘솔 로그를 가져오며, 선택적으로 필터링이 가능합니다 |
| `execute-browser-commands` | 미리 정의된 브라우저 명령을 안전하게 실행합니다 |

## 로그 관리 시스템

- 브라우저의 console log를 캡쳐하여 파일에 저장하고 조회합니다
- 일반 로그와 체크포인트 로그가 각각 순환 버퍼 방식으로 1000줄까지 저장됩니다
- 체크포인트 로그는 체크포인트가 활성화 된 경우에만 저장됩니다

## 체크포인트 시스템

### 체크포인트 동작 방식
- 체크포인트는 특정 버전의 스냅샷, 로그, 스크린샷 등을 관리할 때 사용됩니다
- `head`에 `<meta name="__mcp_checkpoint" data-id="">`를 삽입하면 data-id 속성을 식별자로 하여 데이터를 별도로 기록합니다

## 아키텍처 및 데이터 흐름

### 핵심 구성 요소

1. **MCP 서버**: Cursor에 도구를 제공하는 Model Context Protocol SDK 기반의 중앙 모듈입니다.

2. **Vite HMR 클라이언트**: Vite 개발 서버와 WebSocket 연결을 설정 및 유지하며 HMR 이벤트를 구독합니다.

3. **브라우저 자동화**: Puppeteer를 사용하여 Chrome을 제어하고 변경 사항을 시각적으로 검사할 수 있게 합니다.

4. **체크포인트 시스템**: 비교 및 테스트를 위해 브라우저 상태의 스냅샷을 유지합니다.

### 데이터 소스 및 상태 관리

서버는 여러 중요한 데이터 저장소를 유지합니다:

- **HMR 이벤트 기록**: Vite에서 발생한 최근 HMR 이벤트(업데이트, 오류)를 추적합니다.
- **콘솔 메시지 로그**: 디버깅을 위한 브라우저 콘솔 출력을 캡처합니다.
- **체크포인트 저장소**: DOM 스냅샷을 포함한 브라우저 상태의 이름이 지정된 스냅샷을 저장합니다.

### 통신 흐름

1. **Vite → MCP 서버**: 
   - Vite는 파일이 변경될 때 WebSocket을 통해 실시간 HMR 이벤트를 전송합니다.
   - 이벤트에는 업데이트(성공적인 변경) 및 오류(컴파일 실패)가 포함됩니다.

2. **MCP 서버 → Cursor**:
   - 서버는 HMR 이벤트를 구조화된 응답으로 변환합니다.
   - Cursor가 HMR 상태를 쿼리하고 스크린샷을 캡처하는 등의 도구를 제공합니다.

3. **브라우저 → MCP 서버**:
   - 시각적 변경 사항은 Puppeteer를 통해 캡처됩니다.
   - 디버깅을 위해 콘솔 출력 및 오류가 수집됩니다.

### 상태 유지

서버는 다음에 대한 참조 객체를 유지합니다:
- 현재 브라우저 및 페이지 인스턴스
- 활성 Vite 클라이언트 연결
- 프로젝트 루트 경로
- 최근 HMR 이벤트
