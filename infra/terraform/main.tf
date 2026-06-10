provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_service_account" "run" {
  account_id   = "intrepid-run"
  display_name = "intrepid Cloud Run runtime"
}

resource "google_cloud_run_v2_service" "api" {
  name     = var.api_service_name
  location = var.region

  template {
    service_account = google_service_account.run.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = var.api_image

      ports {
        container_port = 4000
      }

      resources {
        limits = {
          cpu    = var.api_cpu
          memory = var.api_memory
        }
      }

      dynamic "env" {
        for_each = var.api_env
        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

resource "google_cloud_run_v2_service" "web" {
  name     = var.web_service_name
  location = var.region

  template {
    service_account = google_service_account.run.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = var.web_image

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = var.web_cpu
          memory = var.web_memory
        }
      }

      env {
        name  = "PORT"
        value = "3000"
      }

      env {
        name  = "API_BASE_URL"
        value = google_cloud_run_v2_service.api.uri
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

# Public (unauthenticated) access
resource "google_cloud_run_v2_service_iam_member" "api_invoker" {
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "web_invoker" {
  location = google_cloud_run_v2_service.web.location
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
