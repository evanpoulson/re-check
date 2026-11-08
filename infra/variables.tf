variable "region" {
  description = "AWS region. us-west-2 is where the Tiger Cloud service runs."
  type        = string
  default     = "us-west-2"
}

variable "instance_type" {
  description = "EC2 size. 2 GB plus swap is enough to build the web and API images on the box."
  type        = string
  default     = "t3.small"
}

variable "ssh_public_key" {
  description = "Public half of the deploy key. The private half goes in the DEPLOY_SSH_KEY GitHub secret."
  type        = string
}

variable "ssh_cidrs" {
  description = "Who can SSH in. GitHub-hosted runners have no fixed IPs, so this stays open; login is key-only."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "repo_url" {
  description = "Repository the box clones. It's public, so no credentials are needed."
  type        = string
  default     = "https://github.com/evanpoulson/re-check.git"
}
