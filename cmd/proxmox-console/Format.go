package main

type VMRequest struct {
	VMID       int    `json:"vmid,omitempty"`
	CPU        int    `json:"cpu,omitempty"`
	Memory     int    `json:"memory,omitempty"`
	HDD        int    `json:"hdd,omitempty"`
	Servername string `json:"servername,omitempty"`
	Username   string `json:"username,omitempty"`
	OS         string `json:"os,omitempty"`
	Runcmd     string `json:"runcmd,omitempty"`
	ISOVolume  string `json:"iso_volume,omitempty"`
}

type VMResponse struct {
	Type       string `json:"type"`
	VMID       int    `json:"VMID,omitempty"`
	JOBID      string `json:"jobid,omitempty"`
	CPU        int    `json:"cpu,omitempty"`
	Memory     int    `json:"memory,omitempty"`
	HDD        int    `json:"hdd,omitempty"`
	Servername string `json:"servername,omitempty"`
	OS         string `json:"os,omitempty"`
	Status     string `json:"status,omitempty"`
	IP         string `json:"IP,omitempty"`
}

type ISOInfo struct {
	ID        int    `json:"id"`
	Filename  string `json:"filename"`
	VolumeID  string `json:"volume_id"`
	Size      int64  `json:"size"`
	CreatedAt string `json:"created_at"`
}

type Job struct {
	Status     string
	IP         string
	VMID       int
	LogPath    string
	Workdir    string
	NodeName   string
	Servername string
	OwnerID    string
	Request    *VMRequest
}
