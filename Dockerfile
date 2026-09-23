FROM node:22-alpine AS test

WORKDIR /app
COPY package.json ./
COPY dist ./dist
COPY tests ./tests
COPY demo.mjs server.mjs ai.mjs ./
RUN npm test

FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173

WORKDIR /app
COPY --from=test --chown=node:node /app/package.json ./package.json
COPY --from=test --chown=node:node /app/server.mjs ./server.mjs
COPY --from=test --chown=node:node /app/ai.mjs ./ai.mjs
COPY --from=test --chown=node:node /app/demo.mjs ./demo.mjs
COPY --from=test --chown=node:node /app/dist ./dist
COPY --from=test --chown=node:node /app/tests ./tests

USER node
EXPOSE 4173

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

CMD ["node", "server.mjs"]
