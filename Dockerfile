# Backend API. In development the repository is bind-mounted at /app
# (docker-compose.yml), so source changes are picked up without rebuilding
# (tsx watch). The image is also complete on its own: the production stack
# (deploy/compose) runs it without a mount and overrides the command.
FROM tersect-base

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY common /app/common
COPY backend /app/backend
# Defaults; deployments override them with TB_* environment variables.
COPY tbconfig.example.json /app/tbconfig.json

EXPOSE 4300
CMD ["npm", "start"]
