FROM tersect-base

WORKDIR /app
COPY ./backend /app/backend
COPY ./frontend /app/frontend
COPY ./common /app/common
COPY ./tbconfig.json /app/

WORKDIR /app/backend
RUN npm install && npm run build

EXPOSE 4300
CMD ["npm","run","start"]
