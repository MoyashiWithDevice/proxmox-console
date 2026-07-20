package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	_ "github.com/lib/pq"
)

var db *sql.DB

// initDB はデータベース接続を初期化します
func initDB() error {
	host := os.Getenv("DB_HOST")
	port := os.Getenv("DB_PORT")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbname := os.Getenv("DB_NAME")

	if host == "" {
		host = "app-postgres"
	}
	if port == "" {
		port = "5432"
	}
	if user == "" {
		user = "pguser"
	}
	if password == "" {
		password = "secret"
	}
	if dbname == "" {
		dbname = "app"
	}

	psqlInfo := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, password, dbname)

	var err error
	db, err = sql.Open("postgres", psqlInfo)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	// 接続テスト
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := ensureSchema(); err != nil {
		return fmt.Errorf("failed to ensure database schema: %w", err)
	}

	log.Println("Database connected successfully")
	return nil
}

func ensureSchema() error {
	const schemaSQL = `
CREATE TABLE IF NOT EXISTS users (
    id         SERIAL      PRIMARY KEY,
    kratos_id  TEXT        NOT NULL UNIQUE,
    role       TEXT        NOT NULL DEFAULT 'user',
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
`

	if _, err := db.Exec(schemaSQL); err != nil {
		return fmt.Errorf("failed to execute schema SQL: %w", err)
	}
	return nil
}

// User はユーザー情報を表します
type User struct {
	ID        int
	KratosID  string
	Role      string
	CreatedAt time.Time
}

// VM はVM情報を表します
type ManageVM struct {
	ID          int
	UserID      int
	ProxmoxVMID int
	NodeName    string
	TFWorkdir   string
	Status      string
	CreatedAt   time.Time
}

// getOrCreateUser はKratos IDでユーザーを取得または作成します
func getOrCreateUser(kratosID string) (*User, error) {
	user := &User{}
	err := db.QueryRow(
		"SELECT id, kratos_id, role, created_at FROM users WHERE kratos_id = $1",
		kratosID,
	).Scan(&user.ID, &user.KratosID, &user.Role, &user.CreatedAt)

	if err == sql.ErrNoRows {
		err = db.QueryRow(
			"INSERT INTO users (kratos_id, role) VALUES ($1, $2) RETURNING id, kratos_id, role, created_at",
			kratosID, "user",
		).Scan(&user.ID, &user.KratosID, &user.Role, &user.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to create user: %w", err)
		}
		return user, nil
	}

	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	return user, nil
}

// createVM はVM情報をデータベースに保存します
func createVM(userID int, proxmoxVMID int, nodeName string, tfWorkdir string) (*ManageVM, error) {
	vm := &ManageVM{}
	err := db.QueryRow(
		"INSERT INTO vms (user_id, proxmox_vm_id, node_name, tf_workdir, status) VALUES ($1, $2, $3, $4, $5) RETURNING id, user_id, proxmox_vm_id, node_name, tf_workdir, status, created_at",
		userID, proxmoxVMID, nodeName, tfWorkdir, "creating",
	).Scan(&vm.ID, &vm.UserID, &vm.ProxmoxVMID, &vm.NodeName, &vm.TFWorkdir, &vm.Status, &vm.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create vm: %w", err)
	}

	return vm, nil
}

// getUserVMs はユーザーのVMリストを取得します
func getUserVMs(userID int) ([]*ManageVM, error) {
	rows, err := db.Query(
		"SELECT id, user_id, proxmox_vm_id, node_name, tf_workdir, status, created_at FROM vms WHERE user_id = $1 ORDER BY created_at DESC",
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query vms: %w", err)
	}
	defer rows.Close()

	var vms []*ManageVM
	for rows.Next() {
		vm := &ManageVM{}
		if err := rows.Scan(&vm.ID, &vm.UserID, &vm.ProxmoxVMID, &vm.NodeName, &vm.TFWorkdir, &vm.Status, &vm.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan vm: %w", err)
		}
		vms = append(vms, vm)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}

	return vms, nil
}

