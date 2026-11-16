#!/usr/bin/env bash
# Build the three images of the production stack (deploy/compose) for
# linux/amd64 and push them to a registry.
set -euo pipefail

usage() {
    cat <<'USAGE'
Usage: deploy/scripts/push-images.sh [options] REGISTRY [TAG]

Builds the web, backend and pipeline images for linux/amd64 and pushes them as

    REGISTRY/web:TAG   REGISTRY/backend:TAG   REGISTRY/pipeline:TAG

REGISTRY  the registry and path in front of the image names: the "registry"
          output of the Terraform environments, or any registry you can push to.
            AWS ECR            123456789012.dkr.ecr.eu-west-2.amazonaws.com/tersect
            Artifact Registry  europe-west2-docker.pkg.dev/my-project/tersect
            other              ghcr.io/my-org/tersect
TAG       the image tag. Default: `git describe --tags --always --dirty`.
          Use a new tag for every release: the deployment notices a release
          by its tag (image_tag in terraform.tfvars).

Options:
  --no-login       do not log in to the registry (you already are)
  --build-only     build and tag, do not push
  --rebuild-base   rebuild the tersect-base image even when it exists
  --only NAMES     comma-separated subset of web,backend,pipeline
  -h, --help       show this text

Login is automatic for ECR (needs the aws CLI and credentials) and Artifact
Registry (needs gcloud and a login). For any other registry run
`docker login` first.

The backend is built FROM the local image "tersect-base" (Dockerfile.base,
linux/amd64 only). It is built first when missing; on Apple Silicon that runs
under emulation and takes a long time once.

Examples:
  deploy/scripts/push-images.sh "$(terraform -chdir=deploy/terraform/environments/aws output -raw registry)" 1.0.0
  deploy/scripts/push-images.sh --only web ghcr.io/my-org/tersect
USAGE
}

die() { echo "push-images: $*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

login=1
push=1
rebuild_base=0
only="web,backend,pipeline"
positional=()

while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help) usage; exit 0 ;;
        --no-login) login=0 ;;
        --build-only) push=0; login=0 ;;
        --rebuild-base) rebuild_base=1 ;;
        --only) [ $# -ge 2 ] || die "--only needs a value"; only="$2"; shift ;;
        --only=*) only="${1#--only=}" ;;
        --) shift; positional+=("$@"); break ;;
        -*) usage >&2; die "unknown option: $1" ;;
        *) positional+=("$1") ;;
    esac
    shift
done

if [ "${#positional[@]}" -lt 1 ] || [ "${#positional[@]}" -gt 2 ]; then
    usage >&2
    exit 2
fi

registry="${positional[0]%/}"
case "$registry" in
    *://*) die "REGISTRY must not include a scheme (https://): $registry" ;;
    *[[:space:]]*|"") die "REGISTRY is empty or contains spaces" ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

if [ "${#positional[@]}" -eq 2 ]; then
    tag="${positional[1]}"
else
    tag="$(git describe --tags --always --dirty 2>/dev/null)" \
        || die "no TAG given and git describe failed; pass a tag"
fi
[[ "$tag" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] \
    || die "not a valid image tag: $tag (letters, digits, underscore, dot, hyphen)"

IFS=',' read -r -a names <<< "$only"
for name in "${names[@]}"; do
    case "$name" in
        web|backend|pipeline) ;;
        *) die "--only: unknown image '$name' (web, backend, pipeline)" ;;
    esac
done

command -v docker >/dev/null 2>&1 || die "docker is not installed"
docker info >/dev/null 2>&1 || die "the Docker daemon is not running"

platform=linux/amd64
host="${registry%%/*}"

# --- Login -------------------------------------------------------------------

if [ "$login" -eq 1 ]; then
    case "$host" in
        *.dkr.ecr.*.amazonaws.com|*.dkr.ecr.*.amazonaws.com.cn)
            command -v aws >/dev/null 2>&1 || die "the aws CLI is needed to log in to ECR (or log in yourself and pass --no-login)"
            region="$(printf '%s' "$host" | sed -E 's/^[0-9]+\.dkr\.ecr\.([a-z0-9-]+)\.amazonaws\.com(\.cn)?$/\1/')"
            step "Logging in to ECR ($host)"
            aws ecr get-login-password --region "$region" \
                | docker login --username AWS --password-stdin "$host"
            ;;
        *-docker.pkg.dev)
            command -v gcloud >/dev/null 2>&1 || die "gcloud is needed to log in to Artifact Registry (or log in yourself and pass --no-login)"
            step "Logging in to Artifact Registry ($host)"
            gcloud auth print-access-token \
                | docker login --username oauth2accesstoken --password-stdin "https://$host"
            ;;
        *)
            echo "push-images: no automatic login for $host; assuming 'docker login' was done"
            ;;
    esac
fi

# --- Build -------------------------------------------------------------------

build() {
    # build NAME DOCKERFILE
    local name="$1" dockerfile="$2"
    step "Building $registry/$name:$tag ($dockerfile, $platform)"
    docker build --platform "$platform" -f "$dockerfile" -t "$registry/$name:$tag" .
}

wants() {
    local name
    for name in "${names[@]}"; do
        [ "$name" = "$1" ] && return 0
    done
    return 1
}

if wants backend; then
    if [ "$rebuild_base" -eq 1 ] || ! docker image inspect tersect-base >/dev/null 2>&1; then
        step "Building tersect-base (Dockerfile.base, $platform); this is the slow one"
        docker build --platform "$platform" -f Dockerfile.base -t tersect-base .
    fi
    base_arch="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' tersect-base)"
    [ "$base_arch" = "$platform" ] || die "the local tersect-base image is $base_arch, not $platform; run again with --rebuild-base"
    build backend Dockerfile
fi
if wants pipeline; then
    build pipeline Dockerfile.pipeline
fi
if wants web; then
    build web deploy/docker/web.Dockerfile
fi

# --- Push --------------------------------------------------------------------

if [ "$push" -eq 1 ]; then
    for name in "${names[@]}"; do
        step "Pushing $registry/$name:$tag"
        docker push "$registry/$name:$tag"
    done
fi

step "Done"
for name in "${names[@]}"; do
    echo "  $registry/$name:$tag"
done
if [ "$push" -eq 1 ]; then
    cat <<NEXT

Next: set   image_tag = "$tag"   in terraform.tfvars and apply. A running
deployment picks the release up within a few minutes.
NEXT
fi
