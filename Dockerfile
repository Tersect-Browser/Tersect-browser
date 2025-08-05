# FROM --platform=linux/amd64 node:16

# # Use the Debian archive for buster
# RUN sed -i -e 's|http://deb.debian.org/debian|http://archive.debian.org/debian|g' \
#            -e 's|http://security.debian.org/debian-security|http://archive.debian.org/debian-security|g' \
#            /etc/apt/sources.list \
#  && printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99no-check-valid


# # 1) Install OS packages: build tools + Python3/venv + Conda prerequisites
# RUN apt-get update && apt-get install -y \
#     git build-essential wget cmake flex bison \
#     python3 python3-venv bzip2 ca-certificates \
#     gfortran \
#     libopenblas-dev \
#     liblapack-dev \
#     openjdk-11-jre-headless \
#   && rm -rf /var/lib/apt/lists/*

# # 2) Create a small Python venv for pure-Python pip packages
# RUN python3 -m venv /opt/venv
# ENV VIRTUAL_ENV=/opt/venv
# ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# # 3) Install pip-only requirements into the venv
# COPY backend/src/scripts/requirements.venv.txt /tmp/requirements.venv.txt

# RUN /opt/venv/bin/pip install --upgrade pip setuptools wheel \
#  && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.venv.txt \
#  && rm /tmp/requirements.venv.txt


# # 8) Build rapidNJ from source
# RUN git clone https://github.com/somme89/rapidNJ /tmp/rapidNJ \
#  && cd /tmp/rapidNJ \
#  && make \
#  && install -m755 ./bin/rapidnj /usr/local/bin/rapidnj \
#  && rm -rf /tmp/rapidNJ

# # 9) Build Tersect from source (out-of-source)
# RUN git clone https://github.com/tomkurowski/tersect.git /tmp/tersect \
#  && mkdir /tmp/tersect/build \
#  && cd /tmp/tersect/build \
#  && cmake .. \
#  && make \
#  && make install \
#  && rm -rf /tmp/tersect

# # Install micromamba
# ARG MAMBA_VERSION=1.5.8
# ENV MAMBA_ROOT_PREFIX=/opt/conda
# RUN curl -Ls https://micro.mamba.pm/api/micromamba/linux-64/${MAMBA_VERSION} \
#   | tar -xvj -C /usr/local/bin --strip-components=1 bin/micromamba

# # === Create the conda env from your environment.yml ===
# # (choose one: environment.yml or environment-pip.yml)
# COPY environment.yml /tmp/environment.yml
# RUN micromamba create -y -n tersect -f /tmp/environment.yml && \
#     micromamba clean -a -y

# ENV PATH="/opt/venv/bin:/opt/conda/envs/tersect/bin:${PATH}"

# RUN printf '%s\n' '#!/usr/bin/env bash' \
#     'exec micromamba run -n tersect "$@"' > /usr/local/bin/conda-run && \
#     chmod +x /usr/local/bin/conda-run

# # Optional: shims so calling bcftools/beagle hits conda even though venv is first
# RUN mkdir -p /usr/local/conda-shims && \
#     printf '%s\n' '#!/usr/bin/env bash' 'exec micromamba run -n tersect bcftools "$@"' \
#       > /usr/local/conda-shims/bcftools && chmod +x /usr/local/conda-shims/bcftools && \
#     printf '%s\n' '#!/usr/bin/env bash' 'exec micromamba run -n tersect beagle "$@"' \
#       > /usr/local/conda-shims/beagle && chmod +x /usr/local/conda-shims/beagle

# # Prepend shim dir so these specific tools resolve to conda without changing code
# ENV PATH="/usr/local/conda-shims:/opt/venv/bin:/opt/conda/envs/tersect/bin:${PATH}"

# ENV PHYLONET_HOME=/opt/phylonet
# RUN mkdir -p "$PHYLONET_HOME"
# COPY ./PhyloNet.jar ${PHYLONET_HOME}/PhyloNet.jar
# ENV PHYLONET_JAR=${PHYLONET_HOME}/PhyloNet.jar

# # Convenient wrapper to call "phylonet"
# RUN printf '%s\n' '#!/usr/bin/env bash' \
#     'exec java ${PHYLONET_JAVA_OPTS} -jar "${PHYLONET_JAR}" "$@"' \
#     > /usr/local/bin/phylonet && chmod +x /usr/local/bin/phylonet

# # Before your Julia package install step
# # Install a real 'conda' inside the tersect env (you already have this)
# RUN micromamba install -y -n tersect -c conda-forge conda \
#  && /opt/conda/envs/tersect/bin/conda --version

