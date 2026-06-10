variable "project_id" {
  type        = string
  description = "GCP project id"
}

variable "region" {
  type        = string
  description = "GCP region"
  default     = "asia-southeast1"
}

variable "artifact_repo" {
  type        = string
  description = "Artifact Registry repository id"
  default     = "intrepid"
}

variable "api_service_name" {
  type        = string
  default     = "intrepid-api"
}

variable "web_service_name" {
  type        = string
  default     = "intrepid-web"
}

variable "api_image" {
  type        = string
  description = "Full image URL for API (Artifact Registry)"
}

variable "web_image" {
  type        = string
  description = "Full image URL for Web (Artifact Registry)"
}

variable "api_env" {
  type        = map(string)
  description = "Environment variables for API Cloud Run"
  default = {
    PORT        = "4000"
    CORS_ORIGIN = "*"
  }
}

variable "api_cpu" {
  type        = string
  description = "API Cloud Run CPU limit (e.g. '1' or '1000m')"
  default     = "1"
}

variable "api_memory" {
  type        = string
  description = "API Cloud Run memory limit (e.g. '256Mi', '512Mi')"
  default     = "256Mi"
}

variable "web_cpu" {
  type        = string
  description = "Web Cloud Run CPU limit (e.g. '1' or '1000m')"
  default     = "1"
}

variable "web_memory" {
  type        = string
  description = "Web Cloud Run memory limit (e.g. '256Mi', '512Mi')"
  default     = "512Mi"
}

variable "min_instances" {
  type        = number
  description = "Cloud Run min instances (dev: 0 to reduce cost)"
  default     = 0
}

variable "max_instances" {
  type        = number
  description = "Cloud Run max instances (dev: 1 to cap spend)"
  default     = 1
}
