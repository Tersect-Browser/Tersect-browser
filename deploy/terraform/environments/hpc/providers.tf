# No cloud provider: the cluster is reached over SSH with your own account
# (ssh_* variables), by the provisioners of the hpc-slurm module. The random
# provider generates the passwords and needs no settings.
provider "random" {}
