CREATE TABLE users (
    id         SERIAL      PRIMARY KEY,
    kratos_id  TEXT        NOT NULL UNIQUE,
    role       TEXT        NOT NULL DEFAULT 'user',
    vlan_id    INTEGER     UNIQUE,
    created_at TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE TABLE vms (
    id             SERIAL      PRIMARY KEY,
    user_id        INTEGER     NOT NULL REFERENCES users(id),
    proxmox_vm_id  INTEGER     NOT NULL,
    node_name      TEXT        NOT NULL,
    tf_workdir     TEXT        NOT NULL,
    status         TEXT        NOT NULL DEFAULT 'creating',
    created_at     TIMESTAMP   NOT NULL DEFAULT NOW()
);