# # ✅ Call Julia WITHOUT micromamba run, and pass CONDA_JL_CONDA_EXE inline
# RUN CONDA_JL_CONDA_EXE=/opt/conda/envs/tersect/bin/conda \
#     /opt/conda/envs/tersect/bin/julia -e 'using Pkg; Pkg.add(["PhyloNetworks","PhyloPlots","Compose","Cairo"]); Pkg.precompile()'
# # 10) Copy & build your Node app
# WORKDIR /app
# COPY ./backend /app/backend
# COPY ./frontend /app/frontend
# COPY ./common /app/common
# COPY ./tbconfig.json /app/

# WORKDIR /app/backend
# RUN npm install
# RUN npm run build

# # 11) Expose & run
# EXPOSE 4300
# # Run inside the conda env to ensure all subprocesses use it
# CMD ["npm","run","start"]


# # ---------------------------
# # Stage 0: Build Julia + deps
# # ---------------------------
# FROM --platform=linux/amd64 node:16 AS juliapkgs

# # Use Debian archive mirrors (buster is EOL)
# RUN sed -i -e 's|http://deb.debian.org/debian|http://archive.debian.org/debian|g' \
#            -e 's|http://security.debian.org/debian-security|http://archive.debian.org/debian-security|g' \
#            /etc/apt/sources.list \
#  && printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99no-check-valid

# RUN apt-get update && apt-get install -y \
#     curl ca-certificates \
#  && rm -rf /var/lib/apt/lists/*

# # Install official Julia tarball in this clean stage
# ARG JULIA_VERSION=1.10.5
# ENV JULIA_HOME=/opt/julia
# RUN curl -fsSL https://julialang-s3.julialang.org/bin/linux/x64/1.10/julia-${JULIA_VERSION}-linux-x86_64.tar.gz \
#  | tar -xz -C /opt \
#  && mv /opt/julia-${JULIA_VERSION} ${JULIA_HOME}
# ENV PATH="${JULIA_HOME}/bin:${PATH}"

# # Preinstall packages (depot kept outside $HOME so we can copy it)
# ENV JULIA_DEPOT_PATH=/opt/julia_depot
# RUN julia -e 'using Pkg; Pkg.add(["PhyloNetworks","PhyloPlots","Compose","Cairo"]); Pkg.precompile()'


# # --------------------------------
# # Stage 1: Your backend application
# # --------------------------------
# FROM --platform=linux/amd64 node:16

# # Use the Debian archive for buster
# RUN sed -i -e 's|http://deb.debian.org/debian|http://archive.debian.org/debian|g' \
#            -e 's|http://security.debian.org/debian-security|http://archive.debian.org/debian-security|g' \
#            /etc/apt/sources.list \
#  && printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99no-check-valid

# # 1) OS packages
# RUN apt-get update && apt-get install -y \
#     git build-essential wget curl cmake flex bison \
#     python3 python3-venv bzip2 ca-certificates \
#     gfortran libopenblas-dev liblapack-dev \
#     openjdk-11-jre-headless \
#   && rm -rf /var/lib/apt/lists/*

# # 2) Legacy Python venv
# RUN python3 -m venv /opt/venv
# ENV VIRTUAL_ENV=/opt/venv
# ENV PATH="/opt/venv/bin:${PATH}"

# # 3) Pip requirements into the venv
# COPY backend/src/scripts/requirements.venv.txt /tmp/requirements.venv.txt
# RUN /opt/venv/bin/pip install --upgrade pip setuptools wheel \
#  && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.venv.txt \
#  && rm /tmp/requirements.venv.txt

# # 4) Build rapidNJ
# RUN git clone https://github.com/somme89/rapidNJ /tmp/rapidNJ \
#  && cd /tmp/rapidNJ && make \
#  && install -m755 ./bin/rapidnj /usr/local/bin/rapidnj \
#  && rm -rf /tmp/rapidNJ

# # 5) Build Tersect
# RUN git clone https://github.com/tomkurowski/tersect.git /tmp/tersect \
#  && mkdir /tmp/tersect/build && cd /tmp/tersect/build \
#  && cmake .. && make && make install \
#  && rm -rf /tmp/tersect

# # 6) Micromamba + conda env
# ARG MAMBA_VERSION=1.5.8
# ENV MAMBA_ROOT_PREFIX=/opt/conda
# RUN curl -Ls https://micro.mamba.pm/api/micromamba/linux-64/${MAMBA_VERSION} \
#   | tar -xvj -C /usr/local/bin --strip-components=1 bin/micromamba

# COPY environment.yml /tmp/environment.yml
# RUN micromamba create -y -n tersect -f /tmp/environment.yml && micromamba clean -a -y

