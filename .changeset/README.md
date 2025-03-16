# Changesets

이 디렉토리는 [changesets](https://github.com/changesets/changesets) CLI에 의해 관리됩니다.

변경 사항을 기록하고 릴리스를 관리하기 위해 다음 명령어를 사용하세요:

## 변경 사항 생성하기

새로운 변경 사항을 기록하려면 다음 명령어를 실행하세요:

```bash
npm run changeset
```

이 명령은 변경 유형(major, minor, patch)과 변경 내용에 대한 설명을 요청합니다.

## 버전 업데이트하기

기록된 변경 사항을 기반으로, 버전을 업데이트하려면 다음 명령어를 실행하세요:

```bash
npm run version
```

## 릴리스하기

새 버전을 npm에 배포하려면 다음 명령어를 실행하세요:

```bash
npm run release
```

이 명령은 먼저 프로젝트를 빌드한 후 changeset을 사용하여 npm에 배포합니다. 