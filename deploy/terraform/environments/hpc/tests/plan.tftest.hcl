# Checks the configuration and what it renders without a cluster: only plans,
# so nothing is uploaded and no SSH connection is made.
#
#   tofu test        (or: terraform test)

variables {
  login_host     = "login.hpc.example.org"
  ssh_user       = "alice"
  deploy_dir     = "/project/lab/tersect"
  image_web      = "registry.example.org/tersect/web:1.0.0"
  image_backend  = "registry.example.org/tersect/backend:1.0.0"
  image_pipeline = "registry.example.org/tersect/pipeline:1.0.0"
}

run "defaults" {
  command = plan

  assert {
    condition     = output.tunnel_command == "ssh -N -L 8080:127.0.0.1:8080 -J alice@login.hpc.example.org alice@NODE"
    error_message = "With the default bind address the tunnel must end on the compute node."
  }

  assert {
    condition     = output.status_command == "ssh alice@login.hpc.example.org /project/lab/tersect/tersect-stack.sh status"
    error_message = "Unexpected status command."
  }

  assert {
    condition     = strcontains(output.sbatch_header, "#SBATCH --signal=B:TERM@300") && strcontains(output.sbatch_header, "#SBATCH --cpus-per-task=8") && strcontains(output.sbatch_header, "#SBATCH --mem=32G") && strcontains(output.sbatch_header, "#SBATCH --chdir=/project/lab/tersect")
    error_message = "The job header is missing an expected option."
  }

  assert {
    condition     = !strcontains(output.sbatch_header, "--partition") && !strcontains(output.sbatch_header, "--gres")
    error_message = "Options that were not set must not appear in the job header."
  }

  assert {
    condition     = output.assistant == "off" && output.data_dir == "/project/lab/tersect/data"
    error_message = "Unexpected defaults."
  }
}

run "login_node_tunnel_and_gpu" {
  command = plan

  variables {
    bind_address         = "0.0.0.0"
    ssh_port             = 2222
    http_port            = 18080
    partition            = "gpu"
    account              = "lab"
    gres                 = "gpu:1"
    time_limit           = "7-00:00:00"
    enable_assistant     = true
    sbatch_extra_options = ["--constraint=avx2"]
  }

  assert {
    condition     = output.tunnel_command == "ssh -N -L 8080:NODE:18080 -p 2222 alice@login.hpc.example.org"
    error_message = "With bind_address 0.0.0.0 the tunnel must end on the login node."
  }

  assert {
    condition     = strcontains(output.sbatch_header, "#SBATCH --gres=gpu:1") && strcontains(output.sbatch_header, "#SBATCH --partition=gpu") && strcontains(output.sbatch_header, "#SBATCH --time=7-00:00:00") && strcontains(output.sbatch_header, "#SBATCH --constraint=avx2")
    error_message = "The job header is missing a requested option."
  }

  assert {
    condition     = output.assistant == "ollama in the job (qwen3:14b)"
    error_message = "enable_assistant without assistant_url must run Ollama in the job."
  }
}

run "external_assistant" {
  command = plan

  variables {
    enable_assistant = true
    assistant_url    = "https://llm.example.org/v1"
  }

  assert {
    condition     = output.assistant == "external: https://llm.example.org/v1"
    error_message = "assistant_url must be used when given."
  }
}

run "rejects_relative_deploy_dir" {
  command = plan

  variables {
    deploy_dir = "tersect"
  }

  expect_failures = [var.deploy_dir]
}

run "rejects_low_port" {
  command = plan

  variables {
    http_port = 80
  }

  expect_failures = [var.http_port]
}

run "rejects_shell_characters_in_job_options" {
  command = plan

  variables {
    sbatch_extra_options = ["--comment=$(id)"]
  }

  expect_failures = [var.sbatch_extra_options]
}
