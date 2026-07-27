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
var kratosDB *sql.DB

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

// initKratosDB はKratosデータベースへの接続を初期化します
func initKratosDB() error {
	host := os.Getenv("KRATOS_DB_HOST")
	port := os.Getenv("KRATOS_DB_PORT")
	user := os.Getenv("KRATOS_DB_USER")
	password := os.Getenv("KRATOS_DB_PASSWORD")
	dbname := os.Getenv("KRATOS_DB_NAME")

	if host == "" {
		host = "kratos-postgres"
	}
	if port == "" {
		port = "5432"
	}
	if user == "" {
		user = "kratos"
	}
	if password == "" {
		password = "secret"
	}
	if dbname == "" {
		dbname = "kratos"
	}

	psqlInfo := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, password, dbname)

	var err error
	kratosDB, err = sql.Open("postgres", psqlInfo)
	if err != nil {
		return fmt.Errorf("failed to open kratos database: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := kratosDB.PingContext(ctx); err != nil {
		return fmt.Errorf("failed to ping kratos database: %w", err)
	}

	kratosDB.SetMaxOpenConns(10)
	kratosDB.SetMaxIdleConns(2)
	kratosDB.SetConnMaxLifetime(5 * time.Minute)

	log.Println("Kratos database connected successfully")
	return nil
}

// getEmailByKratosID はKratos IDからメールアドレスを取得します
func getEmailByKratosID(kratosID string) string {
	if kratosDB == nil {
		return ""
	}
	var email string
	err := kratosDB.QueryRow(
		"SELECT traits->>'email' FROM identities WHERE id = $1",
		kratosID,
	).Scan(&email)
	if err != nil {
		return ""
	}
	return email
}

// getEmailsByKratosIDs は複数のKratos IDからメールアドレスを一括取得します
func getEmailsByKratosIDs(kratosIDs []string) map[string]string {
	result := make(map[string]string)
	if kratosDB == nil || len(kratosIDs) == 0 {
		return result
	}
	for _, id := range kratosIDs {
		result[id] = getEmailByKratosID(id)
	}
	return result
}

