output "public_ip" {
  description = "Set as the DEPLOY_HOST GitHub variable."
  value       = aws_eip.app.public_ip
}

output "site_address" {
  description = "Hostname Caddy gets a certificate for (sslip.io resolves it to the box)."
  value       = "${replace(aws_eip.app.public_ip, ".", "-")}.sslip.io"
}

output "public_url" {
  description = "Where the app is served; QR links start with this."
  value       = "https://${replace(aws_eip.app.public_ip, ".", "-")}.sslip.io"
}

output "ssh" {
  value = "ssh -i <deploy key> ubuntu@${aws_eip.app.public_ip}"
}
