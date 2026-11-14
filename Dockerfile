# Backend API. The repository is bind-mounted at /app in docker-compose.yml,
# so source changes are picked up without rebuilding (tsx watch).
FROM tersect-base

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY common /app/common
COPY backend /app/backend

EXPOSE 4300
CMD ["npm", "start"]