// closeKratosDB はKratosデータベース接続を閉じます
func closeKratosDB() error {
	if kratosDB != nil {
		return kratosDB.Close()
	}
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
    uuid           TEXT        NOT NULL UNIQUE,
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
`

	if _, err := db.Exec(schemaSQL); err != nil {
		return fmt.Errorf("failed to execute schema SQL: %w", err)
	}

	migrationSQL := `
ALTER TABLE vms ADD COLUMN IF NOT EXISTS uuid TEXT;
UPDATE vms SET uuid = gen_random_uuid()::text WHERE uuid IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_vms_uuid ON vms (uuid);
ALTER TABLE vms ALTER COLUMN uuid SET NOT NULL;
`
	if _, err := db.Exec(migrationSQL); err != nil {
		return fmt.Errorf("failed to execute migration SQL: %w", err)
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
	UUID        string
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
func createVM(userID int, uuid string, proxmoxVMID int, nodeName string, tfWorkdir string) (*ManageVM, error) {
	vm := &ManageVM{}
	err := db.QueryRow(
		"INSERT INTO vms (user_id, uuid, proxmox_vm_id, node_name, tf_workdir, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, user_id, uuid, proxmox_vm_id, node_name, tf_workdir, status, created_at",
		userID, uuid, proxmoxVMID, nodeName, tfWorkdir, "creating",
	).Scan(&vm.ID, &vm.UserID, &vm.UUID, &vm.ProxmoxVMID, &vm.NodeName, &vm.TFWorkdir, &vm.Status, &vm.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create vm: %w", err)
	}

	return vm, nil
}

// getUserVMs はユーザーのVMリストを取得します
func getUserVMs(userID int) ([]*ManageVM, error) {
	rows, err := db.Query(
		"SELECT id, user_id, uuid, proxmox_vm_id, node_name, tf_workdir, status, created_at FROM vms WHERE user_id = $1 ORDER BY created_at DESC",
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query vms: %w", err)
	}
	defer rows.Close()

	var vms []*ManageVM
	for rows.Next() {
		vm := &ManageVM{}
		if err := rows.Scan(&vm.ID, &vm.UserID, &vm.UUID, &vm.ProxmoxVMID, &vm.NodeName, &vm.TFWorkdir, &vm.Status, &vm.CreatedAt); err != nil {
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
		"SELECT id, user_id, uuid, proxmox_vm_id, node_name, tf_workdir, status, created_at FROM vms WHERE id = $1",
		vmID,
	).Scan(&vm.ID, &vm.UserID, &vm.UUID, &vm.ProxmoxVMID, &vm.NodeName, &vm.TFWorkdir, &vm.Status, &vm.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to get vm: %w", err)
	}

	return vm, nil
}

func getVMByProxmoxID(proxmoxID, userID int) (*ManageVM, error) {
	vm := &ManageVM{}
	err := db.QueryRow(
		"SELECT id, user_id, uuid, proxmox_vm_id, node_name, tf_workdir, status, created_at FROM vms WHERE proxmox_vm_id = $1 AND user_id = $2",
		proxmoxID, userID,
	).Scan(&vm.ID, &vm.UserID, &vm.UUID, &vm.ProxmoxVMID, &vm.NodeName, &vm.TFWorkdir, &vm.Status, &vm.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to get vm: %w", err)
	}

	return vm, nil
}

func getVMByUUID(uuid string, userID int) (*ManageVM, error) {
	vm := &ManageVM{}
	err := db.QueryRow(
		"SELECT id, user_id, uuid, proxmox_vm_id, node_name, tf_workdir, status, created_at FROM vms WHERE uuid = $1 AND user_id = $2",
		uuid, userID,
	).Scan(&vm.ID, &vm.UserID, &vm.UUID, &vm.ProxmoxVMID, &vm.NodeName, &vm.TFWorkdir, &vm.Status, &vm.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to get vm by uuid: %w", err)
	}

	return vm, nil
}

func deleteVMByUUID(uuid string, userID int) error {
	result, err := db.Exec(
		"DELETE FROM vms WHERE uuid = $1 AND user_id = $2",
		uuid, userID,
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

// SupportRequest はサポート依頼を表します
type SupportRequest struct {
	ID        int       `json:"id"`
	UserID    *int      `json:"user_id"`
	KratosID  string    `json:"kratos_id"`
	Subject   string    `json:"subject"`
	VMID      *string   `json:"vmid"`
	Details   string    `json:"details"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

// createSupportRequest はサポート依頼をデータベースに保存します
func createSupportRequest(kratosID string, subject string, vmid string, details string) (*SupportRequest, error) {
	req := &SupportRequest{}
	var vmidPtr *string
	if vmid != "" {
		vmidPtr = &vmid
	}
	
	// Get user_id if exists
	var userID *int
	user, err := getOrCreateUser(kratosID)
	if err == nil {
		userID = &user.ID
	}

	err = db.QueryRow(
		`INSERT INTO support_requests (user_id, kratos_id, subject, vmid, details) 
		 VALUES ($1, $2, $3, $4, $5) 
		 RETURNING id, user_id, kratos_id, subject, vmid, details, status, created_at`,
		userID, kratosID, subject, vmidPtr, details,
	).Scan(&req.ID, &req.UserID, &req.KratosID, &req.Subject, &req.VMID, &req.Details, &req.Status, &req.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create support request: %w", err)
	}

	return req, nil
}

// getAllSupportRequests はすべてのサポート依頼を取得します（管理者用）
func getAllSupportRequests() ([]*SupportRequest, error) {
	rows, err := db.Query(
		"SELECT id, user_id, kratos_id, subject, vmid, details, status, created_at FROM support_requests ORDER BY created_at DESC",
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query support requests: %w", err)
	}
	defer rows.Close()

	var reqs []*SupportRequest
	for rows.Next() {
		req := &SupportRequest{}
		if err := rows.Scan(&req.ID, &req.UserID, &req.KratosID, &req.Subject, &req.VMID, &req.Details, &req.Status, &req.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan support request: %w", err)
		}
		reqs = append(reqs, req)
	}
	return reqs, nil
}

// updateSupportRequestStatus はサポート依頼のステータスを更新します
func updateSupportRequestStatus(id int, status string) error {
	result, err := db.Exec(
		"UPDATE support_requests SET status = $1 WHERE id = $2",
		status, id,
	)
	if err != nil {
		return fmt.Errorf("failed to update support request status: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("support request not found")
	}

	return nil
}

// getAllUsers はすべてのユーザーを取得します（管理者用）
func getAllUsers() ([]*User, error) {
	rows, err := db.Query(
		"SELECT id, kratos_id, role, created_at FROM users ORDER BY created_at DESC",
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query users: %w", err)
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		user := &User{}
		if err := rows.Scan(&user.ID, &user.KratosID, &user.Role, &user.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan user: %w", err)
		}
		users = append(users, user)
	}
	return users, nil
}

// isAdmin は指定されたKratos IDのユーザーが管理者かどうかを確認します
func isAdmin(kratosID string) (bool, error) {
	user, err := getOrCreateUser(kratosID)
	if err != nil {
		return false, err
	}
	return user.Role == "admin", nil
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

// VMWithUser はVM情報とユーザ情報を結合したものです（管理者ダッシュボード用）
type VMWithUser struct {
	ID          int
	UserID      int
	UUID        string
	ProxmoxVMID int
	NodeName    string
	TFWorkdir   string
	Status      string
	CreatedAt   time.Time
	KratosID    string
	Email       string
}

// getAllVMsWithUsers は全VMをユーザ情報付きで取得します（管理者用）
func getAllVMsWithUsers() ([]*VMWithUser, error) {
	rows, err := db.Query(`
		SELECT v.id, v.user_id, v.uuid, v.proxmox_vm_id, v.node_name, v.tf_workdir, v.status, v.created_at, u.kratos_id
		FROM vms v
		JOIN users u ON v.user_id = u.id
		ORDER BY v.created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query vms with users: %w", err)
	}
	defer rows.Close()

	var vms []*VMWithUser
	var kratosIDs []string
	for rows.Next() {
		vm := &VMWithUser{}
		if err := rows.Scan(&vm.ID, &vm.UserID, &vm.UUID, &vm.ProxmoxVMID, &vm.NodeName, &vm.TFWorkdir, &vm.Status, &vm.CreatedAt, &vm.KratosID); err != nil {
			return nil, fmt.Errorf("failed to scan vm: %w", err)
		}
		vms = append(vms, vm)
		kratosIDs = append(kratosIDs, vm.KratosID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}

	emails := getEmailsByKratosIDs(kratosIDs)
	for _, vm := range vms {
		vm.Email = emails[vm.KratosID]
	}

	return vms, nil
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