# # Helper + shims; keep venv first so legacy code uses it by default
# RUN printf '%s\n' '#!/usr/bin/env bash' \
#     'exec micromamba run -n tersect "$@"' > /usr/local/bin/conda-run && chmod +x /usr/local/bin/conda-run

# RUN mkdir -p /usr/local/conda-shims && \
#     printf '%s\n' '#!/usr/bin/env bash' 'exec micromamba run -n tersect bcftools "$@"' \
#       > /usr/local/conda-shims/bcftools && chmod +x /usr/local/conda-shims/bcftools && \
#     printf '%s\n' '#!/usr/bin/env bash' 'exec micromamba run -n tersect beagle "$@"' \
#       > /usr/local/conda-shims/beagle && chmod +x /usr/local/conda-shims/beagle

# # PATH order: shims -> venv -> conda
# ENV PATH="/usr/local/conda-shims:/opt/venv/bin:/opt/conda/envs/tersect/bin:${PATH}"

# # 7) PhyloNet JAR + wrapper
# ENV PHYLONET_HOME=/opt/phylonet
# RUN mkdir -p "$PHYLONET_HOME"
# COPY ./PhyloNet.jar ${PHYLONET_HOME}/PhyloNet.jar
# ENV PHYLONET_JAR=${PHYLONET_HOME}/PhyloNet.jar
# RUN printf '%s\n' '#!/usr/bin/env bash' \
#     'exec java ${PHYLONET_JAVA_OPTS} -jar "${PHYLONET_JAR}" "$@"' \
#     > /usr/local/bin/phylonet && chmod +x /usr/local/bin/phylonet

# # 8) Bring in Julia runtime + preinstalled packages from stage 0
# COPY --from=juliapkgs /opt/julia /opt/julia
# COPY --from=juliapkgs /opt/julia_depot /opt/julia_depot
# ENV JULIA_DEPOT_PATH=/opt/julia_depot
# # Put Julia on PATH (ahead of system)
# ENV PATH="/opt/julia/bin:/usr/local/conda-shims:/opt/venv/bin:/opt/conda/envs/tersect/bin:${PATH}"

# # Bind RCall to the R inside the 'tersect' env
# RUN bash -lc 'R_HOME=$(/opt/conda/envs/tersect/bin/R RHOME); \
#               echo "R_HOME=$R_HOME"; \
#               R_HOME="$R_HOME" /opt/julia/bin/julia -e "import Pkg; Pkg.build(\"RCall\"); using PhyloNetworks,PhyloPlots; println(\"julia+RCall OK\")"'


# # 9) App code
# WORKDIR /app
# COPY ./backend /app/backend
# COPY ./frontend /app/frontend
# COPY ./common /app/common
# COPY ./tbconfig.json /app/

# WORKDIR /app/backend
# RUN npm install && npm run build

# # 10) Expose & run
# EXPOSE 4300
# CMD ["npm","run","start"]






# ---------------------------
# Stage 0: Julia + packages
# ---------------------------
FROM --platform=linux/amd64 julia:1.10-bullseye AS juliapkgs

# Put the depot somewhere we can COPY later
ENV JULIA_DEPOT_PATH=/opt/julia_depot

# Preinstall Julia packages (no R needed here)
RUN julia -e 'using Pkg; Pkg.add(["PhyloNetworks","PhyloPlots","Compose","Cairo"]); Pkg.precompile()'

# Force-download the MbedTLS artifact (libmbedcrypto) into the depot
RUN julia -e 'using MbedTLS_jll, Libdl; println("mbedcrypto=", Libdl.dlpath("libmbedcrypto"))'



# --------------------------------
# Stage 1: your backend application
# --------------------------------
FROM --platform=linux/amd64 node:16-bullseye