// getVM はVM情報を ID で取得します
func getVM(vmID int) (*ManageVM, error) {
	vm := &ManageVM{}
	err := db.QueryRow(
		"SELECT id, user_id, proxmox_vm_id, node_name, tf_workdir, status, created_at FROM vms WHERE id = $1",
		vmID,
	).Scan(&vm.ID, &vm.UserID, &vm.ProxmoxVMID, &vm.NodeName, &vm.TFWorkdir, &vm.Status, &vm.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to get vm: %w", err)
	}

	return vm, nil
}

func getVMByProxmoxID(proxmoxID int) (*ManageVM, error) {
	vm := &ManageVM{}
	err := db.QueryRow(
		"SELECT id, user_id, proxmox_vm_id, node_name, tf_workdir, status, created_at FROM vms WHERE proxmox_vm_id = $1",
		proxmoxID,
	).Scan(&vm.ID, &vm.UserID, &vm.ProxmoxVMID, &vm.NodeName, &vm.TFWorkdir, &vm.Status, &vm.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to get vm: %w", err)
	}

	return vm, nil
}

func deleteVMByProxmoxID(proxmoxID int) error {
	result, err := db.Exec(
		"DELETE FROM vms WHERE proxmox_vm_id = $1",
		proxmoxID,
	)
	if err != nil {
		return fmt.Errorf("failed to delete vm: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return sql.ErrNoRows
	}

	return nil
}

// updateVMStatus はVM のステータスを更新します
func updateVMStatus(vmID int, status string) error {
	result, err := db.Exec(
		"UPDATE vms SET status = $1 WHERE id = $2",
		status, vmID,
	)
	if err != nil {
		return fmt.Errorf("failed to update vm status: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("vm not found")
	}

	return nil
}

// ISO はアップロードされたISO情報を表します
type ISO struct {
	ID        int
	UserID    int
	Filename  string
	VolumeID  string
	Size      int64
	CreatedAt time.Time
}

// createISO はISO情報をデータベースに保存します
func createISO(userID int, filename, volumeID string, size int64) (*ISO, error) {
	iso := &ISO{}
	err := db.QueryRow(
		"INSERT INTO isos (user_id, filename, volume_id, size) VALUES ($1, $2, $3, $4) RETURNING id, user_id, filename, volume_id, size, created_at",
		userID, filename, volumeID, size,
	).Scan(&iso.ID, &iso.UserID, &iso.Filename, &iso.VolumeID, &iso.Size, &iso.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create iso: %w", err)
	}
	return iso, nil
}

// getUserISOs はユーザーのISOリストを取得します
func getUserISOs(userID int) ([]*ISO, error) {
	rows, err := db.Query(
		"SELECT id, user_id, filename, volume_id, size, created_at FROM isos WHERE user_id = $1 ORDER BY created_at DESC",
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query isos: %w", err)
	}
	defer rows.Close()

	var isos []*ISO
	for rows.Next() {
		iso := &ISO{}
		if err := rows.Scan(&iso.ID, &iso.UserID, &iso.Filename, &iso.VolumeID, &iso.Size, &iso.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan iso: %w", err)
		}
		isos = append(isos, iso)
	}
	return isos, nil
}

// getAllISOs はすべてのISOを取得します（管理者用もしくは全ユーザー共有用）
func getAllISOs() ([]*ISO, error) {
	rows, err := db.Query(
		"SELECT id, user_id, filename, volume_id, size, created_at FROM isos ORDER BY created_at DESC",
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query isos: %w", err)
	}
	defer rows.Close()

	var isos []*ISO
	for rows.Next() {
		iso := &ISO{}
		if err := rows.Scan(&iso.ID, &iso.UserID, &iso.Filename, &iso.VolumeID, &iso.Size, &iso.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan iso: %w", err)
		}
		isos = append(isos, iso)
	}
	return isos, nil
}

// closeDB はデータベース接続を閉じます
func closeDB() error {
	if db != nil {
		return db.Close()
	}
	return nil
}
