# AWS hooks for the boot scripts (deploy/terraform/modules/vm-bootstrap).
# Settings come from /etc/tersect/deploy.env:
#   TERSECT_REGION, TERSECT_BUNDLE_ID (secret ARN), TERSECT_REGISTRY_HOSTS
# Credentials come from the instance role.

# The AWS CLI is a snap; systemd services do not have /snap/bin on their path.
export PATH="$PATH:/snap/bin"

cloud_prepare() {
    if ! command -v aws >/dev/null 2>&1; then
        local attempt
        for attempt in 1 2 3 4 5; do
            snap install aws-cli --classic && return 0
            echo "installing the AWS CLI failed (attempt $attempt)"
            sleep 15
        done
        return 1
    fi
}

cloud_fetch_bundle() {
    aws secretsmanager get-secret-value \
        --region "$TERSECT_REGION" \
        --secret-id "$TERSECT_BUNDLE_ID" \
        --query SecretString --output text
}

cloud_registry_login() {
    local host
    for host in $TERSECT_REGISTRY_HOSTS; do
        aws ecr get-login-password --region "$TERSECT_REGION" \
            | docker login --username AWS --password-stdin "$host" >/dev/null
    done
}
