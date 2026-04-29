FROM mcr.microsoft.com/playwright:v1.47.2-jammy

WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/orchestrator/package.json apps/orchestrator/package.json
COPY apps/executor/package.json apps/executor/package.json

RUN npm install

COPY packages packages
COPY apps apps

RUN npm run build

ENV NODE_ENV=production

