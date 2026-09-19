# spongemap-81a6e Firebase 연결

## 현재 상태
코드는 배포 준비용입니다. Firebase에 로그인·배포하지 않았고 실제 OpenAI 호출도 검증하지 않았습니다.
firebase-client.js의 SPONGE_CLOUD_ENABLED=false가 기본값이므로 기존 GitHub Pages 대화 방식은 유지됩니다.
이 값을 서버 준비 전에 true로 바꾸지 마세요.
Firebase 웹 apiKey는 공개 설정이며 OpenAI 비밀 키가 아닙니다. Analytics는 초기화하지 않습니다.

## 콘솔에서 준비
1. 프로젝트 spongemap-81a6e의 Blaze 결제 계정을 연결합니다.
2. Firestore의 (default) 데이터베이스를 만듭니다. 기존 DB가 있다면 그대로 사용합니다.
3. Authentication > 로그인 방법에서 익명, 이메일/비밀번호를 켭니다.
4. Authentication > 사용자에서 관리자 계정을 추가합니다. 공개 가입된 일반 계정에는 관리자 권한이 부여되지 않습니다.
5. 그 관리자의 UID로 Firestore에 spongemapAdmins/{UID} 문서를 만들고 enabled를 boolean true로 설정합니다.
6. Authentication 승인 도메인에 lovewinsall78.github.io를 등록합니다.
7. 이 서버 전용 컬렉션에 클라이언트 쓰기·읽기를 허용하지 마세요:
   spongemapAdmins, spongemapConfig, spongemapDays, spongemapVisitors, spongemapSessions, spongemapRequests.
   아래 파일의 규칙 예시를 기존 규칙에 병합하고, 광범위한 allow 규칙이 이 경로를 허용하지 않는지 확인하세요.
   기존 프로젝트 규칙을 덮어쓰는 배포는 포함하지 않았습니다.

## 맥북 터미널에서 배포
Node.js 22와 Firebase CLI가 필요합니다. 저장소 루트에서:
```sh
npm install -g firebase-tools
firebase login
npm --prefix firebase/functions install
npm --prefix firebase/functions test
firebase functions:secrets:set OPENAI_API_KEY --project spongemap-81a6e
firebase deploy --only functions:spongemapApi --project spongemap-81a6e
```
OPENAI_API_KEY 입력 프롬프트에 실제 OpenAI 비밀 키를 넣습니다. GitHub 파일·채팅·일반 Firestore 설정에는 넣지 마세요.
배포 시 OPENAI_MODEL을 물으면 해당 OpenAI 프로젝트에서 사용 가능한 모델명을 입력하세요. 기본값은 gpt-4o-mini이며 접근 가능 여부를 보장하지 않습니다.
이름이 같은 기존 spongemapApi 함수가 있다면 먼저 충돌 여부를 확인하세요.
Functions codebase는 spongemap이며 다른 사이트/함수/Firestore 규칙은 이 배포 대상이 아닙니다.

## 게시와 점검
1. GitHub Pages admin.html > Firebase > 관리자 계정으로 로그인.
2. 대화단계 탭에서 각 단계의 질문·선택지를 확인하고 단계 저장.
3. 장소 탭에 실제 운영할 안성 장소를 등록. 기존 맥북 브라우저에서 진행하면 로컬 데이터를 활용할 수 있습니다.
4. Firebase 탭에서 '이 브라우저 설정을 공통 설정으로 게시'.
5. 운영 활성화 전에 테스트용 복사본의 firebase-client.js에서 SPONGE_CLOUD_ENABLED=true로 바꾸어 테스트합니다.
   CORS 허용 출처는 GitHub와 이 프로젝트의 Firebase Hosting입니다.
6. 비밀 키가 없는 휴대폰에서 끝까지 진행, 관리자 통합 사용량 증가, 오류·중복 요청·관리자 권한을 확인.
7. 검증 후 GitHub의 firebase-client.js도 true로 변경.
서버 오류 때 브라우저 비밀 키로 조용히 우회하지 않습니다.

## 운영 범위와 한계
- 중앙 설정은 새 대화 시작 시 불러옵니다. 인트로 설정은 페이지를 다시 열 때 반영됩니다.
- 관리자 로컬 '저장' 뒤 Firebase 탭의 '게시'를 해야 전체 기기에 반영됩니다.
- 기존 브라우저 기록은 중앙 집계에 소급 포함하지 않습니다.
- 서버는 AI 응답의 실제 usage만 집계하며 대화 원문과 사용자 사진을 Firestore에 저장하지 않습니다.
- 한국 날짜 기준 전역 하루 200회, 익명 Firebase UID당 50회, 1.5초 간격을 서버 트랜잭션으로 제한합니다.
- 익명 UID는 재생성될 수 있어 실제 사람 인증이 아닙니다. 큰 행사 공개 전 App Check/초대 코드와 추가 남용 방지를 검토하세요.
- 80% 토큰 알림은 로컬 메뉴와 별개입니다. 중앙 화면은 우선 실제 합계를 보여줍니다. 토큰 하드 한도는 구현하지 않았습니다.
- Functions 중단 시 pending 요청이 남을 수 있으므로 비용은 OpenAI 사용량과 대조합니다.
- 모델 권한 403은 Firebase 연결만으로 해결되지 않습니다.
- 요청·세션·방문자 기록에 자동 삭제 정책은 아직 없습니다. 행사 후 보관기간을 정해 관리하세요.
