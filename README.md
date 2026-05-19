# Macro Stock Analyzer

거시경제 기반 한국 주식 테마 분석 대시보드 (네이버 증권 API)

## 실행 방법

```bash
# 개발 모드 (프론트: Vite, 백엔드: Express)
npm run dev

# 프로덕션 빌드
npm run build
npm start
```

## 배포 (Render.com 무료 티어)

### 1. GitHub에 푸시
```bash
git remote add origin https://github.com/<username>/macro-stock-analyzer.git
git push -u origin master
```

### 2. Render.com 배포
1. https://render.com 가입 (GitHub 계정 연동)
2. New Web Service → GitHub 저장소 선택
3. 설정:
   - Name: `macro-stock-analyzer`
   - Runtime: Node
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Free Instance Type 선택

### 3. 도메인
- 자동 생성: `https://macro-stock-analyzer.onrender.com`

## 관리자 계정
- ID: `ysk`
- PW: `admin`
(최초 서버 실행 시 자동 생성)

## API 엔드포인트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/health` | 헬스체크 |
| GET | `/api/quote/:codes` | 주식 시세 (네이버) |
| POST | `/api/auth/register` | 회원가입 |
| POST | `/api/auth/login` | 로그인 |
| GET | `/api/auth/me` | 내 정보 |
| GET/POST | `/api/posts` | 게시글 목록/작성 |
| GET/PUT/DELETE | `/api/posts/:id` | 게시글 상세/수정/삭제 |
| POST | `/api/posts/:id/comments` | 댓글 작성 |
