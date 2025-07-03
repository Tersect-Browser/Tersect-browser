FROM --platform=linux/amd64 node:16

# 1) Install OS packages: build tools + Python3/venv + Conda prerequisites
RUN apt-get update && apt-get install -y \
    git build-essential wget cmake flex bison \
    python3 python3-venv bzip2 ca-certificates \
    gfortran \
    libopenblas-dev \
    liblapack-dev \
  && rm -rf /var/lib/apt/lists/*

# 2) Create a small Python venv for pure-Python pip packages
RUN python3 -m venv /opt/venv
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# 3) Install pip-only requirements into the venv
COPY backend/src/scripts/requirements.venv.txt /tmp/requirements.venv.txt

RUN pip install --upgrade pip setuptools wheel \
 && pip install --no-cache-dir -r /tmp/requirements.venv.txt \
 && rm /tmp/requirements.venv.txt
# RUN pip install --no-cache-dir -r /tmp/requirements.venv.txt \
#  && rm /tmp/requirements.venv.txt

# 4) Install Miniconda into /opt/conda
# RUN wget -qO /tmp/miniconda.sh https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh \
#  && bash /tmp/miniconda.sh -b -p /opt/conda \
#  && rm /tmp/miniconda.sh \
#  && /opt/conda/bin/conda clean -afy

# 5) Make 'conda' available on $PATH
# ENV PATH="/opt/conda/bin:$PATH"

# 6) Create the Conda env (bioenv) from your environment file
# Copy the Conda‐spec file (your requirements.txt)
# COPY backend/src/scripts/requirements.txt /tmp/conda-spec.txt

# # Create the bioenv environment from that spec
# RUN conda create -n bioenv --file /tmp/conda-spec.txt -y \
#  && conda clean -afy \
#  && rm /tmp/conda-spec.txt

# # 7) Prepend the Conda env's bin directory so its tools are on the PATH too
# #    (we leave the venv first so pip/python still resolve into /opt/venv)
# ENV PATH="/opt/venv/bin:/opt/conda/envs/bioenv/bin:$PATH"

# 8) Build rapidNJ from source
RUN git clone https://github.com/somme89/rapidNJ /tmp/rapidNJ \
 && cd /tmp/rapidNJ \
 && make \
 && install -m755 ./bin/rapidnj /usr/local/bin/rapidnj \
 && rm -rf /tmp/rapidNJ

# 9) Build Tersect from source (out-of-source)
RUN git clone https://github.com/tomkurowski/tersect.git /tmp/tersect \
 && mkdir /tmp/tersect/build \
 && cd /tmp/tersect/build \
 && cmake .. \
 && make \
 && make install \
 && rm -rf /tmp/tersect

# 10) Copy & build your Node app
WORKDIR /app
COPY ./backend /app/backend
COPY ./frontend /app/frontend
COPY ./common /app/common
COPY ./tbconfig.json /app/

WORKDIR /app/backend
RUN npm install
RUN npm run build

# 11) Expose & run
EXPOSE 4300
CMD ["npm", "run", "start"]
