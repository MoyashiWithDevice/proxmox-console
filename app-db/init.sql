CREATE TABLE IF NOT EXISTS users (
    id         SERIAL      PRIMARY KEY,
    kratos_id  TEXT        NOT NULL UNIQUE,
    role       TEXT        NOT NULL DEFAULT 'user',
    vlan_id    INTEGER     UNIQUE,
    created_at TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vms (
    id             SERIAL      PRIMARY KEY,
    user_id        INTEGER     NOT NULL REFERENCES users(id),
    proxmox_vm_id  INTEGER     NOT NULL,
    node_name      TEXT        NOT NULL,
    tf_workdir     TEXT        NOT NULL,
    status         TEXT        NOT NULL DEFAULT 'creating',
    created_at     TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS isos (
    id         SERIAL      PRIMARY KEY,
    user_id    INTEGER     NOT NULL REFERENCES users(id),
    filename   TEXT        NOT NULL,
    volume_id  TEXT        NOT NULL,
    size       BIGINT      NOT NULL DEFAULT 0,
    created_at TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_requests (
    id         SERIAL      PRIMARY KEY,
    user_id    INTEGER     REFERENCES users(id),
    kratos_id  TEXT        NOT NULL,
    subject    TEXT        NOT NULL,
    vmid       TEXT,
    details    TEXT        NOT NULL,
    status     TEXT        NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP   NOT NULL DEFAULT NOW()
);
