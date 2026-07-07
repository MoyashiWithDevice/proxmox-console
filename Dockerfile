# syntax=docker/dockerfile:1.7

########################
# Terraform
########################
FROM hashicorp/terraform:1.13 AS terraform

########################
# Frontend build stage
########################
FROM node:22-bookworm AS frontend

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY frontend/ ./
RUN npm run build

########################
# Go build stage
########################
FROM golang:1.26.2-bookworm AS builder

WORKDIR /src

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        libc6-dev && \
    rm -rf /var/lib/apt/lists/*

# Dependency cache
COPY go.mod go.sum ./

RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# Source code
COPY . .

# Copy frontend build output
COPY --from=frontend /app/../static/dist ./static/dist

# Build cache
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=1 \
    go build \
        -trimpath \
        -o /out/proxmox-console \
        ./cmd/proxmox-console

########################
# Runtime stage
########################
FROM debian:bookworm-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Application
COPY --from=builder /out/proxmox-console /usr/local/bin/proxmox-console

# Terraform binary
COPY --from=terraform /bin/terraform /usr/local/bin/terraform

# Assets
COPY --from=builder /src/static ./static
COPY --from=builder /src/terraform ./terraform
COPY --from=builder /src/setting.json ./setting.json

EXPOSE 8080

CMD ["proxmox-console"]
