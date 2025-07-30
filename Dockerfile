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

RUN /opt/venv/bin/pip install --upgrade pip setuptools wheel \
 && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.venv.txt \
 && rm /tmp/requirements.venv.txt


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

# Install micromamba
ARG MAMBA_VERSION=1.5.8
ENV MAMBA_ROOT_PREFIX=/opt/conda
RUN curl -Ls https://micro.mamba.pm/api/micromamba/linux-64/${MAMBA_VERSION} \
  | tar -xvj -C /usr/local/bin --strip-components=1 bin/micromamba

# === Create the conda env from your environment.yml ===
# (choose one: environment.yml or environment-pip.yml)
COPY environment.yml /tmp/environment.yml
RUN micromamba create -y -n tersect -f /tmp/environment.yml && \
    micromamba clean -a -y

ENV PATH="/opt/venv/bin:/opt/conda/envs/tersect/bin:${PATH}"

RUN printf '%s\n' '#!/usr/bin/env bash' \
    'exec micromamba run -n tersect "$@"' > /usr/local/bin/conda-run && \
    chmod +x /usr/local/bin/conda-run

# Optional: shims so calling bcftools/beagle hits conda even though venv is first
RUN mkdir -p /usr/local/conda-shims && \
    printf '%s\n' '#!/usr/bin/env bash' 'exec micromamba run -n tersect bcftools "$@"' \
      > /usr/local/conda-shims/bcftools && chmod +x /usr/local/conda-shims/bcftools && \
    printf '%s\n' '#!/usr/bin/env bash' 'exec micromamba run -n tersect beagle "$@"' \
      > /usr/local/conda-shims/beagle && chmod +x /usr/local/conda-shims/beagle

# Prepend shim dir so these specific tools resolve to conda without changing code
ENV PATH="/usr/local/conda-shims:/opt/venv/bin:/opt/conda/envs/tersect/bin:${PATH}"

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
# Run inside the conda env to ensure all subprocesses use it
CMD ["npm","run","start"]
