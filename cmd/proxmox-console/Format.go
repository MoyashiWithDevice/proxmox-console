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
}

type VMResponse struct {
	Type       string `json:"type"`
	VMID       int    `json:"VMID,omitempty"`
	JOBID      string `json:"id,omitempty"`
	CPU        int    `json:"cpu,omitempty"`
	Memory     int    `json:"memory,omitempty"`
	HDD        int    `json:"hdd,omitempty"`
	Servername string `json:"servername,omitempty"`
	OS         string `json:"os,omitempty"`
	Status     string `json:"status,omitempty"`
	IP         string `json:"IP,omitempty"`
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
}
