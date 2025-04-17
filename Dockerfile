FROM --platform=linux/amd64 node:16

# 1) Install OS packages needed for building native CLI tools
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    wget \
    # ... anything else needed by rapidNJ
    && rm -rf /var/lib/apt/lists/*

# 2) Get the code for the custom CLI from its repository or from a local source
#    If you have a direct URL to a tarball, you could wget and unzip it instead
RUN git clone https://github.com/somme89/rapidNJ /tmp/rapidNJ
WORKDIR /tmp/rapidNJ

# 3) Build/Install the CLI
#    Commands will differ based on how `rapidNJ` is built

RUN make && ls -lah && ls ./bin/


RUN pwd

# Optionally run `make install` or copy the compiled binary:
RUN cp ./bin/rapidnj /usr/local/bin/rapidnj
# Make sure it's executable
RUN chmod +x /usr/local/bin/rapidnj

WORKDIR /app
RUN mkdir -p /tools

# 2) Copy the tersect tarball from your local build context into the image
#    (Assuming you have tersect-0.12.0-Linux.tar.gz in your backend folder or a path in the Docker build context)
COPY ./tersect-0.12.0-Linux.tar.gz /tools

# 3) Unpack the tar.gz and make the binary accessible
WORKDIR /tools

RUN tar -xzf tersect-0.12.0-Linux.tar.gz

RUN ls tersect-0.12.0-Linux/bin/tersect
RUN  chmod +x tersect-0.12.0-Linux/bin/tersect \
    && mv tersect-0.12.0-Linux/bin/tersect /usr/local/bin \
    && rm tersect-0.12.0-Linux.tar.gz
# If the binary has a different name, adjust accordingly

# 4) Copy your backend code
WORKDIR /app
COPY ./backend /app/backend
COPY ./frontend /app/frontend
COPY ./common /app/common
COPY ./tbconfig.json /app/

WORKDIR /app/backend

# 5) Install backend dependencies
RUN npm install

RUN npm run build

# 6) Expose your backend port (example: 3001)
EXPOSE 4300

# 7) Start the backend
CMD ["npm", "run", "start"]

