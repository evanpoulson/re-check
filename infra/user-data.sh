#!/bin/bash
# First boot: swap, Docker Engine with the compose and buildx plugins, and a clone of the repo.
# The deploy workflow waits for this to finish (`cloud-init status --wait`), then writes .env and runs compose.
set -euxo pipefail

# 2 GB of swap so `npm ci` and the Vite build fit next to the running app on a t3.small.
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
usermod -aG docker ubuntu

sudo -u ubuntu git clone ${repo_url} /home/ubuntu/re-check
