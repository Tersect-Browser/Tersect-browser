# Legacy genome-browser extension. Build context: repository root.
FROM node:22

WORKDIR /app
COPY extension/tersect-browser-extended/package.json extension/tersect-browser-extended/package-lock.json ./
RUN npm ci
COPY extension/tersect-browser-extended /app
COPY tbconfig.json /app/tbconfig.json

ENV HOST=0.0.0.0
ENV PORT=3200
EXPOSE 3200
CMD ["npm", "start"]
