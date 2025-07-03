FROM node:23
WORKDIR /app
COPY . /app
COPY ../../tbconfig.json /app/tbconfig.json
RUN npm install

# tell CRA to listen on all interfaces
ENV HOST 0.0.0.0
ENV PORT 3200

EXPOSE 3200
CMD ["npm", "start"]
