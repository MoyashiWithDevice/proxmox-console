FROM golang:1.25.10-bookworm

WORKDIR /app/src

RUN apt-get update && \
    apt-get install -y gcc libc6-dev && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# ★ ローカルのコードをビルド時にコピー
COPY . .

EXPOSE 8080

CMD ["sh", "-c", "go mod tidy && go run ."]