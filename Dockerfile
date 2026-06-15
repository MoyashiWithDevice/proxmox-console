FROM golang:1.26.2-bookworm AS builder

WORKDIR /src

RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libc6-dev && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o /out/proxmox-console ./cmd/proxmox-console

FROM debian:bookworm-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
        lsb-release && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /etc/apt/keyrings/hashicorp-archive-keyring.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" > /etc/apt/sources.list.d/hashicorp.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends terraform && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=builder /out/proxmox-console /usr/local/bin/proxmox-console
COPY --from=builder /src/static ./static
COPY --from=builder /src/terraform ./terraform
COPY --from=builder /src/setting.json ./setting.json

EXPOSE 8080

CMD ["proxmox-console"]