# 1) OS packages
RUN apt-get update && apt-get install -y \
    git build-essential wget curl cmake flex bison \
    python3 python3-venv bzip2 ca-certificates \
    gfortran libopenblas-dev liblapack-dev \
    openjdk-11-jre-headless \
 && rm -rf /var/lib/apt/lists/*

# 2) Legacy Python venv (kept first for your old code)
RUN python3 -m venv /opt/venv
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

# 3) Pip requirements into the venv
COPY backend/src/scripts/requirements.venv.txt /tmp/requirements.venv.txt
RUN /opt/venv/bin/pip install --upgrade pip setuptools wheel \
 && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.venv.txt \
 && rm /tmp/requirements.venv.txt

# 4) Build rapidNJ
RUN git clone https://github.com/somme89/rapidNJ /tmp/rapidNJ \
 && cd /tmp/rapidNJ && make \
 && install -m755 ./bin/rapidnj /usr/local/bin/rapidnj \
 && rm -rf /tmp/rapidNJ

# 5) Build Tersect
RUN git clone https://github.com/tomkurowski/tersect.git /tmp/tersect \
 && mkdir /tmp/tersect/build \
 && cd /tmp/tersect/build \
 && cmake .. -DCMAKE_C_FLAGS="-fcommon" \
 && make -j$(nproc) \
 && make install \
 && rm -rf /tmp/tersect


# 6) Micromamba + conda env (make sure environment.yml includes r-base and any R pkgs you need)
ARG MAMBA_VERSION=1.5.8
ENV MAMBA_ROOT_PREFIX=/opt/conda
RUN curl -Ls https://micro.mamba.pm/api/micromamba/linux-64/${MAMBA_VERSION} \
  | tar -xvj -C /usr/local/bin --strip-components=1 bin/micromamba

COPY environment.yml /tmp/environment.yml
RUN micromamba create -y -n tersect -f /tmp/environment.yml && micromamba clean -a -y

# Helper + shims; PATH order: shims -> venv -> conda (Julia will be added later)
RUN printf '%s\n' '#!/usr/bin/env bash' \
    'exec micromamba run -n tersect "$@"' > /usr/local/bin/conda-run && chmod +x /usr/local/bin/conda-run

RUN mkdir -p /usr/local/conda-shims && \
    printf '%s\n' '#!/usr/bin/env bash' 'exec micromamba run -n tersect bcftools "$@"' \
      > /usr/local/conda-shims/bcftools && chmod +x /usr/local/conda-shims/bcftools && \
    printf '%s\n' '#!/usr/bin/env bash' 'exec micromamba run -n tersect beagle "$@"' \
      > /usr/local/conda-shims/beagle && chmod +x /usr/local/conda-shims/beagle

ENV PATH="/usr/local/conda-shims:/opt/venv/bin:/opt/conda/envs/tersect/bin:${PATH}"

# 7) PhyloNet JAR + wrapper
ENV PHYLONET_HOME=/opt/phylonet
RUN mkdir -p "$PHYLONET_HOME"
COPY ./PhyloNet.jar ${PHYLONET_HOME}/PhyloNet.jar
ENV PHYLONET_JAR=${PHYLONET_HOME}/PhyloNet.jar
RUN printf '%s\n' '#!/usr/bin/env bash' \
    'exec java ${PHYLONET_JAVA_OPTS} -jar "${PHYLONET_JAR}" "$@"' \
    > /usr/local/bin/phylonet && chmod +x /usr/local/bin/phylonet

ARG JULIA_VERSION=1.10.5
RUN set -eux; \
    curl -fsSL "https://julialang-s3.julialang.org/bin/linux/x64/${JULIA_VERSION%.*}/julia-${JULIA_VERSION}-linux-x86_64.tar.gz" \
      | tar -xz -C /opt; \
    ln -s /opt/julia-${JULIA_VERSION} /opt/julia; \
    ln -sf /opt/julia/bin/julia /usr/local/bin/julia; \
    # sanity: prove the binary runs here
    /usr/local/bin/julia -e 'using InteractiveUtils; versioninfo()'

RUN R_HOME=$(/opt/conda/envs/tersect/bin/R RHOME) \
 && echo "R_HOME=$R_HOME" \
 && env -u LD_LIBRARY_PATH R_HOME="$R_HOME" /usr/local/bin/julia -e 'import Pkg; Pkg.add("RCall"); Pkg.build("RCall"); using RCall; println("RCall OK")'


# after installing Julia:
RUN env -u LD_LIBRARY_PATH /usr/local/bin/julia -e 'using InteractiveUtils; versioninfo()'

# add packages without Conda’s LD_LIBRARY_PATH
RUN env -u LD_LIBRARY_PATH /usr/local/bin/julia -e 'using Pkg; Pkg.add(["PhyloNetworks","PhyloPlots","Compose","Cairo", "ArgParse"]); Pkg.precompile()'

# touch a JLL to materialize artifacts with the clean loader
RUN env -u LD_LIBRARY_PATH /usr/local/bin/julia -e 'using MbedTLS_jll, Libdl; println("mbedcrypto=", Libdl.dlpath("libmbedcrypto"))'



              # 10) App code
WORKDIR /app
COPY ./backend /app/backend
COPY ./frontend /app/frontend
COPY ./common /app/common
COPY ./tbconfig.json /app/

WORKDIR /app/backend
RUN npm install && npm run build

# 11) Expose & run
EXPOSE 4300
CMD ["npm","run","start"]
